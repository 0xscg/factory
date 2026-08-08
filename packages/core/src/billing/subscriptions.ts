import { eq, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { mutate, type MutationContext } from "../audit/mutate.js";
import { withOrg, type Db } from "../db/client.js";
import { subscriptions } from "../db/schema/index.js";
import type { MailSender } from "../identity/mail.js";

import type { EventHandlers } from "./webhooks.js";

export type SubscriptionRow = typeof subscriptions.$inferSelect;

/**
 * Pull org attribution off the subscription's metadata (set at checkout
 * — see checkout.ts). Returns null for subscriptions the chassis didn't
 * create; those events are acknowledged and skipped, never guessed at.
 */
function tenantFromMetadata(
  metadata: Stripe.Metadata | null | undefined,
): { orgId: string; product: string } | null {
  const orgId = metadata?.org_id;
  const product = metadata?.product;
  if (!orgId || !product) return null;
  return { orgId, product };
}

function periodEnd(sub: Stripe.Subscription): Date | null {
  // API 2025-03-31+ moved current_period_end onto subscription items.
  const epoch = sub.items?.data[0]?.current_period_end;
  return epoch ? new Date(epoch * 1000) : null;
}

/**
 * Upsert the local mirror row from a Stripe subscription object
 * (created/updated/deleted events all carry the full object). Keyed on
 * the business key (org, product) — a re-subscribe after cancellation
 * arrives with a NEW subscription id and must replace the old row, not
 * crash on the unique index. Stripe does not guarantee delivery order,
 * so the update is guarded on `eventCreated` (the event's `created`
 * epoch): an older event never overwrites a newer write — a delayed
 * `updated` can't resurrect a canceled subscription. A stale event
 * returns the current row untouched and audits `stale: true`.
 */
export async function syncSubscription(
  db: Db,
  sub: Stripe.Subscription,
  eventCreated: number,
): Promise<SubscriptionRow | null> {
  const tenant = tenantFromMetadata(sub.metadata);
  if (!tenant) return null;

  const ctx: MutationContext = { ...tenant, actorUserId: null };
  const values = {
    orgId: tenant.orgId,
    product: tenant.product,
    stripeCustomerId:
      typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    stripeSubscriptionId: sub.id,
    status: sub.status,
    priceLookupKey: sub.items?.data[0]?.price?.lookup_key ?? null,
    currentPeriodEnd: periodEnd(sub),
    canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
    lastEventAt: new Date(eventCreated * 1000),
  };

  return mutate(db, ctx, async (tx) => {
    const [row] = await tx
      .insert(subscriptions)
      .values(values)
      .onConflictDoUpdate({
        target: [subscriptions.orgId, subscriptions.product],
        set: {
          stripeCustomerId: values.stripeCustomerId,
          stripeSubscriptionId: values.stripeSubscriptionId,
          status: values.status,
          priceLookupKey: values.priceLookupKey,
          currentPeriodEnd: values.currentPeriodEnd,
          canceledAt: values.canceledAt,
          lastEventAt: values.lastEventAt,
          updatedAt: sql`now()`,
        },
        setWhere: sql`${subscriptions.lastEventAt} <= excluded.last_event_at`,
      })
      .returning();

    if (!row) {
      // Stale event: the guard skipped the update. Return current state.
      const [current] = await tx
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.product, tenant.product));
      return {
        result: current ?? null,
        action: "subscription.synced",
        entityType: "subscription",
        entityId: sub.id,
        after: { stale: true, ignoredStatus: values.status },
      };
    }
    return {
      result: row,
      action: "subscription.synced",
      entityType: "subscription",
      entityId: sub.id,
      after: {
        status: values.status,
        priceLookupKey: values.priceLookupKey,
        currentPeriodEnd: values.currentPeriodEnd?.toISOString() ?? null,
      },
    };
  });
}

export async function getSubscription(
  db: Db,
  orgId: string,
  product: string,
): Promise<SubscriptionRow | null> {
  return withOrg(db, orgId, async (tx) => {
    const [row] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.product, product));
    return row ?? null;
  });
}

/** Statuses that should gate access to the product. */
export function isSubscriptionActive(row: SubscriptionRow | null): boolean {
  return row?.status === "trialing" || row?.status === "active";
}

export interface DunningDeps {
  db: Db;
  mail: MailSender;
  /** Owner/admin emails for the org (resolver injected by the app). */
  recipients: (orgId: string) => Promise<string[]>;
}

/**
 * invoice.payment_failed: the subscription mirror flips to past_due via
 * the subscription.updated event Stripe sends alongside; this handler
 * owns the human side — one plain email per recipient. Copy stays in
 * the records/audit vocabulary (no compliance claims).
 */
export async function handlePaymentFailed(
  deps: DunningDeps,
  invoice: Stripe.Invoice,
): Promise<void> {
  const tenant = tenantFromMetadata(
    invoice.parent?.subscription_details?.metadata,
  );
  if (!tenant) return;
  const emails = await deps.recipients(tenant.orgId);
  for (const to of emails) {
    await deps.mail.send({
      to,
      subject: "Payment failed — action needed to keep your records active",
      text:
        "Your latest subscription payment did not go through. " +
        "Stripe will retry automatically; to update your card now, open Billing in the app. " +
        "Your records and evidence remain stored and exportable throughout.",
    });
  }
}

/**
 * Default chassis wiring for the webhook endpoint: subscription mirror
 * sync + dunning email. Apps can extend or override per skin.
 */
export function defaultBillingHandlers(deps: DunningDeps): EventHandlers {
  const sync = async (event: Stripe.Event) => {
    await syncSubscription(
      deps.db,
      event.data.object as Stripe.Subscription,
      event.created,
    );
  };
  return {
    "customer.subscription.created": sync,
    "customer.subscription.updated": sync,
    "customer.subscription.deleted": sync,
    "invoice.payment_failed": (event) =>
      handlePaymentFailed(deps, event.data.object as Stripe.Invoice),
  };
}
