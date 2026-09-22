/**
 * Read-side reporting: queries Prisma and hands the results to the pure domain layer
 * (src/domain/*) for every actual calculation. This module does no financial arithmetic itself
 * beyond selecting "latest" rows and grouping — the moment a number is computed, it goes through
 * domain code that has unit tests.
 */
import { PrismaClient } from "@prisma/client";
import { Decimal } from "decimal.js";
import { computeMonthlySpending, equalElapsedDayProjection } from "@/domain/spending";
import {
  computeSecurityAllocations,
  computeInvestmentShare,
  computeUnrealizedGain,
  computeTrackedNetWorth,
} from "@/domain/investments";
import type { DomainTransaction } from "@/domain/types";

const REPORTING_CCY = "EUR"; // TODO: drive from Owner.reportingCcy once multi-currency FX pipeline is populated.

export interface DataQualityIssue {
  severity: "info" | "warning";
  message: string;
}

export interface OverviewData {
  cashMinor: bigint;
  investedMinor: bigint;
  netWorthMinor: bigint;
  netWorthIsPartial: boolean;
  monthlyIncomeMinor: bigint;
  monthlySpendingMinor: bigint;
  monthlySavingsMinor: bigint;
  savingsRate: Decimal | null;
  currency: string;
  lastSuccessfulSync: Date | null;
  connectionsSummary: { total: number; current: number; unconfigured: number; failed: number };
  dataQuality: DataQualityIssue[];
  unresolvedCount: number;
}

async function ownerTransactions(db: PrismaClient, ownerId: string): Promise<DomainTransaction[]> {
  const rows = await db.transaction.findMany({ where: { ownerId } });
  return rows.map((t) => ({
    id: t.id,
    accountId: t.accountId,
    ownerId: t.ownerId,
    bookedDate: t.bookedDate ? t.bookedDate.toISOString().slice(0, 10) : null,
    transactionDate: t.transactionDate.toISOString().slice(0, 10),
    status: t.status,
    amountMinor: t.amountMinor,
    currency: t.currency,
    description: t.description,
    economicClass: t.economicClass,
  }));
}

async function latestBalancesMinor(db: PrismaClient, ownerId: string): Promise<{ cashMinor: bigint; liabilityMinor: bigint; issues: DataQualityIssue[] }> {
  const accounts = await db.account.findMany({
    where: { ownerId, includeInNetWorth: true, kind: { in: ["CASH", "CARD", "BROKERAGE_CASH", "LOAN"] } },
    include: { balances: { orderBy: { asOf: "desc" }, take: 1 } },
  });
  let cashMinor = 0n;
  let liabilityMinor = 0n;
  const issues: DataQualityIssue[] = [];
  for (const acct of accounts) {
    const latest = acct.balances[0];
    if (!latest) {
      issues.push({ severity: "warning", message: `${acct.name}: no balance observed yet.` });
      continue;
    }
    if (latest.currency !== REPORTING_CCY) {
      issues.push({ severity: "warning", message: `${acct.name}: balance in ${latest.currency}, no FX rate applied — excluded from totals.` });
      continue;
    }
    if (acct.isLiability) liabilityMinor += latest.bookedMinor < 0n ? -latest.bookedMinor : latest.bookedMinor;
    else cashMinor += latest.bookedMinor;
  }
  return { cashMinor, liabilityMinor, issues };
}

