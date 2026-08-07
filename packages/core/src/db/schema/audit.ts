import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenantColumns } from "../tenancy.js";

/**
 * Append-only event stream on every mutation — the core sales artefact.
 * Immutability is triple-enforced in the DB: no UPDATE/DELETE grants,
 * RLS policies for SELECT/INSERT only, and a trigger that rejects
 * UPDATE/DELETE/TRUNCATE even from the table owner.
 */
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  ...tenantColumns,
  /** Null for system-initiated events (jobs, webhooks). */
  actorUserId: uuid("actor_user_id"),
  /** Dotted verb, e.g. "member.added", "record.updated", "user.totp_enabled". */
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
