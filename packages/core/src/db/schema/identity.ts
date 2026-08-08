import {
  bigint,
  boolean,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { orgs } from "./orgs.js";

/**
 * Global (not tenant-scoped): a user can belong to several orgs. Auth
 * tables (users, magic_link_tokens, sessions) carry no org_id/product —
 * documented exception to the every-table rule; they are protected by
 * table grants, and secrets never leave the identity module.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  /** Base32 TOTP secret; set when 2FA enrolment starts, verified on first use. */
  totpSecret: text("totp_secret"),
  totpEnabled: boolean("totp_enabled").notNull().default(false),
  /**
   * Highest TOTP counter step already accepted — a code is valid only
   * for a step strictly greater, so an intercepted code can't be
   * replayed inside its ±1-step window.
   */
  totpLastUsedStep: bigint("totp_last_used_step", { mode: "number" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Fixed-window rate-limit counters for auth endpoints (magic-link
 * requests per email, TOTP attempts per user). System table like
 * stripe_events: no tenant data — keys are derived identifiers.
 */
export const authAttempts = pgTable("auth_attempts", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull(),
});

/** Only the SHA-256 hash of a token is ever stored. */
export const magicLinkTokens = pgTable("magic_link_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const roleEnum = pgEnum("member_role", [
  "owner",
  "admin",
  "member",
  "auditor",
]);

/**
 * Org-scoped, RLS'd by org_id. No product column: membership is
 * org-wide across skins (same exception as orgs — see orgs.ts).
 */
export const members = pgTable(
  "members",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] })],
);
