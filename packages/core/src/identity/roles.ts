import { and, eq } from "drizzle-orm";
import type { TenantTx } from "../db/client.js";
import { members } from "../db/schema/index.js";

export const ROLES = ["owner", "admin", "member", "auditor"] as const;
export type Role = (typeof ROLES)[number];

/** Higher = more privilege. Auditor is read-only by definition. */
const RANK: Record<Role, number> = {
  owner: 3,
  admin: 2,
  member: 1,
  auditor: 0,
};

export function roleAtLeast(role: Role, min: Role): boolean {
  return RANK[role] >= RANK[min];
}

/** Auditors can never write, whatever the operation. */
export function canWrite(role: Role): boolean {
  return role !== "auditor";
}

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Runs inside withOrg — RLS already scopes members to the current org. */
export async function getMemberRole(
  tx: TenantTx,
  orgId: string,
  userId: string,
): Promise<Role | null> {
  const [row] = await tx
    .select({ role: members.role })
    .from(members)
    .where(and(eq(members.orgId, orgId), eq(members.userId, userId)));
  return row?.role ?? null;
}

export async function requireRole(
  tx: TenantTx,
  orgId: string,
  userId: string,
  min: Role,
): Promise<Role> {
  const role = await getMemberRole(tx, orgId, userId);
  if (!role || !roleAtLeast(role, min)) {
    throw new ForbiddenError(`requires ${min} role`);
  }
  return role;
}

export async function requireWriteAccess(
  tx: TenantTx,
  orgId: string,
  userId: string,
): Promise<Role> {
  const role = await getMemberRole(tx, orgId, userId);
  if (!role || !canWrite(role)) {
    throw new ForbiddenError("auditor role is read-only");
  }
  return role;
}
