/**
 * Records module integration tests against real Postgres.
 *
 * Same two-connection setup as src/audit/audit.test.ts:
 *  - admin (superuser `factory`): migrations, truncation, RLS-bypassing
 *    assertions.
 *  - app (`app_login` in factory_app): all flows run here under RLS.
 *
 * IMPORTANT: audit_log and record_versions are append-only for EVERY role
 * (triggers block UPDATE/DELETE/TRUNCATE even for the owner), so rows
 * accumulate across tests. record_versions has NO FK to records, so
 * `TRUNCATE records CASCADE` does not touch it and truncating it directly
 * is trigger-blocked. Every test therefore uses fresh orgs/users and
 * scopes version/audit assertions by recordId/orgId.
 */
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, runMigrations, type DbHandle } from "../db/index.js";
import { withOrg } from "../db/client.js";
import { auditLog, records, recordVersions } from "../db/schema/index.js";
import type { MutationContext } from "../audit/mutate.js";
import {
  createOrgWithOwner,
  requestMagicLink,
  verifyMagicLink,
} from "../identity/index.js";
import type { MailSender } from "../identity/mail.js";
import {
  createRecord,
  defineEntity,
  getRecord,
  listRecords,
  listVersions,
  readRecords,
  softDeleteRecord,
  updateRecord,
  RecordNotFoundError,
  VersionConflictError,
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

/** Trigger raises "record_versions is append-only" (SQLSTATE P0001). */
function isAppendOnlyViolation(err: unknown): boolean {
  for (let e = err; e instanceof Error; e = e.cause as Error) {
    if (/append-only/i.test(e.message)) return true;
  }
  return false;
}

/** App role may instead be stopped by missing grants (42501). */
function isImmutabilityViolation(err: unknown): boolean {
  if (isAppendOnlyViolation(err)) return true;
  for (let e = err; e instanceof Error; e = e.cause as Error) {
    if (/permission denied/i.test(e.message)) return true;
    if ((e as { code?: string }).code === "42501") return true;
  }
  return false;
}

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
  const { orgId } = await createOrgWithOwner(app.db, "Records Co", userId);
  return { orgId, product, actorUserId: userId };
}

const receipt = defineEntity(
  "waste_receipt",
  z.object({
    carrier: z.string().min(1),
    tonnes: z.number().positive(),
    hazardous: z.boolean().default(false),
    notes: z.string().optional(),
  }),
);

/** Version rows for one record, read as admin (bypasses RLS), newest first. */
async function adminVersions(recordId: string) {
  return admin.db
    .select()
    .from(recordVersions)
    .where(eq(recordVersions.recordId, recordId))
    .orderBy(sql`${recordVersions.version} desc`);
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
      `Records tests need a reachable Postgres at ${ADMIN_URL} ` +
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
  // record_versions and audit_log deliberately NOT truncated — they can't
  // be. Fresh orgs per test + recordId-scoped assertions keep isolation.
  await admin.db.execute(sql`TRUNCATE users, orgs, records CASCADE`);
  mail = new FakeMailSender();
});

describe("entity schema boundary", () => {
  it("valid input creates a record and data round-trips through jsonb", async () => {
    const ctx = await seedOrg();
    const row = await createRecord(app.db, ctx, receipt, {
      carrier: "Acme Haulage",
      tonnes: 2.5,
      notes: "bay 4",
    });
    expect(row.entityType).toBe("waste_receipt");
    expect(row.version).toBe(1);
    expect(row.orgId).toBe(ctx.orgId);
    expect(row.data).toEqual({
      carrier: "Acme Haulage",
      tonnes: 2.5,
      hazardous: false, // Zod default applied at the boundary
      notes: "bay 4",
    });

    const read = await readRecords(app.db, ctx.orgId, (tx) =>
      getRecord(tx, receipt.type, row.id),
    );
    expect(read?.data).toEqual(row.data);
  });

  it("invalid input throws ZodError and writes NOTHING", async () => {
    const ctx = await seedOrg();
    const trailBefore = await adminTrail(ctx.orgId);

    await expect(
      createRecord(app.db, ctx, receipt, {
        carrier: "",
        tonnes: -1,
      } as z.input<typeof receipt.schema>),
    ).rejects.toBeInstanceOf(z.ZodError);

    const rows = await admin.db
      .select()
      .from(records)
      .where(eq(records.orgId, ctx.orgId));
    expect(rows).toEqual([]);
    const versions = await admin.db
      .select()
      .from(recordVersions)
      .where(eq(recordVersions.orgId, ctx.orgId));
    expect(versions).toEqual([]);
    const trailAfter = await adminTrail(ctx.orgId);
    expect(trailAfter).toHaveLength(trailBefore.length);
  });

  it("defineEntity rejects non-snake_case type names", () => {
    expect(() => defineEntity("WasteReceipt", z.object({}))).toThrow(
      /snake_case/,
    );
    expect(() => defineEntity("waste-receipt", z.object({}))).toThrow(
      /snake_case/,
    );
    expect(() => defineEntity("1receipt", z.object({}))).toThrow(/snake_case/);
    expect(() => defineEntity("waste_receipt_2", z.object({}))).not.toThrow();
  });
});

