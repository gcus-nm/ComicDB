import { parse } from "csv-parse/sync";
import {
  CATALOG_TRANSFER_HEADERS,
  exportCatalogRows,
  importCatalogRows,
  preflightCatalogRows,
  type RawCatalogRow,
} from "./catalog-transfer";

export const CSV_HEADERS = CATALOG_TRANSFER_HEADERS;

function parseCsvRows(csv: string) {
  const records = parse(csv, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  }) as RawCatalogRow[];
  return records.map((raw, index) => ({
    rowNumber: index + 2,
    raw,
  }));
}

export function preflightCsv(csv: string) {
  return preflightCatalogRows(parseCsvRows(csv));
}

export function importCsv(csv: string) {
  return importCatalogRows(parseCsvRows(csv));
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\r\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}

export function exportCsv() {
  const lines = [CSV_HEADERS.map(csvCell).join(",")];
  for (const row of exportCatalogRows()) {
    lines.push(row.map(csvCell).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

export function csvTemplate() {
  return `\uFEFF${CSV_HEADERS.map(csvCell).join(",")}\r\n`;
}
