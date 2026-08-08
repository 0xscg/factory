import { getSubscription, isSubscriptionActive } from "@factory/core/billing";
import skin from "../../../skin.config";
import { requireOrg } from "@/server/context";
import { startCheckout } from "./actions";

const dateFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

const PLANS = [
  {
    lookupKey: "wasteduty_starter",
    name: "Starter",
    price: skin.pricing.starter,
    blurb: "Movement records, evidence vault, audit trail.",
  },
  {
    lookupKey: "wasteduty_pro",
    name: "Pro",
    price: skin.pricing.pro,
    blurb:
      "Everything in Starter plus checklists, deadline escalations and report packs.",
  },
] as const;

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; cancelled?: string }>;
}) {
  const { success, cancelled } = await searchParams;
  const { db, ctx, canWrite } = await requireOrg();
  const sub = await getSubscription(db, ctx.orgId, ctx.product);
  const active = isSubscriptionActive(sub);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">Billing</h1>

      {success && (
        <p className="rounded border border-border bg-accent p-4 text-sm text-accent-foreground">
          Checkout complete — your subscription will show below once Stripe
          confirms it.
        </p>
      )}
      {cancelled && (
        <p className="rounded border border-border bg-muted p-4 text-sm">
          Checkout cancelled — no charge was made.
        </p>
      )}

      {sub?.status === "trialing" && (
        <p className="rounded border border-border bg-accent p-4 text-sm text-accent-foreground">
          You&apos;re on the 14-day free trial
          {sub.currentPeriodEnd
            ? ` — trial ends ${dateFmt.format(new Date(sub.currentPeriodEnd))}`
            : ""}
          . Your records and evidence remain stored and exportable throughout.
        </p>
      )}

      <section className="rounded border border-border p-4 text-sm">
        <h2 className="text-lg font-medium">Current subscription</h2>
        {sub ? (
          <div className="mt-2 flex flex-col gap-1">
            <p>
              Plan:{" "}
              <span className="font-medium">
                {sub.priceLookupKey ?? "unknown"}
              </span>
            </p>
            <p>
              Status: <span className="font-medium">{sub.status}</span>
              {!active && " — access is limited until payment is up to date"}
            </p>
            {sub.currentPeriodEnd && (
              <p>
                Current period ends{" "}
                {dateFmt.format(new Date(sub.currentPeriodEnd))}
              </p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-muted-foreground">
            No subscription yet — start a 14-day free trial below. No card
            surprises: prices are shown exclusive of VAT.
          </p>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {PLANS.map((plan) => (
          <div
            key={plan.lookupKey}
            className="flex flex-col rounded border border-border p-4"
          >
            <h3 className="text-lg font-medium">{plan.name}</h3>
            <p className="mt-1 text-3xl font-semibold">
              £{plan.price}
              <span className="text-sm font-normal text-muted-foreground">
                /month + VAT
              </span>
            </p>
            <p className="mt-2 flex-1 text-sm text-muted-foreground">
              {plan.blurb}
            </p>
            {canWrite && (
              <form action={startCheckout} className="mt-4">
                <input type="hidden" name="plan" value={plan.lookupKey} />
                <button
                  type="submit"
                  className="w-full rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                >
                  {sub ? `Switch to ${plan.name}` : `Start 14-day trial`}
                </button>
              </form>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
