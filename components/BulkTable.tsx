"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { bulkTrashAction, bulkUpdateAction, gridUpdateAction, inlineUpdateAction } from "@/lib/actions";

export type ColumnDef = {
  key: string;
  header: string;
  // 초기 열 너비(px). 사용자가 헤더 경계를 끌어 바꾸면 브라우저에 기억된다.
  width?: number;
  kind?: "readonly" | "text" | "select" | "date" | "number";
  options?: [string, string][];
  numeric?: boolean;
};

export type BulkRow = {
  id: string;
  display: Record<string, string>;
  raw?: Record<string, string>;
  href?: string;
  linkKey?: string;
  emphasis?: string[];
};

export type BulkAction = {
  field: string;
  label: string;
  options: [string, string][];
};

type Override = { display: string; raw: string };

const MIN_WIDTH = 56;
const DEFAULT_WIDTH = 130;

export function BulkTable({
  entity,
  columns,
  rows,
  bulkActions = [],
  returnPath,
  emptyText = "표시할 항목이 없습니다.",
  storageKey,
  canPaste = false,
}: {
  entity: string;
  columns: ColumnDef[];
  rows: BulkRow[];
  bulkActions?: BulkAction[];
  returnPath: string;
  emptyText?: string;
  storageKey?: string;
  canPaste?: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<{ r: number; c: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, Record<string, Override>>>({});
  const [failed, setFailed] = useState<Record<string, Set<string>>>({});
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const [activeBulk, setActiveBulk] = useState(bulkActions[0]?.field ?? "");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteStart, setPasteStart] = useState({ r: 0, c: columns.findIndex((c) => c.kind && c.kind !== "readonly") });
  const gridRef = useRef<HTMLDivElement>(null);

  const widthKey = `xp.cols.${storageKey ?? entity}`;
  const [widths, setWidths] = useState<Record<string, number>>(() =>
    Object.fromEntries(columns.map((c) => [c.key, c.width ?? DEFAULT_WIDTH]))
  );

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(widthKey);
      if (!saved) return;
      const parsed = JSON.parse(saved) as Record<string, number>;
      setWidths((current) => {
        const next = { ...current };
        for (const column of columns) {
          const value = parsed[column.key];
          if (typeof value === "number" && value >= MIN_WIDTH) next[column.key] = value;
        }
        return next;
      });
    } catch {
      // 저장된 값이 깨졌으면 기본값을 쓴다
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widthKey]);

  const persistWidths = (next: Record<string, number>) => {
    try {
      window.localStorage.setItem(widthKey, JSON.stringify(next));
    } catch {
      // 저장 실패는 무시 (동작에는 영향 없음)
    }
  };

  const startResize = (key: string, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = widths[key] ?? DEFAULT_WIDTH;
    let latest = startWidth;

    const onMove = (move: MouseEvent) => {
      latest = Math.max(MIN_WIDTH, startWidth + (move.clientX - startX));
      setWidths((current) => ({ ...current, [key]: latest }));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setWidths((current) => {
        const next = { ...current, [key]: latest };
        persistWidths(next);
        return next;
      });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const resetWidths = () => {
    const next = Object.fromEntries(columns.map((c) => [c.key, c.width ?? DEFAULT_WIDTH]));
    setWidths(next);
    persistWidths(next);
  };

  const valueOf = useCallback(
    (row: BulkRow, column: ColumnDef) => {
      const override = overrides[row.id]?.[column.key];
      if (override) return override;
      return {
        display: row.display[column.key] ?? "",
        raw: row.raw?.[column.key] ?? "",
      };
    },
    [overrides]
  );

  const labelFor = (column: ColumnDef, raw: string) => {
    if (!column.options) return raw;
    return column.options.find(([value]) => value === raw)?.[1] ?? raw;
  };

  const rawFromPasted = (column: ColumnDef, text: string) => {
    const trimmed = text.trim();
    if (!column.options) return trimmed;
    if (trimmed === "") return "";
    const byValue = column.options.find(([value]) => value === trimmed);
    if (byValue) return byValue[0];
    const byLabel = column.options.find(([, display]) => display === trimmed);
    return byLabel ? byLabel[0] : trimmed;
  };

  const applyOverride = (rowId: string, key: string, override: Override) => {
    setOverrides((current) => ({ ...current, [rowId]: { ...current[rowId], [key]: override } }));
  };

  const markFailed = (rowId: string, key: string, isFailed: boolean) => {
    setFailed((current) => {
      const next = { ...current };
      const set = new Set(next[rowId] ?? []);
      if (isFailed) set.add(key);
      else set.delete(key);
      next[rowId] = set;
      return next;
    });
  };

  // 낙관적 저장: 화면은 즉시 바뀌고, 실패하면 되돌린다.
  const save = (row: BulkRow, column: ColumnDef, nextRaw: string) => {
    setEditing(false);
    const before = valueOf(row, column);
    if (nextRaw === before.raw) return;

    applyOverride(row.id, column.key, { raw: nextRaw, display: labelFor(column, nextRaw) });
    markFailed(row.id, column.key, false);

    startTransition(async () => {
      const result = await inlineUpdateAction(entity, row.id, column.key, nextRaw, returnPath);
      if (!result.ok) {
        applyOverride(row.id, column.key, before);
        markFailed(row.id, column.key, true);
        setMessage(result.message);
      }
    });
  };

  const editableColumns = columns.filter((c) => c.kind && c.kind !== "readonly");

  const applyPaste = (text: string, start: { r: number; c: number }) => {
    const matrix = text
      .replace(/\r/g, "")
      .split("\n")
      .filter((line, index, all) => line !== "" || index < all.length - 1)
      .map((line) => line.split("\t"));

    const cells: { id: string; field: string; value: string }[] = [];
    const revert: { id: string; key: string; before: Override }[] = [];

    matrix.forEach((line, rowOffset) => {
      const row = rows[start.r + rowOffset];
      if (!row) return;
      line.forEach((cellText, colOffset) => {
        const column = columns[start.c + colOffset];
        if (!column || !column.kind || column.kind === "readonly") return;
        const nextRaw = rawFromPasted(column, cellText);
        const before = valueOf(row, column);
        if (nextRaw === before.raw) return;
        revert.push({ id: row.id, key: column.key, before });
        applyOverride(row.id, column.key, { raw: nextRaw, display: labelFor(column, nextRaw) });
        cells.push({ id: row.id, field: column.key, value: nextRaw });
      });
    });

    if (cells.length === 0) return;
    setMessage(`${cells.length}칸 반영 중`);

    startTransition(async () => {
      const result = await gridUpdateAction(entity, cells);
      const failures = result.results.filter((r) => !r.ok);
      for (const failure of failures) {
        const original = revert.find((v) => v.id === failure.id && v.key === failure.field);
        if (original) applyOverride(failure.id, failure.field, original.before);
        markFailed(failure.id, failure.field, true);
      }
      setMessage(
        failures.length === 0
          ? `${cells.length}칸 저장됨`
          : `${cells.length - failures.length}칸 저장 · ${failures.length}칸 실패 — ${failures[0].message}`
      );
    });
  };

  const onPaste = (event: React.ClipboardEvent) => {
    if (!canPaste || editing || !active) return;
    const text = event.clipboardData.getData("text/plain");
    if (!text || (!text.includes("\t") && !text.includes("\n"))) return;
    event.preventDefault();
    applyPaste(text, active);
  };

  const move = (dr: number, dc: number) => {
    setActive((current) => {
      if (!current) return { r: 0, c: 0 };
      return {
        r: Math.min(rows.length - 1, Math.max(0, current.r + dr)),
        c: Math.min(columns.length - 1, Math.max(0, current.c + dc)),
      };
    });
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (editing || !active) return;
    const column = columns[active.c];
    const canEditCell = Boolean(column?.kind && column.kind !== "readonly");

    if (event.key === "ArrowDown") { event.preventDefault(); move(1, 0); return; }
    if (event.key === "ArrowUp") { event.preventDefault(); move(-1, 0); return; }
    if (event.key === "ArrowRight") { event.preventDefault(); move(0, 1); return; }
    if (event.key === "ArrowLeft") { event.preventDefault(); move(0, -1); return; }
    if (event.key === "Tab") { event.preventDefault(); move(0, event.shiftKey ? -1 : 1); return; }
    if (event.key === "Enter" && canEditCell) { event.preventDefault(); setEditing(true); return; }
    if (event.key === " ") {
      event.preventDefault();
      const row = rows[active.r];
      if (row) toggle(row.id);
      return;
    }
    if (canEditCell && event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
      setEditing(true);
    }
  };

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () =>
    setSelected(selected.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)));

  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected]);
  const currentAction = bulkActions.find((a) => a.field === activeBulk);
  const totalWidth = columns.reduce((sum, c) => sum + (widths[c.key] ?? DEFAULT_WIDTH), 0) + 34;

  return (
    <>
      {selected.size > 0 ? (
        <div className="bulkBar">
          <span className="bulkCount">{selected.size}건 선택</span>

          {bulkActions.length > 0 ? (
            <form action={bulkUpdateAction} className="bulkForm">
              <input type="hidden" name="entity" value={entity} />
              <input type="hidden" name="return_path" value={returnPath} />
              {selectedRows.map((row) => (
                <input key={row.id} type="hidden" name="id" value={row.id} />
              ))}
              <select name="field" value={activeBulk} onChange={(event) => setActiveBulk(event.target.value)}>
                {bulkActions.map((action) => (
                  <option key={action.field} value={action.field}>
                    {action.label}
                  </option>
                ))}
              </select>
              <select name="value" defaultValue="">
                <option value="">— 값 선택 —</option>
                {(currentAction?.options ?? []).map(([value, display]) => (
                  <option key={value} value={value}>
                    {display}
                  </option>
                ))}
              </select>
              <button className="smallButton" type="submit">
                일괄 적용
              </button>
            </form>
          ) : null}

          <form action={bulkTrashAction} className="bulkForm">
            <input type="hidden" name="entity" value={entity} />
            <input type="hidden" name="return_path" value={returnPath} />
            {selectedRows.map((row) => (
              <input key={row.id} type="hidden" name="id" value={row.id} />
            ))}
            <button className="dangerButton" type="submit">
              휴지통으로 ({selected.size})
            </button>
          </form>

          <button className="smallButton" type="button" onClick={() => setSelected(new Set())}>
            선택 해제
          </button>
        </div>
      ) : null}

      <div className="gridBar">
        {canPaste ? (
          <button className="smallButton" type="button" onClick={() => setPasteOpen(true)}>
            엑셀 붙여넣기
          </button>
        ) : null}
        <button className="smallButton" type="button" onClick={resetWidths}>
          열 너비 초기화
        </button>
        {message ? <span className="gridMessage">{message}</span> : null}
      </div>

      {pasteOpen ? (
        <div className="modalBackdrop" onClick={() => setPasteOpen(false)}>
          <div className="modalCard" onClick={(event) => event.stopPropagation()}>
            <div className="modalHeader">
              <span>엑셀 붙여넣기</span>
              <button className="smallButton" type="button" onClick={() => setPasteOpen(false)}>
                닫기
              </button>
            </div>
            <div className="modalBody">
              <div className="modalRow">
                <div className="field">
                  <label>시작 행</label>
                  <select
                    value={pasteStart.r}
                    onChange={(event) => setPasteStart((v) => ({ ...v, r: Number(event.target.value) }))}
                  >
                    {rows.map((row, index) => (
                      <option key={row.id} value={index}>
                        {index + 1}. {row.display[columns[0].key] || row.display[columns[1]?.key] || row.id.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>시작 열</label>
                  <select
                    value={pasteStart.c}
                    onChange={(event) => setPasteStart((v) => ({ ...v, c: Number(event.target.value) }))}
                  >
                    {columns.map((column, index) =>
                      column.kind && column.kind !== "readonly" ? (
                        <option key={column.key} value={index}>
                          {column.header}
                        </option>
                      ) : null
                    )}
                  </select>
                </div>
              </div>
              <div className="field">
                <label>붙여넣기</label>
                <textarea
                  rows={10}
                  value={pasteText}
                  onChange={(event) => setPasteText(event.target.value)}
                  autoFocus
                />
              </div>
              <div className="formActions">
                <button className="secondaryButton" type="button" onClick={() => setPasteOpen(false)}>
                  취소
                </button>
                <button
                  className="primaryButton"
                  type="button"
                  disabled={!pasteText.trim() || pending}
                  onClick={() => {
                    applyPaste(pasteText, pasteStart);
                    setPasteText("");
                    setPasteOpen(false);
                  }}
                >
                  적용
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div
        className="tableWrap gridWrap"
        ref={gridRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
      >
        <table className="gridTable" style={{ width: totalWidth, minWidth: "100%" }}>
          <colgroup>
            <col style={{ width: 34 }} />
            {columns.map((column) => (
              <col key={column.key} style={{ width: widths[column.key] ?? DEFAULT_WIDTH }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="checkCell">
                <input
                  type="checkbox"
                  checked={rows.length > 0 && selected.size === rows.length}
                  onChange={toggleAll}
                />
              </th>
              {columns.map((column) => (
                <th key={column.key} className={column.numeric ? "numeric" : undefined}>
                  {column.header}
                  <span className="colResizer" onMouseDown={(event) => startResize(column.key, event)} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="emptyCell">
                  {emptyText}
                </td>
              </tr>
            ) : (
              rows.map((row, rowIndex) => (
                <tr key={row.id} style={pending && selected.has(row.id) ? { opacity: 0.75 } : undefined}>
                  <td className="checkCell">
                    <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)} />
                  </td>
                  {columns.map((column, colIndex) => {
                    const cell = valueOf(row, column);
                    const isActive = active?.r === rowIndex && active?.c === colIndex;
                    const isEditing = isActive && editing;
                    const canEditCell = Boolean(column.kind && column.kind !== "readonly");
                    const isFailed = failed[row.id]?.has(column.key);

                    const classes = [
                      column.numeric ? "numeric" : "",
                      isActive ? "cellActive" : "",
                      canEditCell ? "cellEditable" : "",
                      isFailed ? "cellFailed" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");

                    if (isEditing) {
                      return (
                        <td key={column.key} className={classes}>
                          {column.kind === "select" ? (
                            <select
                              autoFocus
                              defaultValue={cell.raw}
                              onBlur={(event) => save(row, column, event.target.value)}
                              onChange={(event) => save(row, column, event.target.value)}
                              className="cellInput"
                            >
                              <option value="">—</option>
                              {(column.options ?? []).map(([value, display]) => (
                                <option key={value} value={value}>
                                  {display}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              autoFocus
                              type={column.kind === "date" ? "date" : "text"}
                              inputMode={column.kind === "number" ? "numeric" : undefined}
                              defaultValue={cell.raw}
                              className="cellInput"
                              onBlur={(event) => save(row, column, event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  save(row, column, event.currentTarget.value);
                                  move(1, 0);
                                  gridRef.current?.focus();
                                }
                                if (event.key === "Tab") {
                                  event.preventDefault();
                                  save(row, column, event.currentTarget.value);
                                  move(0, event.shiftKey ? -1 : 1);
                                  gridRef.current?.focus();
                                }
                                if (event.key === "Escape") {
                                  setEditing(false);
                                  gridRef.current?.focus();
                                }
                              }}
                            />
                          )}
                        </td>
                      );
                    }

                    return (
                      <td
                        key={column.key}
                        className={classes}
                        onMouseDown={() => {
                          setActive({ r: rowIndex, c: colIndex });
                          setEditing(false);
                          gridRef.current?.focus();
                        }}
                        onDoubleClick={() => {
                          if (canEditCell) setEditing(true);
                        }}
                      >
                        {row.href && row.linkKey === column.key ? (
                          <Link className="tableLink" href={row.href}>
                            {cell.display || "–"}
                          </Link>
                        ) : (
                          <span
                            className={cell.display ? undefined : "faintText"}
                            style={row.emphasis?.includes(column.key) ? { fontWeight: 700 } : undefined}
                          >
                            {cell.display || "–"}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
