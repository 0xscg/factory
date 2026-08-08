import {
  DbProcessedEventStore,
  defaultBillingHandlers,
  handleWebhookEvent,
  verifyWebhookSignature,
} from "@factory/core/billing";
import { getDb } from "@/server/db";
import { getMailSender } from "@/server/mail";
import { getOrgAdminEmails } from "@/server/queries";

/**
 * Stripe webhook: signature-verified, idempotent via the durable
 * stripe_events ledger; chassis default handlers own subscription
 * mirroring + dunning email. A handler throw returns non-2xx so Stripe
 * redelivers.
 */
export async function POST(req: Request) {
  const db = getDb();
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  let event;
  try {
    event = verifyWebhookSignature(rawBody, signature);
  } catch (err) {
    console.error("[wasteduty] webhook signature rejected", err);
    return new Response("Invalid signature", { status: 400 });
  }

  const result = await handleWebhookEvent(
    event,
    defaultBillingHandlers({
      db,
      mail: getMailSender(),
      recipients: (orgId) => getOrgAdminEmails(db, orgId),
    }),
    new DbProcessedEventStore(db),
  );
  return Response.json(result);
}
