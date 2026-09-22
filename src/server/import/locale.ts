/**
 * Locale-aware parsing for imported amounts and dates (brief §3: "locale-aware parsing").
 * Spanish convention (es-ES): "1.234,56" — dot thousands separator, comma decimal separator.
 * US/UK convention (en-US): "1,234.56" — comma thousands separator, dot decimal separator.
 * Dates: es-ES commonly dd/mm/yyyy; en-US mm/dd/yyyy; ISO yyyy-mm-dd is accepted regardless of locale.
 */

export type SupportedLocale = "es-ES" | "en-US" | "en-GB";

export interface AmountParseResult {
  ok: boolean;
  minor?: bigint; // integer minor units (cents), signed
  error?: string;
}

/** Parses a locale-formatted amount string into integer minor units (cents). Never uses parseFloat. */
export function parseLocaleAmount(raw: string, locale: SupportedLocale, currencyExponent = 2): AmountParseResult {
  let s = raw.trim();
  if (s === "") return { ok: false, error: "empty amount" };

  // Strip currency symbols/spaces, keep sign and digits/separators.
  s = s.replace(/[€$£\s]/g, "");
  let negative = false;
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith("(") && s.endsWith(")")) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("+")) s = s.slice(1);

  let integerPart: string;
  let fractionPart: string;

  if (locale === "es-ES") {
    // dot = thousands, comma = decimal
    const commaIdx = s.lastIndexOf(",");
    if (commaIdx === -1) {
      integerPart = s.replace(/\./g, "");
      fractionPart = "";
    } else {
      integerPart = s.slice(0, commaIdx).replace(/\./g, "");
      fractionPart = s.slice(commaIdx + 1);
    }
  } else {
    // en-US / en-GB: comma = thousands, dot = decimal
    const dotIdx = s.lastIndexOf(".");
    if (dotIdx === -1) {
      integerPart = s.replace(/,/g, "");
      fractionPart = "";
    } else {
      integerPart = s.slice(0, dotIdx).replace(/,/g, "");
      fractionPart = s.slice(dotIdx + 1);
    }
  }

  if (!/^\d*$/.test(integerPart) || !/^\d*$/.test(fractionPart)) {
    return { ok: false, error: `unparseable amount: "${raw}"` };
  }
  if (integerPart === "" && fractionPart === "") {
    return { ok: false, error: `unparseable amount: "${raw}"` };
  }

  const paddedFraction = (fractionPart + "0".repeat(currencyExponent)).slice(0, currencyExponent);
  const minorStr = `${integerPart || "0"}${paddedFraction}`;
  let minor = BigInt(minorStr);
  if (negative) minor = -minor;
  return { ok: true, minor };
}

export interface DateParseResult {
  ok: boolean;
  isoDate?: string; // "YYYY-MM-DD"
  error?: string;
}

/**
 * Parses a locale-formatted date string to an ISO date (date-only, no timezone shifting — the
 * bank-provided calendar date is preserved exactly as printed).
 */
export function parseLocaleDate(raw: string, locale: SupportedLocale): DateParseResult {
  const s = raw.trim();
  if (s === "") return { ok: false, error: "empty date" };

  // ISO format is always accepted regardless of locale.
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return { ok: true, isoDate: `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}` };
  }

  const slashMatch = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (slashMatch) {
    const [, a, b] = slashMatch;
    let y = slashMatch[3];
    if (y.length === 2) y = `20${y}`;
    let day: string, month: string;
    if (locale === "en-US") {
      month = a;
      day = b;
    } else {
      day = a;
      month = b;
    }
    const dayNum = Number(day);
    const monthNum = Number(month);
    if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) {
      return { ok: false, error: `unparseable date: "${raw}"` };
    }
    return { ok: true, isoDate: `${y}-${month.padStart(2, "0")}-${day.padStart(2, "0")}` };
  }

  return { ok: false, error: `unparseable date: "${raw}"` };
}