async function latestInvestedValueMinor(db: PrismaClient, ownerId: string): Promise<{ investedMinor: bigint; issues: DataQualityIssue[] }> {
  const accounts = await db.account.findMany({
    where: { ownerId, kind: "INVESTMENT" },
    include: {
      holdings: { orderBy: { asOf: "desc" } },
    },
  });
  const issues: DataQualityIssue[] = [];
  let investedMinor = 0n;

  // Keep only the latest snapshot per instrument per account.
  for (const acct of accounts) {
    const seenInstrument = new Set<string>();
    for (const h of acct.holdings) {
      if (seenInstrument.has(h.instrumentId)) continue;
      seenInstrument.add(h.instrumentId);

      const price = await db.priceObservation.findFirst({
        where: { instrumentId: h.instrumentId },
        orderBy: { asOf: "desc" },
      });
      const instrument = await db.instrument.findUnique({ where: { id: h.instrumentId } });
      if (!price || !instrument) {
        issues.push({ severity: "warning", message: `${instrument?.name ?? "Unknown holding"}: no price observation — excluded from valuation.` });
        continue;
      }
      let priceMinorInReportingCcy = price.priceMinor;
      if (price.currency !== REPORTING_CCY) {
        const fx = await db.fxObservation.findFirst({
          where: { baseCcy: price.currency, quoteCcy: REPORTING_CCY },
          orderBy: { asOf: "desc" },
        });
        if (!fx) {
          issues.push({ severity: "warning", message: `${instrument.name}: priced in ${price.currency}, no FX rate on file — excluded from valuation.` });
          continue;
        }
        priceMinorInReportingCcy = BigInt(
          new Decimal(price.priceMinor.toString()).mul(fx.rate).toDecimalPlaces(0).toFixed(0)
        );
      }
      const valueMinor = BigInt(new Decimal(h.units.toString()).mul(priceMinorInReportingCcy.toString()).toDecimalPlaces(0).toFixed(0));
      investedMinor += valueMinor;
    }
  }
  return { investedMinor, issues };
}

export async function getOverviewData(db: PrismaClient, ownerId: string): Promise<OverviewData> {
  const [{ cashMinor, liabilityMinor, issues: balanceIssues }, { investedMinor, issues: investIssues }, transactions, connections] =
    await Promise.all([
      latestBalancesMinor(db, ownerId),
      latestInvestedValueMinor(db, ownerId),
      ownerTransactions(db, ownerId),
      db.connection.findMany({ include: { institution: true } }),
    ]);

  const includedAssets = cashMinor + investedMinor;
  const netWorthMinor = computeTrackedNetWorth(includedAssets, liabilityMinor);

  const now = new Date();
  const month = now.toISOString().slice(0, 7);
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const elapsedDays = now.getUTCDate();

  const spending = computeMonthlySpending({ month, currency: REPORTING_CCY, transactions, daysInMonth, elapsedDays });

  const relevantConnections = connections;
  const connectionsSummary = {
    total: relevantConnections.length,
    current: relevantConnections.filter((c) => c.status === "CURRENT").length,
    unconfigured: relevantConnections.filter((c) => c.status === "UNCONFIGURED").length,
    failed: relevantConnections.filter((c) => c.status === "FAILED").length,
  };
  const lastSuccessfulSync = relevantConnections
    .map((c) => c.lastSuccessAt)
    .filter((d): d is Date => d != null)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  const dataQuality: DataQualityIssue[] = [...balanceIssues, ...investIssues];
  if (connectionsSummary.unconfigured > 0) {
    dataQuality.push({
      severity: "info",
      message: `${connectionsSummary.unconfigured} institution(s) not connected — see Connections.`,
    });
  }
  if (spending.unresolvedCount > 0) {
    dataQuality.push({ severity: "warning", message: `${spending.unresolvedCount} transaction(s) this month need review.` });
  }

  return {
    cashMinor,
    investedMinor,
    netWorthMinor,
    netWorthIsPartial: liabilityMinor === 0n, // no liability accounts tracked yet is a partial signal, not a confirmed zero
    monthlyIncomeMinor: spending.operatingIncomeMinor,
    monthlySpendingMinor: spending.netSpendingMinor,
    monthlySavingsMinor: spending.operatingSavingsMinor,
    savingsRate: spending.savingsRate,
    currency: REPORTING_CCY,
    lastSuccessfulSync,
    connectionsSummary,
    dataQuality,
    unresolvedCount: spending.unresolvedCount,
  };
}

