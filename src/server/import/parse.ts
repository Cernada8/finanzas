/**
 * Low-level file parsing: CSV (Papa Parse) and XLSX (SheetJS) into a common row-shape so the
 * rest of the import pipeline is format-agnostic.
 */
import Papa from "papaparse";
import * as XLSX from "xlsx";

export interface ParsedTable {
  headers: string[];
  rows: string[][];
}

export function parseCsv(content: string): ParsedTable {
  const result = Papa.parse<string[]>(content.trim(), { skipEmptyLines: true });
  if (result.errors.length > 0) {
    const fatal = result.errors.filter((e) => e.type !== "FieldMismatch");
    if (fatal.length > 0) {
      throw new Error(`CSV parse error: ${fatal[0].message} (row ${fatal[0].row})`);
    }
  }
  const [headers, ...rows] = result.data;
  return { headers: headers ?? [], rows };
}

export function parseXlsx(buffer: Buffer): ParsedTable {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "" });
  const [headers, ...rows] = data as string[][];
  return { headers: headers ?? [], rows };
}

export function parseFile(fileType: "CSV" | "XLSX", buffer: Buffer): ParsedTable {
  if (fileType === "CSV") return parseCsv(buffer.toString("utf-8"));
  return parseXlsx(buffer);
}
