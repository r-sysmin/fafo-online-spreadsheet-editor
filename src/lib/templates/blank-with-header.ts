import { FileSpreadsheet } from "lucide-react";
import type { SpreadsheetTemplate } from "./types";

/**
 * Proof-of-concept template: a single sheet with a bold, frozen header row
 * and a handful of empty data rows. Real templates will follow the same shape.
 */
export const blankWithHeaderTemplate: SpreadsheetTemplate = {
  id: "blank-with-header",
  name: "Blank with header row",
  description: "Single sheet with a bold frozen header row and a few empty rows.",
  category: "Basics",
  icon: FileSpreadsheet,
  build: (unitId) => {
    const sheetId = "sheet-01";
    const headerStyleId = "headerBold";
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
          ht: 2, // horizontal center
          vt: 2, // vertical middle
          cl: { rgb: "#0f172a" },
        },
      },
      sheets: {
        [sheetId]: {
          id: sheetId,
          name: "Sheet1",
          rowCount: 100,
          columnCount: 26,
          defaultColumnWidth: 120,
          defaultRowHeight: 24,
          freeze: { startRow: 1, startColumn: -1, ySplit: 1, xSplit: 0 },
          columnData: {
            0: { w: 160 },
            1: { w: 160 },
            2: { w: 160 },
          },
          rowData: {
            0: { h: 28 },
          },
          cellData: {
            0: {
              0: { v: "Column A", s: headerStyleId },
              1: { v: "Column B", s: headerStyleId },
              2: { v: "Column C", s: headerStyleId },
            },
          },
        },
      },
      resources: [],
    };
  },
};
