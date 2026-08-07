import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { tenantColumns } from "../tenancy.js";

/**
 * Current state of every typed entity a skin defines (a waste receipt,
 * a CBAM shipment…). Data is validated against the skin's Zod schema at
 * the module boundary and stored as jsonb. Soft-delete only — DELETE is
 * not granted; history stays queryable for inspections.
 */
export const records = pgTable("records", {
  id: uuid("id").primaryKey().defaultRandom(),
  ...tenantColumns,
  entityType: text("entity_type").notNull(),
  version: integer("version").notNull().default(1),
  data: jsonb("data").notNull(),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

/**
 * Full version history, one row per version including the current one.
 * Append-only — same protection class as audit_log (no UPDATE/DELETE
 * grants, insert-only RLS, immutability trigger).
 */
export const recordVersions = pgTable(
  "record_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns,
    recordId: uuid("record_id").notNull(),
    version: integer("version").notNull(),
    data: jsonb("data").notNull(),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("record_versions_record_version_idx").on(t.recordId, t.version),
  ],
);
