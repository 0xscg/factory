import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { withOrg, withUser, type Db } from "../db/client.js";
import { members, orgs } from "../db/schema/index.js";
import { requireRole, type Role } from "./roles.js";
import { upsertUserByEmail } from "./users.js";

const orgNameSchema = z.string().trim().min(1).max(200);

/**
 * Signup path: the org id is generated first so the whole creation runs
 * inside withOrg(id) — RLS WITH CHECK passes because the inserted rows
 * match the transaction's org context. No privileged connection needed.
 */
export async function createOrgWithOwner(
  db: Db,
  name: string,
  ownerUserId: string,
): Promise<{ orgId: string }> {
  const orgName = orgNameSchema.parse(name);
  const orgId = randomUUID();
  await withOrg(db, orgId, async (tx) => {
    await tx.insert(orgs).values({ id: orgId, name: orgName });
    await tx
      .insert(members)
      .values({ orgId, userId: ownerUserId, role: "owner" });
  });
  return { orgId };
}

/** Admin+ invites by email; the user row is created on first sight. */
export async function addMember(
  db: Db,
  orgId: string,
  actingUserId: string,
  email: string,
  role: Role,
): Promise<{ userId: string }> {
  if (role === "owner")
    throw new Error("ownership is transferred, not granted");
  const user = await upsertUserByEmail(db, email);

  await withOrg(db, orgId, async (tx) => {
    await requireRole(tx, orgId, actingUserId, "admin");
    await tx.insert(members).values({ orgId, userId: user.id, role });
  });
  return { userId: user.id };
}

/**
 * "Which orgs can I open?" — pre-org-selection, so it runs under withUser:
 * the members_self_view policy exposes exactly the caller's own rows.
 */
export async function listUserOrgs(
  db: Db,
  userId: string,
): Promise<{ orgId: string; role: Role }[]> {
  return withUser(db, userId, (tx) =>
    tx
      .select({ orgId: members.orgId, role: members.role })
      .from(members)
      .where(eq(members.userId, userId)),
  );
}
