import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { users } from "../db/schema/index.js";
import { generateTotpSecret, totpEnrolmentUri, verifyTotp } from "./totp.js";
import { auditForUserOrgs } from "../audit/index.js";

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
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new Error("user not found");
  if (user.totpEnabled)
    throw new Error("TOTP already enabled; disable it first");

  const secret = generateTotpSecret();
  await db
    .update(users)
    .set({ totpSecret: secret, totpEnabled: false })
    .where(eq(users.id, userId));
  return { secret, uri: totpEnrolmentUri(secret, user.email, issuer) };
}

export async function confirmTotpEnrolment(
  db: Db,
  userId: string,
  code: string,
): Promise<boolean> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user?.totpSecret || user.totpEnabled) return false;
  if (!verifyTotp(user.totpSecret, code)) return false;
  await db.update(users).set({ totpEnabled: true }).where(eq(users.id, userId));
  await auditForUserOrgs(db, userId, {
    action: "user.totp_enabled",
    entityType: "user",
    entityId: userId,
    actorUserId: userId,
  });
  return true;
}

/** Login-time check for users with TOTP enabled. */
export async function verifyUserTotp(
  db: Db,
  userId: string,
  code: string,
): Promise<boolean> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user?.totpSecret || !user.totpEnabled) return false;
  return verifyTotp(user.totpSecret, code);
}
