import Link from "next/link";
import { withOrg } from "@factory/core/db";
import { listChecklists } from "@factory/core/checklists";
import skin from "../../../skin.config";
import { requireOrg } from "@/server/context";
import { startFromTemplate } from "./actions";

const dateFmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

export default async function ChecklistsPage() {
  const { db, ctx, canWrite } = await requireOrg();
  const rows = await withOrg(db, ctx.orgId, (tx) =>
    listChecklists(tx, { limit: 100 }),
  );

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">Checklists</h1>

      {canWrite && (
        <section className="grid gap-4 sm:grid-cols-3">
          {skin.checklists.map((def) => (
            <form
              key={def.key}
              action={startFromTemplate}
              className="flex flex-col justify-between rounded border border-border p-4"
            >
              <div>
                <p className="font-medium">{def.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {def.steps.length} steps ·{" "}
                  {def.steps.filter((s) => s.requiresEvidence).length} need
                  evidence
                </p>
              </div>
              <input type="hidden" name="templateKey" value={def.key} />
              <button
                type="submit"
                className="mt-4 rounded bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
              >
                Start
              </button>
            </form>
          ))}
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-medium">All checklists</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            None yet — start one from a template above.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded border border-border">
            {rows.map((c) => (
              <li key={c.id} className="flex items-center gap-4 p-4">
                <div className="flex-1">
                  <Link
                    href={`/app/checklists/${c.id}`}
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    {c.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    Started {dateFmt.format(new Date(c.createdAt))}
                  </p>
                </div>
                <span
                  className={`rounded px-2 py-1 text-xs ${
                    c.status === "signed_off"
                      ? "bg-accent text-accent-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {c.status === "signed_off" ? "Signed off" : "Open"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
