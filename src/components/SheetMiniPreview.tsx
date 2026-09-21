import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { WorkbookData } from "@/lib/templates/types";

/**
 * Miniature "thumbnail" render of a Univer workbook snapshot. Parses the
 * persisted snapshot directly (no Univer engine) and draws a top-left window
 * of the first worksheet as a small HTML grid.
 *
 * The grid uses FIXED cell dimensions (not stretched), so density looks
 * identical regardless of container size — a template tile at 168px and a
 * document card at 400px both render with the same tiny-cell aesthetic.
 * The number of visible rows/cols is derived from the container.
 */

type CellStyle = {
  bl?: number;
  bg?: { rgb?: string };
  cl?: { rgb?: string };
  ht?: number;
};

type Cell = {
  v?: unknown;
  s?: string | CellStyle;
};

type Props = {
  data: WorkbookData | null | undefined;
  maxRows?: number;
  maxCols?: number;
  className?: string;
};

// Fixed cell footprint — tuned to match the template-tile look at ~168px wide.
const CELL_W = 22;
const CELL_H = 14;
const DEFAULT_ROWS = 14;
const DEFAULT_COLS = 8;

function resolveStyle(
  cellStyle: string | CellStyle | undefined,
  styles: Record<string, CellStyle> | undefined,
): CellStyle | undefined {
  if (!cellStyle) return undefined;
  if (typeof cellStyle === "string") return styles?.[cellStyle];
  return cellStyle;
}

function alignClass(ht: number | undefined): string {
  if (ht === 2) return "text-center";
  if (ht === 3) return "text-right";
  return "text-left";
}

function firstSheet(data: WorkbookData): Record<string, unknown> | null {
  const sheets = data.sheets as Record<string, unknown> | undefined;
  if (!sheets) return null;
  const order = data.sheetOrder as string[] | undefined;
  const id = order && order.length > 0 ? order[0] : Object.keys(sheets)[0];
  if (!id) return null;
  const sheet = sheets[id];
  return (sheet as Record<string, unknown>) ?? null;
}

function SheetMiniPreviewImpl({
  data,
  maxRows = DEFAULT_ROWS,
  maxCols = DEFAULT_COLS,
  className,
}: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 168, h: 126 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) setSize({ w, h });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cols = Math.max(1, maxCols);
  const rows = Math.max(1, maxRows);
  const baseWidth = cols * CELL_W;
  const baseHeight = rows * CELL_H;
  const scale = Math.max(size.w / baseWidth, size.h / baseHeight, 1);

  const parsed = useMemo(() => {
    if (!data) return null;
    const sheet = firstSheet(data);
    if (!sheet) return null;
    const styles = (data.styles ?? {}) as Record<string, CellStyle>;
    const cellData = (sheet.cellData ?? {}) as Record<
      string | number,
      Record<string | number, Cell>
    >;

    const out: Array<Array<{ text: string; style?: CellStyle }>> = [];
    for (let r = 0; r < rows; r++) {
      const rowSrc = cellData[r] ?? cellData[String(r)];
      const row: Array<{ text: string; style?: CellStyle }> = [];
      for (let c = 0; c < cols; c++) {
        const cell = rowSrc?.[c] ?? rowSrc?.[String(c)];
        const v = cell?.v;
        const text = v === undefined || v === null ? "" : typeof v === "string" ? v : String(v);
        row.push({ text, style: resolveStyle(cell?.s, styles) });
      }
      out.push(row);
    }
    return out;
  }, [data, rows, cols]);

  if (!data) return null;

  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      className={"relative h-full w-full overflow-hidden bg-background " + (className ?? "")}
    >
      <div
        className="absolute left-0 top-0 grid origin-top-left"
        style={{
          gridTemplateColumns: `repeat(${cols}, ${CELL_W}px)`,
          gridTemplateRows: `repeat(${rows}, ${CELL_H}px)`,
          width: `${baseWidth}px`,
          height: `${baseHeight}px`,
          transform: `scale(${scale})`,
        }}
      >
        {parsed?.flatMap((row, rIdx) =>
          row.map((cell, cIdx) => {
            const s = cell.style;
            const bg = s?.bg?.rgb;
            const cl = s?.cl?.rgb;
            const bold = s?.bl === 1;
            return (
              <div
                key={`${rIdx}-${cIdx}`}
                className={
                  "min-w-0 overflow-hidden border-r border-b border-border/40 px-[2px] leading-none " +
                  alignClass(s?.ht) +
                  (bold ? " font-semibold" : "")
                }
                style={{
                  backgroundColor: bg,
                  color: cl,
                  fontSize: "6px",
                  whiteSpace: "nowrap",
                  lineHeight: `${CELL_H}px`,
                }}
              >
                {cell.text}
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}

export const SheetMiniPreview = memo(SheetMiniPreviewImpl);
