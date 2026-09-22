import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getInvestmentsData } from "@/server/services/reporting";
import { formatMoneyMinor, formatPercent } from "@/lib/format";
import { StatTile } from "@/components/stat-tile";

export default async function InvestmentsPage() {
  let owner;
  try {
    owner = await requireOwner();
  } catch {
    redirect("/login");
  }

  const data = await getInvestmentsData(prisma, owner.id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Investments</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Portfolio history and time-weighted/money-weighted performance are not shown below because this workspace does not yet have
          enough bracketed valuation history for either metric to be computed reliably — see docs/financial-methodology.md. They will
          appear automatically once enough dated valuations exist, rather than being approximated now.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Securities value" value={formatMoneyMinor(data.totalSecuritiesValueMinor, data.currency)} />
        <StatTile label="Broker cash" value={formatMoneyMinor(data.brokerCashMinor, data.currency)} />
        <StatTile
          label="Investment share"
          value={formatPercent(data.investmentShare)}
          sublabel="Invested securities ÷ included financial assets"
        />
      </div>

      {data.costBasisMissingCount > 0 && (
        <div className="card p-4 text-sm" style={{ color: "var(--status-warning)" }}>
          {data.costBasisMissingCount} position(s) are missing a cost basis — their unrealized gain is shown as unavailable rather than
          guessed.
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        <h2 className="px-5 pt-5 text-sm font-medium text-[var(--text-secondary)]">Positions</h2>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-t text-left text-xs uppercase tracking-wide text-[var(--text-muted)]" style={{ borderColor: "var(--gridline)" }}>
              <th className="px-5 py-2 font-normal">Instrument</th>
              <th className="px-5 py-2 font-normal">Account</th>
              <th className="px-5 py-2 font-normal">Type</th>
              <th className="px-5 py-2 text-right font-normal">Units</th>
              <th className="px-5 py-2 text-right font-normal">Value</th>
              <th className="px-5 py-2 text-right font-normal">Unrealized gain</th>
              <th className="px-5 py-2 text-right font-normal">Allocation</th>
            </tr>
          </thead>
          <tbody>
            {data.positions.map((p) => (
              <tr key={p.instrumentId} className="border-t" style={{ borderColor: "var(--gridline)" }}>
                <td className="px-5 py-2">
                  <div className="font-medium">{p.name}</div>
                  {p.isin && <div className="text-xs text-[var(--text-muted)]">{p.isin}</div>}
                </td>
                <td className="px-5 py-2 whitespace-nowrap text-[var(--text-secondary)]">{p.accountName}</td>
                <td className="px-5 py-2 whitespace-nowrap text-[var(--text-secondary)]">{p.assetType}</td>
                <td className="tabular px-5 py-2 text-right">{p.units}</td>
                <td className="tabular px-5 py-2 text-right">
                  {p.priceMissing ? <span className="text-[var(--status-warning)]">no price</span> : formatMoneyMinor(p.currentValueMinor, data.currency)}
                </td>
                <td className="tabular px-5 py-2 text-right">
                  {p.unrealizedGainMinor == null ? (
                    <span className="text-[var(--text-muted)]">unavailable</span>
                  ) : (
                    <span style={{ color: p.unrealizedGainMinor >= 0n ? "var(--status-good)" : "var(--status-critical)" }}>
                      {formatMoneyMinor(p.unrealizedGainMinor, data.currency)}
                      {p.unrealizedGainPct != null && ` (${formatPercent(p.unrealizedGainPct)})`}
                    </span>
                  )}
                </td>
                <td className="tabular px-5 py-2 text-right">{formatPercent(p.allocationOfSecurities)}</td>
              </tr>
            ))}
            {data.positions.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-[var(--text-muted)]">
                  No investment holdings synced yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
