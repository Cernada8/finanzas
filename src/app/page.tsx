import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOverviewData } from "@/server/services/reporting";
import { formatMoneyMinor, formatPercent } from "@/lib/format";
import { StatTile, DataQualityPanel } from "@/components/stat-tile";

export default async function OverviewPage() {
  let owner;
  try {
    owner = await requireOwner();
  } catch {
    redirect("/login");
  }

  const data = await getOverviewData(prisma, owner.id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Overview</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {data.lastSuccessfulSync
            ? `Last successful sync: ${new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(data.lastSuccessfulSync)}`
            : "No successful sync yet."}
          {" · "}
          {data.connectionsSummary.current}/{data.connectionsSummary.total} connections current
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Cash" value={formatMoneyMinor(data.cashMinor, data.currency)} />
        <StatTile label="Invested assets" value={formatMoneyMinor(data.investedMinor, data.currency)} />
        <StatTile
          label="Tracked net worth"
          value={formatMoneyMinor(data.netWorthMinor, data.currency)}
          sublabel={data.netWorthIsPartial ? "Partial — no liability accounts tracked yet" : undefined}
        />
        <StatTile
          label="Savings rate (this month)"
          value={formatPercent(data.savingsRate)}
          sublabel={data.savingsRate == null ? "Unavailable — no operating income booked yet" : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Income (month to date)" value={formatMoneyMinor(data.monthlyIncomeMinor, data.currency)} />
        <StatTile label="Net spending (month to date)" value={formatMoneyMinor(data.monthlySpendingMinor, data.currency)} />
        <StatTile
          label="Operating savings (month to date)"
          value={formatMoneyMinor(data.monthlySavingsMinor, data.currency)}
          tone={data.monthlySavingsMinor >= 0n ? "good" : "critical"}
        />
      </div>

      <DataQualityPanel issues={data.dataQuality} />
    </div>
  );
}
