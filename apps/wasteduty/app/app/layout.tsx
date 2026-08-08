import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import skin from "../../skin.config";
import { getSessionUser } from "@/server/context";
import { signOut } from "./actions";

const NAV = [
  ["/app", "Dashboard"],
  ["/app/receipts", "Receipts"],
  ["/app/carriers", "Carriers"],
  ["/app/sites", "Sites"],
  ["/app/checklists", "Checklists"],
  ["/app/reports", "Reports"],
  ["/app/billing", "Billing"],
] as const;

/** Session guard for everything under /app (actions re-check via requireOrg). */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-3">
          <Link href="/app" className="font-semibold text-primary">
            {skin.brand.name}
          </Link>
          <nav className="flex flex-1 gap-4 overflow-x-auto text-sm">
            {NAV.map(([href, label]) => (
              <Link
                key={href}
                href={href}
                className="text-muted-foreground hover:text-foreground"
              >
                {label}
              </Link>
            ))}
          </nav>
          <form action={signOut}>
            <button
              type="submit"
              className="text-sm text-muted-foreground hover:text-foreground"
              title={user.email}
            >
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        {children}
      </main>
      <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        {skin.brand.footerText}
      </footer>
    </div>
  );
}
