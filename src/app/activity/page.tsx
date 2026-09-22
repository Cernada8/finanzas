import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatMoneyMinor, formatDate } from "@/lib/format";

export default async function ActivityPage() {
  let owner;
  try {
    owner = await requireOwner();
  } catch {
    redirect("/login");
  }

  const [unresolved, candidateTransfers, recentImports] = await Promise.all([
    prisma.transaction.findMany({
      where: { ownerId: owner.id, economicClass: "UNRESOLVED" },
      include: { account: true },
      orderBy: { transactionDate: "desc" },
      take: 100,
    }),
    prisma.transferMatch.findMany({
      where: { ownerId: owner.id, status: "CANDIDATE" },
      include: { fromTx: { include: { account: true } }, toTx: { include: { account: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.importBatch.findMany({ where: { ownerId: owner.id }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Activity &amp; review</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Uncategorized transactions, uncertain transfer matches, and import history. Corrections made here persist and are never
          overwritten by a future sync or rule run.
        </p>
      </div>

      <section className="card overflow-x-auto p-0">
        <h2 className="px-5 pt-5 text-sm font-medium text-[var(--text-secondary)]">
          Uncategorized transactions ({unresolved.length})
        </h2>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-t text-left text-xs uppercase tracking-wide text-[var(--text-muted)]" style={{ borderColor: "var(--gridline)" }}>
              <th className="px-5 py-2 font-normal">Date</th>
              <th className="px-5 py-2 font-normal">Description</th>
              <th className="px-5 py-2 font-normal">Account</th>
              <th className="px-5 py-2 text-right font-normal">Amount</th>
            </tr>
          </thead>
          <tbody>
            {unresolved.map((t) => (
              <tr key={t.id} className="border-t" style={{ borderColor: "var(--gridline)" }}>
                <td className="px-5 py-2 whitespace-nowrap">{formatDate(t.transactionDate)}</td>
                <td className="px-5 py-2">{t.description}</td>
                <td className="px-5 py-2 whitespace-nowrap text-[var(--text-secondary)]">{t.account.name}</td>
                <td className="tabular px-5 py-2 text-right">{formatMoneyMinor(t.amountMinor, t.currency)}</td>
              </tr>
            ))}
            {unresolved.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-[var(--text-muted)]">
                  Nothing to review — every transaction is classified.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="card overflow-x-auto p-0">
        <h2 className="px-5 pt-5 text-sm font-medium text-[var(--text-secondary)]">
          Uncertain transfer matches ({candidateTransfers.length})
        </h2>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-t text-left text-xs uppercase tracking-wide text-[var(--text-muted)]" style={{ borderColor: "var(--gridline)" }}>
              <th className="px-5 py-2 font-normal">From</th>
              <th className="px-5 py-2 font-normal">To</th>
              <th className="px-5 py-2 font-normal">Matched by</th>
              <th className="px-5 py-2 text-right font-normal">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {candidateTransfers.map((m) => (
              <tr key={m.id} className="border-t" style={{ borderColor: "var(--gridline)" }}>
                <td className="px-5 py-2">
                  {m.fromTx.account.name} — {m.fromTx.description}
                </td>
                <td className="px-5 py-2">
                  {m.toTx.account.name} — {m.toTx.description}
                </td>
                <td className="px-5 py-2 text-[var(--text-secondary)]">{m.matchedBy}</td>
                <td className="tabular px-5 py-2 text-right">{(m.confidence * 100).toFixed(0)}%</td>
              </tr>
            ))}
            {candidateTransfers.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-[var(--text-muted)]">
                  No uncertain transfer matches.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="card overflow-x-auto p-0">
        <h2 className="px-5 pt-5 text-sm font-medium text-[var(--text-secondary)]">Recent imports</h2>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-t text-left text-xs uppercase tracking-wide text-[var(--text-muted)]" style={{ borderColor: "var(--gridline)" }}>
              <th className="px-5 py-2 font-normal">File</th>
              <th className="px-5 py-2 font-normal">Status</th>
              <th className="px-5 py-2 text-right font-normal">Imported</th>
              <th className="px-5 py-2 text-right font-normal">Duplicates</th>
              <th className="px-5 py-2 text-right font-normal">Errors</th>
            </tr>
          </thead>
          <tbody>
            {recentImports.map((b) => (
              <tr key={b.id} className="border-t" style={{ borderColor: "var(--gridline)" }}>
                <td className="px-5 py-2">{b.fileName}</td>
                <td className="px-5 py-2 text-[var(--text-secondary)]">{b.status}</td>
                <td className="tabular px-5 py-2 text-right">{b.rowsImported}</td>
                <td className="tabular px-5 py-2 text-right">{b.rowsDuplicate}</td>
                <td className="tabular px-5 py-2 text-right">{b.rowsErrored}</td>
              </tr>
            ))}
            {recentImports.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-[var(--text-muted)]">
                  No imports yet. Add one from Connections.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
