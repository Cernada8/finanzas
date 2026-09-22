import { describe, expect, it } from "vitest";
import { previewImport, type ColumnMapping } from "../transactions-import";
import type { ParsedTable } from "../parse";

const mapping: ColumnMapping = { dateColumn: 0, amountColumn: 1, descriptionColumn: 2 };

describe("previewImport", () => {
  it("parses valid rows and computes a stable dedupe key", () => {
    const table: ParsedTable = {
      headers: ["fecha", "importe", "concepto"],
      rows: [["15/03/2026", "-45,20", "MERCADONA MADRID"]],
    };
    const result = previewImport(table, mapping, "es-ES", "acct-1");
    expect(result.validCount).toBe(1);
    expect(result.rows[0].amountMinor).toBe(-4520n);
    expect(result.rows[0].isoDate).toBe("2026-03-15");
    expect(result.rows[0].dedupeKey).toBeTruthy();
  });

  it("flags duplicate rows within the same file", () => {
    const table: ParsedTable = {
      headers: ["fecha", "importe", "concepto"],
      rows: [
        ["15/03/2026", "-45,20", "MERCADONA MADRID"],
        ["15/03/2026", "-45,20", "MERCADONA MADRID"],
      ],
    };
    const result = previewImport(table, mapping, "es-ES", "acct-1");
    expect(result.duplicateInFileCount).toBe(1);
    expect(result.rows[1].isDuplicateInFile).toBe(true);
  });

  it("reports row-level errors instead of silently skipping or guessing", () => {
    const table: ParsedTable = {
      headers: ["fecha", "importe", "concepto"],
      rows: [["not-a-date", "abc", ""]],
    };
    const result = previewImport(table, mapping, "es-ES", "acct-1");
    expect(result.errorCount).toBe(1);
    expect(result.rows[0].errors.length).toBeGreaterThan(0);
  });

  it("supports separate debit/credit columns", () => {
    const debitCreditMapping: ColumnMapping = {
      dateColumn: 0,
      amountColumn: 1, // debit
      creditColumn: 2,
      descriptionColumn: 3,
    };
    const table: ParsedTable = {
      headers: ["fecha", "debe", "haber", "concepto"],
      rows: [
        ["01/03/2026", "50,00", "", "SUPERMERCADO"],
        ["02/03/2026", "", "1.000,00", "NOMINA"],
      ],
    };
    const result = previewImport(table, debitCreditMapping, "es-ES", "acct-1");
    expect(result.rows[0].amountMinor).toBe(-5000n);
    expect(result.rows[1].amountMinor).toBe(100000n);
  });
});
