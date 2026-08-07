import type Stripe from "stripe";
import { stripeClient } from "./client.js";
import { loadBillingEnv } from "./env.js";

/**
 * Events the chassis reacts to. Everything else is acknowledged and ignored.
 * Dunning: past_due/unpaid land here via subscription.updated.
 */
export type HandledEventType =
  | "checkout.session.completed"
  | "customer.subscription.created"
  | "customer.subscription.updated"
  | "customer.subscription.deleted"
  | "invoice.payment_failed";

export type EventHandlers = Partial<{
  [K in HandledEventType]: (event: Stripe.Event) => Promise<void>;
}>;

/**
 * Idempotency store: Stripe redelivers events, so processing must be
 * at-most-once per event id. Backed by a DB table once the chassis DB
 * foundation lands; tests use an in-memory Set.
 */
export interface ProcessedEventStore {
  /** Returns true if the id was newly marked, false if already processed. */
  markProcessed(eventId: string): Promise<boolean>;
}

export class InMemoryProcessedEventStore implements ProcessedEventStore {
  private seen = new Set<string>();
  async markProcessed(eventId: string): Promise<boolean> {
    if (this.seen.has(eventId)) return false;
    this.seen.add(eventId);
    return true;
  }
}

export function verifyWebhookSignature(
  rawBody: string | Buffer,
  signatureHeader: string,
  stripe: Stripe = stripeClient(),
  webhookSecret?: string,
): Stripe.Event {
  const secret = webhookSecret ?? loadBillingEnv().STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured; refusing to accept webhooks.");
  }
  return stripe.webhooks.constructEvent(rawBody, signatureHeader, secret);
}

export interface WebhookResult {
  received: true;
  handled: boolean;
  duplicate: boolean;
}

export async function handleWebhookEvent(
  event: Stripe.Event,
  handlers: EventHandlers,
  store: ProcessedEventStore,
): Promise<WebhookResult> {
  const handler = handlers[event.type as HandledEventType];
  if (!handler) return { received: true, handled: false, duplicate: false };

  const fresh = await store.markProcessed(event.id);
  if (!fresh) return { received: true, handled: false, duplicate: true };

  await handler(event);
  return { received: true, handled: true, duplicate: false };
}
