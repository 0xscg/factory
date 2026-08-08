"use server";

import { redirect } from "next/navigation";
import { createCheckoutSession, loadBillingEnv } from "@factory/core/billing";
import { requireWriteOrg } from "@/server/context";
import { env } from "@/server/env";

const PLANS = new Set(["wasteduty_starter", "wasteduty_pro"]);

export async function startCheckout(formData: FormData): Promise<void> {
  const { ctx, user } = await requireWriteOrg();
  const lookupKey = String(formData.get("plan") ?? "");
  if (!PLANS.has(lookupKey)) redirect("/app/billing");
  loadBillingEnv(); // fail fast with a clear message if Stripe env is absent
  const session = await createCheckoutSession({
    orgId: ctx.orgId,
    product: ctx.product,
    priceLookupKey: lookupKey,
    customerEmail: user.email,
    successUrl: `${env.APP_URL}/app/billing?success=1`,
    cancelUrl: `${env.APP_URL}/app/billing?cancelled=1`,
  });
  if (!session.url) throw new Error("Stripe returned no checkout URL");
  redirect(session.url);
}
