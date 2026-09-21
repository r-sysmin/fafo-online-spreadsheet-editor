export type RemoteSelection = {
  clientId: string;
  userId: string;
  name: string;
  color: string;
  subUnitId: string;
  range: {
    startRow: number;
    startColumn: number;
    endRow: number;
    endColumn: number;
  };
};

// Approximate offsets inside the Univer canvas container. Univer renders its
// own toolbar + formula bar above the grid, plus a row of column letters and
// a column of row numbers. These constants match the defaults used in
// blankWorkbookData (88×24 cells). Good enough for a near-cell overlay.
const TOOLBAR_OFFSET_Y = 84; // toolbar + formula bar
const ROW_HEADER_H = 20; // column-letter row
const COL_HEADER_W = 46; // row-number column
const CELL_W = 88;
const CELL_H = 24;

export function RemoteCursors({
  selections,
  activeSubUnitId,
}: {
  selections: RemoteSelection[];
  activeSubUnitId: string | null;
}) {
  const visible = selections.filter(
    (s) => !activeSubUnitId || s.subUnitId === activeSubUnitId,
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {visible.map((s) => {
        const left = COL_HEADER_W + s.range.startColumn * CELL_W;
        const top =
          TOOLBAR_OFFSET_Y + ROW_HEADER_H + s.range.startRow * CELL_H;
        const width = (s.range.endColumn - s.range.startColumn + 1) * CELL_W;
        const height = (s.range.endRow - s.range.startRow + 1) * CELL_H;
        return (
          <div
            key={s.clientId}
            data-remote-selection={s.clientId}
            data-user-name={s.name}
            style={{
              position: "absolute",
              left,
              top,
              width,
              height,
              border: `2px solid ${s.color}`,
              boxShadow: `0 0 0 1px ${s.color}33 inset`,
              borderRadius: 2,
              transition: "left 80ms linear, top 80ms linear, width 80ms linear, height 80ms linear",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: -18,
                left: -2,
                background: s.color,
                color: "white",
                fontSize: 10,
                lineHeight: "14px",
                padding: "1px 6px",
                borderRadius: 3,
                whiteSpace: "nowrap",
                fontWeight: 600,
                fontFamily:
                  "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
              }}
            >
              {s.name}
            </div>
          </div>
        );
      })}
    </div>
  );
}
