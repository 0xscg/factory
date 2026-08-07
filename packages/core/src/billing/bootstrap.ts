import type Stripe from "stripe";
import { stripeClient } from "./client.js";

export interface SkinPricing {
  /** Skin id, e.g. "wasteduty" — becomes the Stripe Product metadata key. */
  product: string;
  displayName: string;
  /** VAT-exclusive monthly amounts in pence. */
  tiers: { name: string; monthlyPence: number }[];
}

/**
 * Idempotently creates one Stripe Product per skin and one recurring GBP
 * price per tier, keyed by lookup_key `<skin>_<tier>_monthly`. Safe to
 * re-run: existing products (by metadata.product) and prices (by
 * lookup_key) are left untouched.
 */
export async function bootstrapSkinBilling(
  pricing: SkinPricing,
  stripe: Stripe = stripeClient(),
): Promise<{ productId: string; priceIds: Record<string, string> }> {
  const existing = await stripe.products.search({
    query: `active:'true' AND metadata['product']:'${pricing.product}'`,
  });
  const product =
    existing.data[0] ??
    (await stripe.products.create({
      name: pricing.displayName,
      metadata: { product: pricing.product },
    }));

  const priceIds: Record<string, string> = {};
  for (const tier of pricing.tiers) {
    const lookupKey = `${pricing.product}_${tier.name.toLowerCase()}_monthly`;
    const found = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
    const price =
      found.data[0] ??
      (await stripe.prices.create({
        product: product.id,
        currency: "gbp",
        unit_amount: tier.monthlyPence,
        recurring: { interval: "month" },
        lookup_key: lookupKey,
        nickname: `${pricing.displayName} ${tier.name} (monthly, ex VAT)`,
      }));
    priceIds[tier.name] = price.id;
  }

  return { productId: product.id, priceIds };
}
