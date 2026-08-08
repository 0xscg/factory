"use server";

import { redirect } from "next/navigation";
import {
  ChecklistStateError,
  completeStep,
  signOffChecklist,
  startChecklist,
} from "@factory/core/checklists";
import {
  newCarrierOnboarding,
  quarterlyReview,
  receiptChecklist,
} from "@/checklists";
import { requireWriteOrg } from "@/server/context";

const TEMPLATES = {
  [receiptChecklist.key]: receiptChecklist,
  [quarterlyReview.key]: quarterlyReview,
  [newCarrierOnboarding.key]: newCarrierOnboarding,
} as const;

export async function startFromTemplate(formData: FormData): Promise<void> {
  const { db, ctx } = await requireWriteOrg();
  const key = String(formData.get("templateKey") ?? "");
  const def = TEMPLATES[key as keyof typeof TEMPLATES];
  if (!def) redirect("/app/checklists");
  const recordId = String(formData.get("recordId") ?? "").trim();
  const row = await startChecklist(db, ctx, def, {
    recordId: recordId || undefined,
  });
  redirect(`/app/checklists/${row.id}`);
}

export async function completeChecklistStep(formData: FormData): Promise<void> {
  const { db, ctx } = await requireWriteOrg();
  const checklistId = String(formData.get("checklistId") ?? "");
  const stepKey = String(formData.get("stepKey") ?? "");
  const evidenceId = String(formData.get("evidenceId") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  try {
    await completeStep(db, ctx, checklistId, stepKey, {
      evidenceId: evidenceId || undefined,
      notes: notes || undefined,
    });
  } catch (err) {
    if (err instanceof ChecklistStateError) {
      redirect(
        `/app/checklists/${checklistId}?error=${encodeURIComponent(err.message)}`,
      );
    }
    throw err;
  }
  redirect(`/app/checklists/${checklistId}`);
}

export async function signOff(formData: FormData): Promise<void> {
  const { db, ctx } = await requireWriteOrg();
  const checklistId = String(formData.get("checklistId") ?? "");
  try {
    await signOffChecklist(db, ctx, checklistId);
  } catch (err) {
    if (err instanceof ChecklistStateError) {
      redirect(
        `/app/checklists/${checklistId}?error=${encodeURIComponent(err.message)}`,
      );
    }
    throw err;
  }
  redirect(`/app/checklists/${checklistId}`);
}
