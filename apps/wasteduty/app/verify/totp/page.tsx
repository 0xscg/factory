import skin from "../../../skin.config";
import { completeTotp } from "../actions";

export default async function TotpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <p className="mb-8 text-lg font-semibold text-primary">
        {skin.brand.name}
      </p>
      <h1 className="text-2xl font-semibold">Two-factor code</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Enter the 6-digit code from your authenticator app.
      </p>
      <form action={completeTotp} className="mt-6 flex flex-col gap-3">
        {error && (
          <p className="rounded border border-border bg-muted p-3 text-sm">
            {error === "rate-limited"
              ? "Too many attempts — wait a few minutes, then try again."
              : "That code didn't match — try again."}
          </p>
        )}
        <input
          name="code"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          autoFocus
          className="rounded border border-border bg-background px-3 py-2 text-center text-lg tracking-[0.4em]"
        />
        <button
          type="submit"
          className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Verify
        </button>
      </form>
    </main>
  );
}
