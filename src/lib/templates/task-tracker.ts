import { ListChecks } from "lucide-react";
import type { SpreadsheetTemplate } from "./types";

/**
 * Project task tracker: a single sheet listing tasks with owner, status,
 * priority, due date and notes, plus a Summary block that counts tasks by
 * status via COUNTIF and total tasks via COUNTA.
 */
export const taskTrackerTemplate: SpreadsheetTemplate = {
  id: "task-tracker",
  name: "Project Task Tracker",
  description: "Plan and track tasks with owner, status, priority, and due dates.",
  category: "Project",
  icon: ListChecks,
  build: (unitId) => {
    const sheetId = "sheet-01";
    const headerStyleId = "headerBold";
    const summaryHeaderStyleId = "summaryHeader";
    const summaryLabelStyleId = "summaryLabel";
    const summaryCountStyleId = "summaryCount";

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
        [summaryHeaderStyleId]: {
          bl: 1,
          fs: 12,
          bg: { rgb: "#e0e7ff" },
          cl: { rgb: "#1e1b4b" },
          vt: 2,
        },
        [summaryLabelStyleId]: {
          bl: 1,
          bg: { rgb: "#f8fafc" },
          cl: { rgb: "#0f172a" },
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
          name: "Tasks",
          rowCount: 100,
          columnCount: 26,
          defaultColumnWidth: 120,
          defaultRowHeight: 24,
          freeze: { startRow: 1, startColumn: -1, ySplit: 1, xSplit: 0 },
          columnData: {
            0: { w: 240 }, // Task
            1: { w: 140 }, // Owner
            2: { w: 130 }, // Status
            3: { w: 110 }, // Priority
            4: { w: 120 }, // Due Date
            5: { w: 280 }, // Notes
            6: { w: 40 },  // spacer
            7: { w: 160 }, // Summary label
            8: { w: 100 }, // Summary count
          },
          rowData: {
            0: { h: 28 },
          },
          // Layout (0-indexed rows; A1 refs are +1):
          // Row 0  -> A1..F1: headers
          // Rows 1-10 -> A2..F11: 10 sample tasks
          // Summary block at columns H/I (indexes 7/8):
          // Row 0  -> H1: "Summary"
          // Row 1  -> H2: "Total tasks"  | I2: =COUNTA(A2:A11)
          // Row 2  -> H3: "Not Started"  | I3: =COUNTIF(C2:C11,"Not Started")
          // Row 3  -> H4: "In Progress"  | I4: =COUNTIF(C2:C11,"In Progress")
          // Row 4  -> H5: "Blocked"      | I5: =COUNTIF(C2:C11,"Blocked")
          // Row 5  -> H6: "Done"         | I6: =COUNTIF(C2:C11,"Done")
          cellData: {
            0: {
              0: { v: "Task", s: headerStyleId },
              1: { v: "Owner", s: headerStyleId },
              2: { v: "Status", s: headerStyleId },
              3: { v: "Priority", s: headerStyleId },
              4: { v: "Due Date", s: headerStyleId },
              5: { v: "Notes", s: headerStyleId },
              7: { v: "Summary", s: summaryHeaderStyleId },
              8: { v: "", s: summaryHeaderStyleId },
            },
            1: {
              0: { v: "Draft project brief" },
              1: { v: "Alex" },
              2: { v: "Done" },
              3: { v: "High" },
              4: { v: "2026-07-01" },
              5: { v: "Shared with stakeholders for review" },
              7: { v: "Total tasks", s: summaryLabelStyleId },
              8: { f: "=COUNTA(A2:A11)", s: summaryCountStyleId },
            },
            2: {
              0: { v: "Set up repository" },
              1: { v: "Priya" },
              2: { v: "Done" },
              3: { v: "High" },
              4: { v: "2026-07-03" },
              5: { v: "Main + dev branches protected" },
              7: { v: "Not Started", s: summaryLabelStyleId },
              8: { f: '=COUNTIF(C2:C11,"Not Started")', s: summaryCountStyleId },
            },
            3: {
              0: { v: "Design wireframes" },
              1: { v: "Mira" },
              2: { v: "In Progress" },
              3: { v: "High" },
              4: { v: "2026-07-10" },
              5: { v: "Home + dashboard flows" },
              7: { v: "In Progress", s: summaryLabelStyleId },
              8: { f: '=COUNTIF(C2:C11,"In Progress")', s: summaryCountStyleId },
            },
            4: {
              0: { v: "Build landing page" },
              1: { v: "Sam" },
              2: { v: "In Progress" },
              3: { v: "Medium" },
              4: { v: "2026-07-15" },
              5: { v: "Hero + pricing sections" },
              7: { v: "Blocked", s: summaryLabelStyleId },
              8: { f: '=COUNTIF(C2:C11,"Blocked")', s: summaryCountStyleId },
            },
            5: {
              0: { v: "Write integration tests" },
              1: { v: "Jordan" },
              2: { v: "Not Started" },
              3: { v: "Medium" },
              4: { v: "2026-07-20" },
              5: { v: "Cover auth + checkout flows" },
              7: { v: "Done", s: summaryLabelStyleId },
              8: { f: '=COUNTIF(C2:C11,"Done")', s: summaryCountStyleId },
            },
            6: {
              0: { v: "Review pull requests" },
              1: { v: "Alex" },
              2: { v: "In Progress" },
              3: { v: "Medium" },
              4: { v: "2026-07-12" },
              5: { v: "Backlog of 6 PRs" },
            },
            7: {
              0: { v: "Set up CI pipeline" },
              1: { v: "Priya" },
              2: { v: "Blocked" },
              3: { v: "High" },
              4: { v: "2026-07-08" },
              5: { v: "Waiting on secrets from ops" },
            },
            8: {
              0: { v: "Prepare launch checklist" },
              1: { v: "Mira" },
              2: { v: "Not Started" },
              3: { v: "Low" },
              4: { v: "2026-07-25" },
              5: { v: "QA, analytics, comms" },
            },
            9: {
              0: { v: "Set up analytics dashboard" },
              1: { v: "Sam" },
              2: { v: "Not Started" },
              3: { v: "Low" },
              4: { v: "2026-07-22" },
              5: { v: "Funnel + retention charts" },
            },
            10: {
              0: { v: "Schedule user interviews" },
              1: { v: "Jordan" },
              2: { v: "In Progress" },
              3: { v: "Medium" },
              4: { v: "2026-07-18" },
              5: { v: "Target 5 participants" },
            },
          },
        },
      },
      resources: [],
    };
  },
};
