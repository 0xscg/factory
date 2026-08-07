import { withOrg, type Db, type TenantTx } from "../db/client.js";
import { audit } from "./index.js";

export interface MutationContext {
  orgId: string;
  product: string;
  /** Null/undefined for system-initiated mutations (jobs, webhooks). */
  actorUserId?: string | null;
}

export interface MutationOutcome<T> {
  result: T;
  /** Dotted verb, e.g. "record.created". */
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}

/**
 * THE way chassis modules mutate tenant data (plan §Phase 1.3): runs the
 * mutation and its audit entry in one withOrg transaction — a mutation
 * through this wrapper cannot commit without its event. Coverage is
 * structural per call-site, not per-table: raw drizzle writes inside a
 * bare withOrg still bypass it (code review enforces "all mutations go
 * through mutate()"; a deferred constraint trigger on records could
 * close this at the DB level — see plan backlog).
 * The callback decides the event content after doing the work (it knows
 * ids and before/after states); throwing rolls back both.
 */
export async function mutate<T>(
  db: Db,
  ctx: MutationContext,
  fn: (tx: TenantTx) => Promise<MutationOutcome<T>>,
): Promise<T> {
  return withOrg(db, ctx.orgId, async (tx) => {
    const outcome = await fn(tx);
    await audit(tx, ctx.orgId, {
      product: ctx.product,
      actorUserId: ctx.actorUserId ?? null,
      action: outcome.action,
      entityType: outcome.entityType,
      entityId: outcome.entityId,
      before: outcome.before,
      after: outcome.after,
    });
    return outcome.result;
  });
}
