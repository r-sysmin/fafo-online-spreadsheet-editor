import { CalendarDays } from "lucide-react";
import type { SpreadsheetTemplate } from "./types";

/**
 * Weekly planner: hourly time-block grid across all 7 days, with the header
 * row and the Time column both frozen so they stay visible when scrolling.
 */
export const weeklyPlannerTemplate: SpreadsheetTemplate = {
  id: "weekly-planner",
  name: "Weekly Planner",
  description: "Plan your week with an hourly time-block grid across all 7 days.",
  category: "Personal",
  icon: CalendarDays,
  build: (unitId) => {
    const sheetId = "sheet-01";
    const headerStyleId = "headerBold";
    const weekendHeaderStyleId = "headerWeekend";
    const timeColStyleId = "timeCol";
    const sampleBlockStyleId = "sampleBlock";

    const times = [
      "7:00 AM",
      "8:00 AM",
      "9:00 AM",
      "10:00 AM",
      "11:00 AM",
      "12:00 PM",
      "1:00 PM",
      "2:00 PM",
      "3:00 PM",
      "4:00 PM",
      "5:00 PM",
      "6:00 PM",
      "7:00 PM",
      "8:00 PM",
    ];

    // Build cellData: row 0 is the header row, rows 1..14 are the hour rows.
    const cellData: Record<number, Record<number, any>> = {
      0: {
        0: { v: "Time", s: headerStyleId },
        1: { v: "Mon", s: headerStyleId },
        2: { v: "Tue", s: headerStyleId },
        3: { v: "Wed", s: headerStyleId },
        4: { v: "Thu", s: headerStyleId },
        5: { v: "Fri", s: headerStyleId },
        6: { v: "Sat", s: weekendHeaderStyleId },
        7: { v: "Sun", s: weekendHeaderStyleId },
      },
    };

    times.forEach((label, i) => {
      const row = i + 1;
      cellData[row] = {
        0: { v: label, s: timeColStyleId },
      };
    });

    // Pre-filled sample blocks so the grid clearly reads as a planner.
    // "9:00 AM" -> rowIndex 2 (times[2]), so row 3.
    // Standup, Mon 9 AM
    cellData[3]![1] = { v: "Standup", s: sampleBlockStyleId };
    // Lunch across the midday row (12:00 PM -> times[5] -> row 6), Mon–Fri
    [1, 2, 3, 4, 5].forEach((col) => {
      cellData[6]![col] = { v: "Lunch", s: sampleBlockStyleId };
    });
    // Gym, Wed 6 PM (times[11] -> row 12, Wed -> col 3)
    cellData[12]![3] = { v: "Gym", s: sampleBlockStyleId };
    // Deep work, Tue 10 AM (times[3] -> row 4, Tue -> col 2)
    cellData[4]![2] = { v: "Deep work", s: sampleBlockStyleId };

    // Row heights for header + hour rows.
    const rowData: Record<number, { h: number }> = { 0: { h: 28 } };
    for (let i = 1; i <= times.length; i++) rowData[i] = { h: 32 };

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
        [weekendHeaderStyleId]: {
          bl: 1,
          bg: { rgb: "#e0e7ff" },
          ht: 2,
          vt: 2,
          cl: { rgb: "#1e1b4b" },
        },
        [timeColStyleId]: {
          bl: 1,
          bg: { rgb: "#f8fafc" },
          cl: { rgb: "#334155" },
          ht: 3, // right align
          vt: 2,
        },
        [sampleBlockStyleId]: {
          bg: { rgb: "#dcfce7" },
          cl: { rgb: "#14532d" },
          ht: 2,
          vt: 2,
        },
      },
      sheets: {
        [sheetId]: {
          id: sheetId,
          name: "Week",
          rowCount: 60,
          columnCount: 16,
          defaultColumnWidth: 130,
          defaultRowHeight: 32,
          // Freeze header row AND the Time column.
          freeze: { startRow: 1, startColumn: 1, ySplit: 1, xSplit: 1 },
          columnData: {
            0: { w: 90 },
            1: { w: 130 },
            2: { w: 130 },
            3: { w: 130 },
            4: { w: 130 },
            5: { w: 130 },
            6: { w: 130 },
            7: { w: 130 },
          },
          rowData,
          cellData,
        },
      },
      resources: [],
    };
  },
};
