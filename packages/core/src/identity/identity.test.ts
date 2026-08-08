/**
 * Identity integration tests against real Postgres.
 *
 * Same two-connection setup as src/db/rls.test.ts:
 *  - admin (superuser `factory`): migrations, truncation, backdating rows.
 *  - app (`app_login` in factory_app): every identity flow runs here —
 *    proving the module works under the production role's grants + RLS.
 *
 * Deterministic: expiries are backdated as admin, never slept through.
 */
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, runMigrations, type DbHandle } from "../db/index.js";
import { magicLinkTokens, sessions, users } from "../db/schema/index.js";
import {
  addMember,
  confirmTotpEnrolment,
  createOrgWithOwner,
  createSession,
  ForbiddenError,
  listUserOrgs,
  requestMagicLink,
  requireWriteAccess,
  revokeAllSessions,
  revokeSession,
  startTotpEnrolment,
  totpCode,
  validateSession,
  verifyMagicLink,
} from "./index.js";
import { withOrg } from "../db/client.js";
import type { MailSender } from "./mail.js";

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

/** Full login shortcut used by tests that just need a user id. */
async function loginUser(email: string): Promise<string> {
  const req = await requestMagicLink(app.db, email, buildUrl, mail);
  const verified = await verifyMagicLink(app.db, req.token);
  if (!verified) throw new Error("test setup: magic link verify failed");
  return verified.userId;
}

beforeAll(async () => {
  admin = createDb(ADMIN_URL);
  try {
    await admin.db.execute(sql`select 1`);
  } catch (err) {
    throw new Error(
      `Identity tests need a reachable Postgres at ${ADMIN_URL} ` +
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
  await admin.db.execute(sql`TRUNCATE users, orgs CASCADE`);
  // Fixed emails + persistent rate-limit counters would trip the
  // magic-link limit on a second run inside the window.
  await admin.db.execute(sql`DELETE FROM auth_attempts`);
  mail = new FakeMailSender();
});

describe("magic link", () => {
  it("happy path: emails a link with the raw token, stores only the hash, verifies once", async () => {
    const req = await requestMagicLink(
      app.db,
      "alice@example.com",
      buildUrl,
      mail,
    );

    // mail recorded, link carries the raw token
    expect(mail.messages).toHaveLength(1);
    expect(mail.messages[0]!.to).toBe("alice@example.com");
    expect(mail.messages[0]!.text).toContain(buildUrl(req.token));

    // DB stores a hash, never the raw token (checked as admin)
    const rows = await admin.db.select().from(magicLinkTokens);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).not.toBe(req.token);
    expect(rows[0]!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rows)).not.toContain(req.token);

    const verified = await verifyMagicLink(app.db, req.token);
    expect(verified).toEqual({ userId: req.userId, totpRequired: false });
  });

  it("is single-use: the second verify returns null", async () => {
    const req = await requestMagicLink(app.db, "a@example.com", buildUrl, mail);
    expect(await verifyMagicLink(app.db, req.token)).not.toBeNull();
    expect(await verifyMagicLink(app.db, req.token)).toBeNull();
  });

  it("rejects an expired token (past expires_at set as admin)", async () => {
    const req = await requestMagicLink(app.db, "a@example.com", buildUrl, mail);
    await admin.db
      .update(magicLinkTokens)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(magicLinkTokens.userId, req.userId));
    expect(await verifyMagicLink(app.db, req.token)).toBeNull();
  });

  it("exactly one of two CONCURRENT redemptions wins (race safety)", async () => {
    const req = await requestMagicLink(app.db, "a@example.com", buildUrl, mail);
    const results = await Promise.all([
      verifyMagicLink(app.db, req.token),
      verifyMagicLink(app.db, req.token),
    ]);
    const wins = results.filter((r) => r !== null);
    expect(wins).toHaveLength(1);
    expect(wins[0]!.userId).toBe(req.userId);
  });

  it("returns null for an unknown token", async () => {
    expect(await verifyMagicLink(app.db, "no-such-token")).toBeNull();
  });

  it("normalizes email: mixed case + whitespace map to one user", async () => {
    const a = await requestMagicLink(
      app.db,
      "  Alice@Example.COM ",
      buildUrl,
      mail,
    );
    const b = await requestMagicLink(
      app.db,
      "alice@example.com",
      buildUrl,
      mail,
    );
    expect(b.userId).toBe(a.userId);
    const rows = await admin.db.select().from(users);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.email).toBe("alice@example.com");
    expect(mail.messages.every((m) => m.to === "alice@example.com")).toBe(true);
  });
});

