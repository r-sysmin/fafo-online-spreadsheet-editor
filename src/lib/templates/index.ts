import type { SpreadsheetTemplate } from "./types";
import { blankWithHeaderTemplate } from "./blank-with-header";
import { monthlyBudgetTemplate } from "./monthly-budget";
import { taskTrackerTemplate } from "./task-tracker";
import { weeklyPlannerTemplate } from "./weekly-planner";
import { invoiceTemplate } from "./invoice";
import { inventoryTrackerTemplate } from "./inventory-tracker";

/**
 * Registry of spreadsheet templates surfaced in the "New from template" gallery.
 * Adding a new template = append one entry here. Each entry is self-contained.
 */
export const SPREADSHEET_TEMPLATES: ReadonlyArray<SpreadsheetTemplate> = [
  blankWithHeaderTemplate,
  monthlyBudgetTemplate,
  taskTrackerTemplate,
  weeklyPlannerTemplate,
  invoiceTemplate,
  inventoryTrackerTemplate,
];

export function getTemplateById(id: string): SpreadsheetTemplate | undefined {
  return SPREADSHEET_TEMPLATES.find((t) => t.id === id);
}

export type { SpreadsheetTemplate, TemplateCategory, WorkbookData } from "./types";
