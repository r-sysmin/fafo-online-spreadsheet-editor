import { useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, Upload } from "lucide-react";
import { toast } from "sonner";

type Props = {
  getUniverApi: () => any;
  title: string;
  canEdit: boolean;
};

function sanitizeFilename(name: string) {
  const trimmed = (name || "spreadsheet").trim() || "spreadsheet";
  return trimmed.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 120);
}

function escapeCsvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let i = 0;
  let inQuotes = false;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      cur.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\r") {
      if (text[i + 1] === "\n") i++;
      cur.push(field);
      rows.push(cur);
      cur = [];
      field = "";
      i++;
      continue;
    }
    if (c === "\n") {
      cur.push(field);
      rows.push(cur);
      cur = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }
  return rows;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function sheetToMatrix(sheet: any): unknown[][] {
  const cellData = sheet?.cellData ?? {};
  let maxRow = -1;
  let maxCol = -1;
  for (const r of Object.keys(cellData)) {
    const rowNum = Number(r);
    const row = cellData[r] ?? {};
    for (const c of Object.keys(row)) {
      const colNum = Number(c);
      const cell = row[c];
      if (cell && (cell.v !== undefined || cell.f !== undefined)) {
        if (rowNum > maxRow) maxRow = rowNum;
        if (colNum > maxCol) maxCol = colNum;
      }
    }
  }
  if (maxRow < 0) return [];
  const out: unknown[][] = [];
  for (let r = 0; r <= maxRow; r++) {
    const row: unknown[] = [];
    const rowData = cellData[r] ?? {};
    for (let c = 0; c <= maxCol; c++) {
      const cell = rowData[c];
      row.push(cell?.v ?? "");
    }
    out.push(row);
  }
  return out;
}

/**
 * Shared handlers usable by both the desktop dropdown and a parent-provided
 * overflow menu on mobile.
 */
