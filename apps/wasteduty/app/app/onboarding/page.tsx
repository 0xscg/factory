import { redirect } from "next/navigation";
import { getActiveOrg, getSessionUser } from "@/server/context";
import { getDb } from "@/server/db";
import { createOrganisation } from "../actions";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (await getActiveOrg(getDb(), user.id)) redirect("/app");
  const { error } = await searchParams;
  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-semibold">Set up your organisation</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Records, evidence and the audit trail all belong to your organisation.
        You can invite colleagues later.
      </p>
      <form action={createOrganisation} className="mt-6 flex flex-col gap-3">
        {error && (
          <p className="rounded border border-border bg-muted p-3 text-sm">
            Please enter an organisation name.
          </p>
        )}
        <label className="text-sm font-medium" htmlFor="name">
          Organisation name
        </label>
        <input
          id="name"
          name="name"
          required
          maxLength={200}
          className="rounded border border-border bg-background px-3 py-2 text-sm"
          placeholder="Acme Skip Hire Ltd"
        />
        <button
          type="submit"
          className="mt-2 rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Create organisation
        </button>
      </form>
    </div>
  );
}
