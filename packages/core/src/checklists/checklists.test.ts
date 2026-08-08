/**
 * Checklist engine integration tests against real Postgres.
 *
 * Same two-connection setup as src/evidence/evidence.test.ts:
 *  - admin (superuser `factory`): migrations, truncation, RLS-bypassing
 *    assertions.
 *  - app (`app_login` in factory_app): all flows run here under RLS.
 *
 * audit_log and evidence are append-only, so they are never truncated;
 * checklists/checklist_steps are NOT append-only and get truncated per
 * test alongside users/orgs/records. Every test uses fresh orgs and
 * scopes assertions by id/orgId. Object storage: MemoryObjectStore.
 */
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type DbHandle } from "../db/index.js";
import { runMigrations } from "../db/migrate.js";
import { withOrg } from "../db/client.js";
import { auditLog, checklistSteps, checklists } from "../db/schema/index.js";
import type { MutationContext } from "../audit/mutate.js";
import {
  createOrgWithOwner,
  requestMagicLink,
  verifyMagicLink,
} from "../identity/index.js";
import type { MailSender } from "../identity/mail.js";
import { createRecord, defineEntity } from "../records/index.js";
import { attachEvidence, MemoryObjectStore } from "../evidence/index.js";
import {
  ChecklistStateError,
  completeStep,
  defineChecklist,
  getChecklist,
  listChecklists,
  signOffChecklist,
  startChecklist,
} from "./index.js";

const ADMIN_URL =
  process.env.DATABASE_URL_TEST ??
  "postgres://factory:factory@localhost:5433/factory";

const APP_URL = (() => {
  const u = new URL(ADMIN_URL);
  u.username = "app_login";
  u.password = "app";
  return u.toString();
})();

class FakeMailSender implements MailSender {
  messages: { to: string; subject: string; text: string }[] = [];
  async send(message: { to: string; subject: string; text: string }) {
    this.messages.push(message);
  }
}

let admin: DbHandle;
let app: DbHandle;
let mail: FakeMailSender;

const buildUrl = (token: string) => `https://app.example/verify?t=${token}`;

async function loginUser(email: string): Promise<string> {
  const req = await requestMagicLink(app.db, email, buildUrl, mail);
  const verified = await verifyMagicLink(app.db, req.token);
  if (!verified) throw new Error("test setup: magic link verify failed");
  return verified.userId;
}

let seedCounter = 0;
/** Fresh org + owner per test; returns a MutationContext for the org. */
async function seedOrg(product = "wasteduty"): Promise<MutationContext> {
  const userId = await loginUser(
    `owner-${Date.now()}-${seedCounter++}-${Math.random()}@example.com`,
  );
  const { orgId } = await createOrgWithOwner(app.db, "Checklist Co", userId);
  return { orgId, product, actorUserId: userId };
}

const receipt = defineEntity(
  "waste_receipt",
  z.object({ carrier: z.string().min(1), tonnes: z.number().positive() }),
);

const PDF_BYTES = new TextEncoder().encode("%PDF-1.4 fake consignment note");

/** Fresh org + a record + one evidence row attached to it. */
async function seedOrgWithEvidence() {
  const ctx = await seedOrg();
  const record = await createRecord(app.db, ctx, receipt, {
    carrier: "Checklist Haulage",
    tonnes: 3,
  });
  const ev = await attachEvidence(app.db, new MemoryObjectStore(), ctx, {
    recordId: record.id,
    filename: "consignment.pdf",
    contentType: "application/pdf",
    bytes: PDF_BYTES,
  });
  return { ctx, record, ev };
}

const simpleDef = defineChecklist({
  key: "daily_site_check",
  name: "Daily site check",
  steps: [
    { key: "walk_perimeter", title: "Walk the perimeter" },
    { key: "check_bunding", title: "Check bunding" },
  ],
});

