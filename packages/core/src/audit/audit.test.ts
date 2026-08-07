/**
 * Audit module integration tests against real Postgres.
 *
 * Same two-connection setup as src/db/rls.test.ts:
 *  - admin (superuser `factory`): migrations, truncation.
 *  - app (`app_login` in factory_app): all flows run here under RLS.
 *
 * IMPORTANT: audit_log is append-only for EVERY role (trigger blocks
 * UPDATE/DELETE/TRUNCATE even for the owner), so rows accumulate across
 * tests. Each test creates fresh orgs/users and scopes assertions to
 * those rows — never assert on global audit_log contents.
 */
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, runMigrations, type DbHandle } from "../db/index.js";
import { auditLog, orgs } from "../db/schema/index.js";
import { withOrg } from "../db/client.js";
import { audit, readAuditTrail } from "./index.js";
import {
  addMember,
  confirmTotpEnrolment,
  createOrgWithOwner,
  createSession,
  requestMagicLink,
  revokeAllSessions,
  revokeSession,
  startTotpEnrolment,
  totpCode,
  verifyMagicLink,
} from "../identity/index.js";
import type { MailSender } from "../identity/mail.js";

const ADMIN_URL =
  process.env.DATABASE_URL_TEST ??
  "postgres://factory:factory@localhost:5433/factory";

const APP_URL = (() => {
  const u = new URL(ADMIN_URL);
  u.username = "app_login";
  u.password = "app";
  return u.toString();
})();

/**
 * The immutability trigger raises "audit_log is append-only" (a plain
 * RAISE EXCEPTION, SQLSTATE P0001). Drizzle wraps the pg error, so walk
 * the cause chain — same pattern as rls.test.ts's isRlsViolation.
 */
function isAppendOnlyViolation(err: unknown): boolean {
  for (let e = err; e instanceof Error; e = e.cause as Error) {
    if (/append-only/i.test(e.message)) return true;
  }
  return false;
}

/**
 * The app role is stopped one layer earlier than the trigger: it simply
 * has no UPDATE/DELETE grants on audit_log (SQLSTATE 42501, "permission
 * denied"). Either message proves the row cannot be modified.
 */
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

/** Trail rows for one org, read as admin (bypasses RLS), newest first. */
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
      `Audit tests need a reachable Postgres at ${ADMIN_URL} ` +
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
  // audit_log is deliberately NOT truncated — it can't be. Fresh orgs per
  // test keep assertions isolated.
  await admin.db.execute(sql`TRUNCATE users, orgs CASCADE`);
  mail = new FakeMailSender();
});

/** Seed one org + owner + one audit row; returns ids for integrity tests. */
async function seedOrgWithAuditRow() {
  const userId = await loginUser(
    `owner-${Date.now()}-${Math.random()}@example.com`,
  );
  const { orgId } = await createOrgWithOwner(app.db, "Integrity Co", userId);
  const [row] = await adminTrail(orgId);
  if (!row) throw new Error("test setup: no audit row written");
  return { orgId, userId, rowId: row.id };
}

describe("audit_log integrity (append-only for every role)", () => {
  it("UPDATE is blocked for the app role", async () => {
    const { orgId, rowId } = await seedOrgWithAuditRow();
    await expect(
      withOrg(app.db, orgId, (tx) =>
        tx
          .update(auditLog)
          .set({ action: "tampered" })
          .where(eq(auditLog.id, rowId)),
      ),
    ).rejects.toSatisfy(isImmutabilityViolation);
  });

  it("DELETE is blocked for the app role", async () => {
    const { orgId, rowId } = await seedOrgWithAuditRow();
    await expect(
      withOrg(app.db, orgId, (tx) =>
        tx.delete(auditLog).where(eq(auditLog.id, rowId)),
      ),
    ).rejects.toSatisfy(isImmutabilityViolation);
  });

  it("UPDATE is blocked even for the admin/superuser", async () => {
    const { rowId } = await seedOrgWithAuditRow();
    await expect(
      admin.db
        .update(auditLog)
        .set({ action: "tampered" })
        .where(eq(auditLog.id, rowId)),
    ).rejects.toSatisfy(isAppendOnlyViolation);
  });

  it("DELETE is blocked even for the admin/superuser", async () => {
    const { rowId } = await seedOrgWithAuditRow();
    await expect(
      admin.db.delete(auditLog).where(eq(auditLog.id, rowId)),
    ).rejects.toSatisfy(isAppendOnlyViolation);
    // and the row survived
    const [row] = await admin.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.id, rowId));
    expect(row).toBeDefined();
  });

  it("TRUNCATE is blocked even for the admin/superuser", async () => {
    await seedOrgWithAuditRow();
    await expect(admin.db.execute(sql`TRUNCATE audit_log`)).rejects.toSatisfy(
      isAppendOnlyViolation,
    );
  });
});

