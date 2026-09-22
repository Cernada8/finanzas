/**
 * Best-effort column auto-detection for the single-step import UI (see docs/architecture.md for
 * why this is a simplification of the brief's fully interactive mapping wizard). Falls back to
 * position (date, amount, description) when no header matches a known synonym. Always shown to
 * the user as a preview before commit, so a wrong guess is caught, not silently imported.
 */
import type { ColumnMapping } from "./transactions-import";

const DATE_SYNONYMS = ["fecha", "date", "fecha operacion", "f. operación", "transaction date"];
const BOOKED_DATE_SYNONYMS = ["fecha valor", "value date", "booked date", "fecha contable"];
const AMOUNT_SYNONYMS = ["importe", "amount", "cantidad", "monto"];
const DEBIT_SYNONYMS = ["debe", "debit", "cargo"];
const CREDIT_SYNONYMS = ["haber", "credit", "abono"];
const DESCRIPTION_SYNONYMS = ["concepto", "description", "descripcion", "descripción", "detalle", "movimiento"];
const MERCHANT_SYNONYMS = ["comercio", "merchant", "beneficiario"];

function findColumn(headers: string[], synonyms: string[]): number | undefined {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  for (const syn of synonyms) {
    const idx = normalized.indexOf(syn);
    if (idx !== -1) return idx;
  }
  return undefined;
}

export function autoDetectMapping(headers: string[]): { mapping: ColumnMapping; confident: boolean } {
  const dateColumn = findColumn(headers, DATE_SYNONYMS);
  const bookedDateColumn = findColumn(headers, BOOKED_DATE_SYNONYMS);
  const amountColumn = findColumn(headers, AMOUNT_SYNONYMS);
  const debitColumn = findColumn(headers, DEBIT_SYNONYMS);
  const creditColumn = findColumn(headers, CREDIT_SYNONYMS);
  const descriptionColumn = findColumn(headers, DESCRIPTION_SYNONYMS);
  const merchantColumn = findColumn(headers, MERCHANT_SYNONYMS);

  if (dateColumn != null && descriptionColumn != null && (amountColumn != null || (debitColumn != null && creditColumn != null))) {
    return {
      confident: true,
      mapping: {
        dateColumn,
        bookedDateColumn,
        amountColumn: amountColumn ?? debitColumn!,
        creditColumn: amountColumn == null ? creditColumn : undefined,
        descriptionColumn,
        merchantColumn,
      },
    };
  }

  // Fallback: assume the common export order date, amount, description.
  return {
    confident: false,
    mapping: { dateColumn: 0, amountColumn: 1, descriptionColumn: 2 },
  };
}
