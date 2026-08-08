import { and, eq, isNull, or, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { users } from "../db/schema/index.js";
import { auditForUserOrgs } from "../audit/index.js";
import { enforceRateLimit } from "./rate-limit.js";
import { revokeAllSessions } from "./sessions.js";
import { generateTotpSecret, matchTotpStep, totpEnrolmentUri } from "./totp.js";

/** 10 TOTP attempts / 15 min / user — brute force on 6 digits is ~10^6. */
const TOTP_ATTEMPT_LIMIT = { max: 10, windowSeconds: 15 * 60 };

/**
 * Reads exactly the TOTP columns — the secret must never travel in
 * full-row selects that get returned to callers or serialised (audit
 * H1). It stays inside this module.
 */
async function totpColumns(db: Db, userId: string) {
  const [row] = await db
    .select({
      totpSecret: users.totpSecret,
      totpEnabled: users.totpEnabled,
    })
    .from(users)
    .where(eq(users.id, userId));
  return row ?? null;
}

/**
 * Two-step TOTP enrolment: generate + store the secret (disabled), show
 * the QR, then enable only after the user proves their authenticator
 * produces valid codes. Re-running before confirmation rotates the secret.
 */
export async function startTotpEnrolment(
  db: Db,
  userId: string,
  issuer: string,
): Promise<{ secret: string; uri: string }> {
  const [user] = await db
    .select({ email: users.email, totpEnabled: users.totpEnabled })
    .from(users)
    .where(eq(users.id, userId));
  if (!user) throw new Error("user not found");
  if (user.totpEnabled)
    throw new Error("TOTP already enabled; disable it first");

  const secret = generateTotpSecret();
  await db
    .update(users)
    .set({ totpSecret: secret, totpEnabled: false, totpLastUsedStep: null })
    .where(eq(users.id, userId));
  return { secret, uri: totpEnrolmentUri(secret, user.email, issuer) };
}

export async function confirmTotpEnrolment(
  db: Db,
  userId: string,
  code: string,
): Promise<boolean> {
  await enforceRateLimit(db, `totp:${userId}`, TOTP_ATTEMPT_LIMIT);
  const user = await totpColumns(db, userId);
  if (!user?.totpSecret || user.totpEnabled) return false;
  const step = matchTotpStep(user.totpSecret, code);
  if (step === null) return false;
  await db
    .update(users)
    .set({ totpEnabled: true, totpLastUsedStep: step })
    .where(eq(users.id, userId));
  // Sessions predating 2FA were issued under weaker auth — revoke them;
  // the app immediately issues a fresh one for the enrolling user.
  await revokeAllSessions(db, userId);
  await auditForUserOrgs(db, userId, {
    action: "user.totp_enabled",
    entityType: "user",
    entityId: userId,
    actorUserId: userId,
  });
  return true;
}

/**
 * Login-time check. Replay-safe: the accepted step is persisted with a
 * guarded UPDATE that only advances forward, so the same code (or an
 * older one inside the ±1 skew window) can never be accepted twice.
 */
export async function verifyUserTotp(
  db: Db,
  userId: string,
  code: string,
): Promise<boolean> {
  await enforceRateLimit(db, `totp:${userId}`, TOTP_ATTEMPT_LIMIT);
  const user = await totpColumns(db, userId);
  if (!user?.totpSecret || !user.totpEnabled) return false;
  const step = matchTotpStep(user.totpSecret, code);
  if (step === null) return false;
  const [advanced] = await db
    .update(users)
    .set({ totpLastUsedStep: step })
    .where(
      and(
        eq(users.id, userId),
        or(
          isNull(users.totpLastUsedStep),
          sql`${users.totpLastUsedStep} < ${step}`,
        ),
      ),
    )
    .returning({ id: users.id });
  return advanced !== undefined;
}

/**
 * Disable path (device lost after re-auth, or turning 2FA off): requires
 * a currently valid code — possession of a session alone must not be
 * enough to strip the second factor. Clears the secret entirely.
 */
export async function disableTotp(
  db: Db,
  userId: string,
  code: string,
): Promise<boolean> {
  const ok = await verifyUserTotp(db, userId, code);
  if (!ok) return false;
  await db
    .update(users)
    .set({ totpSecret: null, totpEnabled: false, totpLastUsedStep: null })
    .where(eq(users.id, userId));
  await auditForUserOrgs(db, userId, {
    action: "user.totp_disabled",
    entityType: "user",
    entityId: userId,
    actorUserId: userId,
  });
  return true;
}
