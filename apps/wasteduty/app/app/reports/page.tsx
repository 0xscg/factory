import Link from "next/link";
import { requireOrg } from "@/server/context";

export default async function ReportsPage() {
  await requireOrg();
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">Reports</h1>

      <section className="rounded border border-border p-4">
        <h2 className="text-lg font-medium">Inspection-ready pack</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Records, evidence index and audit extract in one PDF — everything an
          inspector asks for, in one click.
        </p>
        <a
          href="/app/reports/inspection-pack"
          className="mt-4 inline-block rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Generate PDF
        </a>
      </section>

      <section className="rounded border border-border p-4">
        <h2 className="text-lg font-medium">Waste movement register</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Date-range view of movements, printable for duty-of-care records.
        </p>
        <form
          action="/app/reports/movement-register"
          method="get"
          className="mt-4 flex flex-wrap items-end gap-3 text-sm"
        >
          <label className="flex flex-col gap-1 text-muted-foreground">
            From
            <input
              type="date"
              name="from"
              className="rounded border border-border bg-background px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-muted-foreground">
            To
            <input
              type="date"
              name="to"
              className="rounded border border-border bg-background px-3 py-2"
            />
          </label>
          <button
            type="submit"
            className="rounded bg-primary px-4 py-2 font-medium text-primary-foreground"
          >
            View register
          </button>
        </form>
        <p className="mt-3 text-xs text-muted-foreground">
          Or open the{" "}
          <Link
            href="/app/reports/movement-register"
            className="text-primary underline"
          >
            full register
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
