import { inArray } from "drizzle-orm";
import { mutate, type MutationContext } from "../audit/mutate.js";
import { readAuditTrail } from "../audit/index.js";
import { withOrg, type Db } from "../db/client.js";
import { evidence as evidenceTable } from "../db/schema/index.js";
import { listRecords, type RecordRow } from "../records/index.js";

import { renderInspectionPack } from "./html.js";
import type { PdfRenderer } from "./pdf.js";

export interface PackEntityType {
  key: string;
  title: string;
}

export interface InspectionPackOptions {
  title: string;
  orgName: string;
  /** Skin's entity types to include, in display order. */
  entityTypes: PackEntityType[];
  /** Trading-name footer line ("X is a trading name of [Ltd], Co. no. …"). */
  footerText?: string;
  auditLimit?: number;
  recordLimit?: number;
  /** Injectable for deterministic tests; defaults to the wall clock. */
  generatedAt?: Date;
}

export interface InspectionPackData {
  title: string;
  orgName: string;
  footerText?: string;
  generatedAt: Date;
  entityTypes: PackEntityType[];
  records: RecordRow[];
  evidence: (typeof evidenceTable.$inferSelect)[];
  audit: Awaited<ReturnType<typeof readAuditTrail>>;
}

/**
 * Gathers records + evidence index + audit extract in one tenant
 * transaction (a consistent snapshot), audits the generation itself
 * (`report.generated` — packs handed to an inspector are exactly the
 * kind of event the trail must show), and returns the data + HTML.
 */
export async function assembleInspectionPack(
  db: Db,
  ctx: MutationContext,
  opts: InspectionPackOptions,
): Promise<{ data: InspectionPackData; html: string }> {
  const generatedAt = opts.generatedAt ?? new Date();

  const gathered = await withOrg(db, ctx.orgId, async (tx) => {
    const records: RecordRow[] = [];
    for (const et of opts.entityTypes) {
      records.push(
        ...(await listRecords(tx, ctx.product, et.key, {
          limit: opts.recordLimit ?? 500,
        })),
      );
    }
    const recordIds = records.map((r) => r.id);
    const evidence = recordIds.length
      ? await tx
          .select()
          .from(evidenceTable)
          .where(inArray(evidenceTable.recordId, recordIds))
      : [];
    const audit = await readAuditTrail(tx, ctx.orgId, opts.auditLimit ?? 200);
    return { records, evidence, audit };
  });

  const data: InspectionPackData = {
    title: opts.title,
    orgName: opts.orgName,
    footerText: opts.footerText,
    generatedAt,
    entityTypes: opts.entityTypes,
    ...gathered,
  };
  const html = renderInspectionPack(data);

  // Audited at assembly, before any PDF render: a Gotenberg failure can
  // leave a report.generated event for a pack that never reached the
  // user — read as "generation attempted", which is what a trail wants.
  await mutate(db, ctx, async () => ({
    result: null,
    action: "report.generated",
    entityType: "report",
    entityId: "inspection-pack",
    after: {
      title: opts.title,
      records: gathered.records.length,
      evidence: gathered.evidence.length,
      auditRows: gathered.audit.length,
      generatedAt: generatedAt.toISOString(),
    },
  }));

  return { data, html };
}

/** The one-click path: assemble, render to PDF via Gotenberg. */
export async function generateInspectionPackPdf(
  db: Db,
  ctx: MutationContext,
  opts: InspectionPackOptions,
  renderer: PdfRenderer,
): Promise<{ pdf: Uint8Array; html: string; data: InspectionPackData }> {
  const { data, html } = await assembleInspectionPack(db, ctx, opts);
  const pdf = await renderer.render(html);
  return { pdf, html, data };
}
