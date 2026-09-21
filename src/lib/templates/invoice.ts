import { ReceiptText } from "lucide-react";
import type { SpreadsheetTemplate } from "./types";

/**
 * Invoice template: company / client / meta block, an itemized line-items table
 * with per-row Amount = Qty * Unit Price formulas, and a totals block with
 * Subtotal (SUM), editable Tax rate, Tax, and Total — all live formulas.
 */
export const invoiceTemplate: SpreadsheetTemplate = {
  id: "invoice",
  name: "Invoice",
  description: "Itemized invoice with automatic subtotal, tax, and total.",
  category: "Work",
  icon: ReceiptText,
  build: (unitId) => {
    const sheetId = "sheet-01";
    const titleStyleId = "title";
    const labelStyleId = "label";
    const valueStyleId = "value";
    const headerStyleId = "headerBold";
    const moneyStyleId = "money";
    const amountStyleId = "amount";
    const totalsLabelStyleId = "totalsLabel";
    const totalsMoneyStyleId = "totalsMoney";
    const totalRowLabelStyleId = "totalRowLabel";
    const totalRowMoneyStyleId = "totalRowMoney";
    const percentStyleId = "percent";

    const currency = '"$"#,##0.00';

    // Line items live in rows index 9..15 (A10:A16) — 5 samples + 2 blanks.
    // Amount formulas per row: D{n} = B{n}*C{n}, n = 10..16
    // Subtotal row index 18 (row 19) -> D19 = SUM(D10:D16)
    // Tax rate row index 19 (row 20) -> D20 (percent)
    // Tax row index 20 (row 21) -> D21 = D19*D20
    // Total row index 21 (row 22) -> D22 = D19+D21

    const lineItems: Array<{ desc: string; qty: number; unit: number }> = [
      { desc: "Design services", qty: 8, unit: 120 },
      { desc: "Development", qty: 24, unit: 110 },
      { desc: "Consulting", qty: 4, unit: 150 },
      { desc: "Project management", qty: 6, unit: 95 },
      { desc: "QA & testing", qty: 5, unit: 85 },
    ];

    const cellData: Record<number, Record<number, any>> = {
      // Row 0: INVOICE title
      0: {
        0: { v: "INVOICE", s: titleStyleId },
      },
      // Row 2: From label / company name; meta: Invoice #
      2: {
        0: { v: "From", s: labelStyleId },
        1: { v: "Your Company", s: valueStyleId },
        3: { v: "Invoice #", s: labelStyleId },
        4: { v: "INV-0001", s: valueStyleId },
      },
      3: {
        1: { v: "123 Main St, City, ST 00000" },
        3: { v: "Date", s: labelStyleId },
        4: { v: "2026-06-26", s: valueStyleId },
      },
      4: {
        3: { v: "Due Date", s: labelStyleId },
        4: { v: "2026-07-10", s: valueStyleId },
      },
      5: {
        0: { v: "Bill To", s: labelStyleId },
        1: { v: "Client Name", s: valueStyleId },
      },
      6: {
        1: { v: "456 Client Ave, City, ST 00000" },
      },
      // Row 8: line-items header
      8: {
        0: { v: "Description", s: headerStyleId },
        1: { v: "Qty", s: headerStyleId },
        2: { v: "Unit Price", s: headerStyleId },
        3: { v: "Amount", s: headerStyleId },
      },
    };

    // Line-items rows: indexes 9..13 filled with samples, 14..15 left blank
    // but seeded with the amount formula so users only fill qty + unit price.
    for (let i = 0; i < 7; i++) {
      const rowIdx = 9 + i;
      const a1Row = rowIdx + 1; // A1 row number
      const sample = lineItems[i];
      cellData[rowIdx] = {
        0: { v: sample?.desc ?? "" },
        1: sample ? { v: sample.qty } : { v: "" },
        2: sample
          ? { v: sample.unit, s: moneyStyleId }
          : { v: "", s: moneyStyleId },
        3: { f: `=B${a1Row}*C${a1Row}`, s: amountStyleId },
      };
    }

    // Totals block
    cellData[18] = {
      2: { v: "Subtotal", s: totalsLabelStyleId },
      3: { f: "=SUM(D10:D16)", s: totalsMoneyStyleId },
    };
    cellData[19] = {
      2: { v: "Tax rate", s: totalsLabelStyleId },
      3: { v: 0.1, s: percentStyleId },
    };
    cellData[20] = {
      2: { v: "Tax", s: totalsLabelStyleId },
      3: { f: "=D19*D20", s: totalsMoneyStyleId },
    };
    cellData[21] = {
      2: { v: "Total", s: totalRowLabelStyleId },
      3: { f: "=D19+D21", s: totalRowMoneyStyleId },
    };

    return {
      id: unitId,
      sheetOrder: [sheetId],
      name: "",
      appVersion: "3.0.0-alpha",
      locale: "enUS",
      styles: {
        [titleStyleId]: {
          bl: 1,
          fs: 24,
          cl: { rgb: "#0f172a" },
          vt: 2,
        },
        [labelStyleId]: {
          bl: 1,
          cl: { rgb: "#475569" },
        },
        [valueStyleId]: {
          cl: { rgb: "#0f172a" },
        },
        [headerStyleId]: {
          bl: 1,
          bg: { rgb: "#f1f5f9" },
          ht: 2,
          vt: 2,
          cl: { rgb: "#0f172a" },
        },
        [moneyStyleId]: {
          n: { pattern: currency },
        },
        [amountStyleId]: {
          n: { pattern: currency },
        },
        [totalsLabelStyleId]: {
          bl: 1,
          ht: 3, // right align
          cl: { rgb: "#0f172a" },
        },
        [totalsMoneyStyleId]: {
          n: { pattern: currency },
        },
        [percentStyleId]: {
          n: { pattern: "0%" },
        },
        [totalRowLabelStyleId]: {
          bl: 1,
          ht: 3,
          bg: { rgb: "#ecfccb" },
          cl: { rgb: "#365314" },
          fs: 12,
        },
        [totalRowMoneyStyleId]: {
          bl: 1,
          bg: { rgb: "#ecfccb" },
          cl: { rgb: "#365314" },
          fs: 12,
          n: { pattern: currency },
        },
      },
      sheets: {
        [sheetId]: {
          id: sheetId,
          name: "Invoice",
          rowCount: 100,
          columnCount: 26,
          defaultColumnWidth: 120,
          defaultRowHeight: 24,
          columnData: {
            0: { w: 280 },
            1: { w: 80 },
            2: { w: 130 },
            3: { w: 140 },
            4: { w: 160 },
          },
          rowData: {
            0: { h: 40 },
            8: { h: 28 },
            21: { h: 30 },
          },
          cellData,
        },
      },
      resources: [],
    };
  },
};
