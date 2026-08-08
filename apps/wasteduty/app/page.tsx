/**
 * GENERATED — regeneration may overwrite; hand-edits move elsewhere.
 * Landing page skeleton from the chassis marketing template, themed via
 * tokens. Copy vocabulary: audit-ready / inspection-ready / evidence /
 * records only (CLAUDE.md copy ban).
 */
import skin from "../skin.config";
import { MandateCountdown } from "./countdown";
import { WaitlistForm } from "./waitlist-form";

export default function LandingPage() {
  return (
    <main>
      {/* Hero */}
      <section className="bg-accent px-6 py-20 text-center">
        <MandateCountdown />
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-accent-foreground">
          {skin.brand.tagline}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          WasteDuty keeps your waste movement records, carrier checks and
          evidence in one place — recorded within the two-working-day window,
          with an inspection-ready pack one click away when the EA visits.
        </p>
        <div className="mt-8">
          <WaitlistForm />
        </div>
      </section>

      {/* What you get */}
      <section className="mx-auto max-w-4xl px-6 py-16">
        <h2 className="text-2xl font-semibold">
          Records, evidence, audit trail
        </h2>
        <ul className="mt-6 grid gap-6 sm:grid-cols-3">
          <li className="rounded border border-border p-5">
            <h3 className="font-medium">Movement records</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Every transfer captured with EWC code, quantities and carrier
              reference — a complete movement register for permit returns.
            </p>
          </li>
          <li className="rounded border border-border p-5">
            <h3 className="font-medium">Evidence vault</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Ticket photos and carrier registration checks attached to each
              record, hashed and immutable once filed.
            </p>
          </li>
          <li className="rounded border border-border p-5">
            <h3 className="font-medium">Inspection-ready pack</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Records, evidence index and audit extract exported as one PDF when
              an inspector asks.
            </p>
          </li>
        </ul>
      </section>

      {/* Pricing */}
      <section className="bg-muted px-6 py-16">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-2xl font-semibold">Pricing</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Monthly, VAT-exclusive. 14-day free trial, no card required.
          </p>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            <div className="rounded border border-border bg-background p-6">
              <h3 className="font-medium">Starter</h3>
              <p className="mt-2 text-3xl font-bold">
                £{skin.pricing.starter}
                <span className="text-base font-normal text-muted-foreground">
                  /mo + VAT
                </span>
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                1 site, 2 users. Movement records, carrier checks, deadline
                reminders, inspection-ready pack.
              </p>
            </div>
            <div className="rounded border-2 border-primary bg-background p-6">
              <h3 className="font-medium">Pro</h3>
              <p className="mt-2 text-3xl font-bold">
                £{skin.pricing.pro}
                <span className="text-base font-normal text-muted-foreground">
                  /mo + VAT
                </span>
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Multi-site, unlimited users, DWT service sync when the DEFRA API
                opens.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-8 text-center text-sm text-muted-foreground">
        <p>{skin.brand.footerText}</p>
        <p className="mt-2">
          WasteDuty is record-keeping and workflow software. You remain the
          legal duty-holder under EPA 1990 s.34 and the digital waste tracking
          regulations.
        </p>
      </footer>
    </main>
  );
}
