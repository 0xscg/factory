/**
 * App env plumbing. Fail fast with a clear message on the required
 * pieces; optional services degrade explicitly (console mail, local
 * evidence dir). Stripe env is validated by the chassis loadBillingEnv
 * at the point of use (billing actions / webhook), not here — the app
 * must boot without Stripe keys in local dev.
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `${name} is not set. Add it to the environment (see apps/wasteduty/.env.example).`,
    );
  }
  return v;
}

export const env = {
  get DATABASE_URL(): string {
    return required("DATABASE_URL");
  },
  /** Absolute origin for magic links / Stripe redirects. */
  get APP_URL(): string {
    return process.env.APP_URL ?? "http://localhost:3000";
  },
  get GOTENBERG_URL(): string {
    return process.env.GOTENBERG_URL ?? "http://localhost:3100";
  },
  /** Optional — ConsoleMailSender when absent (local dev). */
  get RESEND_API_KEY(): string | undefined {
    return process.env.RESEND_API_KEY;
  },
  get MAIL_FROM(): string {
    return process.env.MAIL_FROM ?? "WasteDuty <sign-in@wasteduty.co.uk>";
  },
  /** Evidence object store root (R2 lands later — see core evidence/store.ts). */
  get DATA_DIR(): string {
    return process.env.DATA_DIR ?? ".data/evidence";
  },
  /**
   * Signs the short-lived pending-TOTP cookie. Required in production;
   * a dev fallback keeps local sign-in working.
   */
  get AUTH_SECRET(): string {
    const v = process.env.AUTH_SECRET;
    if (v) return v;
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET is not set (required in production).");
    }
    return "wasteduty-dev-only-secret";
  },
};