describe("versioning", () => {
  it("create=v1, update bumps to v2; one version row per version with data/createdBy; listVersions newest-first", async () => {
    const ctx = await seedOrg();
    const created = await createRecord(app.db, ctx, receipt, {
      carrier: "First Ltd",
      tonnes: 1,
    });
    expect(created.version).toBe(1);

    const updated = await updateRecord(app.db, ctx, receipt, created.id, 1, {
      carrier: "Second Ltd",
      tonnes: 3,
    });
    expect(updated.version).toBe(2);
    expect(updated.data).toMatchObject({ carrier: "Second Ltd", tonnes: 3 });

    const versions = await adminVersions(created.id);
    expect(versions).toHaveLength(2);
    expect(versions.map((v) => v.version)).toEqual([2, 1]);
    expect(versions[0]).toMatchObject({
      data: { carrier: "Second Ltd", tonnes: 3, hazardous: false },
      createdBy: ctx.actorUserId,
    });
    expect(versions[1]).toMatchObject({
      data: { carrier: "First Ltd", tonnes: 1, hazardous: false },
      createdBy: ctx.actorUserId,
    });

    // Public API agrees, newest first.
    const listed = await readRecords(app.db, ctx.orgId, (tx) =>
      listVersions(tx, created.id),
    );
    expect(listed.map((v) => v.version)).toEqual([2, 1]);
  });
});

