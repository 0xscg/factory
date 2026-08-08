import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** RFC 6238 TOTP (SHA-1, 6 digits, 30s step) — what authenticator apps expect. */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;

export function generateTotpSecret(): string {
  const bytes = randomBytes(20);
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(secret: string): Buffer {
  const clean = secret.toUpperCase().replace(/=+$/, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) throw new Error("Invalid base32 character in TOTP secret");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function totpCode(secret: string, atMs: number): string {
  const counter = Math.floor(atMs / 1000 / TOTP_STEP_SECONDS);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", base32Decode(secret))
    .update(counterBuf)
    .digest();
  const offset = (hmac[hmac.length - 1] as number) & 0x0f;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** TOTP_DIGITS;
  return code.toString().padStart(TOTP_DIGITS, "0");
}

/**
 * Accepts the current step ±1 (clock skew), constant-time comparison.
 * Returns the matched counter STEP so callers can persist it and
 * reject replays (a code must never be accepted twice — the DB guard
 * in verifyUserTotp only advances forward). Null when no step matches.
 */
export function matchTotpStep(
  secret: string,
  token: string,
  atMs: number = Date.now(),
): number | null {
  if (!/^\d{6}$/.test(token)) return null;
  const tokenBuf = Buffer.from(token);
  for (const skew of [0, -1, 1]) {
    const stepMs = atMs + skew * TOTP_STEP_SECONDS * 1000;
    const expected = totpCode(secret, stepMs);
    if (timingSafeEqual(tokenBuf, Buffer.from(expected))) {
      return Math.floor(stepMs / 1000 / TOTP_STEP_SECONDS);
    }
  }
  return null;
}

/** Stateless check — login flows must use verifyUserTotp (replay-safe). */
export function verifyTotp(
  secret: string,
  token: string,
  atMs: number = Date.now(),
): boolean {
  return matchTotpStep(secret, token, atMs) !== null;
}

/** otpauth:// URI for authenticator-app enrolment QR codes. */
export function totpEnrolmentUri(
  secret: string,
  email: string,
  issuer: string,
): string {
  const label = encodeURIComponent(`${issuer}:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`;
}
