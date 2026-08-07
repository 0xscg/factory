import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { magicLinkTokens, users } from "../db/schema/index.js";
import type { MailSender } from "./mail.js";
import { generateToken, hashToken } from "./tokens.js";
import { upsertUserByEmail } from "./users.js";

export const MAGIC_LINK_TTL_MINUTES = 15;

export interface MagicLinkRequest {
  userId: string;
  /** Raw token — appears only in the email link, never stored. */
  token: string;
  expiresAt: Date;
}

/**
 * Creates the user on first sight (signup and login are the same flow),
 * issues a single-use token, and emails the link. Returns the request so
 * callers/tests can build the URL; the raw token must not be logged.
 */
export async function requestMagicLink(
  db: Db,
  rawEmail: string,
  buildUrl: (token: string) => string,
  mail: MailSender,
): Promise<MagicLinkRequest> {
  const user = await upsertUserByEmail(db, rawEmail);
  const email = user.email;

  const token = generateToken();
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MINUTES * 60_000);
  await db
    .insert(magicLinkTokens)
    .values({ userId: user.id, tokenHash: hashToken(token), expiresAt });

  await mail.send({
    to: email,
    subject: "Your sign-in link",
    text: `Sign in: ${buildUrl(token)}\n\nThis link is valid for ${MAGIC_LINK_TTL_MINUTES} minutes and can be used once.`,
  });

  return { userId: user.id, token, expiresAt };
}

export interface MagicLinkVerification {
  userId: string;
  /** True when the user has TOTP enabled — the session must not be issued until the code passes. */
  totpRequired: boolean;
}

/**
 * Single-use, race-safe consume: the UPDATE only wins if consumed_at is
 * still NULL and the token is unexpired, so two concurrent redemptions
 * can't both succeed.
 */
export async function verifyMagicLink(
  db: Db,
  token: string,
): Promise<MagicLinkVerification | null> {
  const [consumed] = await db
    .update(magicLinkTokens)
    .set({ consumedAt: sql`now()` })
    .where(
      and(
        eq(magicLinkTokens.tokenHash, hashToken(token)),
        isNull(magicLinkTokens.consumedAt),
        gt(magicLinkTokens.expiresAt, sql`now()`),
      ),
    )
    .returning({ userId: magicLinkTokens.userId });
  if (!consumed) return null;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, consumed.userId));
  if (!user) return null;
  return { userId: user.id, totpRequired: user.totpEnabled };
}