export interface SpendingPageData {
  month: string;
  currency: string;
  netSpendingMinor: bigint;
  grossExpenseMinor: bigint;
  eligibleRefundMinor: bigint;
  operatingIncomeMinor: bigint;
  savingsRate: Decimal | null;
  isPartialMonth: boolean;
  elapsedDays: number;
  totalDaysInMonth: number;
  projectedFullMonthMinor: bigint;
  byCategory: Array<{ categoryId: string | null; name: string; totalMinor: bigint }>;
  transactions: Array<{
    id: string;
    date: string;
    description: string;
    merchant: string | null;
    amountMinor: bigint;
    currency: string;
    categoryName: string | null;
    economicClass: string;
    status: string;
    accountName: string;
  }>;
}

export async function getSpendingData(db: PrismaClient, ownerId: string, month: string): Promise<SpendingPageData> {
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const now = new Date();
  const isCurrentMonth = now.toISOString().slice(0, 7) === month;
  const elapsedDays = isCurrentMonth ? now.getUTCDate() : daysInMonth;

  const transactions = await ownerTransactions(db, ownerId);
  const result = computeMonthlySpending({ month, currency: REPORTING_CCY, transactions, daysInMonth, elapsedDays });
  const projectedFullMonthMinor = equalElapsedDayProjection(result.netSpendingMinor, elapsedDays, daysInMonth);

  const rows = await db.transaction.findMany({
    where: { ownerId, currency: REPORTING_CCY },
    include: { category: true, account: true },
    orderBy: { transactionDate: "desc" },
  });
  const monthRows = rows.filter((t) => t.status === "BOOKED" && t.bookedDate && t.bookedDate.toISOString().slice(0, 7) === month);

  const byCategoryMap = new Map<string, { categoryId: string | null; name: string; totalMinor: bigint }>();
  for (const t of monthRows) {
    if (t.economicClass !== "EXPENSE") continue;
    const key = t.categoryId ?? "uncategorized";
    const name = t.category?.name ?? "Uncategorized";
    const entry = byCategoryMap.get(key) ?? { categoryId: t.categoryId, name, totalMinor: 0n };
    entry.totalMinor += t.amountMinor < 0n ? -t.amountMinor : t.amountMinor;
    byCategoryMap.set(key, entry);
  }

  return {
    month,
    currency: REPORTING_CCY,
    netSpendingMinor: result.netSpendingMinor,
    grossExpenseMinor: result.grossExpenseMinor,
    eligibleRefundMinor: result.eligibleRefundMinor,
    operatingIncomeMinor: result.operatingIncomeMinor,
    savingsRate: result.savingsRate,
    isPartialMonth: result.isPartialMonth,
    elapsedDays: result.elapsedDays,
    totalDaysInMonth: result.totalDaysInMonth,
    projectedFullMonthMinor,
    byCategory: Array.from(byCategoryMap.values()).sort((a, b) => Number(b.totalMinor - a.totalMinor)),
    transactions: monthRows.map((t) => ({
      id: t.id,
      date: (t.bookedDate ?? t.transactionDate).toISOString().slice(0, 10),
      description: t.description,
      merchant: t.merchant,
      amountMinor: t.amountMinor,
      currency: t.currency,
      categoryName: t.category?.name ?? null,
      economicClass: t.economicClass,
      status: t.status,
      accountName: t.account.name,
    })),
  };
}

export interface InvestmentsPageData {
  currency: string;
  positions: Array<{
    instrumentId: string;
    name: string;
    isin: string | null;
    assetType: string;
    accountName: string;
    units: string;
    currentValueMinor: bigint;
    costBasisMinor: bigint | null;
    unrealizedGainMinor: bigint | null;
    unrealizedGainPct: Decimal | null;
    allocationOfSecurities: Decimal | null;
    priceAsOf: string | null;
    priceMissing: boolean;
  }>;
  totalSecuritiesValueMinor: bigint;
  brokerCashMinor: bigint;
  investmentShare: Decimal | null;
  costBasisMissingCount: number;
}

