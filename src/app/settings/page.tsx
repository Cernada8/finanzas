import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatMoneyMinor } from "@/lib/format";

export default async function SettingsPage() {
  let owner;
  try {
    owner = await requireOwner();
  } catch {
    redirect("/login");
  }

  const ownerRow = await prisma.owner.findUniqueOrThrow({ where: { id: owner.id } });
  const [categories, rules, budgets] = await Promise.all([
    prisma.category.findMany({ where: { ownerId: owner.id }, orderBy: { name: "asc" } }),
    prisma.rule.findMany({ where: { ownerId: owner.id }, orderBy: { priority: "asc" } }),
    prisma.budget.findMany({ where: { ownerId: owner.id }, include: { category: true } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
      </div>

      <section className="card p-5">
        <h2 className="text-sm font-medium text-[var(--text-secondary)]">Profile &amp; reporting preferences</h2>
        <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm sm:grid-cols-4">
          <dt className="text-[var(--text-muted)]">Display name</dt>
          <dd>{ownerRow.displayName}</dd>
          <dt className="text-[var(--text-muted)]">Email</dt>
          <dd>{ownerRow.email}</dd>
          <dt className="text-[var(--text-muted)]">Reporting currency</dt>
          <dd>{ownerRow.reportingCcy}</dd>
          <dt className="text-[var(--text-muted)]">Locale</dt>
          <dd>{ownerRow.locale}</dd>
          <dt className="text-[var(--text-muted)]">Interface language</dt>
          <dd>{ownerRow.language}</dd>
          <dt className="text-[var(--text-muted)]">Timezone</dt>
          <dd>{ownerRow.timezone}</dd>
          <dt className="text-[var(--text-muted)]">Workspace</dt>
          <dd>{ownerRow.isDemo ? "Demo (isolated synthetic data)" : "Live"}</dd>
        </dl>
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-medium text-[var(--text-secondary)]">Categories ({categories.length})</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {categories.map((c) => (
            <span key={c.id} className="rounded-full border px-3 py-1 text-xs" style={{ borderColor: "var(--border)" }}>
              {c.name} <span className="text-[var(--text-muted)]">· {c.kind}</span>
            </span>
          ))}
        </div>
      </section>

      <section className="card overflow-x-auto p-0">
        <h2 className="px-5 pt-5 text-sm font-medium text-[var(--text-secondary)]">Categorization rules ({rules.length})</h2>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-t text-left text-xs uppercase tracking-wide text-[var(--text-muted)]" style={{ borderColor: "var(--gridline)" }}>
              <th className="px-5 py-2 font-normal">Priority</th>
              <th className="px-5 py-2 font-normal">Name</th>
              <th className="px-5 py-2 font-normal">Match</th>
              <th className="px-5 py-2 font-normal">Sets class</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} className="border-t" style={{ borderColor: "var(--gridline)" }}>
                <td className="px-5 py-2 tabular">{r.priority}</td>
                <td className="px-5 py-2">{r.name}</td>
                <td className="px-5 py-2 text-[var(--text-secondary)]">
                  {r.matchDescriptionContains ? `description contains "${r.matchDescriptionContains}"` : "—"}
                </td>
                <td className="px-5 py-2 text-[var(--text-secondary)]">{r.setEconomicClass ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-medium text-[var(--text-secondary)]">Budgets</h2>
        <ul className="mt-3 flex flex-col gap-2 text-sm">
          {budgets.map((b) => (
            <li key={b.id} className="flex justify-between">
              <span>{b.name}</span>
              <span className="tabular">{formatMoneyMinor(b.monthlyLimitMinor, b.currency)} / month</span>
            </li>
          ))}
          {budgets.length === 0 && <li className="text-[var(--text-muted)]">No budgets configured.</li>}
        </ul>
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-medium text-[var(--text-secondary)]">Data export &amp; deletion</h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Full data export (JSON) and account deletion are documented in <code>docs/operations.md</code>. They are implemented as
          operator scripts rather than a self-service button in this build — see that document for the exact commands and what each one
          does to backups and retained records.
        </p>
      </section>
    </div>
  );
}
