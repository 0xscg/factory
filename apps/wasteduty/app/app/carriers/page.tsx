import Link from "next/link";
import { withOrg } from "@factory/core/db";
import { listRecords } from "@factory/core/records";
import type { WasteCarrier } from "@/entities";
import { requireOrg } from "@/server/context";
import { createCarrier } from "./actions";

const input = "rounded border border-border bg-background px-3 py-2 text-sm";

export default async function CarriersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { db, ctx, canWrite } = await requireOrg();
  const { error } = await searchParams;
  const rows = await withOrg(db, ctx.orgId, (tx) =>
    listRecords(tx, ctx.product, "waste_carrier", { limit: 200 }),
  );

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">Carriers</h1>

      {canWrite && (
        <section className="rounded border border-border p-4">
          <h2 className="mb-3 text-lg font-medium">Add a carrier</h2>
          {error && (
            <p className="mb-3 rounded border border-border bg-muted p-3 text-sm">
              {error}
            </p>
          )}
          <form action={createCarrier} className="grid gap-3 sm:grid-cols-2">
            <input
              name="name"
              required
              placeholder="Carrier name"
              className={input}
            />
            <input
              name="registrationNumber"
              required
              placeholder="Registration (CBDU123456)"
              className={input}
            />
            <label className="text-sm text-muted-foreground">
              Registration expiry
              <input
                name="expiryDate"
                required
                type="date"
                className={`${input} mt-1 w-full`}
              />
            </label>
            <label className="text-sm text-muted-foreground">
              Last verified against EA register
              <input
                name="verificationDate"
                required
                type="date"
                className={`${input} mt-1 w-full`}
              />
            </label>
            <button
              type="submit"
              className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground sm:col-span-2"
            >
              Save carrier
            </button>
          </form>
        </section>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No carriers yet — keep registrations and verification evidence here.
        </p>
      ) : (
        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3">Registration</th>
                <th className="p-3">Expiry</th>
                <th className="p-3">Last verified</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const d = r.data as WasteCarrier;
                return (
                  <tr key={r.id}>
                    <td className="p-3">
                      <Link
                        href={`/app/carriers/${r.id}`}
                        className="text-primary hover:underline"
                      >
                        {d.name}
                      </Link>
                    </td>
                    <td className="p-3">{d.registrationNumber}</td>
                    <td className="p-3">{d.expiryDate}</td>
                    <td className="p-3">{d.verificationDate}</td>
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
