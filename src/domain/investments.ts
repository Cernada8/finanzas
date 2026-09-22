/**
 * Investment valuation, allocation, and gain calculations (brief §5).
 */
import { Decimal } from "decimal.js";
import { safeRatio } from "./money";

export interface HoldingValuationInput {
  units: Decimal.Value;
  priceMinor: bigint; // in instrument's price currency
  priceCurrency: string;
  reportingCurrency: string;
  /** 1 unit of priceCurrency = fxRate units of reportingCurrency, observed at priceAsOf. */
  fxRate: Decimal.Value;
  priceExponent?: number; // minor-unit exponent of priceCurrency, default 2
}

export interface HoldingValuation {
  currentValueReportingMinor: bigint; // rounded to reporting currency minor units (cents)
}

/** Current security value = units × price, converted to reporting currency with a timestamped FX rate. */
export function valueHolding(input: HoldingValuationInput): HoldingValuation {
  const exp = input.priceExponent ?? 2;
  const priceMajor = new Decimal(input.priceMinor.toString()).div(new Decimal(10).pow(exp));
  const valueInPriceCcy = new Decimal(input.units).mul(priceMajor);
  const valueInReportingCcy = valueInPriceCcy.mul(new Decimal(input.fxRate));
  const minor = valueInReportingCcy
    .mul(100) // reporting currency assumed 2dp (EUR); see money.ts for general case
    .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN);
  return { currentValueReportingMinor: BigInt(minor.toFixed(0)) };
}

export interface AllocationInput {
  securityId: string;
  valueReportingMinor: bigint;
}

export interface AllocationResult {
  securityId: string;
  valueReportingMinor: bigint;
  /** security value / total included securities value */
  allocationOfSecurities: Decimal | null;
}

/**
 * Security allocation = security value / total included securities value.
 * Excludes broker cash and any holdings with missing/unreliable valuation (caller filters those out
 * before calling and reports them separately as "excluded" rather than folding them into weights).
 */
export function computeSecurityAllocations(holdings: AllocationInput[]): AllocationResult[] {
  const total = holdings.reduce((acc, h) => acc + h.valueReportingMinor, 0n);
  const totalDecimal = new Decimal(total.toString());
  return holdings.map((h) => ({
    securityId: h.securityId,
    valueReportingMinor: h.valueReportingMinor,
    allocationOfSecurities: safeRatio(new Decimal(h.valueReportingMinor.toString()), totalDecimal) ?? null,
  }));
}

/**
 * Investment share = invested securities value / included financial assets
 * (securities + broker cash + other tracked cash included in the denominator by the caller).
 */
export function computeInvestmentShare(
  investedSecuritiesMinor: bigint,
  includedFinancialAssetsMinor: bigint
): Decimal | null {
  return (
    safeRatio(
      new Decimal(investedSecuritiesMinor.toString()),
      new Decimal(includedFinancialAssetsMinor.toString())
    ) ?? null
  );
}

export interface GainInput {
  currentValueMinor: bigint;
  remainingCostBasisMinor: bigint | null; // null = unknown/unavailable
}

export interface GainResult {
  unrealizedGainMinor: bigint | null;
  /** percentage uses remaining cost basis; unavailable when basis missing or <= 0 */
  unrealizedGainPct: Decimal | null;
}

/** Unrealized gain = current value − remaining cost basis. */
export function computeUnrealizedGain(input: GainInput): GainResult {
  if (input.remainingCostBasisMinor === null) {
    return { unrealizedGainMinor: null, unrealizedGainPct: null };
  }
  const gain = input.currentValueMinor - input.remainingCostBasisMinor;
  const pct =
    input.remainingCostBasisMinor > 0n
      ? new Decimal(gain.toString()).div(new Decimal(input.remainingCostBasisMinor.toString()))
      : null;
  return { unrealizedGainMinor: gain, unrealizedGainPct: pct };
}

export interface RealizedLot {
  proceedsMinor: bigint;
  costBasisMinor: bigint | null;
}

/**
 * Realized gain from a disposal, using an analytical FIFO lot policy (documented, not tax accounting).
 * Returns null when the cost basis for the consumed lots is unknown, rather than guessing.
 */
export function computeRealizedGain(lot: RealizedLot): bigint | null {
  if (lot.costBasisMinor === null) return null;
  return lot.proceedsMinor - lot.costBasisMinor;
}

/**
 * FIFO lot consumption: given a chronological list of BUY lots (units, unit cost basis in minor
 * units) and a sell of `sellUnits`, returns the cost basis consumed and the remaining lots.
 * This is the documented analytical lot policy used throughout the app; it is NOT presented as
 * Spanish tax accounting (which uses its own averaging/FIFO rules that may differ).
 */
export interface Lot {
  units: Decimal;
  costBasisMinor: bigint; // total cost basis for this lot, not per-unit
}

export function consumeFifo(
  lots: Lot[],
  sellUnits: Decimal
): { costBasisConsumedMinor: bigint; remainingLots: Lot[] } {
  let remaining = sellUnits;
  let costConsumed = 0n;
  const remainingLots: Lot[] = [];

  for (const lot of lots) {
    if (remaining.lte(0)) {
      remainingLots.push(lot);
      continue;
    }
    if (lot.units.lte(remaining)) {
      costConsumed += lot.costBasisMinor;
      remaining = remaining.sub(lot.units);
    } else {
      const fraction = remaining.div(lot.units);
      const consumedCost = new Decimal(lot.costBasisMinor.toString())
        .mul(fraction)
        .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN);
      costConsumed += BigInt(consumedCost.toFixed(0));
      remainingLots.push({
        units: lot.units.sub(remaining),
        costBasisMinor: lot.costBasisMinor - BigInt(consumedCost.toFixed(0)),
      });
      remaining = new Decimal(0);
    }
  }

  return { costBasisConsumedMinor: costConsumed, remainingLots };
}

/**
 * Tracked net worth = included assets − included liabilities.
 * Callers must pass each account's value exactly once — this function does not know about
 * accounts, only about the caller-deduplicated included asset/liability totals — to avoid the
 * double-counting failure mode called out in the brief (broker cash counted twice, or a holdings
 * subtotal counted alongside its own underlying holdings).
 */
export function computeTrackedNetWorth(includedAssetsMinor: bigint, includedLiabilitiesMinor: bigint): bigint {
  return includedAssetsMinor - includedLiabilitiesMinor;
}
