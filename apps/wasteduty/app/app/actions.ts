"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createOrgWithOwner, revokeSession } from "@factory/core/identity";
import { markObligationMet, computeObligation } from "@factory/core/deadlines";
import { dwtMandate2026 } from "@/deadlines";
import {
  PRODUCT,
  SESSION_COOKIE,
  getSessionUser,
  requireWriteOrg,
} from "@/server/context";
import { getDb } from "@/server/db";

export async function signOut(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await revokeSession(getDb(), token);
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}

/** Onboarding: first org for a fresh user; seeds the fixed statutory obligation. */
export async function createOrganisation(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) redirect("/app/onboarding?error=name");
  const db = getDb();
  const { orgId } = await createOrgWithOwner(db, name, user.id, PRODUCT);
  await computeObligation(
    db,
    { orgId, product: PRODUCT, actorUserId: user.id },
    dwtMandate2026,
    { now: new Date() },
  );
  redirect("/app");
}

export async function markObligationDone(formData: FormData): Promise<void> {
  const { db, ctx } = await requireWriteOrg();
  const id = String(formData.get("obligationId") ?? "");
  await markObligationMet(db, ctx, id);
  redirect("/app");
}
