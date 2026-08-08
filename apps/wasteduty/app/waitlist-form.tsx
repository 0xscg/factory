"use client";

import { useActionState } from "react";
import { joinWaitlist } from "./actions";

const initialState = { ok: false, message: "" };

export function WaitlistForm() {
  const [state, formAction, pending] = useActionState(
    joinWaitlist,
    initialState,
  );

  return (
    <form action={formAction} className="mx-auto flex max-w-md gap-2">
      <input
        type="email"
        name="email"
        required
        placeholder="you@yourcompany.co.uk"
        className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <button
        type="submit"
        disabled={pending}
        className="whitespace-nowrap rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {pending ? "Joining…" : "Join the waitlist"}
      </button>
      {state.message && (
        <p
          className={`mt-2 text-sm ${state.ok ? "text-primary" : "text-red-600"}`}
          role="status"
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
