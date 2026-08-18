"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteTicketAction, updateTicketAction } from "@/lib/actions";
import type { Ticket } from "@/lib/queries";

type Assignable = { id: string; name_ko: string; hint: string };
type ProjectOption = { id: string; name: string; company: string | null; folder: string | null };

const STATUS = [
  ["backlog", "대기"],
  ["in_progress", "진행 중"],
  ["waiting", "회신 대기"],
  ["blocked", "보류"],
  ["done", "완료"],
  ["dropped", "중단"],
];

export function TicketTable({
  tickets,
  assignables,
  projects,
  returnPath,
}: {
  tickets: Ticket[];
  assignables: Assignable[];
  projects: ProjectOption[];
  returnPath: string;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = (ticketId: string, field: string, value: string) => {
    const formData = new FormData();
    formData.set(field, value);
    formData.set("return_path", returnPath);
    startTransition(() => {
      void updateTicketAction(ticketId, formData);
    });
  };

  const filtered = query
    ? projects
        .filter((p) => `${p.name} ${p.company ?? ""}`.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 6)
    : [];

  return (
    <div className="tableWrap">
      <table>
        <thead>
          <tr>
            <th style={{ width: "34%" }}>내용</th>
            <th style={{ width: "12%" }}>담당자</th>
            <th style={{ width: "20%" }}>프로젝트</th>
            <th style={{ width: "10%" }}>상태</th>
            <th style={{ width: "10%" }}>기한</th>
            <th style={{ width: "8%" }}>등록</th>
            <th style={{ width: "6%" }} />
          </tr>
        </thead>
        <tbody>
          {tickets.length === 0 ? (
            <tr>
              <td colSpan={7} className="emptyCell">
                티켓이 없습니다.
              </td>
            </tr>
          ) : (
            tickets.map((ticket) => (
              <tr key={ticket.id} style={pending ? { opacity: 0.7 } : undefined}>
                <td>{ticket.title}</td>

                <td>
                  <select
                    value={ticket.assignee?.id ?? ""}
                    onChange={(event) => submit(ticket.id, "assignee_person_id", event.target.value)}
                    style={{ width: "100%", fontFamily: "inherit", fontSize: 12.5, padding: "3px 4px" }}
                  >
                    <option value="">미지정</option>
                    {assignables.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name_ko}
                      </option>
                    ))}
                    {ticket.assignee && !assignables.some((a) => a.id === ticket.assignee?.id) ? (
                      <option value={ticket.assignee.id}>{ticket.assignee.name_ko}</option>
                    ) : null}
                  </select>
                </td>

                <td>
                  {ticket.project ? (
                    <>
                      <Link className="tableLink" href={`/projects/${ticket.project.id}`}>
                        {ticket.project.name}
                      </Link>{" "}
                      <button
                        type="button"
                        className="linkButton"
                        onClick={() => submit(ticket.id, "project_id", "")}
                      >
                        해제
                      </button>
                    </>
                  ) : editing === ticket.id ? (
                    <div>
                      <input
                        autoFocus
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        onBlur={() => setTimeout(() => { setEditing(null); setQuery(""); }, 200)}
                        placeholder="프로젝트 검색"
                        style={{ width: "100%", fontSize: 12.5, padding: "3px 5px" }}
                      />
                      {filtered.length > 0 ? (
                        <div className="suggestList">
                          {filtered.map((project) => (
                            <button
                              key={project.id}
                              type="button"
                              className="suggestItem"
                              onMouseDown={() => {
                                submit(ticket.id, "project_id", project.id);
                                setEditing(null);
                                setQuery("");
                              }}
                            >
                              <strong>{project.name}</strong>
                              <span className="faintText">{project.company ?? ""}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <button type="button" className="smallButton" onClick={() => setEditing(ticket.id)}>
                      프로젝트에 넣기
                    </button>
                  )}
                </td>

                <td>
                  <select
                    value={ticket.status}
                    onChange={(event) => submit(ticket.id, "status", event.target.value)}
                    style={{ width: "100%", fontFamily: "inherit", fontSize: 12.5, padding: "3px 4px" }}
                  >
                    {STATUS.map(([value, display]) => (
                      <option key={value} value={value}>
                        {display}
                      </option>
                    ))}
                  </select>
                </td>

                <td>
                  <input
                    type="date"
                    defaultValue={ticket.due_date ?? ""}
                    onChange={(event) => submit(ticket.id, "due_date", event.target.value)}
                    style={{ fontSize: 12.5, padding: "2px 4px", width: "100%" }}
                  />
                </td>

                <td className="mutedText">{ticket.created_at.slice(2, 10)}</td>

                <td>
                  <form action={deleteTicketAction.bind(null, ticket.id, returnPath)}>
                    <button className="smallButton" type="submit">
                      삭제
                    </button>
                  </form>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
