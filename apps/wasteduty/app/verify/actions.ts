"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  createSession,
  RateLimitError,
  verifyMagicLink,
  verifyUserTotp,
} from "@factory/core/identity";
import {
  PENDING_TOTP_COOKIE,
  SESSION_COOKIE,
  getActiveOrg,
} from "@/server/context";
import { getDb } from "@/server/db";
import { issuePendingTotp, verifyPendingTotp } from "@/server/totp-pending";

const secureCookies = process.env.NODE_ENV === "production";

async function issueSession(userId: string): Promise<never> {
  const db = getDb();
  const session = await createSession(db, userId);
  (await cookies()).set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies,
    expires: session.expiresAt,
    path: "/",
  });
  const org = await getActiveOrg(db, userId);
  redirect(org ? "/app" : "/app/onboarding");
}

/** Button-posted (never on GET render — prefetchers must not burn the token). */
export async function completeSignIn(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const result = await verifyMagicLink(getDb(), token);
  if (!result) redirect("/login?error=invalid-token");
  if (result.totpRequired) {
    (await cookies()).set(
      PENDING_TOTP_COOKIE,
      issuePendingTotp(result.userId),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: secureCookies,
        maxAge: 600,
        path: "/",
      },
    );
    redirect("/verify/totp");
  }
  await issueSession(result.userId);
}

/** Second factor: pending cookie + 6-digit code → session. */
export async function completeTotp(formData: FormData): Promise<void> {
  const jar = await cookies();
  const pending = jar.get(PENDING_TOTP_COOKIE)?.value;
  const userId = pending ? verifyPendingTotp(pending) : null;
  if (!userId) redirect("/login?error=totp-expired");
  const code = String(formData.get("code") ?? "").trim();
  let ok = false;
  let limited = false;
  try {
    ok = await verifyUserTotp(getDb(), userId, code);
  } catch (err) {
    if (!(err instanceof RateLimitError)) throw err;
    limited = true;
  }
  if (limited) redirect("/verify/totp?error=rate-limited");
  if (!ok) redirect("/verify/totp?error=bad-code");
  jar.delete(PENDING_TOTP_COOKIE);
  await issueSession(userId);
}
