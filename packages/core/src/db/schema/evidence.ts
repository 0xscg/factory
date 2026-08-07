import { bigint, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenantColumns } from "../tenancy.js";

/**
 * File attachments on records. Immutable once attached (architecture
 * §3.2): append-only protection class — no UPDATE/DELETE grants,
 * insert/select-only RLS, append_only() triggers. SHA-256 is computed
 * server-side at attach and re-verified on download.
 */
export const evidence = pgTable("evidence", {
  id: uuid("id").primaryKey().defaultRandom(),
  ...tenantColumns,
  recordId: uuid("record_id").notNull(),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  sha256: text("sha256").notNull(),
  /** Object-store key: <orgId>/<evidenceId>. */
  storageKey: text("storage_key").notNull().unique(),
  uploadedBy: uuid("uploaded_by"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