describe("optimistic concurrency", () => {
  it("stale expectedVersion → VersionConflictError; data, versions and audit unchanged", async () => {
    const ctx = await seedOrg();
    const created = await createRecord(app.db, ctx, receipt, {
      carrier: "Stable Ltd",
      tonnes: 5,
    });
    await updateRecord(app.db, ctx, receipt, created.id, 1, {
      carrier: "Stable Ltd",
      tonnes: 6,
    });
    const versionsBefore = await adminVersions(created.id);
    const trailBefore = await adminTrail(ctx.orgId);

    // Version is now 2; retrying with the stale expectedVersion=1 loses.
    await expect(
      updateRecord(app.db, ctx, receipt, created.id, 1, {
        carrier: "Sneaky Ltd",
        tonnes: 99,
      }),
    ).rejects.toBeInstanceOf(VersionConflictError);

    const [row] = await admin.db
      .select()
      .from(records)
      .where(eq(records.id, created.id));
    expect(row?.version).toBe(2);
    expect(row?.data).toMatchObject({ carrier: "Stable Ltd", tonnes: 6 });
    expect(await adminVersions(created.id)).toHaveLength(versionsBefore.length);
    expect(await adminTrail(ctx.orgId)).toHaveLength(trailBefore.length);
  });

  it("concurrent updates with the same expectedVersion — exactly one wins", async () => {
    const ctx = await seedOrg();
    const created = await createRecord(app.db, ctx, receipt, {
      carrier: "Race Ltd",
      tonnes: 1,
    });

    const attempts = await Promise.allSettled([
      updateRecord(app.db, ctx, receipt, created.id, 1, {
        carrier: "Writer A",
        tonnes: 10,
      }),
      updateRecord(app.db, ctx, receipt, created.id, 1, {
        carrier: "Writer B",
        tonnes: 20,
      }),
    ]);

    const wins = attempts.filter((a) => a.status === "fulfilled");
    const losses = attempts.filter((a) => a.status === "rejected");
    expect(wins).toHaveLength(1);
    expect(losses).toHaveLength(1);
    expect((losses[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      VersionConflictError,
    );

    const [row] = await admin.db
      .select()
      .from(records)
      .where(eq(records.id, created.id));
    expect(row?.version).toBe(2);
    const winner = (wins[0] as PromiseFulfilledResult<{ data: unknown }>).value;
    expect(row?.data).toEqual(winner.data);
    // Exactly v1 + v2, no orphan version row from the loser.
    expect((await adminVersions(created.id)).map((v) => v.version)).toEqual([
      2, 1,
    ]);
  });
});

describe("soft delete", () => {
  it("hides the record from getRecord/listRecords, keeps versions, blocks further writes", async () => {
    const ctx = await seedOrg();
    const created = await createRecord(app.db, ctx, receipt, {
      carrier: "Gone Ltd",
      tonnes: 4,
    });
    await softDeleteRecord(app.db, ctx, receipt.type, created.id);

    await readRecords(app.db, ctx.orgId, async (tx) => {
      expect(await getRecord(tx, receipt.type, created.id)).toBeNull();
      expect(await listRecords(tx, "wasteduty", receipt.type)).toEqual([]);
      const withDeleted = await listRecords(tx, "wasteduty", receipt.type, {
        includeDeleted: true,
      });
      expect(withDeleted.map((r) => r.id)).toEqual([created.id]);
      expect(withDeleted[0]!.deletedAt).not.toBeNull();
      // History stays listable for inspections.
      const versions = await listVersions(tx, created.id);
      expect(versions.map((v) => v.version)).toEqual([1]);
    });

    await expect(
      updateRecord(app.db, ctx, receipt, created.id, 1, {
        carrier: "Zombie Ltd",
        tonnes: 1,
      }),
    ).rejects.toBeInstanceOf(RecordNotFoundError);

    await expect(
      softDeleteRecord(app.db, ctx, receipt.type, created.id),
    ).rejects.toBeInstanceOf(RecordNotFoundError);
  });
});

describe("mutate() audit coverage", () => {
  it("create/update/delete each write one audit event with product, actor and payloads", async () => {
    const ctx = await seedOrg("wasteduty");
    const created = await createRecord(app.db, ctx, receipt, {
      carrier: "Audit Ltd",
      tonnes: 1,
    });
    await updateRecord(app.db, ctx, receipt, created.id, 1, {
      carrier: "Audit Ltd",
      tonnes: 2,
    });
    await softDeleteRecord(app.db, ctx, receipt.type, created.id);

    const trail = (await adminTrail(ctx.orgId)).filter(
      (r) => r.entityId === created.id,
    );
    const v1 = { carrier: "Audit Ltd", tonnes: 1, hazardous: false };
    const v2 = { carrier: "Audit Ltd", tonnes: 2, hazardous: false };

    const createdEvt = trail.find((r) => r.action === "record.created");
    expect(createdEvt).toMatchObject({
      product: "wasteduty",
      actorUserId: ctx.actorUserId,
      entityType: "waste_receipt",
      entityId: created.id,
      after: v1,
    });
    expect(createdEvt?.before).toBeNull();

    const updatedEvt = trail.find((r) => r.action === "record.updated");
    expect(updatedEvt).toMatchObject({
      product: "wasteduty",
      actorUserId: ctx.actorUserId,
      entityType: "waste_receipt",
      entityId: created.id,
      before: v1,
      after: v2,
    });

    const deletedEvt = trail.find((r) => r.action === "record.deleted");
    expect(deletedEvt).toMatchObject({
      product: "wasteduty",
      actorUserId: ctx.actorUserId,
      entityType: "waste_receipt",
      entityId: created.id,
      before: v2,
    });
    expect(deletedEvt?.after).toBeNull();

    expect(trail).toHaveLength(3);
  });
});

describe("tenancy (RLS)", () => {
  it("org B cannot read or update org A's record; data unchanged", async () => {
    const ctxA = await seedOrg();
    const ctxB = await seedOrg();
    const created = await createRecord(app.db, ctxA, receipt, {
      carrier: "A Co Carrier",
      tonnes: 7,
    });

    // Invisible to org B's reads.
    await readRecords(app.db, ctxB.orgId, async (tx) => {
      expect(await getRecord(tx, receipt.type, created.id)).toBeNull();
      expect(await listRecords(tx, "wasteduty", receipt.type)).toEqual([]);
    });

    // Update by id from org B's context fails — RLS hides the row.
    await expect(
      updateRecord(app.db, ctxB, receipt, created.id, 1, {
        carrier: "B Co Takeover",
        tonnes: 0.1,
      }),
    ).rejects.toBeInstanceOf(RecordNotFoundError);

    const [row] = await admin.db
      .select()
      .from(records)
      .where(eq(records.id, created.id));
    expect(row?.data).toMatchObject({ carrier: "A Co Carrier", tonnes: 7 });
    expect(row?.version).toBe(1);
  });

  it("record_versions are invisible cross-org", async () => {
    const ctxA = await seedOrg();
    const ctxB = await seedOrg();
    const created = await createRecord(app.db, ctxA, receipt, {
      carrier: "A Co Carrier",
      tonnes: 7,
    });

    const crossVersions = await readRecords(app.db, ctxB.orgId, (tx) =>
      listVersions(tx, created.id),
    );
    expect(crossVersions).toEqual([]);

    // Own org sees them.
    const ownVersions = await readRecords(app.db, ctxA.orgId, (tx) =>
      listVersions(tx, created.id),
    );
    expect(ownVersions).toHaveLength(1);
  });
});

describe("record_versions immutability (append-only for every role)", () => {
  async function seedVersionRow() {
    const ctx = await seedOrg();
    const created = await createRecord(app.db, ctx, receipt, {
      carrier: "Immutable Ltd",
      tonnes: 1,
    });
    const [versionRow] = await adminVersions(created.id);
    if (!versionRow) throw new Error("test setup: no version row written");
    return { ctx, versionRow };
  }

  it("UPDATE is blocked for the app role", async () => {
    const { ctx, versionRow } = await seedVersionRow();
    await expect(
      withOrg(app.db, ctx.orgId, (tx) =>
        tx
          .update(recordVersions)
          .set({ data: { tampered: true } })
          .where(eq(recordVersions.id, versionRow.id)),
      ),
    ).rejects.toSatisfy(isImmutabilityViolation);
  });

  it("DELETE is blocked for the app role", async () => {
    const { ctx, versionRow } = await seedVersionRow();
    await expect(
      withOrg(app.db, ctx.orgId, (tx) =>
        tx.delete(recordVersions).where(eq(recordVersions.id, versionRow.id)),
      ),
    ).rejects.toSatisfy(isImmutabilityViolation);
  });

  it("UPDATE is blocked even for the admin/superuser", async () => {
    const { versionRow } = await seedVersionRow();
    await expect(
      admin.db
        .update(recordVersions)
        .set({ data: { tampered: true } })
        .where(eq(recordVersions.id, versionRow.id)),
    ).rejects.toSatisfy(isAppendOnlyViolation);
  });

  it("DELETE is blocked even for the admin/superuser, and the row survives", async () => {
    const { versionRow } = await seedVersionRow();
    await expect(
      admin.db
        .delete(recordVersions)
        .where(eq(recordVersions.id, versionRow.id)),
    ).rejects.toSatisfy(isAppendOnlyViolation);
    const [row] = await admin.db
      .select()
      .from(recordVersions)
      .where(eq(recordVersions.id, versionRow.id));
    expect(row).toBeDefined();
  });

  it("TRUNCATE is blocked even for the admin/superuser", async () => {
    await seedVersionRow();
    await expect(
      admin.db.execute(sql`TRUNCATE record_versions`),
    ).rejects.toSatisfy(isAppendOnlyViolation);
  });
});

describe("entity-type scoping", () => {
  const invoice = defineEntity("invoice", z.object({ amount: z.number() }));

  it("getRecord with the wrong entityType returns null", async () => {
    const ctx = await seedOrg();
    const created = await createRecord(app.db, ctx, receipt, {
      carrier: "Typed Ltd",
      tonnes: 1,
    });
    await readRecords(app.db, ctx.orgId, async (tx) => {
      expect(await getRecord(tx, invoice.type, created.id)).toBeNull();
      expect(await getRecord(tx, receipt.type, created.id)).not.toBeNull();
    });
  });

  it("updateRecord with the wrong entity def → RecordNotFoundError", async () => {
    const ctx = await seedOrg();
    const created = await createRecord(app.db, ctx, receipt, {
      carrier: "Typed Ltd",
      tonnes: 1,
    });
    await expect(
      updateRecord(app.db, ctx, invoice, created.id, 1, { amount: 5 }),
    ).rejects.toBeInstanceOf(RecordNotFoundError);
    const [row] = await admin.db
      .select()
      .from(records)
      .where(eq(records.id, created.id));
    expect(row?.version).toBe(1);
    expect(row?.data).toMatchObject({ carrier: "Typed Ltd" });
  });
});
