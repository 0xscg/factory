"use server";

import { z } from "zod";

const emailSchema = z.string().trim().toLowerCase().email();

/**
 * Waitlist signup stub. Phase 3 wires this to listmonk (marketing list)
 * — until then it validates and logs so the landing page is shippable.
 */
export async function joinWaitlist(
  _prevState: { ok: boolean; message: string },
  formData: FormData,
): Promise<{ ok: boolean; message: string }> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    return { ok: false, message: "Please enter a valid email address." };
  }
  // TODO(Phase 3): push to listmonk waitlist; never store in app DB.
  // Stub until listmonk wiring (Phase 3). Never log the address itself —
  // raw PII in Coolify logs has no retention story.
  console.log(
    `[wasteduty] waitlist signup received (domain: ${parsed.data.split("@")[1] ?? "?"})`,
  );
  return {
    ok: true,
    message: "You're on the list — we'll email you before the mandate.",
  };
}