describe("audit_log tenancy", () => {
  it("org A's trail is invisible to org B (readAuditTrail and raw select)", async () => {
    const alice = await loginUser("alice@example.com");
    const bob = await loginUser("bob@example.com");
    const { orgId: orgA } = await createOrgWithOwner(app.db, "A Co", alice);
    const { orgId: orgB } = await createOrgWithOwner(app.db, "B Co", bob);

    // Under org B's context, asking for org A's trail returns nothing.
    const crossRead = await withOrg(app.db, orgB, (tx) =>
      readAuditTrail(tx, orgA),
    );
    expect(crossRead).toEqual([]);

    // Raw select under org B sees only org B rows.
    const rawB = await withOrg(app.db, orgB, (tx) =>
      tx.select().from(auditLog),
    );
    expect(rawB.length).toBeGreaterThan(0);
    expect(rawB.every((r) => r.orgId === orgB)).toBe(true);

    // Own trail works.
    const ownA = await withOrg(app.db, orgA, (tx) => readAuditTrail(tx, orgA));
    expect(ownA.length).toBeGreaterThan(0);
    expect(ownA.every((r) => r.orgId === orgA)).toBe(true);
  });

  it("a session with no org context sees no audit rows", async () => {
    const alice = await loginUser("alice@example.com");
    await createOrgWithOwner(app.db, "A Co", alice);
    const rows = await app.db.select().from(auditLog);
    expect(rows).toEqual([]);
  });
});

