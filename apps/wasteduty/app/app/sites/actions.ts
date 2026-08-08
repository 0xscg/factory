"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createRecord } from "@factory/core/records";
import { siteRecord } from "@/entities";
import { requireWriteOrg } from "@/server/context";

export async function createSite(formData: FormData): Promise<void> {
  const { db, ctx } = await requireWriteOrg();
  const codes = String(formData.get("permittedEwcCodes") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  let record;
  try {
    record = await createRecord(db, ctx, siteRecord, {
      name: String(formData.get("name") ?? ""),
      permitRef: String(formData.get("permitRef") ?? ""),
      permittedEwcCodes: codes,
      tonnageLimit: Number(formData.get("tonnageLimit")),
      returnCadence: String(formData.get("returnCadence") ?? "quarterly") as
        "quarterly" | "annual",
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      const msg = err.issues[0]
        ? `${err.issues[0].path.join(".")}: ${err.issues[0].message}`
        : "invalid input";
      redirect(`/app/sites?error=${encodeURIComponent(msg)}`);
    }
    throw err;
  }
  redirect(`/app/sites/${record.id}`);
}
