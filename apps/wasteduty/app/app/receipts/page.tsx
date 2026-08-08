import Link from "next/link";
import { withOrg } from "@factory/core/db";
import { listRecords } from "@factory/core/records";
import type { WasteReceipt } from "@/entities";
import { requireOrg } from "@/server/context";
import { createReceipt } from "./actions";

const input = "rounded border border-border bg-background px-3 py-2 text-sm";

export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { db, ctx, canWrite } = await requireOrg();
  const { error } = await searchParams;
  const rows = await withOrg(db, ctx.orgId, (tx) =>
    listRecords(tx, ctx.product, "waste_receipt", { limit: 200 }),
  );

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">Waste receipts</h1>

      {canWrite && (
        <section className="rounded border border-border p-4">
          <h2 className="mb-3 text-lg font-medium">Record a movement</h2>
          {error && (
            <p className="mb-3 rounded border border-border bg-muted p-3 text-sm">
              {error}
            </p>
          )}
          <form action={createReceipt} className="grid gap-3 sm:grid-cols-2">
            <input
              name="ewcCode"
              required
              placeholder="EWC code (17 01 01)"
              className={input}
            />
            <input
              name="carrierRef"
              required
              placeholder="Carrier registration (CBDU123456)"
              className={input}
            />
            <input
              name="description"
              required
              placeholder="Waste description"
              className={`${input} sm:col-span-2`}
            />
            <input
              name="quantityTonnes"
              required
              type="number"
              step="0.01"
              min="0.01"
              placeholder="Quantity (tonnes)"
              className={input}
            />
            <input name="transferDate" required type="date" className={input} />
            <input
              name="origin"
              required
              placeholder="Origin"
              className={input}
            />
            <input
              name="destination"
              required
              placeholder="Destination"
              className={input}
            />
            <input
              name="dwtSubmissionRef"
              placeholder="DWT submission ref (optional)"
              className={`${input} sm:col-span-2`}
            />
            <button
              type="submit"
              className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground sm:col-span-2"
            >
              Save receipt
            </button>
          </form>
        </section>
      )}

      <section>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No receipts yet — each saved movement becomes a versioned,
            audit-ready record.
          </p>
        ) : (
          <div className="overflow-x-auto rounded border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="p-3">Transfer date</th>
                  <th className="p-3">EWC</th>
                  <th className="p-3">Description</th>
                  <th className="p-3">Tonnes</th>
                  <th className="p-3">Carrier</th>
                  <th className="p-3">DWT ref</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => {
                  const d = r.data as WasteReceipt;
                  return (
                    <tr key={r.id}>
                      <td className="p-3">
                        <Link
                          href={`/app/receipts/${r.id}`}
                          className="text-primary hover:underline"
                        >
                          {d.transferDate}
                        </Link>
                      </td>
                      <td className="p-3">{d.ewcCode}</td>
                      <td className="p-3">{d.description}</td>
                      <td className="p-3">{d.quantityTonnes}</td>
                      <td className="p-3">{d.carrierRef}</td>
                      <td className="p-3">{d.dwtSubmissionRef ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
