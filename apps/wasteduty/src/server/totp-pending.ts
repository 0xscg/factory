import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";

/**
 * Short-lived HMAC-signed "magic link verified, TOTP outstanding" token.
 * Needed because verifyMagicLink consumes the link single-use BEFORE the
 * TOTP step (chassis gap: no two-phase verification handle) — the app
 * must carry the half-authenticated userId across the TOTP form without
 * a session. httpOnly cookie, 10-minute TTL, signed with AUTH_SECRET.
 */
const TTL_MS = 10 * 60_000;

function sign(payload: string): string {
  return createHmac("sha256", env.AUTH_SECRET).update(payload).digest("hex");
}

export function issuePendingTotp(userId: string): string {
  const payload = `${userId}.${Date.now() + TTL_MS}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyPendingTotp(token: string): string | null {
  const [userId, expires, sig] = token.split(".");
  if (!userId || !expires || !sig) return null;
  const payload = `${userId}.${expires}`;
  const expected = Buffer.from(sign(payload), "hex");
  const given = Buffer.from(sig, "hex");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return null;
  }
  if (Number(expires) < Date.now()) return null;
  return userId;
}
