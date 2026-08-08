import Link from "next/link";
import { withOrg } from "@factory/core/db";
import { listRecords } from "@factory/core/records";
import type { SiteRecord } from "@/entities";
import { requireOrg } from "@/server/context";
import { createSite } from "./actions";

const input = "rounded border border-border bg-background px-3 py-2 text-sm";

export default async function SitesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { db, ctx, canWrite } = await requireOrg();
  const { error } = await searchParams;
  const rows = await withOrg(db, ctx.orgId, (tx) =>
    listRecords(tx, ctx.product, "site_record", { limit: 200 }),
  );

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">Sites</h1>

      {canWrite && (
        <section className="rounded border border-border p-4">
          <h2 className="mb-3 text-lg font-medium">Add a site</h2>
          {error && (
            <p className="mb-3 rounded border border-border bg-muted p-3 text-sm">
              {error}
            </p>
          )}
          <form action={createSite} className="grid gap-3 sm:grid-cols-2">
            <input
              name="name"
              required
              placeholder="Site name"
              className={input}
            />
            <input
              name="permitRef"
              required
              placeholder="Permit ref (EPR/AB1234CD)"
              className={input}
            />
            <input
              name="permittedEwcCodes"
              required
              placeholder="Permitted EWC codes, comma-separated (17 01 01, 20 03 01)"
              className={`${input} sm:col-span-2`}
            />
            <input
              name="tonnageLimit"
              required
              type="number"
              step="1"
              min="1"
              placeholder="Tonnage limit"
              className={input}
            />
            <select
              name="returnCadence"
              className={input}
              defaultValue="quarterly"
            >
              <option value="quarterly">Quarterly returns</option>
              <option value="annual">Annual returns</option>
            </select>
            <button
              type="submit"
              className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground sm:col-span-2"
            >
              Save site
            </button>
          </form>
        </section>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No sites yet — permits and permitted codes live here.
        </p>
      ) : (
        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3">Permit</th>
                <th className="p-3">EWC codes</th>
                <th className="p-3">Tonnage limit</th>
                <th className="p-3">Returns</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const d = r.data as SiteRecord;
                return (
                  <tr key={r.id}>
                    <td className="p-3">
                      <Link
                        href={`/app/sites/${r.id}`}
                        className="text-primary hover:underline"
                      >
                        {d.name}
                      </Link>
                    </td>
                    <td className="p-3">{d.permitRef}</td>
                    <td className="p-3">{d.permittedEwcCodes.join(", ")}</td>
                    <td className="p-3">{d.tonnageLimit} t</td>
                    <td className="p-3">{d.returnCadence}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
