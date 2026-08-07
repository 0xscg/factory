import { z } from "zod";

const billingEnvSchema = z.object({
  STRIPE_SECRET_KEY: z.string().startsWith("sk_"),
  STRIPE_PUBLISHABLE_KEY: z.string().startsWith("pk_"),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_").optional(),
});

export type BillingEnv = z.infer<typeof billingEnvSchema>;

export function loadBillingEnv(source: NodeJS.ProcessEnv = process.env): BillingEnv {
  const parsed = billingEnvSchema.safeParse(source);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Billing env invalid or missing: ${missing}`);
  }
  return parsed.data;
}

export function assertTestMode(env: BillingEnv): void {
  if (!env.STRIPE_SECRET_KEY.startsWith("sk_test_")) {
    throw new Error("Expected a test-mode Stripe key; refusing to run against live mode.");
  }
}
