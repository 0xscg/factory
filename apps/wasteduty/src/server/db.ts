import { createDb, type DbHandle } from "@factory/core/db";
import { env } from "./env";

/**
 * One postgres.js pool per server process, survives Next dev HMR via
 * globalThis. All access goes through chassis APIs with this handle.
 */
const globalForDb = globalThis as unknown as { __wastedutyDb?: DbHandle };

export function getDb() {
  globalForDb.__wastedutyDb ??= createDb(env.DATABASE_URL);
  return globalForDb.__wastedutyDb.db;
}
