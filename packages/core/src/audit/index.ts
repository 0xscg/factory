import { desc, eq } from "drizzle-orm";
import { withOrg, withUser, type Db, type TenantTx } from "../db/client.js";
import { auditLog, members } from "../db/schema/index.js";

export interface AuditEvent {
  product: string;
  /** Dotted verb: "member.added", "user.totp_enabled", "record.created"… */
  action: string;
  entityType: string;
  entityId: string;
  /** Null for system-initiated events (jobs, webhooks). */
  actorUserId?: string | null;
  before?: unknown;
  after?: unknown;
}

/**
 * Writes an audit entry INSIDE the caller's withOrg transaction, so the
 * entry commits and rolls back atomically with the mutation it records.
 * Every chassis mutation must call this in the same transaction.
 */
export async function audit(
  tx: TenantTx,
  orgId: string,
  event: AuditEvent,
): Promise<void> {
  await tx.insert(auditLog).values({
    orgId,
    product: event.product,
    actorUserId: event.actorUserId ?? null,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    before: event.before ?? null,
    after: event.after ?? null,
  });
}

/**
 * User-level security events (sign-in, TOTP enablement, session
 * revocation) belong in the audit trail of every org the user is a
 * member of — an org auditor cares that "user X enabled 2FA", whichever
 * surface the user did it on. Product is fixed to "identity" here since
 * these events are not skin-specific.
 *
 * BEST-EFFORT by design: callers invoke this AFTER their mutation has
 * committed (audit_log.org_id is NOT NULL, so user-level events can't
 * join the mutation's transaction). A fan-out failure must therefore
 * never propagate — it would report failure for a mutation that already
 * happened (orphan sessions, "failed" TOTP enables that are actually
 * enabled). Per-org failures are logged via onError and the rest of the
 * fan-out continues. Zero-org users produce no rows (known gap; the
 * pre-first-org window is narrow and org-scoped events cover onboarding).
 */
export async function auditForUserOrgs(
  db: Db,
  userId: string,
  event: Omit<AuditEvent, "product">,
  onError: (orgId: string, error: unknown) => void = (orgId, error) =>
    console.error(`audit fan-out failed for org ${orgId}:`, error),
): Promise<void> {
  let orgRows: { orgId: string }[];
  try {
    orgRows = await withUser(db, userId, (tx) =>
      tx
        .select({ orgId: members.orgId })
        .from(members)
        .where(eq(members.userId, userId)),
    );
  } catch (error) {
    onError("membership-lookup", error);
    return;
  }
  for (const { orgId } of orgRows) {
    try {
      await withOrg(db, orgId, (tx) =>
        audit(tx, orgId, { ...event, product: "identity" }),
      );
    } catch (error) {
      onError(orgId, error);
    }
  }
}

/** Org's audit trail, newest first — feeds the inspection pack extract. */
export async function readAuditTrail(
  tx: TenantTx,
  orgId: string,
  limit = 100,
): Promise<(typeof auditLog.$inferSelect)[]> {
  return tx
    .select()
    .from(auditLog)
    .where(eq(auditLog.orgId, orgId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}
