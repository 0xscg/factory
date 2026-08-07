import Stripe from "stripe";
import { loadBillingEnv } from "./env.js";

let cached: Stripe | undefined;

export function stripeClient(): Stripe {
  if (!cached) {
    const env = loadBillingEnv();
    cached = new Stripe(env.STRIPE_SECRET_KEY, {
      typescript: true,
      appInfo: { name: "factory", url: "https://github.com/0xscg/factory" },
    });
  }
  return cached;
}
