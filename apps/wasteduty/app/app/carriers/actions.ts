"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { computeObligation } from "@factory/core/deadlines";
import { createRecord } from "@factory/core/records";
import { carrierRegistrationExpiry } from "@/deadlines";
import { wasteCarrier } from "@/entities";
import { requireWriteOrg } from "@/server/context";

export async function createCarrier(formData: FormData): Promise<void> {
  const { db, ctx } = await requireWriteOrg();
  let record;
  try {
    record = await createRecord(db, ctx, wasteCarrier, {
      name: String(formData.get("name") ?? ""),
      registrationNumber: String(formData.get("registrationNumber") ?? ""),
      expiryDate: String(formData.get("expiryDate") ?? ""),
      verificationDate: String(formData.get("verificationDate") ?? ""),
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      const msg = err.issues[0]
        ? `${err.issues[0].path.join(".")}: ${err.issues[0].message}`
        : "invalid input";
      redirect(`/app/carriers?error=${encodeURIComponent(msg)}`);
    }
    throw err;
  }
  await computeObligation(db, ctx, carrierRegistrationExpiry, {
    now: new Date(),
    record: { id: record.id, data: record.data },
  });
  redirect(`/app/carriers/${record.id}`);
}