export async function getInvestmentsData(db: PrismaClient, ownerId: string): Promise<InvestmentsPageData> {
  const accounts = await db.account.findMany({
    where: { ownerId, kind: { in: ["INVESTMENT", "BROKERAGE_CASH"] } },
    include: { holdings: { orderBy: { asOf: "desc" } }, balances: { orderBy: { asOf: "desc" }, take: 1 } },
  });

  let brokerCashMinor = 0n;
  const positionInputs: Array<{
    instrumentId: string;
    name: string;
    isin: string | null;
    assetType: string;
    accountName: string;
    units: string;
    currentValueMinor: bigint;
    costBasisMinor: bigint | null;
    priceAsOf: string | null;
    priceMissing: boolean;
  }> = [];
  let costBasisMissingCount = 0;

  for (const acct of accounts) {
    if (acct.kind === "BROKERAGE_CASH") {
      brokerCashMinor += acct.balances[0]?.bookedMinor ?? 0n;
      continue;
    }
    const seen = new Set<string>();
    for (const h of acct.holdings) {
      if (seen.has(h.instrumentId)) continue;
      seen.add(h.instrumentId);
      const instrument = await db.instrument.findUnique({ where: { id: h.instrumentId } });
      const price = await db.priceObservation.findFirst({ where: { instrumentId: h.instrumentId }, orderBy: { asOf: "desc" } });
      if (!instrument) continue;

      let currentValueMinor = 0n;
      let priceMissing = true;
      if (price) {
        let priceMinorInCcy = price.priceMinor;
        if (price.currency !== REPORTING_CCY) {
          const fx = await db.fxObservation.findFirst({ where: { baseCcy: price.currency, quoteCcy: REPORTING_CCY }, orderBy: { asOf: "desc" } });
          if (fx) {
            priceMinorInCcy = BigInt(new Decimal(price.priceMinor.toString()).mul(fx.rate).toDecimalPlaces(0).toFixed(0));
            priceMissing = false;
          }
        } else {
          priceMissing = false;
        }
        if (!priceMissing) {
          currentValueMinor = BigInt(new Decimal(h.units.toString()).mul(priceMinorInCcy.toString()).toDecimalPlaces(0).toFixed(0));
        }
      }
      if (h.costBasisMinor == null) costBasisMissingCount += 1;

      positionInputs.push({
        instrumentId: h.instrumentId,
        name: instrument.name,
        isin: instrument.isin,
        assetType: instrument.assetType,
        accountName: acct.name,
        units: h.units.toString(),
        currentValueMinor,
        costBasisMinor: h.costBasisMinor,
        priceAsOf: price ? price.asOf.toISOString().slice(0, 10) : null,
        priceMissing,
      });
    }
  }

  const allocations = computeSecurityAllocations(
    positionInputs.filter((p) => !p.priceMissing).map((p) => ({ securityId: p.instrumentId, valueReportingMinor: p.currentValueMinor }))
  );
  const allocationByInstrument = new Map(allocations.map((a) => [a.securityId, a.allocationOfSecurities]));

  const totalSecuritiesValueMinor = positionInputs.reduce((acc, p) => acc + p.currentValueMinor, 0n);
  const investmentShare = computeInvestmentShare(totalSecuritiesValueMinor, totalSecuritiesValueMinor + brokerCashMinor);

  const positions = positionInputs.map((p) => {
    const gain = computeUnrealizedGain({ currentValueMinor: p.currentValueMinor, remainingCostBasisMinor: p.costBasisMinor });
    return {
      ...p,
      unrealizedGainMinor: gain.unrealizedGainMinor,
      unrealizedGainPct: gain.unrealizedGainPct,
      allocationOfSecurities: allocationByInstrument.get(p.instrumentId) ?? null,
    };
  });

  return {
    currency: REPORTING_CCY,
    positions,
    totalSecuritiesValueMinor,
    brokerCashMinor,
    investmentShare,
    costBasisMissingCount,
  };
}
