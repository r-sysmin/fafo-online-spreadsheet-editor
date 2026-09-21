import type { LucideIcon } from "lucide-react";

/**
 * Univer workbook data is loosely typed at the persistence boundary; we keep it
 * as a plain JSON object so the template builders only need to construct the
 * fields they care about (cellData, styles, columnData, freeze, ...).
 */
export type WorkbookData = Record<string, any>;

export type TemplateCategory = "Basics" | "Personal" | "Work" | "Project" | "Education";

export type SpreadsheetTemplate = {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  icon: LucideIcon;
  /**
   * Builds the initial Univer workbook snapshot for a newly created sheet.
   * `unitId` is the spreadsheet row id so the workbook's unit id matches its
   * DB row, keeping the persistence pipeline consistent with blank sheets.
   * The builder MUST return a fresh object on every call so edits to one sheet
   * can never mutate the template definition or another user's copy.
   */
  build: (unitId: string) => WorkbookData;
};
