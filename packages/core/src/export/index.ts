import { asc, eq, inArray } from "drizzle-orm";
import { withOrg, type Db } from "../db/client.js";
import {
  auditLog,
  checklists,
  checklistSteps,
  evidence,
  members,
  obligations,
  orgs,
  records,
  recordVersions,
  users,
} from "../db/schema/index.js";
import type { MutationContext } from "../audit/mutate.js";
import { mutate } from "../audit/mutate.js";
import { downloadEvidence } from "../evidence/index.js";
import type { ObjectStore } from "../evidence/store.js";

/**
 * Full org export (architecture §3.5): self-serve JSON + files — a
 * GDPR obligation and a sales feature ("your records are yours; leave
 * whenever you like, inspection-ready"). One tenant transaction gives a
 * consistent snapshot; evidence bytes stream separately per file so the
 * JSON stays loadable.
 */
export interface OrgExport {
  exportVersion: 1;
  orgId: string;
  product: string;
  generatedAt: string;
  /** Org name — data portability includes knowing whose data this is. */
  org: { id: string; name: string } | null;
  /** Roster (userId/email/role) so audit actorUserIds resolve to people. */
  members: { userId: string; email: string; role: string }[];
  records: unknown[];
  recordVersions: unknown[];
  evidenceIndex: unknown[];
  checklists: unknown[];
  checklistSteps: unknown[];
  obligations: unknown[];
  auditLog: unknown[];
}

export async function exportOrg(
  db: Db,
  ctx: MutationContext,
  opts: { generatedAt?: Date } = {},
): Promise<OrgExport> {
  const generatedAt = opts.generatedAt ?? new Date();

  const snapshot = await withOrg(db, ctx.orgId, async (tx) => {
    const [org] = await tx
      .select({ id: orgs.id, name: orgs.name })
      .from(orgs)
      .where(eq(orgs.id, ctx.orgId));
    // Roster with emails so audit actorUserIds resolve to people —
    // auth columns (totp/session/token data) are never selected.
    const roster = await tx
      .select({
        userId: members.userId,
        email: users.email,
        role: members.role,
      })
      .from(members)
      .innerJoin(users, eq(users.id, members.userId))
      .where(eq(members.orgId, ctx.orgId));
    const recs = await tx
      .select()
      .from(records)
      .where(eq(records.product, ctx.product))
      .orderBy(asc(records.createdAt));
    const recIds = recs.map((r) => r.id);
    const versions = recIds.length
      ? await tx
          .select()
          .from(recordVersions)
          .where(inArray(recordVersions.recordId, recIds))
          .orderBy(asc(recordVersions.createdAt))
      : [];
    const ev = recIds.length
      ? await tx
          .select()
          .from(evidence)
          .where(inArray(evidence.recordId, recIds))
          .orderBy(asc(evidence.createdAt))
      : [];
    const cls = await tx
      .select()
      .from(checklists)
      .where(eq(checklists.product, ctx.product))
      .orderBy(asc(checklists.createdAt));
    const clIds = cls.map((c) => c.id);
    const steps = clIds.length
      ? await tx
          .select()
          .from(checklistSteps)
          .where(inArray(checklistSteps.checklistId, clIds))
          .orderBy(
            asc(checklistSteps.checklistId),
            asc(checklistSteps.position),
          )
      : [];
    const obls = await tx
      .select()
      .from(obligations)
      .where(eq(obligations.product, ctx.product))
      .orderBy(asc(obligations.dueAt));
    // The full trail, oldest first — the export must be replayable as
    // evidence, and product-filtering the trail would hide identity
    // events that belong to the org's history.
    // TODO: cursor/stream auditLog when row counts warrant (tens of MB
    // for a years-old active org is fine to hold; hundreds are not).
    const trail = await tx
      .select()
      .from(auditLog)
      .where(eq(auditLog.orgId, ctx.orgId))
      .orderBy(asc(auditLog.createdAt));
    return { org, roster, recs, versions, ev, cls, steps, obls, trail };
  });

  const result: OrgExport = {
    exportVersion: 1,
    orgId: ctx.orgId,
    product: ctx.product,
    generatedAt: generatedAt.toISOString(),
    org: snapshot.org ?? null,
    members: snapshot.roster,
    records: snapshot.recs,
    recordVersions: snapshot.versions,
    evidenceIndex: snapshot.ev,
    checklists: snapshot.cls,
    checklistSteps: snapshot.steps,
    obligations: snapshot.obls,
    auditLog: snapshot.trail,
  };

  // Snapshot and audit event are separate transactions, but the return
  // is AFTER the audit commits — no un-audited export can reach a caller
  // through this function.
  await mutate(db, ctx, async () => ({
    result: null,
    action: "org.exported",
    entityType: "org",
    entityId: ctx.orgId,
    after: {
      records: snapshot.recs.length,
      evidence: snapshot.ev.length,
      auditRows: snapshot.trail.length,
      generatedAt: generatedAt.toISOString(),
    },
  }));

  return result;
}

/**
 * Streams each evidence file to the sink alongside its index entry.
 * Separate from exportOrg so callers can zip/stream without holding
 * every file in memory; hash re-verified on read (chassis invariant).
 */
export async function exportEvidenceFiles(
  db: Db,
  ctx: MutationContext,
  store: ObjectStore,
  sink: (file: {
    evidenceId: string;
    filename: string;
    sha256: string;
    bytes: Uint8Array;
  }) => Promise<void>,
): Promise<{ exported: number }> {
  // Product-filtered to match exportOrg's evidenceIndex exactly — the
  // zip must never contain files the index doesn't list.
  const rows = await withOrg(db, ctx.orgId, async (tx) =>
    tx
      .select()
      .from(evidence)
      .where(eq(evidence.product, ctx.product))
      .orderBy(asc(evidence.createdAt)),
  );
  let exported = 0;
  for (const row of rows) {
    const bytes = await downloadEvidence(store, row);
    await sink({
      evidenceId: row.id,
      filename: row.filename,
      sha256: row.sha256,
      bytes,
    });
    exported += 1;
  }
  return { exported };
}
