import { redirect } from "next/navigation";
import Link from "next/link";
import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSpendingData } from "@/server/services/reporting";
import { formatMoneyMinor, formatPercent, formatDate, formatMonthLabel } from "@/lib/format";
import { CategoryBarChart } from "@/components/category-bar-chart";
import { Decimal } from "decimal.js";

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function SpendingPage(props: PageProps<"/spending">) {
  let owner;
  try {
    owner = await requireOwner();
  } catch {
    redirect("/login");
  }

  const searchParams = await props.searchParams;
  const month = typeof searchParams.month === "string" ? searchParams.month : new Date().toISOString().slice(0, 7);

  const data = await getSpendingData(prisma, owner.id, month);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Spending</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{formatMonthLabel(month)}</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/spending?month=${shiftMonth(month, -1)}`} className="rounded-md border px-3 py-1.5" style={{ borderColor: "var(--border)" }}>
            ← Previous
          </Link>
          <Link href={`/spending?month=${shiftMonth(month, 1)}`} className="rounded-md border px-3 py-1.5" style={{ borderColor: "var(--border)" }}>
            Next →
          </Link>
        </div>
      </div>

      {data.isPartialMonth && (
        <div className="card p-4 text-sm" style={{ color: "var(--status-warning)" }}>
          This month is in progress — {data.elapsedDays} of {data.totalDaysInMonth} days elapsed. Net spending so far is{" "}
          <strong>{formatMoneyMinor(data.netSpendingMinor, data.currency)}</strong>; on an equal-elapsed-day basis it projects to{" "}
          <strong>{formatMoneyMinor(data.projectedFullMonthMinor, data.currency)}</strong> for the full month. Treat this as an estimate, not
          a committed total.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="card p-5">
          <div className="text-sm text-[var(--text-secondary)]">Gross expense</div>
          <div className="tabular mt-1 text-xl font-semibold">{formatMoneyMinor(data.grossExpenseMinor, data.currency)}</div>
        </div>
        <div className="card p-5">
          <div className="text-sm text-[var(--text-secondary)]">Eligible refunds</div>
          <div className="tabular mt-1 text-xl font-semibold">{formatMoneyMinor(data.eligibleRefundMinor, data.currency)}</div>
        </div>
        <div className="card p-5">
          <div className="text-sm text-[var(--text-secondary)]">Net spending</div>
          <div className="tabular mt-1 text-xl font-semibold">{formatMoneyMinor(data.netSpendingMinor, data.currency)}</div>
        </div>
        <div className="card p-5">
          <div className="text-sm text-[var(--text-secondary)]">Savings rate</div>
          <div className="tabular mt-1 text-xl font-semibold">{formatPercent(data.savingsRate)}</div>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="text-sm font-medium text-[var(--text-secondary)]">By category</h2>
        <div className="mt-3">
          <CategoryBarChart
            data={data.byCategory.map((c) => ({ name: c.name, amount: new Decimal(c.totalMinor.toString()).div(100).toNumber() }))}
          />
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <h2 className="px-5 pt-5 text-sm font-medium text-[var(--text-secondary)]">Transactions</h2>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-t text-left text-xs uppercase tracking-wide text-[var(--text-muted)]" style={{ borderColor: "var(--gridline)" }}>
              <th className="px-5 py-2 font-normal">Date</th>
              <th className="px-5 py-2 font-normal">Description</th>
              <th className="px-5 py-2 font-normal">Account</th>
              <th className="px-5 py-2 font-normal">Category</th>
              <th className="px-5 py-2 font-normal">Class</th>
              <th className="px-5 py-2 text-right font-normal">Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.transactions.map((t) => (
              <tr key={t.id} className="border-t" style={{ borderColor: "var(--gridline)" }}>
                <td className="px-5 py-2 whitespace-nowrap">{formatDate(t.date)}</td>
                <td className="px-5 py-2">{t.description}</td>
                <td className="px-5 py-2 whitespace-nowrap text-[var(--text-secondary)]">{t.accountName}</td>
                <td className="px-5 py-2 whitespace-nowrap text-[var(--text-secondary)]">{t.categoryName ?? "—"}</td>
                <td className="px-5 py-2 whitespace-nowrap text-[var(--text-secondary)]">{t.economicClass}</td>
                <td className="tabular px-5 py-2 text-right">{formatMoneyMinor(t.amountMinor, t.currency)}</td>
              </tr>
            ))}
            {data.transactions.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-[var(--text-muted)]">
                  No transactions booked this month.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
