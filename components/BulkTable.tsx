"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { bulkTrashAction, bulkUpdateAction, inlineUpdateAction } from "@/lib/actions";

export type ColumnDef = {
  key: string;
  header: string;
  width?: string;
  // readonly = 표시만, 나머지는 셀 클릭 시 인라인 수정
  kind?: "readonly" | "text" | "select" | "date" | "number";
  options?: [string, string][];
  numeric?: boolean;
};

export type BulkRow = {
  id: string;
  // 표시값
  display: Record<string, string>;
  // 수정 시 초기값 (DB 저장값)
  raw?: Record<string, string>;
  href?: string;
  linkKey?: string;
  // 굵게 표시할 열 (부하 경고 등). 아이콘·색 없이 굵기로만 강조한다.
  emphasis?: string[];
};

export type BulkAction = {
  field: string;
  label: string;
  options: [string, string][];
};

export function BulkTable({
  entity,
  columns,
  rows,
  bulkActions = [],
  returnPath,
  emptyText = "표시할 항목이 없습니다.",
}: {
  entity: string;
  columns: ColumnDef[];
  rows: BulkRow[];
  bulkActions?: BulkAction[];
  returnPath: string;
  emptyText?: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ id: string; key: string } | null>(null);
  const [flash, setFlash] = useState<{ id: string; key: string; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [activeBulk, setActiveBulk] = useState(bulkActions[0]?.field ?? "");

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const toggleAll = () =>
    setSelected(selected.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)));

  const save = (row: BulkRow, column: ColumnDef, value: string) => {
    setEditing(null);
    const before = row.raw?.[column.key] ?? row.display[column.key] ?? "";
    if (value === before) return;
    startTransition(async () => {
      const result = await inlineUpdateAction(entity, row.id, column.key, value, returnPath);
      setFlash({ id: row.id, key: column.key, text: result.ok ? "저장됨" : result.message });
      setTimeout(() => setFlash(null), 2500);
    });
  };

  const selectedRows = rows.filter((r) => selected.has(r.id));
  const currentAction = bulkActions.find((a) => a.field === activeBulk);

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
              <select
                name="field"
                value={activeBulk}
                onChange={(event) => setActiveBulk(event.target.value)}
              >
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

      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th className="checkCell" style={{ width: 34 }}>
                <input
                  type="checkbox"
                  checked={rows.length > 0 && selected.size === rows.length}
                  onChange={toggleAll}
                />
              </th>
              {columns.map((column) => (
                <th
                  key={column.key}
                  style={column.width ? { width: column.width } : undefined}
                  className={column.numeric ? "numeric" : undefined}
                >
                  {column.header}
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
              rows.map((row) => (
                <tr key={row.id} style={pending && selected.has(row.id) ? { opacity: 0.7 } : undefined}>
                  <td className="checkCell">
                    <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)} />
                  </td>
                  {columns.map((column) => {
                    const isEditing = editing?.id === row.id && editing.key === column.key;
                    const flashing = flash?.id === row.id && flash.key === column.key;
                    const value = row.raw?.[column.key] ?? "";
                    const shown = row.display[column.key] ?? "";

                    if (isEditing && column.kind && column.kind !== "readonly") {
                      return (
                        <td key={column.key}>
                          {column.kind === "select" ? (
                            <select
                              autoFocus
                              defaultValue={value}
                              onBlur={(event) => save(row, column, event.target.value)}
                              onChange={(event) => save(row, column, event.target.value)}
                              className="cellInput"
                            >
                              <option value="">—</option>
                              {(column.options ?? []).map(([v, d]) => (
                                <option key={v} value={v}>
                                  {d}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              autoFocus
                              type={column.kind === "date" ? "date" : "text"}
                              inputMode={column.kind === "number" ? "numeric" : undefined}
                              defaultValue={value}
                              className="cellInput"
                              onBlur={(event) => save(row, column, event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") save(row, column, event.currentTarget.value);
                                if (event.key === "Escape") setEditing(null);
                              }}
                            />
                          )}
                        </td>
                      );
                    }

                    return (
                      <td
                        key={column.key}
                        className={column.numeric ? "numeric" : undefined}
                        onDoubleClick={() =>
                          column.kind && column.kind !== "readonly"
                            ? setEditing({ id: row.id, key: column.key })
                            : undefined
                        }
                        title={column.kind && column.kind !== "readonly" ? "더블클릭하면 수정" : undefined}
                        style={
                          column.kind && column.kind !== "readonly" ? { cursor: "cell" } : undefined
                        }
                      >
                        {row.href && row.linkKey === column.key ? (
                          <Link className="tableLink" href={row.href}>
                            {shown || "–"}
                          </Link>
                        ) : (
                          <span
                            className={shown ? undefined : "faintText"}
                            style={row.emphasis?.includes(column.key) ? { fontWeight: 700 } : undefined}
                          >
                            {shown || "–"}
                          </span>
                        )}
                        {flashing ? <span className="cellFlash">{flash.text}</span> : null}
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
