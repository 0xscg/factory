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
 * Idempotency store: Stripe redelivers events. Semantics are
 * at-LEAST-once — an event is marked processed only after its handler
 * succeeds, so a handler failure leaves the event unmarked and Stripe's
 * redelivery retries it (a durable mark-before-handle would turn any
 * transient failure into permanent event loss). Handlers must therefore
 * be idempotent; the narrow race between wasProcessed and markProcessed
 * can run a handler twice, which idempotent handlers absorb.
 */
export interface ProcessedEventStore {
  /** True if this event id has already been fully processed. */
  wasProcessed(eventId: string): Promise<boolean>;
  /** Marks the id processed. Returns false if another delivery won. */
  markProcessed(eventId: string, eventType: string): Promise<boolean>;
}

export class InMemoryProcessedEventStore implements ProcessedEventStore {
  private seen = new Set<string>();
  async wasProcessed(eventId: string): Promise<boolean> {
    return this.seen.has(eventId);
  }
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
    throw new Error(
      "STRIPE_WEBHOOK_SECRET is not configured; refusing to accept webhooks.",
    );
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

  if (await store.wasProcessed(event.id))
    return { received: true, handled: false, duplicate: true };

  // Handle first, mark after: a throw here propagates (endpoint returns
  // non-2xx), the event stays unmarked, and Stripe redelivers.
  await handler(event);
  await store.markProcessed(event.id, event.type);
  return { received: true, handled: true, duplicate: false };
}