const evidenceDef = defineChecklist({
  key: "receipt_check",
  name: "Receipt check",
  steps: [
    { key: "weigh_load", title: "Weigh the load" },
    {
      key: "photograph_note",
      title: "Photograph the consignment note",
      requiresEvidence: true,
    },
  ],
});

/** Audit rows for one org, read as admin, newest first. */
async function adminTrail(orgId: string) {
  return admin.db
    .select()
    .from(auditLog)
    .where(eq(auditLog.orgId, orgId))
    .orderBy(sql`${auditLog.createdAt} desc`);
}

/** One step row, read as admin (bypasses RLS). */
async function adminStep(checklistId: string, stepKey: string) {
  const rows = await admin.db
    .select()
    .from(checklistSteps)
    .where(eq(checklistSteps.checklistId, checklistId));
  return rows.find((r) => r.stepKey === stepKey);
}

async function adminChecklist(checklistId: string) {
  const [row] = await admin.db
    .select()
    .from(checklists)
    .where(eq(checklists.id, checklistId));
  return row;
}

/** Complete every step of simpleDef on a checklist. */
async function completeAll(ctx: MutationContext, checklistId: string) {
  for (const step of simpleDef.steps) {
    await completeStep(app.db, ctx, checklistId, step.key);
  }
}

const GHOST_ID = "00000000-0000-4000-8000-000000000000";

