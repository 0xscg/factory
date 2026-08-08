CREATE TYPE "public"."subscription_status" AS ENUM('trialing', 'active', 'past_due', 'unpaid', 'canceled', 'incomplete', 'incomplete_expired', 'paused');--> statement-breakpoint
CREATE TABLE "stripe_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"product" text NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"stripe_subscription_id" text NOT NULL,
	"status" "subscription_status" NOT NULL,
	"price_lookup_key" text,
	"current_period_end" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"last_event_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_stripe_sub_idx" ON "subscriptions" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_org_product_idx" ON "subscriptions" USING btree ("org_id","product");--> statement-breakpoint
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "subscriptions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "subscriptions_tenant_isolation" ON "subscriptions"
  USING (org_id = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK (org_id = NULLIF(current_setting('app.org_id', true), '')::uuid);
--> statement-breakpoint
GRANT UPDATE ("stripe_customer_id", "stripe_subscription_id", "status", "price_lookup_key", "current_period_end", "canceled_at", "last_event_at", "updated_at") ON "subscriptions" TO "factory_app";
--> statement-breakpoint
-- stripe_events is a system-level idempotency ledger (no tenant data —
-- only Stripe event ids/types; events arrive before org attribution).
-- Insert/select-only: RLS is forced with a permissive policy restricted
-- to those commands, and factory_app never gets UPDATE/DELETE grants.
ALTER TABLE "stripe_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "stripe_events" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "stripe_events_select" ON "stripe_events" FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY "stripe_events_insert" ON "stripe_events" FOR INSERT WITH CHECK (true);
