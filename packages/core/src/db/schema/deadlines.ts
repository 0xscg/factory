import {
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { tenantColumns } from "../tenancy.js";

export const obligationStatusEnum = pgEnum("obligation_status", [
  "pending",
  "met",
]);

/**
 * A computed obligation: one org's instance of a skin-defined deadline
 * rule (rules are code in skin.config.ts). The deadline engine scans
 * pending obligations and sends escalating notifications; each
 * escalation stage is recorded in notified_stages so it fires once.
 */
export const obligations = pgTable(
  "obligations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns,
    ruleKey: text("rule_key").notNull(),
    name: text("name").notNull(),
    /** Statutory citation the skin's rule carries (surfaced in emails/UI). */
    citation: text("citation").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    status: obligationStatusEnum("status").notNull().default("pending"),
    metAt: timestamp("met_at", { withTimezone: true }),
    metBy: uuid("met_by"),
    recordId: uuid("record_id"),
    /** Escalation stages (days-before values) already notified. */
    notifiedStages: jsonb("notified_stages").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("obligations_org_rule_due_idx").on(
      t.orgId,
      t.product,
      t.ruleKey,
      t.dueAt,
    ),
  ],
);
