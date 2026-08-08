import Link from "next/link";
import { withOrg } from "@factory/core/db";
import { listRecords } from "@factory/core/records";
import skin from "../../../../skin.config";
import type { WasteReceipt } from "@/entities";
import { requireOrg } from "@/server/context";

/** Printable movement register: receipts filtered by transfer date range. */
export default async function MovementRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  const { db, ctx } = await requireOrg();
  const rows = await withOrg(db, ctx.orgId, (tx) =>
    listRecords(tx, ctx.product, "waste_receipt", { limit: 1000 }),
  );

  const filtered = rows
    .map((r) => ({ id: r.id, d: r.data as WasteReceipt }))
    .filter(
      ({ d }) =>
        (!from || d.transferDate >= from) && (!to || d.transferDate <= to),
    )
    .sort((a, b) => a.d.transferDate.localeCompare(b.d.transferDate));

  const totalTonnes = filtered.reduce(
    (sum, { d }) => sum + d.quantityTonnes,
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="print:hidden">
        <Link
          href="/app/reports"
          className="text-sm text-primary hover:underline"
        >
          ← Reports
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-semibold">Waste movement register</h1>
        <p className="text-sm text-muted-foreground">
          {from || to
            ? `Movements ${from ?? "…"} to ${to ?? "…"}`
            : "All recorded movements"}{" "}
          · {filtered.length} movements · {totalTonnes.toFixed(2)} tonnes
        </p>
      </div>

      <div className="overflow-x-auto rounded border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="p-3">Transfer date</th>
              <th className="p-3">EWC</th>
              <th className="p-3">Description</th>
              <th className="p-3">Tonnes</th>
              <th className="p-3">Carrier</th>
              <th className="p-3">Origin</th>
              <th className="p-3">Destination</th>
              <th className="p-3">DWT ref</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map(({ id, d }) => (
              <tr key={id}>
                <td className="p-3">{d.transferDate}</td>
                <td className="p-3">{d.ewcCode}</td>
                <td className="p-3">{d.description}</td>
                <td className="p-3">{d.quantityTonnes}</td>
                <td className="p-3">{d.carrierRef}</td>
                <td className="p-3">{d.origin}</td>
                <td className="p-3">{d.destination}</td>
                <td className="p-3">{d.dwtSubmissionRef ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">{skin.brand.footerText}</p>
    </div>
  );
}
