/**
 * Deadline engine integration tests against real Postgres.
 *
 * Same two-connection setup as src/checklists/checklists.test.ts:
 *  - admin (superuser `factory`): migrations, truncation, RLS-bypassing
 *    assertions.
 *  - app (`app_login` in factory_app): all flows run here under RLS.
 *
 * audit_log is append-only and never truncated; obligations is mutable
 * and truncated per test alongside users/orgs. All instants are fixed
 * Dates — no wall clock, no sleeps. Mail: recording FakeMailSender.
 */
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, runMigrations, type DbHandle } from "../db/index.js";
import { withOrg } from "../db/client.js";
import { auditLog, obligations } from "../db/schema/index.js";
import type { MutationContext } from "../audit/mutate.js";
import {
  createOrgWithOwner,
  requestMagicLink,
  verifyMagicLink,
} from "../identity/index.js";
import type { MailSender } from "../identity/mail.js";
import {
  DEFAULT_ESCALATION_STAGES,
  computeObligation,
  defineDeadline,
  listObligations,
  markObligationMet,
  scanAndNotify,
  type DeadlineDef,
  type NotificationTarget,
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

class ThrowingMailSender implements MailSender {
  attempts = 0;
  async send(): Promise<void> {
    this.attempts += 1;
    throw new Error("mail vendor down");
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
  const { orgId } = await createOrgWithOwner(app.db, "Deadline Co", userId);
  // The magic-link login above sent a sign-in email; drop it so tests
  // assert only on deadline notifications.
  mail.messages = [];
  return { orgId, product, actorUserId: userId };
}

// ---- fixed instants: everything derives from DUE, never the wall clock ----
const DUE = new Date("2026-06-30T12:00:00.000Z");
const DAY = 86_400_000;
const HOUR = 3_600_000;
const at = (offsetMs: number) => new Date(DUE.getTime() + offsetMs);

/** A rule due at the fixed instant DUE, stages [30, 7, 1, 0]. */
const annualReturn = defineDeadline({
  key: "annual_return",
  name: "Annual waste return",
  citation: "Env Act 2021 s.58",
  escalationDaysBefore: [30, 7, 1, 0],
  due: () => DUE,
});

const RULES: Record<string, DeadlineDef> = { annual_return: annualReturn };

function target(
  ctx: MutationContext,
  emails = ["owner@example.com"],
): NotificationTarget {
  return { orgId: ctx.orgId, product: ctx.product, emails };
}

/** now used for computeObligation calls; irrelevant for fixed-date rules. */
const NOW = at(-60 * DAY);

async function adminObligation(id: string) {
  const [row] = await admin.db
    .select()
    .from(obligations)
    .where(eq(obligations.id, id));
  return row;
}

/** Audit rows for one org, read as admin, newest first. */
async function adminTrail(orgId: string) {
  return admin.db
    .select()
    .from(auditLog)
    .where(eq(auditLog.orgId, orgId))
    .orderBy(sql`${auditLog.createdAt} desc`);
}

beforeAll(async () => {
  admin = createDb(ADMIN_URL);
  try {
    await admin.db.execute(sql`select 1`);
  } catch (err) {
    throw new Error(
      `Deadline tests need a reachable Postgres at ${ADMIN_URL} ` +
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
  // audit_log is append-only and never truncated; obligations is mutable.
  await admin.db.execute(sql`TRUNCATE users, orgs, obligations CASCADE`);
  mail = new FakeMailSender();
});

describe("defineDeadline", () => {
  it("sorts escalation stages descending regardless of input order", () => {
    const def = defineDeadline({
      key: "jumbled",
      name: "Jumbled",
      citation: "cite",
      escalationDaysBefore: [1, 30, 0, 7],
      due: () => DUE,
    });
    expect(def.escalationDaysBefore).toEqual([30, 7, 1, 0]);
  });

  it("rejects invalid keys", () => {
    for (const bad of [
      "CamelCase",
      "kebab-case",
      "1leading",
      "with space",
      "",
    ]) {
      expect(() =>
        defineDeadline({
          key: bad,
          name: "Bad",
          citation: "cite",
          escalationDaysBefore: [7],
          due: () => DUE,
        }),
      ).toThrow();
    }
  });

  it("rejects an empty citation", () => {
    expect(() =>
      defineDeadline({
        key: "no_cite",
        name: "No cite",
        citation: "",
        escalationDaysBefore: [7],
        due: () => DUE,
      }),
    ).toThrow();
  });

  it("rejects empty escalation stages and negative stages", () => {
    expect(() =>
      defineDeadline({
        key: "no_stages",
        name: "No stages",
        citation: "cite",
        escalationDaysBefore: [],
        due: () => DUE,
      }),
    ).toThrow();
    expect(() =>
      defineDeadline({
        key: "neg_stage",
        name: "Negative",
        citation: "cite",
        escalationDaysBefore: [-1],
        due: () => DUE,
      }),
    ).toThrow();
  });

  it("passes due() through untouched", () => {
    const marker = new Date("2030-01-01T00:00:00.000Z");
    const def = defineDeadline({
      key: "passthrough",
      name: "Passthrough",
      citation: "cite",
      escalationDaysBefore: [7],
      due: ({ record }) => (record ? marker : null),
    });
    expect(def.due({ now: NOW })).toBeNull();
    expect(def.due({ now: NOW, record: {} })).toBe(marker);
  });
});

describe("computeObligation", () => {
  it("creates the obligation and audits obligation.created", async () => {
    const ctx = await seedOrg();
    const row = await computeObligation(app.db, ctx, annualReturn, {
      now: NOW,
    });
    expect(row).toMatchObject({
      orgId: ctx.orgId,
      product: ctx.product,
      ruleKey: "annual_return",
      name: "Annual waste return",
      citation: "Env Act 2021 s.58",
      status: "pending",
      recordId: null,
      notifiedStages: [],
    });
    expect(row?.dueAt.getTime()).toBe(DUE.getTime());

    const events = (await adminTrail(ctx.orgId)).filter(
      (r) => r.action === "obligation.created",
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      entityType: "obligation",
      entityId: row?.id,
      after: {
        ruleKey: "annual_return",
        citation: "Env Act 2021 s.58",
        dueAt: DUE.toISOString(),
      },
    });
  });

  it("is idempotent on org+rule+dueAt: same row back, recomputation audited", async () => {
    const ctx = await seedOrg();
    const first = await computeObligation(app.db, ctx, annualReturn, {
      now: NOW,
    });
    const second = await computeObligation(app.db, ctx, annualReturn, {
      now: at(-10 * DAY), // different now, same fixed due
    });
    expect(second?.id).toBe(first?.id);

    const rows = await admin.db
      .select()
      .from(obligations)
      .where(eq(obligations.orgId, ctx.orgId));
    expect(rows).toHaveLength(1);

    const events = (await adminTrail(ctx.orgId)).filter(
      (r) => r.action === "obligation.recomputed",
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      after: { ruleKey: "annual_return", duplicate: true },
    });
  });

  it("rule whose due() returns null creates nothing", async () => {
    const ctx = await seedOrg();
    const notApplicable = defineDeadline({
      key: "not_applicable",
      name: "Not applicable",
      citation: "cite",
      escalationDaysBefore: [7],
      due: () => null,
    });
    const row = await computeObligation(app.db, ctx, notApplicable, {
      now: NOW,
    });
    expect(row).toBeNull();
    const rows = await admin.db
      .select()
      .from(obligations)
      .where(eq(obligations.orgId, ctx.orgId));
    expect(rows).toEqual([]);
    const events = (await adminTrail(ctx.orgId)).filter((r) =>
      r.action.startsWith("obligation."),
    );
    expect(events).toEqual([]);
  });

  it("record-relative rule derives due from record data and links recordId", async () => {
    const ctx = await seedOrg();
    const receiptRule = defineDeadline({
      key: "receipt_followup",
      name: "Receipt follow-up",
      citation: "Reg 12(3)",
      escalationDaysBefore: [1, 0],
      due: ({ record }) => {
        const receivedAt = (record as { receivedAt?: string })?.receivedAt;
        return receivedAt
          ? new Date(new Date(receivedAt).getTime() + 2 * DAY)
          : null;
      },
    });
    const recordId = "11111111-2222-4333-8444-555555555555";
    const receivedAt = "2026-03-01T09:00:00.000Z";
    const row = await computeObligation(app.db, ctx, receiptRule, {
      now: NOW,
      record: { id: recordId, data: { receivedAt } },
    });
    expect(row?.recordId).toBe(recordId);
    expect(row?.dueAt.toISOString()).toBe("2026-03-03T09:00:00.000Z");
  });
});

describe("escalation boundary sweep", () => {
  // Fresh obligation, stages [30,7,1,0]: one stage fires per scan and it is
  // the FURTHEST-OUT unsent stage whose window has arrived — so any instant
  // at or after D-30d fires 30 first, and only before D-30d fires nothing.
  const sweep: { label: string; offset: number; stage: number | null }[] = [
    { label: "D-31d", offset: -31 * DAY, stage: null },
    { label: "D-30d", offset: -30 * DAY, stage: 30 },
    { label: "D-29d", offset: -29 * DAY, stage: 30 },
    { label: "D-8d", offset: -8 * DAY, stage: 30 },
    { label: "D-7d", offset: -7 * DAY, stage: 30 },
    { label: "D-1d", offset: -1 * DAY, stage: 30 },
    { label: "D-1h", offset: -1 * HOUR, stage: 30 },
    { label: "D", offset: 0, stage: 30 },
    { label: "D+1h", offset: 1 * HOUR, stage: 30 },
  ];

  for (const { label, offset, stage } of sweep) {
    it(`fresh obligation at ${label} fires ${stage === null ? "nothing" : `stage ${stage}`}`, async () => {
      const ctx = await seedOrg();
      const row = await computeObligation(app.db, ctx, annualReturn, {
        now: NOW,
      });
      const res = await scanAndNotify(
        app.db,
        target(ctx),
        RULES,
        mail,
        at(offset),
      );
      if (stage === null) {
        expect(res.notified).toEqual([]);
        expect(mail.messages).toEqual([]);
      } else {
        expect(res.notified).toEqual([{ obligationId: row?.id, stage }]);
        expect(mail.messages).toHaveLength(1);
      }
    });
  }

  // With earlier stages already recorded, the correct NEXT stage fires.
  const catchUp: {
    label: string;
    sent: number[];
    offset: number;
    stage: number | null;
  }[] = [
    { label: "[30] sent, D-6d → 7", sent: [30], offset: -6 * DAY, stage: 7 },
    {
      label: "[30] sent, D-8d → nothing",
      sent: [30],
      offset: -8 * DAY,
      stage: null,
    },
    {
      label: "[30,7] sent, D-1d → 1",
      sent: [30, 7],
      offset: -1 * DAY,
      stage: 1,
    },
    {
      label: "[30,7] sent, D-1h → 1",
      sent: [30, 7],
      offset: -1 * HOUR,
      stage: 1,
    },
    { label: "[30,7,1] sent, D → 0", sent: [30, 7, 1], offset: 0, stage: 0 },
    {
      label: "[30,7,1] sent, D-1h → nothing",
      sent: [30, 7, 1],
      offset: -1 * HOUR,
      stage: null,
    },
    {
      label: "[30,7,1,0] sent, D+1h → nothing",
      sent: [30, 7, 1, 0],
      offset: 1 * HOUR,
      stage: null,
    },
  ];

  for (const { label, sent, offset, stage } of catchUp) {
    it(label, async () => {
      const ctx = await seedOrg();
      const row = await computeObligation(app.db, ctx, annualReturn, {
        now: NOW,
      });
      await withOrg(app.db, ctx.orgId, (tx) =>
        tx
          .update(obligations)
          .set({ notifiedStages: sent })
          .where(eq(obligations.id, row!.id)),
      );
      const res = await scanAndNotify(
        app.db,
        target(ctx),
        RULES,
        mail,
        at(offset),
      );
      if (stage === null) expect(res.notified).toEqual([]);
      else expect(res.notified).toEqual([{ obligationId: row?.id, stage }]);
    });
  }
});

describe("stage-once semantics", () => {
  it("repeated scans at the same instant send nothing new", async () => {
    const ctx = await seedOrg();
    const row = await computeObligation(app.db, ctx, annualReturn, {
      now: NOW,
    });
    const now = at(-10 * DAY);
    const first = await scanAndNotify(app.db, target(ctx), RULES, mail, now);
    expect(first.notified).toEqual([{ obligationId: row?.id, stage: 30 }]);
    const second = await scanAndNotify(app.db, target(ctx), RULES, mail, now);
    const third = await scanAndNotify(app.db, target(ctx), RULES, mail, now);
    expect(second.notified).toEqual([]);
    expect(third.notified).toEqual([]);
    expect(mail.messages).toHaveLength(1);
  });

  it("sequential scans walk 30 → 7 → 1 → 0 exactly once each; stages persisted", async () => {
    const ctx = await seedOrg();
    const row = await computeObligation(app.db, ctx, annualReturn, {
      now: NOW,
    });
    const fired: number[] = [];
    // Walk forward through time; at some instants nothing fires, at others one stage.
    for (const offset of [
      -40 * DAY,
      -30 * DAY,
      -20 * DAY,
      -7 * DAY,
      -7 * DAY,
      -1 * DAY,
      -1 * HOUR,
      0,
      0,
      2 * HOUR,
    ]) {
      const res = await scanAndNotify(
        app.db,
        target(ctx),
        RULES,
        mail,
        at(offset),
      );
      fired.push(...res.notified.map((n) => n.stage));
    }
    expect(fired).toEqual([30, 7, 1, 0]);
    expect(mail.messages).toHaveLength(4);
    const persisted = await adminObligation(row!.id);
    expect(persisted?.notifiedStages).toEqual([30, 7, 1, 0]);
  });
});

describe("markObligationMet", () => {
  it("sets met/metAt/metBy and audits obligation.met", async () => {
    const ctx = await seedOrg();
    const row = await computeObligation(app.db, ctx, annualReturn, {
      now: NOW,
    });
    const met = await markObligationMet(app.db, ctx, row!.id);
    expect(met.status).toBe("met");
    expect(met.metAt).toBeInstanceOf(Date);
    expect(met.metBy).toBe(ctx.actorUserId);

    const persisted = await adminObligation(row!.id);
    expect(persisted?.status).toBe("met");
    expect(persisted?.metBy).toBe(ctx.actorUserId);

    const events = (await adminTrail(ctx.orgId)).filter(
      (r) => r.action === "obligation.met",
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      entityType: "obligation",
      entityId: row?.id,
      after: { metBy: ctx.actorUserId },
    });
  });

  it("met obligations never notify", async () => {
    const ctx = await seedOrg();
    const row = await computeObligation(app.db, ctx, annualReturn, {
      now: NOW,
    });
    await markObligationMet(app.db, ctx, row!.id);
    const res = await scanAndNotify(app.db, target(ctx), RULES, mail, at(0));
    expect(res.notified).toEqual([]);
    expect(mail.messages).toEqual([]);
  });

  it("double-met throws", async () => {
    const ctx = await seedOrg();
    const row = await computeObligation(app.db, ctx, annualReturn, {
      now: NOW,
    });
    await markObligationMet(app.db, ctx, row!.id);
    await expect(markObligationMet(app.db, ctx, row!.id)).rejects.toThrow(
      /not found or already met/,
    );
  });
});

describe("notification email content", () => {
  it('stage 0 subject carries the rule name and "due today"; body carries citation', async () => {
    const ctx = await seedOrg();
    // Pre-record all earlier stages so the day-of scan fires stage 0.
    const row = await computeObligation(app.db, ctx, annualReturn, {
      now: NOW,
    });
    await withOrg(app.db, ctx.orgId, (tx) =>
      tx
        .update(obligations)
        .set({ notifiedStages: [30, 7, 1] })
        .where(eq(obligations.id, row!.id)),
    );
    await scanAndNotify(app.db, target(ctx), RULES, mail, at(0));
    expect(mail.messages).toHaveLength(1);
    const msg = mail.messages[0]!;
    expect(msg.subject).toContain("Annual waste return");
    expect(msg.subject).toContain("due today");
    expect(msg.text).toContain("Env Act 2021 s.58");
    expect(msg.text).toContain("2026-06-30");
  });

  it("earlier stages say 'due in N days or fewer'", async () => {
    const ctx = await seedOrg();
    await computeObligation(app.db, ctx, annualReturn, { now: NOW });
    await scanAndNotify(app.db, target(ctx), RULES, mail, at(-10 * DAY));
    expect(mail.messages[0]?.subject).toContain("due in 30 days or fewer");
  });

  it("sends one email per recipient", async () => {
    const ctx = await seedOrg();
    await computeObligation(app.db, ctx, annualReturn, { now: NOW });
    const emails = ["a@example.com", "b@example.com"];
    await scanAndNotify(
      app.db,
      target(ctx, emails),
      RULES,
      mail,
      at(-10 * DAY),
    );
    expect(mail.messages).toHaveLength(2);
    expect(mail.messages.map((m) => m.to).sort()).toEqual(emails);
  });
});

describe("mail-failure isolation", () => {
  it("stage bookkeeping commits before the send; a failed send is at-most-once (never retried)", async () => {
    const ctx = await seedOrg();
    const row = await computeObligation(app.db, ctx, annualReturn, {
      now: NOW,
    });
    const broken = new ThrowingMailSender();

    // Current implementation: send happens post-commit and the error
    // propagates out of scanAndNotify (nothing catches it).
    await expect(
      scanAndNotify(app.db, target(ctx), RULES, broken, at(-10 * DAY)),
    ).rejects.toThrow(/mail vendor down/);
    expect(broken.attempts).toBe(1);

    // The stage was recorded despite the failed send...
    const persisted = await adminObligation(row!.id);
    expect(persisted?.notifiedStages).toEqual([30]);

    // ...so a rescan does NOT resend stage 30 — at-most-once per stage.
    const rescan = await scanAndNotify(
      app.db,
      target(ctx),
      RULES,
      mail,
      at(-10 * DAY),
    );
    expect(rescan.notified).toEqual([]);
    expect(mail.messages).toEqual([]);
  });
});

describe("tenancy (RLS)", () => {
  it("org B's scan does not see or notify org A's obligations", async () => {
    const ctxA = await seedOrg();
    const ctxB = await seedOrg();
    const rowA = await computeObligation(app.db, ctxA, annualReturn, {
      now: NOW,
    });

    const resB = await scanAndNotify(
      app.db,
      target(ctxB, ["b@example.com"]),
      RULES,
      mail,
      at(0),
    );
    expect(resB.notified).toEqual([]);
    expect(mail.messages).toEqual([]);

    // Org A's obligation is untouched by B's scan.
    expect((await adminObligation(rowA!.id))?.notifiedStages).toEqual([]);

    // A's own scan still fires.
    const resA = await scanAndNotify(
      app.db,
      target(ctxA, ["a@example.com"]),
      RULES,
      mail,
      at(0),
    );
    expect(resA.notified).toEqual([{ obligationId: rowA?.id, stage: 30 }]);
    expect(mail.messages.map((m) => m.to)).toEqual(["a@example.com"]);
  });

  it("listObligations is org-isolated and filters by status", async () => {
    const ctxA = await seedOrg();
    const ctxB = await seedOrg();
    const rowA = await computeObligation(app.db, ctxA, annualReturn, {
      now: NOW,
    });
    await computeObligation(app.db, ctxB, annualReturn, { now: NOW });

    await withOrg(app.db, ctxA.orgId, async (tx) => {
      const all = await listObligations(tx, "wasteduty");
      expect(all.map((r) => r.id)).toEqual([rowA?.id]);
      expect(
        (await listObligations(tx, "wasteduty", { status: "met" })).length,
      ).toBe(0);
      expect(
        (await listObligations(tx, "wasteduty", { status: "pending" })).map(
          (r) => r.id,
        ),
      ).toEqual([rowA?.id]);
      expect((await listObligations(tx, "otherskin")).length).toBe(0);
    });

    await markObligationMet(app.db, ctxA, rowA!.id);
    await withOrg(app.db, ctxA.orgId, async (tx) => {
      expect(
        (await listObligations(tx, "wasteduty", { status: "pending" })).length,
      ).toBe(0);
      expect(
        (await listObligations(tx, "wasteduty", { status: "met" })).map(
          (r) => r.id,
        ),
      ).toEqual([rowA?.id]);
    });
  });

  it("scan is product-scoped: skin A's scan ignores skin B's obligations", async () => {
    const ctx = await seedOrg();
    const ctxB = { ...ctx, product: "otherskin" };
    const rowB = await computeObligation(app.db, ctxB, annualReturn, {
      now: NOW,
    });
    expect(rowB?.product).toBe("otherskin");

    // Same org, same rule key, same due instant — distinct row per product.
    const rowA = await computeObligation(app.db, ctx, annualReturn, {
      now: NOW,
    });
    expect(rowA?.id).not.toBe(rowB?.id);

    const res = await scanAndNotify(app.db, target(ctx), RULES, mail, at(0));
    expect(res.notified).toEqual([{ obligationId: rowA?.id, stage: 30 }]);
    const freshB = await adminObligation(rowB!.id);
    expect(freshB?.notifiedStages).toEqual([]);
  });

  it("unknown ruleKey in DB falls back to DEFAULT_ESCALATION_STAGES", async () => {
    expect(DEFAULT_ESCALATION_STAGES).toEqual([30, 7, 1, 0]);
    const ctx = await seedOrg();
    const orphanRule = defineDeadline({
      key: "orphan_rule",
      name: "Orphan rule",
      citation: "cite",
      escalationDaysBefore: [90], // NOT passed to the scan
      due: () => DUE,
    });
    const row = await computeObligation(app.db, ctx, orphanRule, { now: NOW });

    // Scan with a rules map that no longer contains the key (skin changed).
    const res60 = await scanAndNotify(
      app.db,
      target(ctx),
      {},
      mail,
      at(-60 * DAY),
    );
    expect(res60.notified).toEqual([]); // 90 would fire; default 30 does not
    const res10 = await scanAndNotify(
      app.db,
      target(ctx),
      {},
      mail,
      at(-10 * DAY),
    );
    expect(res10.notified).toEqual([{ obligationId: row?.id, stage: 30 }]);
  });
});

describe("deadline.notified audit event", () => {
  it("is written per scan with the notified list", async () => {
    const ctx = await seedOrg();
    const row = await computeObligation(app.db, ctx, annualReturn, {
      now: NOW,
    });
    const now = at(-10 * DAY);
    await scanAndNotify(app.db, target(ctx), RULES, mail, now);

    const events = (await adminTrail(ctx.orgId)).filter(
      (r) => r.action === "deadline.notified",
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      entityType: "obligation_scan",
      entityId: ctx.orgId,
      actorUserId: null, // system-initiated
      after: {
        notified: [{ obligationId: row?.id, stage: 30 }],
        at: now.toISOString(),
      },
    });
  });

  it("a scan with nothing due writes no audit event (idle scans are no-ops)", async () => {
    // Hourly idle scans must not bloat the append-only log with
    // `notified: []` heartbeats — the pre-check skips mutate() entirely.
    const ctx = await seedOrg();
    await scanAndNotify(app.db, target(ctx), RULES, mail, at(-60 * DAY));
    const events = (await adminTrail(ctx.orgId)).filter(
      (r) => r.action === "deadline.notified",
    );
    expect(events).toHaveLength(0);
  });
});
