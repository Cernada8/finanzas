/**
 * Monthly spending & cash-flow calculations (brief §5).
 *
 * Key rules encoded here:
 *  - Booked date drives default monthly reporting; pending items are excluded.
 *  - Internal transfers and investment cash flows are excluded from spending/income.
 *  - Refunds reduce spending in their own booked month (not the original purchase's month).
 *  - Net spending = gross booked expense magnitude − eligible refunds.
 *  - Operating savings = operating income − net spending (investment income handled separately).
 *  - Savings rate = operating savings / operating income; undefined (null) when income <= 0.
 */
import { Decimal } from "decimal.js";
import type { DomainTransaction, MonthlySpendingResult } from "./types";

export interface ComputeMonthlySpendingInput {
  month: string; // "YYYY-MM"
  currency: string;
  transactions: DomainTransaction[]; // already filtered to the owner + currency; includes classification
  daysInMonth: number;
  /** For the current/incomplete month: how many days have elapsed. Equal to daysInMonth for closed months. */
  elapsedDays: number;
}

function bookedInMonth(tx: DomainTransaction, month: string): boolean {
  if (tx.status !== "BOOKED" || !tx.bookedDate) return false;
  return tx.bookedDate.slice(0, 7) === month;
}

export function computeMonthlySpending(input: ComputeMonthlySpendingInput): MonthlySpendingResult {
  const { month, currency, transactions, daysInMonth, elapsedDays } = input;

  let grossExpenseMinor = 0n;
  let eligibleRefundMinor = 0n;
  let operatingIncomeMinor = 0n;
  let investmentIncomeMinor = 0n;
  let netInvestmentContributionsMinor = 0n;
  let unresolvedCount = 0;

  for (const tx of transactions) {
    if (tx.currency !== currency) continue;
    if (!bookedInMonth(tx, month)) continue;

    switch (tx.economicClass) {
      case "EXPENSE":
        // amountMinor is negative for an outflow; magnitude contributes to gross expense.
        grossExpenseMinor += tx.amountMinor < 0n ? -tx.amountMinor : tx.amountMinor;
        break;
      case "REFUND":
        // Refunds reduce spending in their own booked month by default.
        eligibleRefundMinor += tx.amountMinor > 0n ? tx.amountMinor : -tx.amountMinor;
        break;
      case "INCOME":
        operatingIncomeMinor += tx.amountMinor > 0n ? tx.amountMinor : 0n;
        break;
      case "INTERNAL_TRANSFER":
        // Excluded entirely — not income, not spending.
        break;
      case "INVESTMENT_CASH_FLOW":
        // Dividends/interest received count as investment income; purchases/sales are
        // contributions, not consumption. We separate by sign as a default heuristic;
        // callers with richer InvestmentActivity data should prefer that source instead.
        if (tx.amountMinor > 0n) {
          investmentIncomeMinor += tx.amountMinor;
        } else {
          netInvestmentContributionsMinor += -tx.amountMinor;
        }
        break;
      case "UNRESOLVED":
        unresolvedCount += 1;
        break;
    }
  }

  const netSpendingMinor = grossExpenseMinor - eligibleRefundMinor;
  const operatingSavingsMinor = operatingIncomeMinor - netSpendingMinor;

  const savingsRate =
    operatingIncomeMinor > 0n
      ? new Decimal(operatingSavingsMinor.toString()).div(new Decimal(operatingIncomeMinor.toString()))
      : null;

  return {
    month,
    currency,
    grossExpenseMinor,
    eligibleRefundMinor,
    netSpendingMinor,
    operatingIncomeMinor,
    investmentIncomeMinor,
    netInvestmentContributionsMinor,
    operatingSavingsMinor,
    savingsRate,
    unresolvedCount,
    isPartialMonth: elapsedDays < daysInMonth,
    elapsedDays,
    totalDaysInMonth: daysInMonth,
  };
}

/**
 * Normalizes a (possibly partial) month's totals to an equal-elapsed-day basis so it can be
 * fairly compared against a full month. Returns the pro-rated minor-unit figure; callers should
 * label the comparison as normalized in the UI.
 */
export function equalElapsedDayProjection(minor: bigint, elapsedDays: number, targetDays: number): bigint {
  if (elapsedDays <= 0) return 0n;
  const ratio = new Decimal(targetDays).div(elapsedDays);
  return BigInt(new Decimal(minor.toString()).mul(ratio).toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toFixed(0));
}
