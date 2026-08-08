/**
 * Identity hardening tests (security audit H1/H2/M1 + LOWs) against
 * real Postgres. Same two-connection setup as identity.test.ts:
 *  - admin (superuser `factory`): migrations, truncation, backdating.
 *  - app (`app_login` in factory_app): every flow under test runs here.
 *
 * auth_attempts is never truncated (append-forward counters), so every
 * test derives unique emails/keys via random suffixes.
 */
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type DbHandle } from "../db/index.js";
import { runMigrations } from "../db/migrate.js";
import { authAttempts, stripeEvents, users } from "../db/schema/index.js";
import { withOrg } from "../db/client.js";
import { readAuditTrail } from "../audit/index.js";
import {
  confirmTotpEnrolment,
  createOrgWithOwner,
  createSession,
  disableTotp,
  enforceRateLimit,
  RateLimitError,
  requestMagicLink,
  startTotpEnrolment,
  totpCode,
  upsertUserByEmail,
  validateSession,
  verifyMagicLink,
  verifyUserTotp,
} from "./index.js";
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

/**
 * The append-only trigger raises via a plain RAISE EXCEPTION; drizzle
 * wraps the pg error, so walk the cause chain — same pattern as
 * audit.test.ts / rls.test.ts.
 */
function isAppendOnlyViolation(err: unknown): boolean {
  for (let e = err; e instanceof Error; e = e.cause as Error) {
    if (/append-only/i.test(e.message)) return true;
  }
  return false;
}

/** No DELETE grant → SQLSTATE 42501 "permission denied". */
function isPermissionDenied(err: unknown): boolean {
  for (let e = err; e instanceof Error; e = e.cause as Error) {
    if (/permission denied/i.test(e.message)) return true;
    if ((e as { code?: string }).code === "42501") return true;
  }
  return false;
}

let admin: DbHandle;
let app: DbHandle;
let mail: FakeMailSender;

const buildUrl = (token: string) => `https://app.example/verify?t=${token}`;

/** Unique suffix per call — auth_attempts keys must never collide across runs. */
const uniq = () => randomUUID().slice(0, 13);

async function loginUser(email: string): Promise<string> {
  const req = await requestMagicLink(app.db, email, buildUrl, mail);
  const verified = await verifyMagicLink(app.db, req.token);
  if (!verified) throw new Error("test setup: magic link verify failed");
  return verified.userId;
}

/** Enrol + confirm TOTP for a fresh user; returns { userId, secret }. */
async function enrolTotpUser(): Promise<{ userId: string; secret: string }> {
  const userId = await loginUser(`mfa-${uniq()}@example.com`);
  const { secret } = await startTotpEnrolment(app.db, userId, "Factory");
  const ok = await confirmTotpEnrolment(
    app.db,
    userId,
    totpCode(secret, Date.now()),
  );
  if (!ok) throw new Error("test setup: TOTP confirm failed");
  return { userId, secret };
}