export function useImportExportHandlers({ getUniverApi, title }: Props) {
  function getSnapshot(): any | null {
    const api = getUniverApi();
    const wb = api?.getActiveWorkbook?.();
    if (!wb) return null;
    try {
      return wb.save();
    } catch {
      return null;
    }
  }

  function exportCsv() {
    const api = getUniverApi();
    const snap = getSnapshot();
    if (!snap) {
      toast.error("Workbook not ready");
      return;
    }
    const wb = api.getActiveWorkbook();
    const activeSheet = wb.getActiveSheet?.();
    const activeSubUnitId = activeSheet?.getSheetId?.() ?? snap.sheetOrder?.[0];
    const sheet = snap.sheets?.[activeSubUnitId];
    if (!sheet) {
      toast.error("No active worksheet");
      return;
    }
    const matrix = sheetToMatrix(sheet);
    const csv = matrix.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    triggerDownload(blob, `${sanitizeFilename(title)}.csv`);
  }

  /**
   * Build the XLSX bytes for the current workbook. Pulled out of exportXlsx so
   * tests / round-trip harnesses can capture the bytes without going through
   * the browser download path. Preserves formulas, merges, column widths,
   * row heights, and number formats (within the SheetJS community subset).
   */
  async function buildXlsxBytes(): Promise<Uint8Array | null> {
    const snap = getSnapshot();
    if (!snap) return null;
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const order: string[] = snap.sheetOrder ?? Object.keys(snap.sheets ?? {});
    for (const sid of order) {
      const sheet = snap.sheets?.[sid];
      if (!sheet) continue;
      const cellData = sheet.cellData ?? {};
      // Determine bounds from cellData
      let maxRow = -1;
      let maxCol = -1;
      for (const r of Object.keys(cellData)) {
        const rn = Number(r);
        const row = cellData[r] ?? {};
        for (const c of Object.keys(row)) {
          const cn = Number(c);
          const cell = row[c];
          if (cell && (cell.v !== undefined || cell.f !== undefined)) {
            if (rn > maxRow) maxRow = rn;
            if (cn > maxCol) maxCol = cn;
          }
        }
      }
      const ws: any = {};
      if (maxRow >= 0 && maxCol >= 0) {
        ws["!ref"] = XLSX.utils.encode_range({
          s: { r: 0, c: 0 },
          e: { r: maxRow, c: maxCol },
        });
      } else {
        ws["!ref"] = "A1";
      }
      for (const r of Object.keys(cellData)) {
        const row = cellData[r] ?? {};
        for (const c of Object.keys(row)) {
          const cell = row[c];
          if (!cell) continue;
          const addr = XLSX.utils.encode_cell({ r: Number(r), c: Number(c) });
          const v = cell.v;
          const f: string | undefined = cell.f ?? undefined;
          const out: any = {};
          // Type inference
          if (typeof v === "number") out.t = "n";
          else if (typeof v === "boolean") out.t = "b";
          else if (v !== undefined && v !== null) out.t = "s";
          else out.t = "z";
          if (v !== undefined && v !== null) out.v = v;
          if (typeof f === "string" && f.length) {
            // SheetJS expects formula without leading "="
            out.f = f.startsWith("=") ? f.slice(1) : f;
            // If we have a formula but no cached numeric value, leave type "n"
            // only when we have a value; otherwise default to "n" 0 so Excel
            // recomputes. We avoid forcing a type here.
            if (out.v === undefined) out.t = "n";
          }
          // Style may be inline ({n:{pattern}}) or a string id into snap.styles
          const stylesTable = snap.styles ?? {};
          const resolvedStyle =
            typeof cell?.s === "string" ? stylesTable[cell.s] : cell?.s;
          const pattern =
            resolvedStyle?.n?.pattern ??
            (cell as any)?.style?.n?.pattern;
          if (pattern) out.z = pattern;
          if (out.v !== undefined || out.f !== undefined) ws[addr] = out;
        }
      }
      // Merges
      const merges: any[] = [];
      const md = sheet.mergeData ?? [];
      for (const m of md) {
        if (!m) continue;
        merges.push({
          s: { r: m.startRow, c: m.startColumn },
          e: { r: m.endRow, c: m.endColumn },
        });
      }
      if (merges.length) ws["!merges"] = merges;
      // Column widths (pixels)
      const colData = sheet.columnData ?? {};
      const cols: any[] = [];
      let haveCol = false;
      for (const c of Object.keys(colData)) {
        const cn = Number(c);
        const w = colData[c]?.w;
        if (typeof w === "number" && w > 0) {
          cols[cn] = { wpx: w };
          haveCol = true;
        }
      }
      if (haveCol) ws["!cols"] = cols;
      // Row heights (pixels)
      const rowDataObj = sheet.rowData ?? {};
      const rws: any[] = [];
      let haveRow = false;
      for (const r of Object.keys(rowDataObj)) {
        const rn = Number(r);
        const h = rowDataObj[r]?.h;
        if (typeof h === "number" && h > 0) {
          rws[rn] = { hpx: h };
          haveRow = true;
        }
      }
      if (haveRow) ws["!rows"] = rws;
      const name = (sheet.name || sid).slice(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, name);
    }
    return XLSX.write(wb, { bookType: "xlsx", type: "array" }) as Uint8Array;
  }

  async function exportXlsx() {
    const bytes = await buildXlsxBytes();
    if (!bytes) {
      toast.error("Workbook not ready");
      return;
    }
    const blob = new Blob([bytes as BlobPart], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    triggerDownload(blob, `${sanitizeFilename(title)}.xlsx`);
  }

  function growSheet(sheet: any, rows: number, cols: number) {
    try {
      const maxR = typeof sheet.getMaxRows === "function" ? sheet.getMaxRows() : 0;
      const maxC = typeof sheet.getMaxColumns === "function" ? sheet.getMaxColumns() : 0;
      if (rows > maxR) {
        if (typeof sheet.setRowCount === "function") {
          sheet.setRowCount(rows);
        } else if (typeof sheet.insertRowsAfter === "function" && maxR > 0) {
          sheet.insertRowsAfter(maxR - 1, rows - maxR);
        } else if (typeof sheet.insertRows === "function") {
          sheet.insertRows(Math.max(maxR, 0), rows - maxR);
        }
      }
      if (cols > maxC) {
        if (typeof sheet.setColumnCount === "function") {
          sheet.setColumnCount(cols);
        } else if (typeof sheet.insertColumnsAfter === "function" && maxC > 0) {
          sheet.insertColumnsAfter(maxC - 1, cols - maxC);
        } else if (typeof sheet.insertColumns === "function") {
          sheet.insertColumns(Math.max(maxC, 0), cols - maxC);
        }
      }
    } catch {
      /* best-effort */
    }
  }

  function writeMatrixToSheet(sheet: any, matrix: unknown[][]) {
    if (!matrix.length) return;
    const rows = matrix.length;
    const cols = matrix.reduce((m, r) => Math.max(m, r.length), 0);
    if (!cols) return;
    const normalized = matrix.map((row) => {
      const filled: unknown[] = [];
      for (let c = 0; c < cols; c++) filled.push(row[c] ?? "");
      return filled;
    });
    growSheet(sheet, rows, cols);
    const range = sheet.getRange(0, 0, rows, cols);
    if (!range) throw new Error("Could not get target range for import");
    range.setValues(normalized);
  }

  /**
   * Import a SheetJS worksheet into a Univer FWorksheet preserving formulas,
   * number formats, merges, column widths and row heights. Anything the
   * facade doesn't support is silently skipped.
   */
  async function writeXlsxSheetToTarget(target: any, ws: any) {
    const XLSX = await import("xlsx");
    const ref = ws?.["!ref"];
    if (!ref) return;
    const range = XLSX.utils.decode_range(ref);
    const rows = range.e.r + 1;
    const cols = range.e.c + 1;
    if (rows <= 0 || cols <= 0) return;
    growSheet(target, rows, cols);

    // Build ICellData[][] matrix
    const matrix: any[][] = [];
    for (let r = 0; r < rows; r++) {
      const row: any[] = [];
      for (let c = 0; c < cols; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        if (!cell) {
          row.push({ v: "" });
          continue;
        }
        const out: any = {};
        if (cell.v !== undefined && cell.v !== null) out.v = cell.v;
        if (typeof cell.f === "string" && cell.f.length) {
          out.f = cell.f.startsWith("=") ? cell.f : `=${cell.f}`;
        }
        const pattern: string | undefined = cell.z;
        if (typeof pattern === "string" && pattern.length && pattern.toLowerCase() !== "general") {
          out.s = { n: { pattern } };
        }
        if (out.v === undefined && !out.f) out.v = "";
        row.push(out);
      }
      matrix.push(row);
    }
    const fRange = target.getRange(0, 0, rows, cols);
    if (!fRange) throw new Error("Could not get target range for XLSX import");
    fRange.setValues(matrix);

    // Merges
    const merges = ws["!merges"] ?? [];
    for (const m of merges) {
      try {
        const mr = target.getRange(
          m.s.r,
          m.s.c,
          m.e.r - m.s.r + 1,
          m.e.c - m.s.c + 1,
        );
        if (mr && typeof mr.merge === "function") mr.merge();
      } catch {
        /* skip merge that can't be applied */
      }
    }

    // Column widths
    const colsMeta: any[] = ws["!cols"] ?? [];
    if (typeof target.setColumnWidth === "function") {
      for (let c = 0; c < colsMeta.length; c++) {
        const m = colsMeta[c];
        const w = m?.wpx ?? (typeof m?.wch === "number" ? Math.round(m.wch * 7) : undefined);
        if (typeof w === "number" && w > 0) {
          try {
            target.setColumnWidth(c, w);
          } catch {
            /* skip */
          }
        }
      }
    }

    // Row heights
    const rowsMeta: any[] = ws["!rows"] ?? [];
    if (typeof target.setRowHeight === "function") {
      for (let r = 0; r < rowsMeta.length; r++) {
        const m = rowsMeta[r];
        const h = m?.hpx ?? (typeof m?.hpt === "number" ? Math.round((m.hpt * 96) / 72) : undefined);
        if (typeof h === "number" && h > 0) {
          try {
            target.setRowHeight(r, h);
          } catch {
            /* skip */
          }
        }
      }
    }
  }


  async function handleFile(file: File) {
    const api = getUniverApi();
    const wb = api?.getActiveWorkbook?.();
    if (!wb) {
      toast.error("Workbook not ready");
      return;
    }
    const name = file.name.toLowerCase();
    try {
      if (name.endsWith(".csv")) {
        const text = await file.text();
        const matrix = parseCsv(text);
        const coerced = matrix.map((row) =>
          row.map((cell) => {
            if (typeof cell === "string" && cell !== "" && !isNaN(Number(cell))) {
              return Number(cell);
            }
            return cell;
          }),
        );
        const active = wb.getActiveSheet();
        writeMatrixToSheet(active, coerced);
        toast.success(`Imported ${coerced.length} rows from CSV`);
      } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
        const XLSX = await import("xlsx");
        const buf = await file.arrayBuffer();
        // cellStyles: true is required for !cols and `z` (number formats) to
        // come through. Formulas land on cell.f by default.
        const book = XLSX.read(buf, { type: "array", cellStyles: true, cellFormula: true });
        for (let i = 0; i < book.SheetNames.length; i++) {
          const sname = book.SheetNames[i];
          const ws = book.Sheets[sname];
          let target = wb.getSheetByName?.(sname);
          if (!target) {
            if (i === 0) {
              target = wb.getActiveSheet();
              try {
                target.setName?.(sname);
              } catch {
                /* noop */
              }
            } else {
              try {
                target = wb.create?.(sname, 100, 26) ?? wb.insertSheet?.(sname);
              } catch {
                target = null;
              }
              if (!target) target = wb.getActiveSheet();
            }
          }
          await writeXlsxSheetToTarget(target, ws);
        }
        toast.success(`Imported ${book.SheetNames.length} sheet(s) from XLSX`);
      } else {
        toast.error("Unsupported file type. Use .csv or .xlsx");
      }
    } catch (e: any) {
      console.error("[import] failed", e);
      toast.error(`Import failed: ${e?.message ?? "unknown"}`);
    }
  }

  return { exportCsv, exportXlsx, buildXlsxBytes, handleFile };
}

export function ImportExportMenu({ getUniverApi, title, canEdit }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { exportCsv, exportXlsx, handleFile } = useImportExportHandlers({
    getUniverApi,
    title,
    canEdit,
  });

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            aria-label="Export spreadsheet"
            data-testid="export-menu"
          >
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={exportCsv} data-testid="export-csv">
            Download CSV (active sheet)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={exportXlsx} data-testid="export-xlsx">
            Download XLSX (all sheets)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {canEdit && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Import a file"
          data-testid="import-button"
        >
          <Upload className="h-4 w-4 mr-1" /> Import
        </Button>
      )}
    </>
  );
}
