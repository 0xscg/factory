import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { tenantColumns } from "../tenancy.js";

export const checklistStatusEnum = pgEnum("checklist_status", [
  "open",
  "signed_off",
]);

/**
 * A running instance of a skin-defined checklist template (templates
 * live in skin.config.ts, not the DB). Optionally linked to a record
 * (e.g. a receipt checklist for one waste receipt). Sign-off freezes it.
 */
export const checklists = pgTable("checklists", {
  id: uuid("id").primaryKey().defaultRandom(),
  ...tenantColumns,
  templateKey: text("template_key").notNull(),
  name: text("name").notNull(),
  recordId: uuid("record_id"),
  status: checklistStatusEnum("status").notNull().default("open"),
  signedOffBy: uuid("signed_off_by"),
  signedOffAt: timestamp("signed_off_at", { withTimezone: true }),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const checklistSteps = pgTable(
  "checklist_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns,
    checklistId: uuid("checklist_id").notNull(),
    stepKey: text("step_key").notNull(),
    /** Template order — steps in one insert share createdAt, so ordering needs this. */
    position: integer("position").notNull().default(0),
    title: text("title").notNull(),
    requiresEvidence: boolean("requires_evidence").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedBy: uuid("completed_by"),
    evidenceId: uuid("evidence_id"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("checklist_steps_checklist_step_idx").on(
      t.checklistId,
      t.stepKey,
    ),
  ],
);
