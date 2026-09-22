/**
 * Display-only formatting. Never used for calculation — see src/domain/money.ts for that.
 * Defaults to Spanish number/date conventions and EUR, per brief defaults; both are meant to be
 * driven from Owner.locale / Owner.reportingCcy at call sites, not hardcoded elsewhere.
 */
import { Decimal } from "decimal.js";

export function formatMoneyMinor(minor: bigint, currency: string, locale = "es-ES"): string {
  const exponent = currency === "JPY" ? 0 : 2;
  const major = new Decimal(minor.toString()).div(new Decimal(10).pow(exponent));
  return new Intl.NumberFormat(locale, { style: "currency", currency, currencyDisplay: "symbol" }).format(
    major.toNumber()
  );
}

export function formatPercent(ratio: Decimal | null | undefined, locale = "es-ES", dp = 1): string {
  if (ratio == null) return "—";
  return new Intl.NumberFormat(locale, { style: "percent", minimumFractionDigits: dp, maximumFractionDigits: dp }).format(
    ratio.toNumber()
  );
}

export function formatDate(iso: string | Date, locale = "es-ES"): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "2-digit", timeZone: "UTC" }).format(d);
}

export function formatMonthLabel(month: string, locale = "es-ES"): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", timeZone: "UTC" }).format(d);
}
