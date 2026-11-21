"use client";

/**
 * DataSheet — an MS Access–style datasheet (tabular editing grid), shared by every editing table.
 *
 * Keyboard (navigation mode): arrows move the active cell (Shift extends a range); Tab / Shift+Tab
 * and Enter go to the next / previous field and wrap rows; Home / End; Ctrl+Home / Ctrl+End;
 * typing starts editing with that character; F2 edits the current value; Delete / Backspace clear
 * the selected cells; Ctrl+C / Ctrl+V copy / paste blocks to and from Excel (pasting past the last
 * row creates rows when `onCreateRows` is given). Down on the last row moves to the ✱ new-record
 * row; typing there creates a record.
 * Editing mode: Enter / Tab commit and move on; Up / Down commit and move rows; Esc cancels.
 * Select cells filter as you type; Up / Down pick, Enter chooses.
 * Rows: the marker column shows ▶ current, ✎ unsaved, ⚠ error, ✱ new record. Leaving a row (or the
 * grid) calls `onRowLeave` — the parent saves the row if it changed (Access saves on record exit).
 * Clicking a row marker selects the row; Delete then calls `onDeleteRows`.
 *
 * The grid is controlled: values come from `column.get(row)` and every edit calls `onChange`.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

export interface DSOption {
  value: string;
  label: string;
}

export interface DSColumn<R> {
  key: string;
  title: ReactNode;
  width?: number;
  type?: "text" | "number" | "select" | "readonly";
  align?: "left" | "right" | "center";
  /** Raw value of the cell (for a select: the option value). */
  get: (row: R) => string;
  /** Custom display (readonly cells, or a richer view of a value). */
  display?: (row: R) => ReactNode;
  options?: DSOption[] | ((row: R) => DSOption[]);
  editable?: (row: R) => boolean;
  cellClassName?: (row: R) => string | false | null | undefined;
  placeholder?: string;
}

export interface DataSheetProps<R> {
  rows: R[];
  rowKey: (row: R) => string;
  columns: DSColumn<R>[];
  onChange: (row: R, columnKey: string, value: string) => void;
  /** Create records from values (typing in the ✱ row, or pasting past the last row). */
  onCreateRows?: (values: Record<string, string>[]) => void;
  /** The active row moved away from this row (or focus left the grid): save it if it changed. */
  onRowLeave?: (row: R) => void;
  onDeleteRows?: (rows: R[]) => void;
  isDirty?: (row: R) => boolean;
  rowError?: (row: R) => string | null | undefined;
  rowClassName?: (row: R) => string | false | null | undefined;
  /** Inline style per cell (e.g. a user's highlight colour). */
  cellStyle?: (row: R, columnKey: string) => CSSProperties | undefined;
  /** The active (selected) cell changed: its row (null on the ✱ row / none) and column key. */
  onActiveChange?: (row: R | null, columnKey: string | null) => void;
  /** Column resize (drag the header edge); `done` is true on release. */
  onResize?: (columnKey: string, width: number, done: boolean) => void;
  maxHeight?: string;
  className?: string;
  emptyText?: ReactNode;
  dense?: boolean;
}

interface Pos {
  r: number;
  c: number;
}

const MIN_W = 40;

function optionsOf<R>(col: DSColumn<R>, row: R | undefined): DSOption[] {
  if (!col.options) return [];
  return typeof col.options === "function" ? (row ? col.options(row) : []) : col.options;
}

function labelOf<R>(col: DSColumn<R>, row: R, value: string): string {
  if (col.type !== "select") return value;
  return optionsOf(col, row).find((o) => o.value === value)?.label ?? value;
}

/** A pasted / typed text → the option value (matches value or label, case-insensitive). */
function matchOption(opts: DSOption[], text: string): string | null {
  const t = text.trim().toLowerCase();
  if (!t) return "";
  return (
    opts.find((o) => o.value.toLowerCase() === t)?.value ??
    opts.find((o) => o.label.toLowerCase() === t)?.value ??
    opts.find((o) => o.label.toLowerCase().startsWith(t))?.value ??
    null
  );
}

