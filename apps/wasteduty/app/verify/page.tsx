import { redirect } from "next/navigation";
import skin from "../../skin.config";
import { completeSignIn } from "./actions";

/**
 * The magic link lands here. The token is only consumed on the button
 * POST — email scanners and prefetchers that GET the URL cannot burn
 * the single-use token.
 */
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) redirect("/login");
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <p className="mb-8 text-lg font-semibold text-primary">
        {skin.brand.name}
      </p>
      <h1 className="text-2xl font-semibold">Complete sign-in</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Confirm to use your single-use sign-in link.
      </p>
      <form action={completeSignIn} className="mt-6">
        <input type="hidden" name="token" value={token} />
        <button
          type="submit"
          className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Sign in
        </button>
      </form>
    </main>
  );
}
