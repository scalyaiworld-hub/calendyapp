/**
 * Serializa filas a CSV (RFC 4180). Las celdas que empiezan con = + - @ o tab se prefijan con
 * una comilla simple para que Excel/Sheets no las ejecuten como fórmula (CSV injection).
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  const lines = [header, ...rows].map((r) => r.map(csvCell).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n"; // BOM para que Excel respete los acentos
}
