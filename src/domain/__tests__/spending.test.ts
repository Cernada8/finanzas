import { describe, expect, it } from "vitest";
import { computeMonthlySpending, equalElapsedDayProjection } from "../spending";
import type { DomainTransaction } from "../types";

const owner = "owner-1";

function tx(partial: Partial<DomainTransaction> & Pick<DomainTransaction, "id" | "accountId" | "amountMinor" | "economicClass">): DomainTransaction {
  return {
    ownerId: owner,
    bookedDate: "2026-03-15",
    transactionDate: "2026-03-15",
    status: "BOOKED",
    currency: "EUR",
    description: "tx",
    ...partial,
  };
}

describe("computeMonthlySpending — required scenarios (brief §8)", () => {
  it("a €1,000 transfer CaixaBank -> Trade Republic yields zero spending and zero income", () => {
    const txs = [
      tx({ id: "t1", accountId: "caixabank", amountMinor: -100000n, economicClass: "INTERNAL_TRANSFER" }),
      tx({ id: "t2", accountId: "traderepublic", amountMinor: 100000n, economicClass: "INTERNAL_TRANSFER" }),
    ];
    const result = computeMonthlySpending({
      month: "2026-03",
      currency: "EUR",
      transactions: txs,
      daysInMonth: 31,
      elapsedDays: 31,
    });
    expect(result.netSpendingMinor).toBe(0n);
    expect(result.operatingIncomeMinor).toBe(0n);
  });

  it("a €300 supermarket purchase and €50 refund in the same month nets to €250 spending", () => {
    const txs = [
      tx({ id: "t1", accountId: "a", amountMinor: -30000n, economicClass: "EXPENSE" }),
      tx({ id: "t2", accountId: "a", amountMinor: 5000n, economicClass: "REFUND" }),
    ];
    const result = computeMonthlySpending({
      month: "2026-03",
      currency: "EUR",
      transactions: txs,
      daysInMonth: 31,
      elapsedDays: 31,
    });
    expect(result.netSpendingMinor).toBe(25000n);
  });

  it("€100 card purchase plus €100 repayment counts as €100 spending when both accounts are tracked", () => {
    // The card purchase is the expense; the repayment (card account <- checking account) is an
    // internal transfer between two tracked accounts and must not add a second €100 of spending.
    const txs = [
      tx({ id: "t1", accountId: "card", amountMinor: -10000n, economicClass: "EXPENSE" }),
      tx({ id: "t2", accountId: "card", amountMinor: 10000n, economicClass: "INTERNAL_TRANSFER" }),
      tx({ id: "t3", accountId: "checking", amountMinor: -10000n, economicClass: "INTERNAL_TRANSFER" }),
    ];
    const result = computeMonthlySpending({
      month: "2026-03",
      currency: "EUR",
      transactions: txs,
      daysInMonth: 31,
      elapsedDays: 31,
    });
    expect(result.netSpendingMinor).toBe(10000n);
  });

  it("a €1,000 securities purchase is a cash->investment movement, not consumption", () => {
    const txs = [tx({ id: "t1", accountId: "brokerage-cash", amountMinor: -100000n, economicClass: "INVESTMENT_CASH_FLOW" })];
    const result = computeMonthlySpending({
      month: "2026-03",
      currency: "EUR",
      transactions: txs,
      daysInMonth: 31,
      elapsedDays: 31,
    });
    expect(result.netSpendingMinor).toBe(0n);
    expect(result.netInvestmentContributionsMinor).toBe(100000n);
  });

  it("excludes pending transactions from booked monthly totals", () => {
    const txs = [
      tx({ id: "t1", accountId: "a", amountMinor: -10000n, economicClass: "EXPENSE", status: "PENDING" }),
      tx({ id: "t2", accountId: "a", amountMinor: -5000n, economicClass: "EXPENSE", status: "BOOKED" }),
    ];
    const result = computeMonthlySpending({
      month: "2026-03",
      currency: "EUR",
      transactions: txs,
      daysInMonth: 31,
      elapsedDays: 31,
    });
    expect(result.netSpendingMinor).toBe(5000n);
  });

  it("respects month boundaries (transactions booked in an adjacent month are excluded)", () => {
    const txs = [
      tx({ id: "t1", accountId: "a", amountMinor: -10000n, economicClass: "EXPENSE", bookedDate: "2026-02-28" }),
      tx({ id: "t2", accountId: "a", amountMinor: -20000n, economicClass: "EXPENSE", bookedDate: "2026-03-01" }),
      tx({ id: "t3", accountId: "a", amountMinor: -30000n, economicClass: "EXPENSE", bookedDate: "2026-04-01" }),
    ];
    const result = computeMonthlySpending({
      month: "2026-03",
      currency: "EUR",
      transactions: txs,
      daysInMonth: 31,
      elapsedDays: 31,
    });
    expect(result.netSpendingMinor).toBe(20000n);
  });

  it("savings rate is null (unavailable) when operating income is nonpositive", () => {
    const txs = [tx({ id: "t1", accountId: "a", amountMinor: -10000n, economicClass: "EXPENSE" })];
    const result = computeMonthlySpending({
      month: "2026-03",
      currency: "EUR",
      transactions: txs,
      daysInMonth: 31,
      elapsedDays: 31,
    });
    expect(result.operatingIncomeMinor).toBe(0n);
    expect(result.savingsRate).toBeNull();
  });

  it("computes a positive savings rate correctly", () => {
    const txs = [
      tx({ id: "t1", accountId: "a", amountMinor: 200000n, economicClass: "INCOME" }),
      tx({ id: "t2", accountId: "a", amountMinor: -150000n, economicClass: "EXPENSE" }),
    ];
    const result = computeMonthlySpending({
      month: "2026-03",
      currency: "EUR",
      transactions: txs,
      daysInMonth: 31,
      elapsedDays: 31,
    });
    expect(result.operatingSavingsMinor).toBe(50000n);
    expect(result.savingsRate!.toString()).toBe("0.25");
  });

  it("flags a partial month and supports equal-elapsed-day projection for fair comparison", () => {
    const txs = [tx({ id: "t1", accountId: "a", amountMinor: -31000n, economicClass: "EXPENSE", bookedDate: "2026-03-10" })];
    const result = computeMonthlySpending({
      month: "2026-03",
      currency: "EUR",
      transactions: txs,
      daysInMonth: 31,
      elapsedDays: 10,
    });
    expect(result.isPartialMonth).toBe(true);
    const projected = equalElapsedDayProjection(result.netSpendingMinor, 10, 31);
    expect(projected).toBe(96100n); // 31000 * 31/10, rounded
  });
});