export function DataSheet<R>({
  rows,
  rowKey,
  columns,
  onChange,
  onCreateRows,
  onRowLeave,
  onDeleteRows,
  isDirty,
  rowError,
  rowClassName,
  cellStyle,
  onActiveChange,
  onResize,
  maxHeight = "65vh",
  className,
  emptyText,
  dense,
}: DataSheetProps<R>) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState<Pos | null>(null);
  const [anchor, setAnchor] = useState<Pos | null>(null); // range start (Shift)
  const [rowSelect, setRowSelect] = useState(false); // whole rows selected via marker
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [optIndex, setOptIndex] = useState(0);
  const [optTouched, setOptTouched] = useState(false); // moved through the options
  const [dropRect, setDropRect] = useState<DOMRect | null>(null);

  const canCreate = !!onCreateRows;
  const rowCount = rows.length + (canCreate ? 1 : 0); // + ✱ row
  const isNewRow = (r: number) => canCreate && r === rows.length;
  const colCount = columns.length;

  const editableAt = useCallback(
    (p: Pos) => {
      const col = columns[p.c];
      if (!col || col.type === "readonly") return false;
      if (isNewRow(p.r)) return true;
      const row = rows[p.r];
      return !!row && (col.editable ? col.editable(row) : true);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [columns, rows, canCreate],
  );

  // ── Row leave → save ──
  const lastRowKey = useRef<string | null>(null);
  const leaveRow = useCallback(
    (nextRowIdx: number | null) => {
      const prevKey = lastRowKey.current;
      const nextKey = nextRowIdx !== null && rows[nextRowIdx] ? rowKey(rows[nextRowIdx]) : nextRowIdx !== null ? "__new__" : null;
      if (prevKey && prevKey !== "__new__" && prevKey !== nextKey) {
        const prev = rows.find((r) => rowKey(r) === prevKey);
        if (prev) onRowLeave?.(prev);
      }
      lastRowKey.current = nextKey;
    },
    [rows, rowKey, onRowLeave],
  );

  const moveTo = useCallback(
    (p: Pos, extend = false) => {
      const r = Math.max(0, Math.min(rowCount - 1, p.r));
      const c = Math.max(0, Math.min(colCount - 1, p.c));
      leaveRow(r);
      setActive({ r, c });
      setRowSelect(false);
      if (!extend) setAnchor({ r, c });
    },
    [rowCount, colCount, leaveRow],
  );

  // Tell the parent which cell is selected (rows / columns via refs: report only on a move).
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const colsRef = useRef(columns);
  colsRef.current = columns;
  const onActiveRef = useRef(onActiveChange);
  onActiveRef.current = onActiveChange;
  useEffect(() => {
    if (!onActiveRef.current) return;
    const row = active ? rowsRef.current[active.r] ?? null : null;
    onActiveRef.current(row, active ? colsRef.current[active.c]?.key ?? null : null);
  }, [active]);

  // Keep the active cell in range when rows change (filtering, reload).
  useEffect(() => {
    if (active && active.r >= rowCount) setActive(rowCount ? { r: rowCount - 1, c: active.c } : null);
  }, [rowCount, active]);

  // Scroll the active cell into view.
  useLayoutEffect(() => {
    if (!active || !wrapRef.current) return;
    const el = wrapRef.current.querySelector<HTMLElement>(`[data-cell="${active.r}:${active.c}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

  const range = useMemo(() => {
    if (!active) return null;
    const a = anchor ?? active;
    return {
      r1: Math.min(a.r, active.r),
      r2: Math.max(a.r, active.r),
      c1: rowSelect ? 0 : Math.min(a.c, active.c),
      c2: rowSelect ? colCount - 1 : Math.max(a.c, active.c),
    };
  }, [active, anchor, rowSelect, colCount]);

  // ── Editing ──
  const startEdit = useCallback(
    (initial?: string) => {
      if (!active || !editableAt(active)) return;
      const col = columns[active.c];
      const row = rows[active.r];
      const current = row ? col.get(row) : "";
      setDraft(initial ?? (col.type === "select" ? "" : current));
      setOptIndex(0);
      setOptTouched(false);
      setEditing(true);
      const el = wrapRef.current?.querySelector<HTMLElement>(`[data-cell="${active.r}:${active.c}"]`);
      setDropRect(el?.getBoundingClientRect() ?? null);
    },
    [active, columns, rows, editableAt],
  );

  useEffect(() => {
    if (editing) {
      const i = inputRef.current;
      i?.focus();
      if (i && i.value) i.setSelectionRange(i.value.length, i.value.length);
    } else wrapRef.current?.focus({ preventScroll: true });
  }, [editing]);

  const activeCol = active ? columns[active.c] : undefined;
  const activeRow = active ? rows[active.r] : undefined;
  const filteredOpts = useMemo(() => {
    if (!editing || !activeCol || activeCol.type !== "select") return [];
    const q = draft.trim().toLowerCase();
    const all = optionsOf(activeCol, activeRow);
    return q ? all.filter((o) => o.label.toLowerCase().includes(q)) : all;
  }, [editing, activeCol, activeRow, draft]);

  const writeCell = useCallback(
    (p: Pos, value: string) => {
      const col = columns[p.c];
      if (isNewRow(p.r)) {
        onCreateRows?.([{ [col.key]: value }]);
        return;
      }
      const row = rows[p.r];
      if (row) onChange(row, col.key, value);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [columns, rows, onChange, onCreateRows, canCreate],
  );

  /** Commit the edit; returns false when nothing could be committed (select with no match). */
  const commit = useCallback(() => {
    if (!editing || !active || !activeCol) return true;
    let value = draft;
    if (activeCol.type === "select") {
      const pick = filteredOpts[optIndex] ?? null;
      if (!draft.trim() && !optTouched) {
        setEditing(false);
        return true; // nothing typed: keep the value
      }
      if (!pick) return false;
      value = pick.value;
    }
    const before = activeRow ? activeCol.get(activeRow) : "";
    if (value !== before || isNewRow(active.r)) {
      if (!(isNewRow(active.r) && value === "")) writeCell(active, value);
    }
    setEditing(false);
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, active, activeCol, activeRow, draft, filteredOpts, optIndex, optTouched, writeCell, canCreate]);

  const cancel = () => setEditing(false);

  // Next / previous field, wrapping rows (Access "Enter moves to next field").
  const step = (dir: 1 | -1) => {
    if (!active) return;
    let { r, c } = active;
    c += dir;
    if (c >= colCount) {
      c = 0;
      r += 1;
    } else if (c < 0) {
      c = colCount - 1;
      r -= 1;
    }
    if (r < 0 || r >= rowCount) return;
    moveTo({ r, c });
  };

  // ── Clipboard ──
  const copy = (e: ClipboardEvent | React.ClipboardEvent) => {
    if (!range || editing) return;
    const lines: string[] = [];
    for (let r = range.r1; r <= range.r2; r++) {
      const row = rows[r];
      if (!row) continue;
      const cells: string[] = [];
      for (let c = range.c1; c <= range.c2; c++) {
        const col = columns[c];
        cells.push(labelOf(col, row, col.get(row)).replace(/[\t\n]/g, " "));
      }
      lines.push(cells.join("\t"));
    }
    e.clipboardData?.setData("text/plain", lines.join("\n"));
    e.preventDefault();
  };

  const paste = (e: React.ClipboardEvent) => {
    if (!active || editing) return;
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;
    e.preventDefault();
    const matrix = text.replace(/\r/g, "").replace(/\n$/, "").split("\n").map((l) => l.split("\t"));
    const created: Record<string, string>[] = [];
    matrix.forEach((cells, i) => {
      const r = active.r + i;
      const target = r < rows.length ? rows[r] : null;
      const rec: Record<string, string> = {};
      cells.forEach((raw, j) => {
        const c = active.c + j;
        const col = columns[c];
        if (!col || col.type === "readonly") return;
        let value = raw.trim();
        if (col.type === "select") {
          const m = matchOption(optionsOf(col, target ?? undefined), value);
          if (m === null && target) return; // unknown label: skip the cell
          value = m ?? value;
        }
        if (target) {
          if (!col.editable || col.editable(target)) onChange(target, col.key, value);
        } else rec[col.key] = value;
      });
      if (!target && canCreate && Object.keys(rec).length) created.push(rec);
    });
    if (created.length) onCreateRows?.(created);
  };

  // ── Keys ──
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!active) {
      if (rowCount && ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Tab", "Enter"].includes(e.key)) {
        e.preventDefault();
        moveTo({ r: 0, c: 0 });
      }
      return;
    }
    const isSelect = activeCol?.type === "select";
    if (editing) {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (commit()) step(e.shiftKey ? -1 : 1);
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (isSelect) {
          setOptTouched(true);
          setOptIndex((i) => Math.max(0, Math.min(filteredOpts.length - 1, i + (e.key === "ArrowDown" ? 1 : -1))));
        } else if (commit()) moveTo({ r: active.r + (e.key === "ArrowDown" ? 1 : -1), c: active.c });
      }
      return;
    }
    const ctrl = e.ctrlKey || e.metaKey;
    const go = (dr: number, dc: number) => {
      e.preventDefault();
      moveTo({ r: active.r + dr, c: active.c + dc }, e.shiftKey);
    };
    switch (e.key) {
      case "ArrowDown":
        return go(1, 0);
      case "ArrowUp":
        return go(-1, 0);
      case "ArrowRight":
        return go(0, 1);
      case "ArrowLeft":
        return go(0, -1);
      case "Tab":
        e.preventDefault();
        return step(e.shiftKey ? -1 : 1);
      case "Enter":
        e.preventDefault();
        return step(e.shiftKey ? -1 : 1);
      case "Home":
        e.preventDefault();
        return moveTo({ r: ctrl ? 0 : active.r, c: 0 }, e.shiftKey);
      case "End":
        e.preventDefault();
        return moveTo({ r: ctrl ? rowCount - 1 : active.r, c: colCount - 1 }, e.shiftKey);
      case "F2":
        e.preventDefault();
        return startEdit();
      case "Escape":
        setAnchor(active);
        setRowSelect(false);
        return;
      case "Delete":
      case "Backspace": {
        e.preventDefault();
        if (rowSelect && range && onDeleteRows) {
          onDeleteRows(rows.slice(range.r1, range.r2 + 1));
          return;
        }
        if (!range) return;
        for (let r = range.r1; r <= Math.min(range.r2, rows.length - 1); r++)
          for (let c = range.c1; c <= range.c2; c++) if (editableAt({ r, c })) onChange(rows[r], columns[c].key, "");
        return;
      }
    }
    if (!ctrl && !e.altKey && e.key.length === 1) {
      e.preventDefault();
      startEdit(e.key);
    }
  };

  // Leaving the grid (focus elsewhere) ends the current row.
  const onBlur = (e: React.FocusEvent) => {
    if (wrapRef.current?.contains(e.relatedTarget as Node)) return;
    if (editing) commit();
    leaveRow(null);
  };

  // ── Column resize ──
  const startResize = (e: React.MouseEvent, key: string, w: number) => {
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX;
    let last = w;
    const move = (ev: MouseEvent) => {
      last = Math.max(MIN_W, Math.round(w + ev.clientX - x0));
      onResize?.(key, last, false);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      onResize?.(key, last, true);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const inRange = (r: number, c: number) => !!range && r >= range.r1 && r <= range.r2 && c >= range.c1 && c <= range.c2;
  const pad = dense ? "px-1.5 py-0.5" : "px-2 py-1";
  const totalWidth = 28 + columns.reduce((s, c) => s + (c.width ?? 120), 0);

  const marker = (r: number) => {
    if (isNewRow(r)) return "✱";
    const row = rows[r];
    if (!row) return "";
    if (rowError?.(row)) return "⚠";
    if (isDirty?.(row)) return "✎";
    if (active?.r === r) return "▶";
    return "";
  };

  return (
    <div
      ref={wrapRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onCopy={copy}
      onPaste={paste}
      onBlur={onBlur}
      className={cn("relative overflow-auto rounded border border-border text-xs outline-none focus-visible:ring-1 focus-visible:ring-primary/40", className)}
      style={{ maxHeight }}
    >
      <table className="border-collapse" style={{ tableLayout: "fixed", width: totalWidth, minWidth: "100%" }}>
        <colgroup>
          <col style={{ width: 28 }} />
          {columns.map((c) => (
            <col key={c.key} style={{ width: c.width ?? 120 }} />
          ))}
        </colgroup>
        <thead>
          <tr className="bg-muted">
            <th className="sticky top-0 z-10 border border-border bg-muted" />
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  "sticky top-0 z-10 truncate border border-border bg-muted px-2 py-1 font-semibold",
                  c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left",
                  onResize && "relative",
                )}
              >
                {c.title}
                {onResize && (
                  <span
                    onMouseDown={(e) => startResize(e, c.key, c.width ?? 120)}
                    className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none hover:bg-primary/40"
                  />
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rowCount }, (_, r) => {
            const row = rows[r];
            const err = row ? rowError?.(row) : null;
            return (
              <tr key={row ? rowKey(row) : "__new__"} className={cn(row && rowClassName?.(row))}>
                <td
                  title={err || undefined}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    wrapRef.current?.focus({ preventScroll: true });
                    if (isNewRow(r)) return moveTo({ r, c: 0 });
                    leaveRow(r);
                    setActive({ r, c: 0 });
                    if (!e.shiftKey || !anchor) setAnchor({ r, c: 0 });
                    setRowSelect(true);
                  }}
                  className={cn(
                    "cursor-pointer select-none border border-border bg-muted/60 text-center text-[10px] text-muted-foreground",
                    err && "text-red-600",
                  )}
                >
                  {marker(r)}
                </td>
                {columns.map((col, c) => {
                  const isActive = active?.r === r && active?.c === c;
                  const value = row ? col.get(row) : "";
                  const shown = row ? (col.display ? col.display(row) : labelOf(col, row, value)) : "";
                  const ro = col.type === "readonly" || (row && col.editable ? !col.editable(row) : false);
                  const extra = row ? col.cellClassName?.(row) : undefined;
                  return (
                    <td
                      key={col.key}
                      data-cell={`${r}:${c}`}
                      onMouseDown={(e) => {
                        if ((e.target as HTMLElement).closest("button,a")) return; // inline actions
                        e.preventDefault();
                        wrapRef.current?.focus({ preventScroll: true });
                        if (editing && !isActive) commit();
                        moveTo({ r, c }, e.shiftKey);
                      }}
                      onDoubleClick={() => startEdit()}
                      style={row ? cellStyle?.(row, col.key) : undefined}
                      className={cn(
                        "relative h-7 overflow-hidden whitespace-nowrap border border-border",
                        pad,
                        col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left",
                        ro && !isNewRow(r) && !extra && "text-muted-foreground",
                        inRange(r, c) && !isActive && !extra && "bg-primary/10",
                        extra,
                        isActive && "outline outline-2 -outline-offset-2 outline-primary",
                      )}
                    >
                      {isActive && editing ? (
                        <input
                          ref={inputRef}
                          value={draft}
                          inputMode={col.type === "number" ? "decimal" : undefined}
                          placeholder={col.type === "select" ? "Type to search…" : col.placeholder}
                          onChange={(e) => {
                            setDraft(e.target.value);
                            setOptIndex(0);
                          }}
                          onBlur={(e) => {
                            if (wrapRef.current?.contains(e.relatedTarget as Node)) return;
                            commit();
                          }}
                          className={cn(
                            "absolute inset-0 h-full w-full bg-background px-1.5 text-foreground outline-none",
                            col.align === "right" && "text-right",
                          )}
                          dir="auto"
                        />
                      ) : (
                        <span className="block truncate" dir="auto">
                          {shown === "" && isNewRow(r) ? <span className="text-muted-foreground/50">{col.placeholder ?? ""}</span> : shown}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {rowCount === 0 && (
            <tr>
              <td colSpan={colCount + 1} className="py-6 text-center text-muted-foreground">
                {emptyText ?? "No rows"}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Select editor: the option list under the cell (inside the grid, so focus stays here). */}
      {editing && activeCol?.type === "select" && dropRect && (
        <div
          className="fixed z-50 max-h-56 min-w-[180px] overflow-y-auto rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-md"
          style={{ top: dropRect.bottom + 2, left: dropRect.left, width: Math.max(dropRect.width, 220) }}
        >
          {filteredOpts.length === 0 ? (
            <div className="px-2 py-1.5 text-muted-foreground">No match</div>
          ) : (
            filteredOpts.slice(0, 200).map((o, i) => (
              <div
                key={o.value}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setOptIndex(i);
                  if (active) writeCell(active, o.value);
                  setEditing(false);
                }}
                className={cn("cursor-pointer truncate px-2 py-1", i === optIndex ? "bg-accent text-accent-foreground" : "hover:bg-muted")}
                dir="auto"
              >
                {o.label}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
