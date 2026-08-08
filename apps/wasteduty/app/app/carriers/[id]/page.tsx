import Link from "next/link";
import { notFound } from "next/navigation";
import { withOrg } from "@factory/core/db";
import { listEvidenceForRecord } from "@factory/core/evidence";
import { getRecord, listVersions } from "@factory/core/records";
import type { WasteCarrier } from "@/entities";
import { requireOrg } from "@/server/context";
import { uploadEvidence } from "../../receipts/actions";

const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default async function CarrierDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const { db, ctx, canWrite } = await requireOrg();

  const found = await withOrg(db, ctx.orgId, async (tx) => {
    const record = await getRecord(tx, "waste_carrier", id);
    if (!record) return null;
    return {
      record,
      evidence: await listEvidenceForRecord(tx, id),
      versions: await listVersions(tx, id),
    };
  });
  if (!found) notFound();
  const { record, evidence, versions } = found;
  const d = record.data as WasteCarrier;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link
          href="/app/carriers"
          className="text-sm text-primary hover:underline"
        >
          ← Carriers
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{d.name}</h1>
        <p className="text-sm text-muted-foreground">
          Version {record.version} · created{" "}
          {dateTimeFmt.format(new Date(record.createdAt))}
        </p>
      </div>

      <section className="grid gap-2 rounded border border-border p-4 text-sm sm:grid-cols-2">
        <p>
          <span className="text-muted-foreground">Registration:</span>{" "}
          {d.registrationNumber}
        </p>
        <p>
          <span className="text-muted-foreground">Expiry:</span> {d.expiryDate}
        </p>
        <p>
          <span className="text-muted-foreground">Last verified:</span>{" "}
          {d.verificationDate}
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Evidence</h2>
        {evidence.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No evidence attached — e.g. the EA register lookup screenshot.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded border border-border">
            {evidence.map((e) => (
              <li key={e.id} className="flex items-center gap-4 p-3 text-sm">
                <a
                  href={`/app/evidence/${e.id}`}
                  className="flex-1 text-primary hover:underline"
                >
                  {e.filename}
                </a>
                <span className="text-xs text-muted-foreground">
                  sha256 {e.sha256.slice(0, 12)}…
                </span>
              </li>
            ))}
          </ul>
        )}
        {canWrite && (
          <form
            action={uploadEvidence}
            className="mt-3 flex flex-wrap items-center gap-3"
          >
            {error && (
              <p className="w-full rounded border border-border bg-muted p-3 text-sm">
                {error}
              </p>
            )}
            <input type="hidden" name="recordId" value={record.id} />
            <input
              type="hidden"
              name="backTo"
              value={`/app/carriers/${record.id}`}
            />
            <input type="file" name="file" required className="text-sm" />
            <button
              type="submit"
              className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Attach evidence
            </button>
          </form>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Version history</h2>
        <ul className="divide-y divide-border rounded border border-border text-sm">
          {versions.map((v) => (
            <li key={v.id} className="p-3">
              <p className="font-medium">Version {v.version}</p>
              <p className="text-xs text-muted-foreground">
                {dateTimeFmt.format(new Date(v.createdAt))}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
