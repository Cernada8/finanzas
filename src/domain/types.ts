/** Shared plain-data types for the domain layer. Kept independent of Prisma's generated types
 *  so the domain layer stays pure, framework-free, and unit-testable in isolation. */
import type Decimal from "decimal.js";

export type EconomicClass =
  | "INCOME"
  | "EXPENSE"
  | "REFUND"
  | "INTERNAL_TRANSFER"
  | "INVESTMENT_CASH_FLOW"
  | "UNRESOLVED";

export interface DomainTransaction {
  id: string;
  accountId: string;
  ownerId: string;
  /** ISO date (yyyy-mm-dd), no time/timezone component — bank date-only values preserved as-is. */
  bookedDate: string | null;
  transactionDate: string;
  status: "PENDING" | "BOOKED";
  amountMinor: bigint; // signed; negative = outflow from the account
  currency: string;
  description: string;
  economicClass: EconomicClass;
  refundOfId?: string | null;
}

export interface DomainAccount {
  id: string;
  ownerId: string;
  kind: "CASH" | "CARD" | "BROKERAGE_CASH" | "INVESTMENT" | "LOAN" | "OTHER";
  currency: string;
  includeInNetWorth: boolean;
  isLiability: boolean;
}

export interface TransferCandidate {
  fromTxId: string;
  toTxId: string;
  confidence: number; // 0..1
  matchedBy: string;
}

export interface MonthlySpendingResult {
  month: string; // "YYYY-MM"
  currency: string;
  grossExpenseMinor: bigint;
  eligibleRefundMinor: bigint;
  netSpendingMinor: bigint;
  operatingIncomeMinor: bigint;
  investmentIncomeMinor: bigint;
  netInvestmentContributionsMinor: bigint;
  operatingSavingsMinor: bigint;
  savingsRate: Decimal | null; // null when denominator nonpositive
  unresolvedCount: number;
  isPartialMonth: boolean;
  elapsedDays: number;
  totalDaysInMonth: number;
}