describe("audit() atomicity", () => {
  it("a failing transaction rolls back both the mutation and its audit entry", async () => {
    const alice = await loginUser("alice@example.com");
    const { orgId } = await createOrgWithOwner(app.db, "A Co", alice);
    const before = await adminTrail(orgId);

    await expect(
      withOrg(app.db, orgId, async (tx) => {
        await tx
          .update(orgs)
          .set({ name: "Renamed Co" })
          .where(eq(orgs.id, orgId));
        await audit(tx, orgId, {
          product: "identity",
          action: "org.renamed",
          entityType: "org",
          entityId: orgId,
          actorUserId: alice,
          after: { name: "Renamed Co" },
        });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    // Neither the rename nor the audit row persisted.
    const [org] = await admin.db.select().from(orgs).where(eq(orgs.id, orgId));
    expect(org?.name).toBe("A Co");
    const after = await adminTrail(orgId);
    expect(after).toHaveLength(before.length);
    expect(after.some((r) => r.action === "org.renamed")).toBe(false);
  });
});

describe("identity retrofit", () => {
  it("createOrgWithOwner writes org.created + member.added with product and actor", async () => {
    const alice = await loginUser("alice@example.com");
    const { orgId } = await createOrgWithOwner(
      app.db,
      "Waste Co",
      alice,
      "wasteduty",
    );
    const trail = await adminTrail(orgId);
    expect(trail).toHaveLength(2);

    const created = trail.find((r) => r.action === "org.created");
    expect(created).toMatchObject({
      product: "wasteduty",
      entityType: "org",
      entityId: orgId,
      actorUserId: alice,
      after: { name: "Waste Co" },
    });

    const added = trail.find((r) => r.action === "member.added");
    expect(added).toMatchObject({
      product: "wasteduty",
      entityType: "member",
      entityId: alice,
      actorUserId: alice,
      after: { role: "owner" },
    });
  });

  it("addMember writes member.added with the acting user as actor and role/email in after", async () => {
    const alice = await loginUser("alice@example.com");
    const { orgId } = await createOrgWithOwner(app.db, "A Co", alice);
    const { userId: bob } = await addMember(
      app.db,
      orgId,
      alice,
      "bob@example.com",
      "member",
    );

    const trail = await adminTrail(orgId);
    const entry = trail.find(
      (r) => r.action === "member.added" && r.entityId === bob,
    );
    expect(entry).toMatchObject({
      product: "identity",
      actorUserId: alice,
      after: { role: "member", email: "bob@example.com" },
    });
  });

  it("createSession fans user.signed_in out to ALL the user's orgs", async () => {
    const alice = await loginUser("alice@example.com");
    const bob = await loginUser("bob@example.com");
    const { orgId: orgA } = await createOrgWithOwner(app.db, "A Co", alice);
    const { orgId: orgB } = await createOrgWithOwner(app.db, "B Co", bob);
    await addMember(app.db, orgB, bob, "alice@example.com", "member");

    await createSession(app.db, alice);

    for (const orgId of [orgA, orgB]) {
      const trail = await adminTrail(orgId);
      const signIns = trail.filter(
        (r) => r.action === "user.signed_in" && r.actorUserId === alice,
      );
      expect(signIns).toHaveLength(1);
      expect(signIns[0]).toMatchObject({
        product: "identity",
        entityType: "session",
      });
      expect(signIns[0]!.entityId).not.toBe("unknown");
    }
  });

  it("revokeSession writes user.session_revoked", async () => {
    const alice = await loginUser("alice@example.com");
    const { orgId } = await createOrgWithOwner(app.db, "A Co", alice);
    const session = await createSession(app.db, alice);
    await revokeSession(app.db, session.token);

    const trail = await adminTrail(orgId);
    const entry = trail.find((r) => r.action === "user.session_revoked");
    expect(entry).toMatchObject({
      product: "identity",
      entityType: "session",
      actorUserId: alice,
    });
  });

  it("revokeAllSessions writes user.all_sessions_revoked with revokedCount", async () => {
    const alice = await loginUser("alice@example.com");
    const { orgId } = await createOrgWithOwner(app.db, "A Co", alice);
    await createSession(app.db, alice);
    await createSession(app.db, alice);
    await revokeAllSessions(app.db, alice);

    const trail = await adminTrail(orgId);
    const entry = trail.find((r) => r.action === "user.all_sessions_revoked");
    expect(entry).toMatchObject({
      product: "identity",
      entityType: "user",
      entityId: alice,
      actorUserId: alice,
      after: { revokedCount: 2 },
    });
  });

  it("confirmTotpEnrolment writes user.totp_enabled", async () => {
    const alice = await loginUser("alice@example.com");
    const { orgId } = await createOrgWithOwner(app.db, "A Co", alice);
    const { secret } = await startTotpEnrolment(app.db, alice, "Factory");
    expect(
      await confirmTotpEnrolment(app.db, alice, totpCode(secret, Date.now())),
    ).toBe(true);

    const trail = await adminTrail(orgId);
    const entry = trail.find((r) => r.action === "user.totp_enabled");
    expect(entry).toMatchObject({
      product: "identity",
      entityType: "user",
      entityId: alice,
      actorUserId: alice,
    });
  });
});

describe("readAuditTrail ordering and limit", () => {
  it("returns newest first and honours the limit", async () => {
    const alice = await loginUser("alice@example.com");
    const { orgId } = await createOrgWithOwner(app.db, "A Co", alice);

    // Write 5 entries in known order (separate transactions → distinct
    // created_at timestamps from the clock, but same-microsecond ties are
    // possible; assert on non-strict ordering of timestamps plus limit).
    for (let i = 0; i < 5; i++) {
      await withOrg(app.db, orgId, (tx) =>
        audit(tx, orgId, {
          product: "identity",
          action: `test.event_${i}`,
          entityType: "test",
          entityId: String(i),
          actorUserId: alice,
        }),
      );
    }

    const trail = await withOrg(app.db, orgId, (tx) =>
      readAuditTrail(tx, orgId),
    );
    // 2 from createOrgWithOwner + 5 test events
    expect(trail).toHaveLength(7);
    for (let i = 1; i < trail.length; i++) {
      expect(trail[i - 1]!.createdAt.getTime()).toBeGreaterThanOrEqual(
        trail[i]!.createdAt.getTime(),
      );
    }
    // The latest test event should be at/near the top.
    expect(trail[0]!.action).toBe("test.event_4");

    const limited = await withOrg(app.db, orgId, (tx) =>
      readAuditTrail(tx, orgId, 3),
    );
    expect(limited).toHaveLength(3);
    expect(limited.map((r) => r.id)).toEqual(
      trail.slice(0, 3).map((r) => r.id),
    );
  });
});