beforeAll(async () => {
  admin = createDb(ADMIN_URL);
  try {
    await admin.db.execute(sql`select 1`);
  } catch (err) {
    throw new Error(
      `Hardening tests need a reachable Postgres at ${ADMIN_URL} ` +
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
  mail = new FakeMailSender();
});

describe("enforceRateLimit", () => {
  const OPTS = { max: 3, windowSeconds: 60 };

  it("allows max requests, then throws RateLimitError with a sane retryAfterSeconds", async () => {
    const key = `test:${uniq()}`;
    for (let i = 0; i < OPTS.max; i++) {
      await expect(
        enforceRateLimit(app.db, key, OPTS),
      ).resolves.toBeUndefined();
    }
    let caught: unknown;
    try {
      await enforceRateLimit(app.db, key, OPTS);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(RateLimitError);
    const rl = caught as RateLimitError;
    expect(rl.key).toBe(key);
    expect(rl.retryAfterSeconds).toBeGreaterThan(0);
    expect(rl.retryAfterSeconds).toBeLessThanOrEqual(OPTS.windowSeconds);
  });

  it("separate keys count independently", async () => {
    const a = `test:${uniq()}`;
    const b = `test:${uniq()}`;
    for (let i = 0; i < OPTS.max; i++) await enforceRateLimit(app.db, a, OPTS);
    // key a is at its limit; key b is untouched
    await expect(enforceRateLimit(app.db, a, OPTS)).rejects.toThrow(
      RateLimitError,
    );
    await expect(enforceRateLimit(app.db, b, OPTS)).resolves.toBeUndefined();
  });

  it("an expired window resets: fresh request passes with count back to 1", async () => {
    const key = `test:${uniq()}`;
    for (let i = 0; i < OPTS.max; i++)
      await enforceRateLimit(app.db, key, OPTS);
    await expect(enforceRateLimit(app.db, key, OPTS)).rejects.toThrow(
      RateLimitError,
    );

    // Simulate the window elapsing (admin backdates — no sleeping).
    await admin.db
      .update(authAttempts)
      .set({
        windowStart: new Date(Date.now() - (OPTS.windowSeconds + 5) * 1000),
      })
      .where(eq(authAttempts.key, key));

    await expect(enforceRateLimit(app.db, key, OPTS)).resolves.toBeUndefined();
    const [row] = await admin.db
      .select()
      .from(authAttempts)
      .where(eq(authAttempts.key, key));
    expect(row!.count).toBe(1);
  });
});

describe("TOTP replay protection (H2)", () => {
  it("rejects the same code twice, accepts the next step, then rejects the older step", async () => {
    const { userId, secret } = await enrolTotpUser();

    // The code just consumed by confirmTotpEnrolment must not log in.
    const currentCode = totpCode(secret, Date.now());
    expect(await verifyUserTotp(app.db, userId, currentCode)).toBe(false);

    // The next step's code (inside the ±1 skew window) advances the counter.
    const nextCode = totpCode(secret, Date.now() + 30_000);
    expect(await verifyUserTotp(app.db, userId, nextCode)).toBe(true);

    // Replaying the older step after a newer one was used fails.
    expect(await verifyUserTotp(app.db, userId, currentCode)).toBe(false);
    // And so does replaying the newer one itself.
    expect(await verifyUserTotp(app.db, userId, nextCode)).toBe(false);
  });
});

describe("confirmTotpEnrolment session revocation (M1)", () => {
  it("revokes pre-existing sessions and audits user.totp_enabled", async () => {
    const userId = await loginUser(`mfa-${uniq()}@example.com`);
    const { orgId } = await createOrgWithOwner(app.db, "Acme", userId);
    const preSession = await createSession(app.db, userId);
    expect(await validateSession(app.db, preSession.token)).toBe(userId);

    const { secret } = await startTotpEnrolment(app.db, userId, "Factory");
    expect(
      await confirmTotpEnrolment(app.db, userId, totpCode(secret, Date.now())),
    ).toBe(true);

    // Session issued under weaker (pre-2FA) auth is dead.
    expect(await validateSession(app.db, preSession.token)).toBeNull();

    const trail = await withOrg(app.db, orgId, (tx) =>
      readAuditTrail(tx, orgId),
    );
    expect(trail.map((e) => e.action)).toContain("user.totp_enabled");
  });
});

describe("disableTotp", () => {
  it("a wrong code returns false and leaves TOTP enabled", async () => {
    const { userId, secret } = await enrolTotpUser();
    // A code from 5 steps ago is outside the ±1 window.
    const stale = totpCode(secret, Date.now() - 5 * 30_000);
    expect(await disableTotp(app.db, userId, stale)).toBe(false);

    const [user] = await admin.db
      .select()
      .from(users)
      .where(eq(users.id, userId));
    expect(user!.totpEnabled).toBe(true);
    expect(user!.totpSecret).not.toBeNull();
  });

  it("a valid code disables TOTP, allows re-enrolment, and audits user.totp_disabled", async () => {
    const userId = await loginUser(`mfa-${uniq()}@example.com`);
    const { orgId } = await createOrgWithOwner(app.db, "Acme", userId);
    const { secret } = await startTotpEnrolment(app.db, userId, "Factory");
    expect(
      await confirmTotpEnrolment(app.db, userId, totpCode(secret, Date.now())),
    ).toBe(true);

    // confirm consumed the current step — disable needs the NEXT step.
    expect(
      await disableTotp(app.db, userId, totpCode(secret, Date.now() + 30_000)),
    ).toBe(true);

    const [user] = await admin.db
      .select()
      .from(users)
      .where(eq(users.id, userId));
    expect(user!.totpEnabled).toBe(false);
    expect(user!.totpSecret).toBeNull();
    expect(user!.totpLastUsedStep).toBeNull();

    // Fully cleared: enrolment can start again from scratch.
    await expect(
      startTotpEnrolment(app.db, userId, "Factory"),
    ).resolves.toHaveProperty("secret");

    const trail = await withOrg(app.db, orgId, (tx) =>
      readAuditTrail(tx, orgId),
    );
    expect(trail.map((e) => e.action)).toContain("user.totp_disabled");
  });
});

describe("TOTP attempt rate limit", () => {
  it("throws RateLimitError once the per-user budget is exhausted — even for a correct code", async () => {
    const { userId, secret } = await enrolTotpUser();
    // Budget is 10/15min per user; confirmTotpEnrolment already used 1.
    for (let i = 0; i < 9; i++) {
      expect(await verifyUserTotp(app.db, userId, "000000")).toBe(
        // one-in-a-million collision aside, always false
        totpCode(secret, Date.now()) === "000000",
      );
    }
    // 11th attempt on the key: rejected before the (valid) code is checked.
    await expect(
      verifyUserTotp(app.db, userId, totpCode(secret, Date.now() + 30_000)),
    ).rejects.toThrow(RateLimitError);
  });
});

describe("magic link rate limit", () => {
  it("allows 5 requests per email per window, throws on the 6th; other emails unaffected", async () => {
    const email = `rl-${uniq()}@example.com`;
    for (let i = 0; i < 5; i++) {
      await requestMagicLink(app.db, email, buildUrl, mail);
    }
    await expect(
      requestMagicLink(app.db, email, buildUrl, mail),
    ).rejects.toThrow(RateLimitError);

    await expect(
      requestMagicLink(app.db, `other-${uniq()}@example.com`, buildUrl, mail),
    ).resolves.toHaveProperty("token");
  });
});

describe("TOTP secret never leaves the module (H1)", () => {
  it("verifyMagicLink and upsertUserByEmail return no totpSecret", async () => {
    const email = `h1-${uniq()}@example.com`;
    const upserted = await upsertUserByEmail(app.db, email);
    expect(upserted).not.toHaveProperty("totpSecret");
    expect(JSON.stringify(upserted)).not.toContain("totpSecret");

    const req = await requestMagicLink(app.db, email, buildUrl, mail);
    const verified = await verifyMagicLink(app.db, req.token);
    expect(verified).not.toBeNull();
    expect(verified).not.toHaveProperty("totpSecret");
    expect(JSON.stringify(verified)).not.toContain("totpSecret");
  });
});

describe("stripe_events immutability (LOW)", () => {
  it("even superuser UPDATE/DELETE hits the append_only trigger", async () => {
    const eventId = `evt_test_${uniq()}`;
    await admin.db
      .insert(stripeEvents)
      .values({ id: eventId, type: "invoice.paid" });

    await expect(
      admin.db
        .update(stripeEvents)
        .set({ type: "tampered" })
        .where(eq(stripeEvents.id, eventId)),
    ).rejects.toSatisfy(isAppendOnlyViolation);

    await expect(
      admin.db.delete(stripeEvents).where(eq(stripeEvents.id, eventId)),
    ).rejects.toSatisfy(isAppendOnlyViolation);

    const [row] = await admin.db
      .select()
      .from(stripeEvents)
      .where(eq(stripeEvents.id, eventId));
    expect(row!.type).toBe("invoice.paid");
  });
});

describe("auth_attempts grants", () => {
  it("the app role cannot DELETE rate-limit counters", async () => {
    const key = `test:${uniq()}`;
    await enforceRateLimit(app.db, key, { max: 5, windowSeconds: 60 });
    await expect(
      app.db.delete(authAttempts).where(eq(authAttempts.key, key)),
    ).rejects.toSatisfy(isPermissionDenied);
    // Counter still there.
    const [row] = await admin.db
      .select()
      .from(authAttempts)
      .where(eq(authAttempts.key, key));
    expect(row).toBeDefined();
  });
});
