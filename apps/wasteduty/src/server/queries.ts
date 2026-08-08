import { eq } from "drizzle-orm";
import { members, orgs, users, withOrg, type Db } from "@factory/core/db";

/**
 * Read-only lookups the chassis does not yet expose (reported as
 * chassis gaps, not forked): getUserById, org name, and the org
 * admin-email resolver the dunning handler needs. Reads use only
 * chassis-exported schema/tenancy wrappers; NO writes happen here —
 * all mutations go through chassis APIs elsewhere.
 */

export async function getUserById(
  db: Db,
  userId: string,
): Promise<{ id: string; email: string } | null> {
  const [row] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.id, userId));
  return row ?? null;
}

/** RLS scopes orgs to the current org — the select returns exactly one row. */
export async function getOrgName(db: Db, orgId: string): Promise<string> {
  const [row] = await withOrg(db, orgId, (tx) =>
    tx.select({ name: orgs.name }).from(orgs),
  );
  return row?.name ?? "Your organisation";
}

/** Owner/admin emails for an org — recipients for dunning/deadline mail. */
export async function getOrgAdminEmails(
  db: Db,
  orgId: string,
): Promise<string[]> {
  const rows = await withOrg(db, orgId, (tx) =>
    tx
      .select({ email: users.email, role: members.role })
      .from(members)
      .innerJoin(users, eq(users.id, members.userId)),
  );
  return rows
    .filter((r) => r.role === "owner" || r.role === "admin")
    .map((r) => r.email);
}
