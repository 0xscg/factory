"use server";

import { redirect } from "next/navigation";
import { RateLimitError, requestMagicLink } from "@factory/core/identity";
import { ZodError } from "zod";
import { getDb } from "@/server/db";
import { env } from "@/server/env";
import { getMailSender } from "@/server/mail";

/** Email → single-use magic link. Signup and sign-in are the same flow. */
export async function sendMagicLink(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "");
  try {
    await requestMagicLink(
      getDb(),
      email,
      (token) => `${env.APP_URL}/verify?token=${encodeURIComponent(token)}`,
      getMailSender(),
    );
  } catch (err) {
    if (err instanceof RateLimitError) {
      redirect("/login?error=rate-limited");
    }
    if (err instanceof ZodError) {
      redirect("/login?error=invalid-email");
    }
    // Transport failure (mail vendor / DB) — log WITHOUT the address and
    // tell the user the truth instead of blaming their email.
    console.error(
      `[wasteduty] magic-link send failed: ${err instanceof Error ? err.name : "unknown"}`,
    );
    redirect("/login?error=send-failed");
  }
  redirect("/login?sent=1");
}
