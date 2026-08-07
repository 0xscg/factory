import type Stripe from "stripe";
import { stripeClient } from "./client.js";

export const TRIAL_DAYS = 14;

export interface CheckoutParams {
  orgId: string;
  product: string;
  priceLookupKey: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
}

/**
 * Prices are VAT-exclusive; Stripe Tax handles VAT on top when enabled.
 * The org/product pair rides in metadata so webhooks can attribute events
 * without a DB lookup.
 */
export async function createCheckoutSession(
  params: CheckoutParams,
  stripe: Stripe = stripeClient(),
): Promise<Stripe.Checkout.Session> {
  const prices = await stripe.prices.list({
    lookup_keys: [params.priceLookupKey],
    active: true,
    limit: 1,
  });
  const price = prices.data[0];
  if (!price) throw new Error(`No active price with lookup key ${params.priceLookupKey}`);

  return stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: price.id, quantity: 1 }],
    customer_email: params.customerEmail,
    subscription_data: {
      trial_period_days: TRIAL_DAYS,
      metadata: { org_id: params.orgId, product: params.product },
    },
    metadata: { org_id: params.orgId, product: params.product },
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });
}

export async function createPortalSession(
  customerId: string,
  returnUrl: string,
  stripe: Stripe = stripeClient(),
): Promise<Stripe.BillingPortal.Session> {
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
}
