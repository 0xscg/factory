import { sql } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { authAttempts } from "../db/schema/index.js";

export class RateLimitError extends Error {
  constructor(key: string, retryAfterSeconds: number) {
    super(`rate limit exceeded; retry in ${retryAfterSeconds}s`);
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
    this.key = key;
  }
  readonly retryAfterSeconds: number;
  readonly key: string;
}

/**
 * Fixed-window counter, atomic in one upsert: expired windows reset to
 * 1, live windows increment — two concurrent requests can't both slip
 * under the limit. Fails CLOSED via RateLimitError; callers surface it
 * as HTTP 429. Keys carry no credentials, but magic_link:<email> keys
 * DO hold emails (PII) — auth_attempts must stay module-internal; hash
 * the key before ever exposing this table to app-facing queries.
 */
export async function enforceRateLimit(
  db: Db,
  key: string,
  opts: { max: number; windowSeconds: number },
): Promise<void> {
  const windowInterval = sql`make_interval(secs => ${opts.windowSeconds})`;
  const [row] = await db
    .insert(authAttempts)
    .values({ key, windowStart: sql`now()`, count: 1 })
    .onConflictDoUpdate({
      target: authAttempts.key,
      set: {
        count: sql`CASE WHEN ${authAttempts.windowStart} <= now() - ${windowInterval} THEN 1 ELSE ${authAttempts.count} + 1 END`,
        windowStart: sql`CASE WHEN ${authAttempts.windowStart} <= now() - ${windowInterval} THEN now() ELSE ${authAttempts.windowStart} END`,
      },
    })
    .returning({
      count: authAttempts.count,
      windowStart: authAttempts.windowStart,
    });
  if (row && row.count > opts.max) {
    const elapsed = (Date.now() - row.windowStart.getTime()) / 1000;
    throw new RateLimitError(
      key,
      Math.max(1, Math.ceil(opts.windowSeconds - elapsed)),
    );
  }
}
