import Link from "next/link";
import skin from "../../skin.config";
import { sendMagicLink } from "./actions";

const MESSAGES: Record<string, string> = {
  "rate-limited":
    "Too many sign-in links requested — wait a few minutes and try again.",
  "invalid-email": "Please enter a valid email address.",
  "send-failed":
    "We couldn't send the sign-in email just now — try again in a minute.",
  "invalid-token":
    "That sign-in link is invalid or has expired. Request a new one.",
  "totp-expired":
    "The verification window expired. Request a new sign-in link.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { sent, error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <Link href="/" className="mb-8 text-lg font-semibold text-primary">
        {skin.brand.name}
      </Link>
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        We&apos;ll email you a single-use sign-in link. New here? The same link
        creates your account.
      </p>
      {sent ? (
        <p className="mt-6 rounded border border-border bg-accent p-4 text-sm text-accent-foreground">
          Check your inbox — the link is valid for 15 minutes and can be used
          once.
        </p>
      ) : (
        <form action={sendMagicLink} className="mt-6 flex flex-col gap-3">
          {error && (
            <p className="rounded border border-border bg-muted p-3 text-sm">
              {MESSAGES[error] ?? "Something went wrong — try again."}
            </p>
          )}
          <label className="text-sm font-medium" htmlFor="email">
            Work email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="rounded border border-border bg-background px-3 py-2 text-sm"
            placeholder="you@company.co.uk"
          />
          <button
            type="submit"
            className="mt-2 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Email me a sign-in link
          </button>
        </form>
      )}
      <p className="mt-10 text-xs text-muted-foreground">
        {skin.brand.footerText}
      </p>
    </main>
  );
}
