import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { getWorkspaceMode } from "@/lib/prisma";

const NAV_ITEMS = [
  { href: "/", label: "Overview" },
  { href: "/spending", label: "Spending" },
  { href: "/investments", label: "Investments" },
  { href: "/activity", label: "Activity" },
  { href: "/connections", label: "Connections" },
  { href: "/settings", label: "Settings" },
];

export async function NavShell({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const mode = getWorkspaceMode();

  if (!session?.user) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen flex-col">
      {mode === "demo" && (
        <div className="bg-[var(--status-warning)] text-[#1a1400] text-center text-sm py-1.5 font-medium">
          Demo workspace — synthetic data only, isolated from any real account.
        </div>
      )}
      <header className="border-b" style={{ borderColor: "var(--border)" }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-8">
            <span className="font-semibold tracking-tight">Finance</span>
            <nav className="hidden gap-1 sm:flex" aria-label="Main">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              type="submit"
              className="rounded-md border px-3 py-1.5 text-sm text-[var(--text-secondary)]"
              style={{ borderColor: "var(--border)" }}
            >
              Sign out
            </button>
          </form>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t px-2 py-1.5 sm:hidden" style={{ borderColor: "var(--border)" }} aria-label="Main">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-[var(--text-secondary)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
