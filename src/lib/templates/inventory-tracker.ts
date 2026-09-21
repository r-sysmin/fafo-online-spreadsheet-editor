import { Package } from "lucide-react";
import type { SpreadsheetTemplate } from "./types";

/**
 * Inventory tracker: stock list with per-row Total Value (Qty * Unit Cost) and
 * a Status flag (Reorder / OK) driven by an IF formula, plus a summary block
 * with total inventory value (SUM) and items-to-reorder count (COUNTIF).
 */
export const inventoryTrackerTemplate: SpreadsheetTemplate = {
  id: "inventory-tracker",
  name: "Inventory Tracker",
  description: "Track stock levels, value on hand, and items that need reordering.",
  category: "Work",
  icon: Package,
  build: (unitId) => {
    const sheetId = "sheet-01";
    const headerStyleId = "headerBold";
    const moneyStyleId = "money";
    const numCenterStyleId = "numCenter";
    const statusStyleId = "status";
    const summaryLabelStyleId = "summaryLabel";
    const summaryMoneyStyleId = "summaryMoney";
    const summaryCountStyleId = "summaryCount";

    const currency = '"$"#,##0.00';

    const items: Array<{
      item: string;
      sku: string;
      category: string;
      qty: number;
      reorder: number;
      unit: number;
    }> = [
      { item: "Printer Paper", sku: "OFF-PP-001", category: "Office", qty: 12, reorder: 20, unit: 6.5 },
      { item: "Ballpoint Pens", sku: "OFF-BP-002", category: "Office", qty: 150, reorder: 50, unit: 0.45 },
      { item: "USB-C Cables", sku: "ELE-UC-101", category: "Electronics", qty: 40, reorder: 25, unit: 8.99 },
      { item: "Monitors", sku: "ELE-MN-102", category: "Electronics", qty: 4, reorder: 6, unit: 189.0 },
      { item: "Notebooks", sku: "OFF-NB-003", category: "Office", qty: 60, reorder: 30, unit: 3.25 },
      { item: "Staplers", sku: "OFF-ST-004", category: "Office", qty: 8, reorder: 10, unit: 12.5 },
      { item: "HDMI Adapters", sku: "ELE-HD-103", category: "Electronics", qty: 22, reorder: 15, unit: 14.75 },
      { item: "Desk Lamps", sku: "OFF-DL-005", category: "Office", qty: 5, reorder: 8, unit: 28.0 },
      { item: "Whiteboard Markers", sku: "OFF-WM-006", category: "Office", qty: 90, reorder: 40, unit: 1.6 },
      { item: "Keyboards", sku: "ELE-KB-104", category: "Electronics", qty: 7, reorder: 10, unit: 49.0 },
    ];

    // Items occupy A1 rows 2..11 (indexes 1..10). Data range:
    //   Total Value: G2:G11
    //   Status: H2:H11
    const firstDataA1 = 2;
    const lastDataA1 = firstDataA1 + items.length - 1; // 11

    const cellData: Record<number, Record<number, any>> = {
      0: {
        0: { v: "Item", s: headerStyleId },
        1: { v: "SKU", s: headerStyleId },
        2: { v: "Category", s: headerStyleId },
        3: { v: "Qty on Hand", s: headerStyleId },
        4: { v: "Reorder Level", s: headerStyleId },
        5: { v: "Unit Cost", s: headerStyleId },
        6: { v: "Total Value", s: headerStyleId },
        7: { v: "Status", s: headerStyleId },
      },
    };

    items.forEach((it, i) => {
      const rowIdx = i + 1;
      const a1 = rowIdx + 1;
      cellData[rowIdx] = {
        0: { v: it.item },
        1: { v: it.sku },
        2: { v: it.category },
        3: { v: it.qty, s: numCenterStyleId },
        4: { v: it.reorder, s: numCenterStyleId },
        5: { v: it.unit, s: moneyStyleId },
        6: { f: `=D${a1}*F${a1}`, s: moneyStyleId },
        7: { f: `=IF(D${a1}<=E${a1},"Reorder","OK")`, s: statusStyleId },
      };
    });

    // Summary block — one blank row, then two summary rows.
    const summaryStart = items.length + 2; // index after a blank row
    cellData[summaryStart] = {
      5: { v: "Total inventory value", s: summaryLabelStyleId },
      6: { f: `=SUM(G${firstDataA1}:G${lastDataA1})`, s: summaryMoneyStyleId },
    };
    cellData[summaryStart + 1] = {
      5: { v: "Items to reorder", s: summaryLabelStyleId },
      6: { f: `=COUNTIF(H${firstDataA1}:H${lastDataA1},"Reorder")`, s: summaryCountStyleId },
    };

    return {
      id: unitId,
      sheetOrder: [sheetId],
      name: "",
      appVersion: "3.0.0-alpha",
      locale: "enUS",
      styles: {
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
        [numCenterStyleId]: {
          ht: 2,
        },
        [statusStyleId]: {
          ht: 2,
          bl: 1,
        },
        [summaryLabelStyleId]: {
          bl: 1,
          ht: 3, // right align
          bg: { rgb: "#f8fafc" },
          cl: { rgb: "#0f172a" },
        },
        [summaryMoneyStyleId]: {
          bl: 1,
          bg: { rgb: "#f8fafc" },
          n: { pattern: currency },
        },
        [summaryCountStyleId]: {
          bl: 1,
          bg: { rgb: "#f8fafc" },
          ht: 2,
        },
      },
      sheets: {
        [sheetId]: {
          id: sheetId,
          name: "Inventory",
          rowCount: 100,
          columnCount: 26,
          defaultColumnWidth: 120,
          defaultRowHeight: 24,
          freeze: { startRow: 1, startColumn: -1, ySplit: 1, xSplit: 0 },
          columnData: {
            0: { w: 200 }, // Item
            1: { w: 130 }, // SKU
            2: { w: 130 }, // Category
            3: { w: 110 }, // Qty on Hand
            4: { w: 120 }, // Reorder Level
            5: { w: 120 }, // Unit Cost
            6: { w: 140 }, // Total Value
            7: { w: 110 }, // Status
          },
          rowData: {
            0: { h: 28 },
          },
          cellData,
        },
      },
      resources: [],
    };
  },
};
