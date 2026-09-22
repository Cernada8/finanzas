/**
 * Generic CSV/XLSX transaction import: preview -> validate -> commit.
 * Column mapping lets the user tell the importer which column is which; nothing about the format
 * is assumed beyond what the mapping says, so this works for any bank's export, not just the
 * institutions named in the brief.
 */
import type { ParsedTable } from "./parse";
import { parseLocaleAmount, parseLocaleDate, type SupportedLocale } from "./locale";
import { transactionDedupeKey } from "../../lib/crypto";

export interface ColumnMapping {
  dateColumn: number;
  bookedDateColumn?: number; // defaults to dateColumn if absent
  amountColumn: number;
  descriptionColumn: number;
  merchantColumn?: number;
  /** Some exports split debit/credit into two columns instead of a signed amount. */
  creditColumn?: number;
  debitColumnIsNegative?: boolean;
}

export interface PreviewRow {
  rowIndex: number;
  ok: boolean;
  errors: string[];
  isoDate?: string;
  bookedIsoDate?: string;
  amountMinor?: bigint;
  description?: string;
  merchant?: string;
  dedupeKey?: string;
  isDuplicateInFile: boolean;
}

export interface PreviewResult {
  rows: PreviewRow[];
  validCount: number;
  errorCount: number;
  duplicateInFileCount: number;
}

export function previewImport(
  table: ParsedTable,
  mapping: ColumnMapping,
  locale: SupportedLocale,
  accountId: string,
  currencyExponent = 2
): PreviewResult {
  const seenInFile = new Set<string>();
  const rows: PreviewRow[] = table.rows.map((row, idx) => {
    const errors: string[] = [];
    const rawDate = row[mapping.dateColumn] ?? "";
    const rawBookedDate = mapping.bookedDateColumn != null ? row[mapping.bookedDateColumn] : rawDate;
    const rawDescription = row[mapping.descriptionColumn] ?? "";
    const rawMerchant = mapping.merchantColumn != null ? row[mapping.merchantColumn] : undefined;

    const dateResult = parseLocaleDate(rawDate, locale);
    if (!dateResult.ok) errors.push(dateResult.error!);

    const bookedDateResult = parseLocaleDate(rawBookedDate, locale);
    if (!bookedDateResult.ok) errors.push(`booked date: ${bookedDateResult.error}`);

    let amountMinor: bigint | undefined;
    if (mapping.creditColumn != null) {
      const debitRaw = row[mapping.amountColumn] ?? "";
      const creditRaw = row[mapping.creditColumn] ?? "";
      const debit = debitRaw.trim() ? parseLocaleAmount(debitRaw, locale, currencyExponent) : { ok: true, minor: 0n };
      const credit = creditRaw.trim() ? parseLocaleAmount(creditRaw, locale, currencyExponent) : { ok: true, minor: 0n };
      if (!debit.ok) errors.push(`debit: ${debit.error}`);
      if (!credit.ok) errors.push(`credit: ${credit.error}`);
      if (debit.ok && credit.ok) {
        // Debit column conventionally holds a positive magnitude of money OUT unless the file
        // already signs it negative (debitColumnIsNegative); credit column is money IN.
        const debitAbs = debit.minor! < 0n ? -debit.minor! : debit.minor!;
        const debitSigned = mapping.debitColumnIsNegative ? debit.minor! : -debitAbs;
        amountMinor = debitSigned + credit.minor!;
      }
    } else {
      const amountResult = parseLocaleAmount(row[mapping.amountColumn] ?? "", locale, currencyExponent);
      if (!amountResult.ok) errors.push(amountResult.error!);
      else amountMinor = amountResult.minor;
    }

    if (!rawDescription.trim()) errors.push("empty description");

    let dedupeKey: string | undefined;
    let isDuplicateInFile = false;
    if (dateResult.ok && amountMinor !== undefined && rawDescription.trim()) {
      const effectiveDate = bookedDateResult.ok ? bookedDateResult.isoDate! : dateResult.isoDate!;
      dedupeKey = transactionDedupeKey({
        accountId,
        dateIso: effectiveDate,
        amountMinor,
        normalizedDescription: rawDescription.trim().toLowerCase().replace(/\s+/g, " "),
      });
      if (seenInFile.has(dedupeKey)) {
        isDuplicateInFile = true;
      } else {
        seenInFile.add(dedupeKey);
      }
    }

    return {
      rowIndex: idx,
      ok: errors.length === 0,
      errors,
      isoDate: dateResult.isoDate,
      bookedIsoDate: bookedDateResult.isoDate,
      amountMinor,
      description: rawDescription.trim(),
      merchant: rawMerchant?.trim(),
      dedupeKey,
      isDuplicateInFile,
    };
  });

  return {
    rows,
    validCount: rows.filter((r) => r.ok).length,
    errorCount: rows.filter((r) => !r.ok).length,
    duplicateInFileCount: rows.filter((r) => r.isDuplicateInFile).length,
  };
}
