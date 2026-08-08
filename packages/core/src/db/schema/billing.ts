import {
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { tenantColumns } from "../tenancy.js";

/** Mirrors Stripe's subscription statuses we act on. */
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "trialing",
  "active",
  "past_due",
  "unpaid",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "paused",
]);

/**
 * Local mirror of the org's Stripe subscription, synced from webhook
 * events (checkout metadata carries org_id/product, so attribution
 * needs no Stripe API round-trip). Stripe remains the source of truth;
 * this row is what the app reads for gating and dunning banners.
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ...tenantColumns,
    stripeCustomerId: text("stripe_customer_id").notNull(),
    stripeSubscriptionId: text("stripe_subscription_id").notNull(),
    status: subscriptionStatusEnum("status").notNull(),
    priceLookupKey: text("price_lookup_key"),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    /**
     * Stripe event `created` that last wrote this row. Stripe does not
     * guarantee delivery order; the upsert refuses to overwrite with an
     * older event, so a delayed `updated` can't resurrect a canceled sub.
     */
    lastEventAt: timestamp("last_event_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("subscriptions_stripe_sub_idx").on(t.stripeSubscriptionId),
    uniqueIndex("subscriptions_org_product_idx").on(t.orgId, t.product),
  ],
);

/**
 * Webhook idempotency ledger — one row per Stripe event id ever
 * processed. System-level infrastructure, not tenant data (it holds
 * only Stripe event ids/types, and events arrive before any org
 * context exists), so it deliberately carries no org_id/product;
 * RLS still forces an insert/select-only policy and the app role has
 * no UPDATE/DELETE grants.
 */
export const stripeEvents = pgTable("stripe_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