describe("sessions", () => {
  it("validate returns the userId for a live session, and stores only a hash", async () => {
    const userId = await loginUser("s@example.com");
    const session = await createSession(app.db, userId);
    expect(await validateSession(app.db, session.token)).toBe(userId);

    const rows = await admin.db.select().from(sessions);
    expect(rows[0]!.tokenHash).not.toBe(session.token);
    expect(await validateSession(app.db, "bogus")).toBeNull();
  });

  it("revokeSession invalidates that session only", async () => {
    const userId = await loginUser("s@example.com");
    const s1 = await createSession(app.db, userId);
    const s2 = await createSession(app.db, userId);
    await revokeSession(app.db, s1.token);
    expect(await validateSession(app.db, s1.token)).toBeNull();
    expect(await validateSession(app.db, s2.token)).toBe(userId);
  });

  it("revokeAllSessions invalidates every session for the user, not others'", async () => {
    const alice = await loginUser("alice@example.com");
    const bob = await loginUser("bob@example.com");
    const a1 = await createSession(app.db, alice);
    const a2 = await createSession(app.db, alice);
    const b1 = await createSession(app.db, bob);
    await revokeAllSessions(app.db, alice);
    expect(await validateSession(app.db, a1.token)).toBeNull();
    expect(await validateSession(app.db, a2.token)).toBeNull();
    expect(await validateSession(app.db, b1.token)).toBe(bob);
  });

  it("an expired session is invalid (expires_at backdated as admin)", async () => {
    const userId = await loginUser("s@example.com");
    const session = await createSession(app.db, userId);
    await admin.db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.userId, userId));
    expect(await validateSession(app.db, session.token)).toBeNull();
  });
});

describe("orgs and roles", () => {
  it("createOrgWithOwner gives the creator the owner role", async () => {
    const userId = await loginUser("owner@example.com");
    const { orgId } = await createOrgWithOwner(app.db, "Acme", userId);
    expect(await listUserOrgs(app.db, userId)).toEqual([
      { orgId, role: "owner" },
    ]);
  });

  it("owner and admin can addMember; member and auditor cannot", async () => {
    const owner = await loginUser("owner@example.com");
    const { orgId } = await createOrgWithOwner(app.db, "Acme", owner);

    const { userId: adminUser } = await addMember(
      app.db,
      orgId,
      owner,
      "admin@example.com",
      "admin",
    );
    const { userId: memberUser } = await addMember(
      app.db,
      orgId,
      adminUser,
      "member@example.com",
      "member",
    );
    const { userId: auditorUser } = await addMember(
      app.db,
      orgId,
      adminUser,
      "auditor@example.com",
      "auditor",
    );

    for (const actor of [memberUser, auditorUser]) {
      await expect(
        addMember(app.db, orgId, actor, "new@example.com", "member"),
      ).rejects.toThrow(ForbiddenError);
    }
  });

  it("cannot grant the owner role via addMember", async () => {
    const owner = await loginUser("owner@example.com");
    const { orgId } = await createOrgWithOwner(app.db, "Acme", owner);
    await expect(
      addMember(app.db, orgId, owner, "usurper@example.com", "owner"),
    ).rejects.toThrow(/transferred, not granted/);
  });

  it("a non-member actor cannot addMember (RLS hides the org's members)", async () => {
    const owner = await loginUser("owner@example.com");
    const outsider = await loginUser("outsider@example.com");
    const { orgId } = await createOrgWithOwner(app.db, "Acme", owner);
    await expect(
      addMember(app.db, orgId, outsider, "x@example.com", "member"),
    ).rejects.toThrow(ForbiddenError);
  });

  it("listUserOrgs returns only the caller's own memberships", async () => {
    const alice = await loginUser("alice@example.com");
    const bob = await loginUser("bob@example.com");
    const { orgId: orgA } = await createOrgWithOwner(app.db, "Alice Co", alice);
    const { orgId: orgB } = await createOrgWithOwner(app.db, "Bob Co", bob);
    await addMember(app.db, orgA, alice, "bob@example.com", "member");

    expect(await listUserOrgs(app.db, alice)).toEqual([
      { orgId: orgA, role: "owner" },
    ]);
    const bobs = await listUserOrgs(app.db, bob);
    expect(bobs).toHaveLength(2);
    expect(bobs).toEqual(
      expect.arrayContaining([
        { orgId: orgB, role: "owner" },
        { orgId: orgA, role: "member" },
      ]),
    );
  });

  it("requireWriteAccess rejects an auditor, allows a member", async () => {
    const owner = await loginUser("owner@example.com");
    const { orgId } = await createOrgWithOwner(app.db, "Acme", owner);
    const { userId: auditor } = await addMember(
      app.db,
      orgId,
      owner,
      "auditor@example.com",
      "auditor",
    );
    const { userId: member } = await addMember(
      app.db,
      orgId,
      owner,
      "member@example.com",
      "member",
    );

    await expect(
      withOrg(app.db, orgId, (tx) => requireWriteAccess(tx, orgId, auditor)),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      withOrg(app.db, orgId, (tx) => requireWriteAccess(tx, orgId, member)),
    ).resolves.toBe("member");
  });
});

