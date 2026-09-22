/**
 * Portfolio performance metrics (brief §5): TWR and MWR/XIRR.
 *
 * Both are optional analytics that must be hidden rather than approximated
 * silently when inputs are insufficient — see `TwrResult.available` /
 * `XirrResult.available`.
 */
import { Decimal } from "decimal.js";

export interface ValuationPoint {
  date: string; // ISO date
  valueMinor: bigint; // portfolio value at this date, before/excluding the flow on this date's boundary
}

export interface ExternalFlow {
  date: string;
  amountMinor: bigint; // contribution = negative (cash leaving the investor into the portfolio), withdrawal = positive
}

export interface TwrResult {
  available: boolean;
  reason?: string;
  totalReturn?: Decimal; // e.g. 0.0532 = +5.32%
  annualized?: Decimal | null; // null if period too short to annualize meaningfully
  subperiods?: number;
}

/**
 * Time-weighted return via chained subperiod returns. Requires a valuation point immediately
 * before and after each external flow (so the flow's distorting effect on subperiod return is
 * eliminated). If valuations don't bracket every flow, TWR is unavailable rather than
 * approximated.
 */
export function computeTwr(
  valuations: ValuationPoint[],
  flows: ExternalFlow[],
  options: { minDaysToAnnualize?: number } = {}
): TwrResult {
  if (valuations.length < 2) {
    return { available: false, reason: "Fewer than two valuation points." };
  }
  const sorted = [...valuations].sort((a, b) => a.date.localeCompare(b.date));
  const flowsByDate = new Map<string, bigint>();
  for (const f of flows) {
    flowsByDate.set(f.date, (flowsByDate.get(f.date) ?? 0n) + f.amountMinor);
  }

  // Every flow date must have a bracketing valuation on/adjacent to it; we require a valuation
  // point to exist ON each flow date (the caller is expected to supply one — e.g. end-of-day
  // valuation on any day with a flow). Otherwise we refuse rather than approximate.
  for (const f of flows) {
    if (!sorted.some((v) => v.date === f.date)) {
      return {
        available: false,
        reason: `No valuation point on flow date ${f.date}; cannot bracket the flow.`,
      };
    }
  }

  let chainedGrowth = new Decimal(1);
  let subperiods = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const flowAtCurr = flowsByDate.get(curr.date) ?? 0n;
    // Value immediately before the flow on curr.date = curr.valueMinor - flowAtCurr's net effect
    // is already reflected by convention: valuations are point-in-time AFTER any same-day flow,
    // so we back it out for the subperiod return calculation.
    const endValueExFlow = curr.valueMinor - flowAtCurr;
    const startValue = prev.valueMinor;
    if (startValue <= 0n) {
      return { available: false, reason: `Non-positive starting value on ${prev.date}.` };
    }
    const subReturn = new Decimal(endValueExFlow.toString())
      .div(new Decimal(startValue.toString()))
      .sub(1);
    chainedGrowth = chainedGrowth.mul(subReturn.add(1));
    subperiods += 1;
  }

  const totalReturn = chainedGrowth.sub(1);
  const days =
    (new Date(sorted[sorted.length - 1].date).getTime() - new Date(sorted[0].date).getTime()) /
    (1000 * 60 * 60 * 24);
  const minDays = options.minDaysToAnnualize ?? 30;
  let annualized: Decimal | null = null;
  if (days >= minDays) {
    const years = days / 365;
    annualized = chainedGrowth.pow(new Decimal(1).div(years)).sub(1);
  }

  return { available: true, totalReturn, annualized, subperiods };
}

export interface XirrResult {
  available: boolean;
  reason?: string;
  rate?: Decimal; // annualized
}

/**
 * Money-weighted return (XIRR): solves for r such that
 *   sum(flow_i / (1+r)^(days_i/365)) + terminalValue / (1+r)^(daysTerminal/365) = 0
 * Convention: contributions (cash into the portfolio) are negative flows, withdrawals and the
 * terminal value are positive. Uses bisection for robustness (no derivative required); reports
 * unavailable rather than a possibly-wrong root when no sign change is found or inputs are
 * degenerate.
 */
export function computeXirr(
  flows: ExternalFlow[],
  terminalValueMinor: bigint,
  terminalDate: string,
  options: { maxIterations?: number; tolerance?: number } = {}
): XirrResult {
  if (flows.length === 0) {
    return { available: false, reason: "No external flows supplied." };
  }
  const allDates = [...flows.map((f) => f.date), terminalDate].sort();
  const t0 = new Date(allDates[0]).getTime();

  const cashflows = [
    ...flows.map((f) => ({
      days: (new Date(f.date).getTime() - t0) / (1000 * 60 * 60 * 24),
      amount: new Decimal(f.amountMinor.toString()),
    })),
    {
      days: (new Date(terminalDate).getTime() - t0) / (1000 * 60 * 60 * 24),
      amount: new Decimal(terminalValueMinor.toString()),
    },
  ];

  const hasNegative = cashflows.some((c) => c.amount.lt(0));
  const hasPositive = cashflows.some((c) => c.amount.gt(0));
  if (!hasNegative || !hasPositive) {
    return {
      available: false,
      reason: "Flows must include both contributions (negative) and withdrawals/terminal value (positive).",
    };
  }

  const npv = (rate: Decimal): Decimal => {
    return cashflows.reduce((acc, c) => {
      const years = new Decimal(c.days).div(365);
      const discount = new Decimal(1).add(rate).pow(years.neg());
      return acc.add(c.amount.mul(discount));
    }, new Decimal(0));
  };

  // Bisection over a wide, finite bracket. If NPV doesn't change sign across it, no solution.
  let lo = new Decimal(-0.9999);
  let hi = new Decimal(100); // +10,000% annualized upper bound
  const npvLo = npv(lo);
  const npvHi = npv(hi);
  if (npvLo.mul(npvHi).gt(0)) {
    return { available: false, reason: "No sign change found in search bracket; result would be ambiguous." };
  }

  const maxIterations = options.maxIterations ?? 200;
  const tolerance = new Decimal(options.tolerance ?? 1e-9);
  let mid = lo;
  for (let i = 0; i < maxIterations; i++) {
    mid = lo.add(hi).div(2);
    const npvMid = npv(mid);
    if (npvMid.abs().lt(tolerance)) break;
    if (npv(lo).mul(npvMid).lt(0)) {
      hi = mid;
    } else {
      lo = mid;
    }
  }

  return { available: true, rate: mid };
}
