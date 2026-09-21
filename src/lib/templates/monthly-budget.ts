import { Wallet } from "lucide-react";
import type { SpreadsheetTemplate } from "./types";

/**
 * Personal-finance template: track income and expenses for a month, with live
 * SUM totals and net (planned vs actual) computed via cell-reference formulas.
 */
export const monthlyBudgetTemplate: SpreadsheetTemplate = {
  id: "monthly-budget",
  name: "Monthly Budget",
  description: "Track income, expenses by category, and what's left over each month.",
  category: "Personal",
  icon: Wallet,
  build: (unitId) => {
    const sheetId = "sheet-01";
    const titleStyleId = "title";
    const sectionStyleId = "section";
    const headerStyleId = "headerBold";
    const totalLabelStyleId = "totalLabel";
    const totalMoneyStyleId = "totalMoney";
    const moneyStyleId = "money";
    const summaryLabelStyleId = "summaryLabel";
    const summaryMoneyStyleId = "summaryMoney";

    const currency = '"$"#,##0.00';

    return {
      id: unitId,
      sheetOrder: [sheetId],
      name: "",
      appVersion: "3.0.0-alpha",
      locale: "enUS",
      styles: {
        [titleStyleId]: {
          bl: 1,
          fs: 14,
          cl: { rgb: "#0f172a" },
          vt: 2,
        },
        [sectionStyleId]: {
          bl: 1,
          fs: 12,
          bg: { rgb: "#e0f2fe" },
          cl: { rgb: "#0c4a6e" },
          vt: 2,
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
        [totalLabelStyleId]: {
          bl: 1,
          bg: { rgb: "#f8fafc" },
          cl: { rgb: "#0f172a" },
        },
        [totalMoneyStyleId]: {
          bl: 1,
          bg: { rgb: "#f8fafc" },
          n: { pattern: currency },
        },
        [summaryLabelStyleId]: {
          bl: 1,
          bg: { rgb: "#ecfccb" },
          cl: { rgb: "#365314" },
        },
        [summaryMoneyStyleId]: {
          bl: 1,
          bg: { rgb: "#ecfccb" },
          cl: { rgb: "#365314" },
          n: { pattern: currency },
        },
      },
      sheets: {
        [sheetId]: {
          id: sheetId,
          name: "Budget",
          rowCount: 100,
          columnCount: 26,
          defaultColumnWidth: 120,
          defaultRowHeight: 24,
          freeze: { startRow: 1, startColumn: -1, ySplit: 1, xSplit: 0 },
          columnData: {
            0: { w: 220 },
            1: { w: 140 },
            2: { w: 140 },
          },
          rowData: {
            0: { h: 30 },
            1: { h: 28 },
            8: { h: 28 },
            9: { h: 28 },
          },
          // Layout (0-indexed rows; A1 refs are +1):
          // Row 0  -> A1: "Income"           (section header)
          // Row 1  -> A2: Source | B2: Planned | C2: Actual   (column headers)
          // Row 2-5 -> A3..A6: sample income rows
          // Row 6  -> A7: Total Income | B7: =SUM(B3:B6) | C7: =SUM(C3:C6)
          // Row 8  -> A9: "Expenses"
          // Row 9  -> A10: Category | B10: Planned | C10: Actual
          // Row 10-17 -> A11..A18: sample expense rows
          // Row 18 -> A19: Total Expenses | B19: =SUM(B11:B18) | C19: =SUM(C11:C18)
          // Row 20 -> A21: "Summary"
          // Row 21 -> A22: Net (Planned) | B22: =B7-B19
          // Row 22 -> A23: Net (Actual)  | C23: =C7-C19
          cellData: {
            0: {
              0: { v: "Income", s: sectionStyleId },
              1: { v: "", s: sectionStyleId },
              2: { v: "", s: sectionStyleId },
            },
            1: {
              0: { v: "Source", s: headerStyleId },
              1: { v: "Planned", s: headerStyleId },
              2: { v: "Actual", s: headerStyleId },
            },
            2: {
              0: { v: "Salary" },
              1: { v: 4500, s: moneyStyleId },
              2: { v: 0, s: moneyStyleId },
            },
            3: {
              0: { v: "Freelance" },
              1: { v: 800, s: moneyStyleId },
              2: { v: 0, s: moneyStyleId },
            },
            4: {
              0: { v: "Investments" },
              1: { v: 150, s: moneyStyleId },
              2: { v: 0, s: moneyStyleId },
            },
            5: {
              0: { v: "Other" },
              1: { v: 0, s: moneyStyleId },
              2: { v: 0, s: moneyStyleId },
            },
            6: {
              0: { v: "Total Income", s: totalLabelStyleId },
              1: { f: "=SUM(B3:B6)", s: totalMoneyStyleId },
              2: { f: "=SUM(C3:C6)", s: totalMoneyStyleId },
            },
            8: {
              0: { v: "Expenses", s: sectionStyleId },
              1: { v: "", s: sectionStyleId },
              2: { v: "", s: sectionStyleId },
            },
            9: {
              0: { v: "Category", s: headerStyleId },
              1: { v: "Planned", s: headerStyleId },
              2: { v: "Actual", s: headerStyleId },
            },
            10: {
              0: { v: "Rent / Mortgage" },
              1: { v: 1600, s: moneyStyleId },
              2: { v: 0, s: moneyStyleId },
            },
            11: {
              0: { v: "Utilities" },
              1: { v: 180, s: moneyStyleId },
              2: { v: 0, s: moneyStyleId },
            },
            12: {
              0: { v: "Groceries" },
              1: { v: 450, s: moneyStyleId },
              2: { v: 0, s: moneyStyleId },
            },
            13: {
              0: { v: "Transport" },
              1: { v: 200, s: moneyStyleId },
              2: { v: 0, s: moneyStyleId },
            },
            14: {
              0: { v: "Dining" },
              1: { v: 220, s: moneyStyleId },
              2: { v: 0, s: moneyStyleId },
            },
            15: {
              0: { v: "Subscriptions" },
              1: { v: 60, s: moneyStyleId },
              2: { v: 0, s: moneyStyleId },
            },
            16: {
              0: { v: "Savings" },
              1: { v: 500, s: moneyStyleId },
              2: { v: 0, s: moneyStyleId },
            },
            17: {
              0: { v: "Misc" },
              1: { v: 150, s: moneyStyleId },
              2: { v: 0, s: moneyStyleId },
            },
            18: {
              0: { v: "Total Expenses", s: totalLabelStyleId },
              1: { f: "=SUM(B11:B18)", s: totalMoneyStyleId },
              2: { f: "=SUM(C11:C18)", s: totalMoneyStyleId },
            },
            20: {
              0: { v: "Summary", s: sectionStyleId },
              1: { v: "", s: sectionStyleId },
              2: { v: "", s: sectionStyleId },
            },
            21: {
              0: { v: "Net (Planned)", s: summaryLabelStyleId },
              1: { f: "=B7-B19", s: summaryMoneyStyleId },
            },
            22: {
              0: { v: "Net (Actual)", s: summaryLabelStyleId },
              1: { v: "", s: summaryMoneyStyleId },
              2: { f: "=C7-C19", s: summaryMoneyStyleId },
            },
          },
        },
      },
      resources: [],
    };
  },
};
