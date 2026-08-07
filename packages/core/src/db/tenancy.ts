import { text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Every tenant-scoped table carries these columns (architecture §3.4):
 * spread `...tenantColumns` into the table definition and add the RLS
 * statements from `tenantRlsStatements` to the same migration.
 */
export const tenantColumns = {
  orgId: uuid("org_id").notNull(),
  product: text("product").notNull(),
};

export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};

/**
 * RLS statements for a tenant-scoped table. Paste into the table's
 * migration (one statement per drizzle breakpoint). FORCE makes the
 * policy apply even to the table owner — tenancy is enforced in the DB,
 * not app code. The app role must NOT have BYPASSRLS.
 *
 * Sessions establish tenancy via `withOrg()` (set_config('app.org_id')).
 * current_setting(..., true) returns NULL outside a tenant session, so
 * by default nothing is visible.
 */
/**
 * Default privileges give factory_app SELECT + INSERT only — tables are
 * append-only unless a migration explicitly grants mutation. This is what
 * keeps the audit log immutable by default. Add these statements only for
 * tables where UPDATE/DELETE is genuinely part of the domain.
 */
export function mutableTableStatements(table: string): string[] {
  return [`GRANT UPDATE, DELETE ON "${table}" TO "factory_app"`];
}

export function tenantRlsStatements(table: string): string[] {
  return [
    `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`,
    `CREATE POLICY "${table}_tenant_isolation" ON "${table}"
      USING (org_id = NULLIF(current_setting('app.org_id', true), '')::uuid)
      WITH CHECK (org_id = NULLIF(current_setting('app.org_id', true), '')::uuid)`,
  ];
}
