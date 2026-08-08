"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { attachEvidence } from "@factory/core/evidence";
import { computeObligation } from "@factory/core/deadlines";
import { createRecord } from "@factory/core/records";
import { twoWorkingDayRule } from "@/deadlines";
import { wasteReceipt } from "@/entities";
import { requireWriteOrg } from "@/server/context";
import { getObjectStore } from "@/server/evidence";

/** Form → chassis createRecord (Zod-validated) + the 2-working-day obligation. */
export async function createReceipt(formData: FormData): Promise<void> {
  const { db, ctx } = await requireWriteOrg();
  const raw = {
    ewcCode: String(formData.get("ewcCode") ?? ""),
    description: String(formData.get("description") ?? ""),
    quantityTonnes: Number(formData.get("quantityTonnes")),
    carrierRef: String(formData.get("carrierRef") ?? ""),
    origin: String(formData.get("origin") ?? ""),
    destination: String(formData.get("destination") ?? ""),
    transferDate: String(formData.get("transferDate") ?? ""),
    dwtSubmissionRef:
      String(formData.get("dwtSubmissionRef") ?? "").trim() || undefined,
  };
  let record;
  try {
    record = await createRecord(db, ctx, wasteReceipt, raw);
  } catch (err) {
    if (err instanceof z.ZodError) {
      const msg = err.issues[0]
        ? `${err.issues[0].path.join(".")}: ${err.issues[0].message}`
        : "invalid input";
      redirect(`/app/receipts?error=${encodeURIComponent(msg)}`);
    }
    throw err;
  }
  await computeObligation(db, ctx, twoWorkingDayRule, {
    now: new Date(),
    record: { id: record.id, data: record.data },
  });
  redirect(`/app/receipts/${record.id}`);
}

/** Evidence upload on a record — immutable once attached, hashed server-side. */
export async function uploadEvidence(formData: FormData): Promise<void> {
  const { db, ctx } = await requireWriteOrg();
  const recordId = String(formData.get("recordId") ?? "");
  // Only in-app paths — a crafted form must not redirect users off-site.
  const rawBackTo = String(formData.get("backTo") ?? "");
  const backTo = rawBackTo.startsWith("/app/")
    ? rawBackTo
    : `/app/receipts/${recordId}`;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect(
      `${backTo}?error=${encodeURIComponent("Choose a file to attach")}`,
    );
  }
  await attachEvidence(db, getObjectStore(), ctx, {
    recordId,
    filename: file.name,
    contentType: file.type || "application/octet-stream",
    bytes: new Uint8Array(await file.arrayBuffer()),
  });
  redirect(backTo);
}
