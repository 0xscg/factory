/**
 * Local webhook feedback loop. Run alongside `stripe listen`:
 *
 *   stripe listen --api-key "$STRIPE_SECRET_KEY" --forward-to localhost:4242/webhooks/stripe
 *   STRIPE_WEBHOOK_SECRET=whsec_... pnpm --filter @factory/core dev:webhooks
 *   stripe trigger invoice.payment_failed --api-key "$STRIPE_SECRET_KEY"
 *
 * See docs/local-dev.md.
 */
import { createServer } from "node:http";
import {
  InMemoryProcessedEventStore,
  handleWebhookEvent,
  verifyWebhookSignature,
  type EventHandlers,
  type HandledEventType,
} from "../src/billing/index.js";

const PORT = Number(process.env.WEBHOOK_DEV_PORT ?? 4242);
const store = new InMemoryProcessedEventStore();

const logHandler = (event: { id: string; type: string }) => {
  console.log(`  → handled ${event.type} (${event.id})`);
  return Promise.resolve();
};
const handlers: EventHandlers = Object.fromEntries(
  (
    [
      "checkout.session.completed",
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "invoice.payment_failed",
    ] as HandledEventType[]
  ).map((t) => [t, logHandler]),
);

createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/webhooks/stripe") {
    res.writeHead(404).end();
    return;
  }
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", () => {
    void (async () => {
      try {
        const event = verifyWebhookSignature(
          Buffer.concat(chunks),
          req.headers["stripe-signature"] as string,
        );
        const result = await handleWebhookEvent(event, handlers, store);
        console.log(
          `${event.type} (${event.id}): handled=${result.handled} duplicate=${result.duplicate}`,
        );
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err) {
        console.error("rejected:", err instanceof Error ? err.message : err);
        res.writeHead(400).end("invalid signature");
      }
    })();
  });
}).listen(PORT, () =>
  console.log(`webhook dev server on :${PORT} (POST /webhooks/stripe)`),
);