describe("TOTP enrolment", () => {
  it("start → confirm with a valid code → next magic-link verify reports totpRequired", async () => {
    const userId = await loginUser("mfa@example.com");
    const { secret, uri } = await startTotpEnrolment(app.db, userId, "Factory");
    expect(uri).toContain(`secret=${secret}`);

    expect(
      await confirmTotpEnrolment(app.db, userId, totpCode(secret, Date.now())),
    ).toBe(true);

    const req = await requestMagicLink(
      app.db,
      "mfa@example.com",
      buildUrl,
      mail,
    );
    expect(await verifyMagicLink(app.db, req.token)).toEqual({
      userId,
      totpRequired: true,
    });
  });

  it("a wrong code does not enable TOTP", async () => {
    const userId = await loginUser("mfa@example.com");
    const { secret } = await startTotpEnrolment(app.db, userId, "Factory");
    // a code from 5 steps ago is outside the ±1 window
    const stale = totpCode(secret, Date.now() - 5 * 30_000);
    expect(await confirmTotpEnrolment(app.db, userId, stale)).toBe(false);
    expect(await confirmTotpEnrolment(app.db, userId, "000000")).toBe(
      // one-in-a-million collision with the real code aside, this is false
      totpCode(secret, Date.now()) === "000000",
    );

    const [user] = await admin.db
      .select()
      .from(users)
      .where(eq(users.id, userId));
    expect(user!.totpEnabled).toBe(false);
  });

  it("re-starting enrolment before confirm rotates the secret; old codes stop working", async () => {
    const userId = await loginUser("mfa@example.com");
    const first = await startTotpEnrolment(app.db, userId, "Factory");
    const second = await startTotpEnrolment(app.db, userId, "Factory");
    expect(second.secret).not.toBe(first.secret);

    expect(
      await confirmTotpEnrolment(
        app.db,
        userId,
        totpCode(first.secret, Date.now()),
      ),
    ).toBe(false);
    expect(
      await confirmTotpEnrolment(
        app.db,
        userId,
        totpCode(second.secret, Date.now()),
      ),
    ).toBe(true);
  });

  it("cannot re-start enrolment once TOTP is enabled", async () => {
    const userId = await loginUser("mfa@example.com");
    const { secret } = await startTotpEnrolment(app.db, userId, "Factory");
    await confirmTotpEnrolment(app.db, userId, totpCode(secret, Date.now()));
    await expect(startTotpEnrolment(app.db, userId, "Factory")).rejects.toThrow(
      /already enabled/,
    );
  });
});
