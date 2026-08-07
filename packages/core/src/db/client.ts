import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

export type Db = PostgresJsDatabase<typeof schema>;
export type TenantTx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export interface DbHandle {
  db: Db;
  /** Underlying postgres.js client — call `end()` on shutdown. */
  client: postgres.Sql;
}

export function createDb(connectionString?: string): DbHandle {
  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = postgres(url, { onnotice: () => {} });
  return { db: drizzle(client, { schema }), client };
}

/**
 * Runs `fn` in a transaction with the org's RLS context established via
 * set_config('app.org_id', orgId, /* local= *\/ true) — scoped to the
 * transaction, so nothing leaks between pooled connections. ALL
 * tenant-scoped queries must go through this wrapper; outside it,
 * current_setting('app.org_id') is NULL and RLS hides every row.
 */
export async function withOrg<T>(
  db: Db,
  orgId: string,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      orgId,
    )
  ) {
    throw new Error(`withOrg: orgId is not a UUID: ${orgId}`);
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
    return fn(tx);
  });
}
