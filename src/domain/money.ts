/**
 * Money handling for the financial domain layer.
 *
 * Non-negotiable rule (brief §5): never use binary floating point for money,
 * units, prices, or FX. Everywhere outside this module, amounts should be
 * represented either as:
 *   - integer minor units (BigInt cents) at the persistence boundary, or
 *   - Decimal (decimal.js) inside the domain layer.
 *
 * This module is the only place that converts between the two.
 */
import Decimal from "decimal.js";

// Money arithmetic must never silently lose precision.
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_EVEN });

export type CurrencyCode = string; // ISO 4217, e.g. "EUR"

export interface Money {
  readonly amount: Decimal; // major units, e.g. euros (not cents)
  readonly currency: CurrencyCode;
}

/** Most currencies use 2 minor-unit decimal places; a few (e.g. none we support here) differ. */
const MINOR_UNIT_EXPONENT: Record<string, number> = {
  EUR: 2,
  USD: 2,
  GBP: 2,
  JPY: 0,
};

export function minorUnitExponent(currency: CurrencyCode): number {
  return MINOR_UNIT_EXPONENT[currency.toUpperCase()] ?? 2;
}

export function money(amount: Decimal.Value, currency: CurrencyCode): Money {
  return { amount: new Decimal(amount), currency: currency.toUpperCase() };
}

export function zero(currency: CurrencyCode): Money {
  return money(0, currency);
}

/** Convert an integer minor-unit amount (as stored, e.g. BigInt cents) to Money. */
export function fromMinor(minor: bigint | number, currency: CurrencyCode): Money {
  const exp = minorUnitExponent(currency);
  const d = new Decimal(minor.toString()).div(new Decimal(10).pow(exp));
  return money(d, currency);
}

/** Convert Money back to integer minor units for persistence. Throws if it doesn't round evenly. */
export function toMinor(m: Money): bigint {
  const exp = minorUnitExponent(m.currency);
  const scaled = m.amount.mul(new Decimal(10).pow(exp));
  const rounded = scaled.toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN);
  return BigInt(rounded.toFixed(0));
}

function assertSameCurrency(a: Money, b: Money) {
  if (a.currency !== b.currency) {
    throw new CurrencyMismatchError(a.currency, b.currency);
  }
}

export class CurrencyMismatchError extends Error {
  constructor(public a: string, public b: string) {
    super(`Currency mismatch: ${a} vs ${b}. Convert via FX before combining.`);
    this.name = "CurrencyMismatchError";
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amount.add(b.amount), a.currency);
}

export function sub(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amount.sub(b.amount), a.currency);
}

export function sum(items: Money[], currency: CurrencyCode): Money {
  return items.reduce((acc, m) => add(acc, m), zero(currency));
}

export function negate(a: Money): Money {
  return money(a.amount.neg(), a.currency);
}

export function isZero(a: Money): boolean {
  return a.amount.isZero();
}

export function isPositive(a: Money): boolean {
  return a.amount.gt(0);
}

export function compare(a: Money, b: Money): number {
  assertSameCurrency(a, b);
  return a.amount.cmp(b.amount);
}

/**
 * Convert Money to another currency using a timestamped FX rate.
 * `rate` = 1 unit of `from.currency` expressed in `toCurrency`.
 */
export function convert(from: Money, toCurrency: CurrencyCode, rate: Decimal.Value): Money {
  if (from.currency === toCurrency.toUpperCase()) return from;
  return money(from.amount.mul(new Decimal(rate)), toCurrency);
}

/** Ratio of a/b as a Decimal (not Money) — e.g. for allocation percentages. Undefined when b is zero or negative. */
export function safeRatio(a: Decimal.Value, b: Decimal.Value): Decimal | undefined {
  const bd = new Decimal(b);
  if (bd.lte(0)) return undefined;
  return new Decimal(a).div(bd);
}

/** Display rounding only — never used for further calculation. */
export function roundForDisplay(m: Money, dp?: number): string {
  const exp = dp ?? minorUnitExponent(m.currency);
  return m.amount.toDecimalPlaces(exp, Decimal.ROUND_HALF_EVEN).toFixed(exp);
}

export { Decimal };