beforeAll(async () => {
  admin = createDb(ADMIN_URL);
  try {
    await admin.db.execute(sql`select 1`);
  } catch (err) {
    throw new Error(
      `Checklist tests need a reachable Postgres at ${ADMIN_URL} ` +
        `(start it: podman compose up -d — see docs/local-dev.md). ` +
        `Underlying error: ${String(err)}`,
    );
  }
  await runMigrations(admin.db);
  await admin.db.execute(sql`
    DO $$ BEGIN
      CREATE ROLE app_login LOGIN PASSWORD 'app' IN ROLE factory_app;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  app = createDb(APP_URL);
});

afterAll(async () => {
  await app?.client.end();
  await admin?.client.end();
});

beforeEach(async () => {
  // audit_log and evidence are append-only and can't be truncated;
  // checklists/checklist_steps are ordinary tables and are cleaned.
  await admin.db.execute(
    sql`TRUNCATE users, orgs, records, checklists, checklist_steps CASCADE`,
  );
  await admin.db.execute(sql`DELETE FROM auth_attempts`);
  mail = new FakeMailSender();
});

describe("defineChecklist validation", () => {
  it("rejects duplicate step keys", () => {
    expect(() =>
      defineChecklist({
        key: "dupes",
        name: "Dupes",
        steps: [
          { key: "same_key", title: "One" },
          { key: "same_key", title: "Two" },
        ],
      }),
    ).toThrow(/duplicate step keys/);
  });

  it("rejects non-snake_case step keys", () => {
    for (const bad of ["CamelCase", "kebab-case", "1leading", "with space"]) {
      expect(() =>
        defineChecklist({
          key: "bad_keys",
          name: "Bad",
          steps: [{ key: bad, title: "Bad" }],
        }),
      ).toThrow();
    }
  });

  it("rejects a non-snake_case checklist key", () => {
    expect(() =>
      defineChecklist({
        key: "Not-Snake",
        name: "Bad",
        steps: [{ key: "ok_step", title: "Ok" }],
      }),
    ).toThrow();
  });

  it("rejects empty step lists", () => {
    expect(() =>
      defineChecklist({ key: "empty", name: "Empty", steps: [] }),
    ).toThrow();
  });

  it("defaults requiresEvidence to false", () => {
    const def = defineChecklist({
      key: "defaults",
      name: "Defaults",
      steps: [{ key: "plain_step", title: "Plain" }],
    });
    expect(def.steps[0]?.requiresEvidence).toBe(false);
  });
});

describe("startChecklist", () => {
  it("creates the instance and one row per step, and audits", async () => {
    const ctx = await seedOrg();
    const row = await startChecklist(app.db, ctx, evidenceDef);

    expect(row).toMatchObject({
      orgId: ctx.orgId,
      product: ctx.product,
      templateKey: "receipt_check",
      name: "Receipt check",
      recordId: null,
      status: "open",
      createdBy: ctx.actorUserId,
      signedOffBy: null,
      signedOffAt: null,
    });

    await withOrg(app.db, ctx.orgId, async (tx) => {
      const got = await getChecklist(tx, row.id);
      expect(got?.checklist.id).toBe(row.id);
      expect(
        got?.steps.map((s) => ({
          stepKey: s.stepKey,
          title: s.title,
          requiresEvidence: s.requiresEvidence,
          completedAt: s.completedAt,
        })),
      ).toEqual([
        {
          stepKey: "weigh_load",
          title: "Weigh the load",
          requiresEvidence: false,
          completedAt: null,
        },
        {
          stepKey: "photograph_note",
          title: "Photograph the consignment note",
          requiresEvidence: true,
          completedAt: null,
        },
      ]);
    });

    const events = (await adminTrail(ctx.orgId)).filter(
      (r) => r.action === "checklist.started",
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actorUserId: ctx.actorUserId,
      entityType: "checklist",
      entityId: row.id,
      after: { templateKey: "receipt_check", recordId: null, steps: 2 },
    });
  });

  it("links to a record when recordId is given", async () => {
    const { ctx, record } = await seedOrgWithEvidence();
    const row = await startChecklist(app.db, ctx, simpleDef, {
      recordId: record.id,
    });
    expect(row.recordId).toBe(record.id);
    const events = (await adminTrail(ctx.orgId)).filter(
      (r) => r.action === "checklist.started",
    );
    expect(events[0]?.after).toMatchObject({ recordId: record.id });
  });
});

describe("completeStep", () => {
  it("sets completedAt/completedBy/notes and audits with before/after", async () => {
    const ctx = await seedOrg();
    const cl = await startChecklist(app.db, ctx, simpleDef);

    const updated = await completeStep(app.db, ctx, cl.id, "walk_perimeter", {
      notes: "all clear",
    });
    expect(updated).toMatchObject({
      stepKey: "walk_perimeter",
      completedBy: ctx.actorUserId,
      notes: "all clear",
      evidenceId: null,
    });
    expect(updated.completedAt).toBeInstanceOf(Date);

    const persisted = await adminStep(cl.id, "walk_perimeter");
    expect(persisted?.completedBy).toBe(ctx.actorUserId);
    expect(persisted?.notes).toBe("all clear");

    const events = (await adminTrail(ctx.orgId)).filter(
      (r) => r.action === "checklist.step_completed",
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      entityType: "checklist_step",
      entityId: updated.id,
      before: { completedAt: null, evidenceId: null },
      after: {
        stepKey: "walk_perimeter",
        evidenceId: null,
        checklistId: cl.id,
      },
    });
  });

  it("re-completing while open overwrites evidence and notes", async () => {
    const { ctx, ev } = await seedOrgWithEvidence();
    const cl = await startChecklist(app.db, ctx, simpleDef);

    await completeStep(app.db, ctx, cl.id, "walk_perimeter", {
      evidenceId: ev.id,
      notes: "first pass",
    });
    const second = await completeStep(app.db, ctx, cl.id, "walk_perimeter", {
      notes: "second pass",
    });
    expect(second.notes).toBe("second pass");
    expect(second.evidenceId).toBeNull();

    const persisted = await adminStep(cl.id, "walk_perimeter");
    expect(persisted?.notes).toBe("second pass");
    expect(persisted?.evidenceId).toBeNull();

    // Second audit event carries the first completion as `before`.
    const events = (await adminTrail(ctx.orgId)).filter(
      (r) => r.action === "checklist.step_completed",
    );
    expect(events).toHaveLength(2);
    expect(events[0]?.before).toMatchObject({ evidenceId: ev.id });
  });

  it("unknown stepKey → ChecklistStateError", async () => {
    const ctx = await seedOrg();
    const cl = await startChecklist(app.db, ctx, simpleDef);
    await expect(
      completeStep(app.db, ctx, cl.id, "no_such_step"),
    ).rejects.toBeInstanceOf(ChecklistStateError);
  });

  it("unknown checklist → ChecklistStateError", async () => {
    const ctx = await seedOrg();
    await expect(
      completeStep(app.db, ctx, GHOST_ID, "walk_perimeter"),
    ).rejects.toBeInstanceOf(ChecklistStateError);
  });
});

describe("evidence gating", () => {
  it("requiresEvidence step without evidenceId → error, step stays incomplete", async () => {
    const ctx = await seedOrg();
    const cl = await startChecklist(app.db, ctx, evidenceDef);
    await expect(
      completeStep(app.db, ctx, cl.id, "photograph_note"),
    ).rejects.toThrow(/requires evidence/);
    const persisted = await adminStep(cl.id, "photograph_note");
    expect(persisted?.completedAt).toBeNull();
  });

  it("nonexistent evidenceId → ChecklistStateError", async () => {
    const ctx = await seedOrg();
    const cl = await startChecklist(app.db, ctx, evidenceDef);
    await expect(
      completeStep(app.db, ctx, cl.id, "photograph_note", {
        evidenceId: GHOST_ID,
      }),
    ).rejects.toBeInstanceOf(ChecklistStateError);
    const persisted = await adminStep(cl.id, "photograph_note");
    expect(persisted?.completedAt).toBeNull();
  });

  it("another org's evidence id is RLS-invisible → ChecklistStateError", async () => {
    const { ev } = await seedOrgWithEvidence(); // org B's evidence
    const ctxA = await seedOrg();
    const cl = await startChecklist(app.db, ctxA, evidenceDef);
    await expect(
      completeStep(app.db, ctxA, cl.id, "photograph_note", {
        evidenceId: ev.id,
      }),
    ).rejects.toBeInstanceOf(ChecklistStateError);
    const persisted = await adminStep(cl.id, "photograph_note");
    expect(persisted?.completedAt).toBeNull();
  });

  it("valid evidence completes the step and stores evidenceId", async () => {
    const { ctx, ev } = await seedOrgWithEvidence();
    const cl = await startChecklist(app.db, ctx, evidenceDef);
    const updated = await completeStep(app.db, ctx, cl.id, "photograph_note", {
      evidenceId: ev.id,
    });
    expect(updated.evidenceId).toBe(ev.id);
    expect(updated.completedAt).toBeInstanceOf(Date);
    const persisted = await adminStep(cl.id, "photograph_note");
    expect(persisted?.evidenceId).toBe(ev.id);
  });
});

describe("signOffChecklist", () => {
  it("is blocked while steps are incomplete, naming them", async () => {
    const ctx = await seedOrg();
    const cl = await startChecklist(app.db, ctx, simpleDef);
    await completeStep(app.db, ctx, cl.id, "walk_perimeter");
    await expect(signOffChecklist(app.db, ctx, cl.id)).rejects.toThrow(
      /incomplete steps.*check_bunding/,
    );
    expect((await adminChecklist(cl.id))?.status).toBe("open");
  });

  it("succeeds when all steps are complete, and audits", async () => {
    const ctx = await seedOrg();
    const cl = await startChecklist(app.db, ctx, simpleDef);
    await completeAll(ctx, cl.id);

    const signed = await signOffChecklist(app.db, ctx, cl.id);
    expect(signed.status).toBe("signed_off");
    expect(signed.signedOffBy).toBe(ctx.actorUserId);
    expect(signed.signedOffAt).toBeInstanceOf(Date);

    const persisted = await adminChecklist(cl.id);
    expect(persisted?.status).toBe("signed_off");
    expect(persisted?.signedOffBy).toBe(ctx.actorUserId);

    const events = (await adminTrail(ctx.orgId)).filter(
      (r) => r.action === "checklist.signed_off",
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      entityType: "checklist",
      entityId: cl.id,
      after: { signedOffBy: ctx.actorUserId },
    });
  });

  it("requires a user actor", async () => {
    const ctx = await seedOrg();
    const cl = await startChecklist(app.db, ctx, simpleDef);
    await completeAll(ctx, cl.id);
    const systemCtx: MutationContext = {
      orgId: ctx.orgId,
      product: ctx.product,
    };
    await expect(
      signOffChecklist(app.db, systemCtx, cl.id),
    ).rejects.toBeInstanceOf(ChecklistStateError);
    expect((await adminChecklist(cl.id))?.status).toBe("open");
  });

  it("double sign-off → ChecklistStateError", async () => {
    const ctx = await seedOrg();
    const cl = await startChecklist(app.db, ctx, simpleDef);
    await completeAll(ctx, cl.id);
    await signOffChecklist(app.db, ctx, cl.id);
    await expect(signOffChecklist(app.db, ctx, cl.id)).rejects.toBeInstanceOf(
      ChecklistStateError,
    );
  });

  it("completeStep after sign-off → ChecklistStateError, step unchanged", async () => {
    const ctx = await seedOrg();
    const cl = await startChecklist(app.db, ctx, simpleDef);
    await completeAll(ctx, cl.id);
    await signOffChecklist(app.db, ctx, cl.id);

    const before = await adminStep(cl.id, "walk_perimeter");
    await expect(
      completeStep(app.db, ctx, cl.id, "walk_perimeter", {
        notes: "late edit",
      }),
    ).rejects.toBeInstanceOf(ChecklistStateError);
    const after = await adminStep(cl.id, "walk_perimeter");
    expect(after).toEqual(before);
  });
});

describe("tenancy (RLS)", () => {
  it("org B cannot see org A's checklist", async () => {
    const ctxA = await seedOrg();
    const ctxB = await seedOrg();
    const cl = await startChecklist(app.db, ctxA, simpleDef);

    await withOrg(app.db, ctxB.orgId, async (tx) => {
      expect(await getChecklist(tx, cl.id)).toBeNull();
      expect(await listChecklists(tx)).toEqual([]);
    });

    // Own org still sees it.
    await withOrg(app.db, ctxA.orgId, async (tx) => {
      expect((await getChecklist(tx, cl.id))?.checklist.id).toBe(cl.id);
    });
  });

  it("org B cannot completeStep or signOff org A's checklist", async () => {
    const ctxA = await seedOrg();
    const ctxB = await seedOrg();
    const cl = await startChecklist(app.db, ctxA, simpleDef);
    await completeAll(ctxA, cl.id);

    await expect(
      completeStep(app.db, ctxB, cl.id, "walk_perimeter", { notes: "steal" }),
    ).rejects.toBeInstanceOf(ChecklistStateError);
    await expect(signOffChecklist(app.db, ctxB, cl.id)).rejects.toBeInstanceOf(
      ChecklistStateError,
    );

    // State unchanged: still open, no cross-org note landed.
    expect((await adminChecklist(cl.id))?.status).toBe("open");
    expect((await adminStep(cl.id, "walk_perimeter"))?.notes).toBeNull();
    const bEvents = (await adminTrail(ctxB.orgId)).filter((r) =>
      r.action.startsWith("checklist."),
    );
    expect(bEvents).toEqual([]);
  });
});

describe("listChecklists filters", () => {
  it("filters by templateKey and by recordId", async () => {
    const { ctx, record } = await seedOrgWithEvidence();
    const a = await startChecklist(app.db, ctx, simpleDef);
    const b = await startChecklist(app.db, ctx, evidenceDef, {
      recordId: record.id,
    });

    await withOrg(app.db, ctx.orgId, async (tx) => {
      expect((await listChecklists(tx)).map((r) => r.id).sort()).toEqual(
        [a.id, b.id].sort(),
      );
      expect(
        (await listChecklists(tx, { templateKey: "daily_site_check" })).map(
          (r) => r.id,
        ),
      ).toEqual([a.id]);
      expect(
        (await listChecklists(tx, { recordId: record.id })).map((r) => r.id),
      ).toEqual([b.id]);
      expect(
        await listChecklists(tx, {
          templateKey: "daily_site_check",
          recordId: record.id,
        }),
      ).toEqual([]);
    });
  });
});

describe("concurrency", () => {
  it("two concurrent sign-offs: exactly one wins", async () => {
    const ctx = await seedOrg();
    const cl = await startChecklist(app.db, ctx, simpleDef);
    await completeAll(ctx, cl.id);

    const results = await Promise.allSettled([
      signOffChecklist(app.db, ctx, cl.id),
      signOffChecklist(app.db, ctx, cl.id),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(ChecklistStateError);

    expect((await adminChecklist(cl.id))?.status).toBe("signed_off");
    const events = (await adminTrail(ctx.orgId)).filter(
      (r) => r.action === "checklist.signed_off",
    );
    expect(events).toHaveLength(1);
  });
});

describe("DB-level freeze (raw SQL cannot bypass sign-off)", () => {
  it("app role cannot un-sign-off via raw UPDATE", async () => {
    const ctx = await seedOrg();
    const cl = await startChecklist(app.db, ctx, simpleDef);
    await completeAll(ctx, cl.id);
    await signOffChecklist(app.db, ctx, cl.id);

    await expect(
      withOrg(app.db, ctx.orgId, (tx) =>
        tx.execute(
          sql`update checklists set status = 'open', signed_off_by = null where id = ${cl.id}`,
        ),
      ),
    ).rejects.toThrow();
    expect((await adminChecklist(cl.id))?.status).toBe("signed_off");
  });

  it("admin cannot mutate a signed-off checklist either (trigger)", async () => {
    const ctx = await seedOrg();
    const cl = await startChecklist(app.db, ctx, simpleDef);
    await completeAll(ctx, cl.id);
    await signOffChecklist(app.db, ctx, cl.id);

    await expect(
      admin.db.execute(sql`update checklists set name = 'renamed' where id = ${cl.id}`),
    ).rejects.toThrow();
    await expect(
      admin.db.execute(sql`delete from checklists where id = ${cl.id}`),
    ).rejects.toThrow();
  });

  it("steps of a signed-off checklist are frozen against raw UPDATE", async () => {
    const ctx = await seedOrg();
    const cl = await startChecklist(app.db, ctx, simpleDef);
    await completeAll(ctx, cl.id);
    await signOffChecklist(app.db, ctx, cl.id);

    await expect(
      withOrg(app.db, ctx.orgId, (tx) =>
        tx.execute(
          sql`update checklist_steps set notes = 'tampered' where checklist_id = ${cl.id}`,
        ),
      ),
    ).rejects.toThrow();
    await expect(
      admin.db.execute(
        sql`update checklist_steps set notes = 'tampered' where checklist_id = ${cl.id}`,
      ),
    ).rejects.toThrow();
  });

  it("checklists cannot be inserted pre-signed-off (forge guard)", async () => {
    const ctx = await seedOrg();
    await expect(
      withOrg(app.db, ctx.orgId, (tx) =>
        tx.execute(
          sql`insert into checklists (org_id, product, template_key, name, status)
              values (${ctx.orgId}, 'wasteduty', 'forged', 'Forged', 'signed_off')`,
        ),
      ),
    ).rejects.toThrow();
  });

  it("dangling evidence_id is rejected by the FK even via raw SQL", async () => {
    const ctx = await seedOrg();
    const cl = await startChecklist(app.db, ctx, simpleDef);
    await expect(
      withOrg(app.db, ctx.orgId, (tx) =>
        tx.execute(
          sql`update checklist_steps set evidence_id = gen_random_uuid() where checklist_id = ${cl.id}`,
        ),
      ),
    ).rejects.toThrow();
  });
});
