import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { assertTestMode, loadBillingEnv } from "./env.js";
import {
  InMemoryProcessedEventStore,
  handleWebhookEvent,
  verifyWebhookSignature,
} from "./webhooks.js";

const TEST_SECRET = "whsec_test_secret";
const stripe = new Stripe("sk_test_dummy", { typescript: true });

function signedEvent(id: string, type: string): { body: string; header: string } {
  const body = JSON.stringify({
    id,
    object: "event",
    type,
    data: { object: {} },
  });
  const header = stripe.webhooks.generateTestHeaderString({
    payload: body,
    secret: TEST_SECRET,
  });
  return { body, header };
}

describe("loadBillingEnv", () => {
  it("rejects missing keys", () => {
    expect(() => loadBillingEnv({} as NodeJS.ProcessEnv)).toThrow(/STRIPE_SECRET_KEY/);
  });

  it("rejects swapped keys", () => {
    expect(() =>
      loadBillingEnv({
        STRIPE_SECRET_KEY: "pk_test_x",
        STRIPE_PUBLISHABLE_KEY: "sk_test_x",
      } as NodeJS.ProcessEnv),
    ).toThrow();
  });

  it("refuses live keys in test-mode guard", () => {
    const env = loadBillingEnv({
      STRIPE_SECRET_KEY: "sk_live_x",
      STRIPE_PUBLISHABLE_KEY: "pk_live_x",
    } as NodeJS.ProcessEnv);
    expect(() => assertTestMode(env)).toThrow(/live mode/);
  });
});

describe("verifyWebhookSignature", () => {
  it("accepts a correctly signed payload", () => {
    const { body, header } = signedEvent("evt_1", "invoice.payment_failed");
    const event = verifyWebhookSignature(body, header, stripe, TEST_SECRET);
    expect(event.id).toBe("evt_1");
  });

  it("rejects a tampered payload", () => {
    const { header } = signedEvent("evt_1", "invoice.payment_failed");
    const tampered = JSON.stringify({ id: "evt_evil", object: "event", type: "x" });
    expect(() => verifyWebhookSignature(tampered, header, stripe, TEST_SECRET)).toThrow();
  });

  it("rejects when no webhook secret is configured", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
    vi.stubEnv("STRIPE_PUBLISHABLE_KEY", "pk_test_dummy");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    try {
      const { body, header } = signedEvent("evt_1", "invoice.payment_failed");
      expect(() =>
        verifyWebhookSignature(body, header, stripe, undefined),
      ).toThrow(/STRIPE_WEBHOOK_SECRET/);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("handleWebhookEvent", () => {
  const event = (id: string, type: string) => ({ id, type }) as Stripe.Event;

  it("dispatches handled event types once", async () => {
    const store = new InMemoryProcessedEventStore();
    let calls = 0;
    const handlers = {
      "invoice.payment_failed": async () => {
        calls += 1;
      },
    };
    const first = await handleWebhookEvent(event("evt_a", "invoice.payment_failed"), handlers, store);
    expect(first).toEqual({ received: true, handled: true, duplicate: false });
    expect(calls).toBe(1);
  });

  it("is idempotent under duplicate delivery", async () => {
    const store = new InMemoryProcessedEventStore();
    let calls = 0;
    const handlers = {
      "customer.subscription.updated": async () => {
        calls += 1;
      },
    };
    const e = event("evt_dup", "customer.subscription.updated");
    await handleWebhookEvent(e, handlers, store);
    const second = await handleWebhookEvent(e, handlers, store);
    expect(second.duplicate).toBe(true);
    expect(calls).toBe(1);
  });

  it("acknowledges but ignores unhandled event types", async () => {
    const store = new InMemoryProcessedEventStore();
    const result = await handleWebhookEvent(event("evt_x", "charge.refunded"), {}, store);
    expect(result).toEqual({ received: true, handled: false, duplicate: false });
  });
});
