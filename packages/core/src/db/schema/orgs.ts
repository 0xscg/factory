import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Tenant root. Not tenant-*scoped* itself (it defines the tenant), but
 * still RLS-guarded: a session sees only its own org row. org_id on
 * every other table references orgs.id.
 *
 * Deliberate exceptions to the every-table rule, RLS WITH CHECK included:
 * - no `product` column: an org can hold subscriptions to several skins
 *   (cross-sell); product lives on subscriptions/records, not the tenant.
 * - org CREATION cannot happen through withOrg (WITH CHECK requires the
 *   row's id to equal an org context that doesn't exist yet). Signup runs
 *   on a privileged connection (Identity module owns this) — do not
 *   loosen the policy to make app-role inserts work.
 */
export const orgs = pgTable("orgs", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
