import Link from "next/link";
import { notFound } from "next/navigation";
import { withOrg } from "@factory/core/db";
import { getChecklist } from "@factory/core/checklists";
import {
  listEvidenceForRecord,
  type EvidenceRow,
} from "@factory/core/evidence";
import { requireOrg } from "@/server/context";
import { completeChecklistStep, signOff } from "../actions";

const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});
const input = "rounded border border-border bg-background px-2 py-1 text-xs";

export default async function ChecklistDetailPage({
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
    const cl = await getChecklist(tx, id);
    if (!cl) return null;
    const evidenceOptions: EvidenceRow[] = cl.checklist.recordId
      ? await listEvidenceForRecord(tx, cl.checklist.recordId)
      : [];
    return { ...cl, evidenceOptions };
  });
  if (!found) notFound();
  const { checklist, steps, evidenceOptions } = found;
  const open = checklist.status === "open";
  const allDone = steps.every((s) => s.completedAt !== null);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link
          href="/app/checklists"
          className="text-sm text-primary hover:underline"
        >
          ← Checklists
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{checklist.name}</h1>
        <p className="text-sm text-muted-foreground">
          {open
            ? "Open"
            : `Signed off ${checklist.signedOffAt ? dateTimeFmt.format(new Date(checklist.signedOffAt)) : ""}`}
          {checklist.recordId && (
            <>
              {" "}
              · linked to{" "}
              <Link
                href={`/app/receipts/${checklist.recordId}`}
                className="text-primary hover:underline"
              >
                a record
              </Link>
            </>
          )}
        </p>
      </div>

      {error && (
        <p className="rounded border border-border bg-muted p-3 text-sm">
          {error}
        </p>
      )}

      <ul className="divide-y divide-border rounded border border-border">
        {steps.map((s) => (
          <li key={s.id} className="p-4">
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className={`inline-block h-4 w-4 rounded-full border ${
                  s.completedAt
                    ? "border-primary bg-primary"
                    : "border-border bg-background"
                }`}
              />
              <p className="flex-1 text-sm font-medium">{s.title}</p>
              {s.requiresEvidence && (
                <span className="rounded bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                  evidence required
                </span>
              )}
            </div>
            {s.completedAt ? (
              <p className="ml-7 mt-1 text-xs text-muted-foreground">
                Completed {dateTimeFmt.format(new Date(s.completedAt))}
                {s.notes ? ` — ${s.notes}` : ""}
                {s.evidenceId && (
                  <>
                    {" · "}
                    <a
                      href={`/app/evidence/${s.evidenceId}`}
                      className="text-primary hover:underline"
                    >
                      evidence
                    </a>
                  </>
                )}
              </p>
            ) : (
              open &&
              canWrite && (
                <form
                  action={completeChecklistStep}
                  className="ml-7 mt-2 flex flex-wrap items-center gap-2"
                >
                  <input
                    type="hidden"
                    name="checklistId"
                    value={checklist.id}
                  />
                  <input type="hidden" name="stepKey" value={s.stepKey} />
                  {evidenceOptions.length > 0 ? (
                    <select name="evidenceId" className={input} defaultValue="">
                      <option value="">
                        {s.requiresEvidence ? "Pick evidence…" : "No evidence"}
                      </option>
                      {evidenceOptions.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.filename}
                        </option>
                      ))}
                    </select>
                  ) : (
                    s.requiresEvidence && (
                      <input
                        name="evidenceId"
                        placeholder="Evidence ID (attach on the record first)"
                        className={`${input} w-72`}
                      />
                    )
                  )}
                  <input
                    name="notes"
                    placeholder="Notes (optional)"
                    className={`${input} w-56`}
                  />
                  <button
                    type="submit"
                    className="rounded border border-border px-3 py-1 text-xs hover:bg-muted"
                  >
                    Mark complete
                  </button>
                </form>
              )
            )}
          </li>
        ))}
      </ul>

      {open && canWrite && (
        <form action={signOff}>
          <input type="hidden" name="checklistId" value={checklist.id} />
          <button
            type="submit"
            disabled={!allDone}
            className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            Sign off checklist
          </button>
          {!allDone && (
            <p className="mt-2 text-xs text-muted-foreground">
              All steps must be complete before sign-off.
            </p>
          )}
        </form>
      )}
    </div>
  );
}
