import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { sessions } from "../db/schema/index.js";
import { generateToken, hashToken } from "./tokens.js";

export const SESSION_TTL_DAYS = 30;

export interface IssuedSession {
  /** Raw bearer token — goes into an httpOnly cookie, never stored. */
  token: string;
  expiresAt: Date;
}

export async function createSession(
  db: Db,
  userId: string,
): Promise<IssuedSession> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60_000);
  await db
    .insert(sessions)
    .values({ userId, tokenHash: hashToken(token), expiresAt });
  return { token, expiresAt };
}

/** Returns the userId for a live session, null otherwise. */
export async function validateSession(
  db: Db,
  token: string,
): Promise<string | null> {
  const [row] = await db
    .select({ userId: sessions.userId })
    .from(sessions)
    .where(
      and(
        eq(sessions.tokenHash, hashToken(token)),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, sql`now()`),
      ),
    );
  return row?.userId ?? null;
}

export async function revokeSession(db: Db, token: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: sql`now()` })
    .where(eq(sessions.tokenHash, hashToken(token)));
}

/** Sign-out-everywhere / lost-device path. */
export async function revokeAllSessions(db: Db, userId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: sql`now()` })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}
