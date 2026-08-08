import Link from "next/link";
import { withOrg } from "@factory/core/db";
import { listObligations } from "@factory/core/deadlines";
import { listChecklists } from "@factory/core/checklists";
import { listRecords } from "@factory/core/records";
import { requireOrg } from "@/server/context";
import { markObligationDone } from "./actions";

const dateFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

export default async function DashboardPage() {
  const { db, ctx, canWrite } = await requireOrg();

  const { obligations, openChecklists, counts } = await withOrg(
    db,
    ctx.orgId,
    async (tx) => {
      const obligations = await listObligations(tx, ctx.product, {
        status: "pending",
        limit: 20,
      });
      const checklists = await listChecklists(tx, { limit: 50 });
      const counts: [string, string, number][] = [];
      for (const [type, label, href] of [
        ["waste_receipt", "Waste receipts", "/app/receipts"],
        ["waste_carrier", "Carriers", "/app/carriers"],
        ["site_record", "Sites", "/app/sites"],
      ] as const) {
        const rows = await listRecords(tx, ctx.product, type, { limit: 1000 });
        counts.push([label, href, rows.length]);
      }
      return {
        obligations,
        openChecklists: checklists.filter((c) => c.status === "open"),
        counts,
      };
    },
  );

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <section className="grid gap-4 sm:grid-cols-3">
        {counts.map(([label, href, n]) => (
          <Link
            key={href}
            href={href}
            className="rounded border border-border p-4 hover:bg-muted"
          >
            <p className="text-3xl font-semibold">{n}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
          </Link>
        ))}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Pending obligations</h2>
        {obligations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing pending — obligations appear here as deadline rules compute
            against your records.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded border border-border">
            {obligations.map((o) => (
              <li key={o.id} className="flex items-center gap-4 p-4">
                <div className="flex-1">
                  <p className="text-sm font-medium">{o.name}</p>
                  <p className="text-xs text-muted-foreground">{o.citation}</p>
                </div>
                <span className="text-sm">
                  Due {dateFmt.format(new Date(o.dueAt))}
                </span>
                {canWrite && (
                  <form action={markObligationDone}>
                    <input type="hidden" name="obligationId" value={o.id} />
                    <button
                      type="submit"
                      className="rounded border border-border px-3 py-1 text-xs hover:bg-muted"
                    >
                      Mark met
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Open checklists</h2>
        {openChecklists.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No open checklists.{" "}
            <Link href="/app/checklists" className="text-primary underline">
              Start one from a template.
            </Link>
          </p>
        ) : (
          <ul className="divide-y divide-border rounded border border-border">
            {openChecklists.map((c) => (
              <li key={c.id} className="p-4">
                <Link
                  href={`/app/checklists/${c.id}`}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  {c.name}
                </Link>
                <p className="text-xs text-muted-foreground">
                  Started {dateFmt.format(new Date(c.createdAt))}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
