import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { MutationContext } from "@factory/core/audit";
import type { Db } from "@factory/core/db";
import {
  canWrite,
  listUserOrgs,
  requireWriteAccess,
  validateSession,
  type Role,
} from "@factory/core/identity";
import { withOrg } from "@factory/core/db";
import { getDb } from "./db";
import { getUserById } from "./queries";

export const SESSION_COOKIE = "wd_session";
export const PENDING_TOTP_COOKIE = "wd_pending_totp";
export const PRODUCT = "wasteduty";

export interface SessionUser {
  id: string;
  email: string;
}

/** Session cookie → user, or null. Read-only; never redirects. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = getDb();
  const userId = await validateSession(db, token);
  if (!userId) return null;
  const user = await getUserById(db, userId);
  return user ? { id: user.id, email: user.email } : null;
}

/** First org membership for now; multi-org switching is a later phase. */
export async function getActiveOrg(
  db: Db,
  userId: string,
): Promise<{ orgId: string; role: Role } | null> {
  const orgs = await listUserOrgs(db, userId);
  return orgs[0] ?? null;
}

export interface OrgContext {
  db: Db;
  ctx: MutationContext & { actorUserId: string };
  user: SessionUser;
  role: Role;
  /** Auditor role is read-only — gate every mutating form/action on this. */
  canWrite: boolean;
}

/**
 * The one guard every /app page and action goes through: session →
 * active org → {db, ctx}. Redirects to /login (no session) or
 * /app/onboarding (no org yet).
 */
export async function requireOrg(): Promise<OrgContext> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const db = getDb();
  const membership = await getActiveOrg(db, user.id);
  if (!membership) redirect("/app/onboarding");
  return {
    db,
    ctx: { orgId: membership.orgId, product: PRODUCT, actorUserId: user.id },
    user,
    role: membership.role,
    canWrite: canWrite(membership.role),
  };
}

/**
 * requireOrg + DB-level write gate (chassis requireWriteAccess inside
 * the tenant transaction — auditors are refused server-side, not just
 * hidden in the UI).
 */
export async function requireWriteOrg(): Promise<OrgContext> {
  const org = await requireOrg();
  await withOrg(org.db, org.ctx.orgId, (tx) =>
    requireWriteAccess(tx, org.ctx.orgId, org.user.id),
  );
  return org;
}
