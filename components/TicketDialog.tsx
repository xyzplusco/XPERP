"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createTicketAction, getTicketOptionsAction } from "@/lib/actions";

type Assignable = { id: string; name_ko: string; hint: string };
type ProjectOption = { id: string; name: string; company: string | null; folder: string | null };

// 담당자·프로젝트 목록은 티켓 창을 처음 열 때만 가져온다.
// 사이드바에 있다는 이유로 모든 페이지에서 미리 조회하면 전 페이지가 그만큼 느려진다.
export function TicketDialog() {
  const [assignables, setAssignables] = useState<Assignable[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [assignee, setAssignee] = useState("");
  const [projectQuery, setProjectQuery] = useState("");
  const [projectId, setProjectId] = useState("");
  const pathname = usePathname();
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    titleRef.current?.focus();
    if (loaded) return;
    let alive = true;
    void getTicketOptionsAction().then((data) => {
      if (!alive) return;
      setAssignables(data.assignables);
      setProjects(data.projects);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [open, loaded]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filtered = projectQuery
    ? projects
        .filter((p) =>
          `${p.name} ${p.company ?? ""} ${p.folder ?? ""}`.toLowerCase().includes(projectQuery.toLowerCase())
        )
        .slice(0, 8)
    : [];

  const selectedProject = projects.find((p) => p.id === projectId);

  return (
    <>
      <button className="ticketButton" type="button" onClick={() => setOpen(true)}>
        티켓 생성
      </button>

      {open ? (
        <div className="modalBackdrop" onClick={() => setOpen(false)}>
          <div className="modalCard" onClick={(event) => event.stopPropagation()}>
            <div className="modalHeader">
              <span>새 티켓</span>
              <button className="smallButton" type="button" onClick={() => setOpen(false)}>
                닫기
              </button>
            </div>

            <form action={createTicketAction} className="modalBody">
              <input type="hidden" name="return_path" value={pathname} />
              <input type="hidden" name="assignee_person_id" value={assignee} />
              <input type="hidden" name="project_id" value={projectId} />

              <div className="field">
                <label>내용</label>
                <input
                  ref={titleRef}
                  name="title"
                  required
                  autoComplete="off"
                  placeholder="무엇을 해야 하는지 한 줄로"
                />
              </div>

              <div className="field">
                <label>담당자 {assignee ? "" : <span className="faintText">— 미지정</span>}</label>
                <div className="chipRow">
                  {assignables.map((person) => (
                    <button
                      key={person.id}
                      type="button"
                      className={assignee === person.id ? "chip chipOn" : "chip"}
                      onClick={() => setAssignee(assignee === person.id ? "" : person.id)}
                    >
                      {person.name_ko}
                    </button>
                  ))}
                  {loaded && assignables.length === 0 ? <span className="faintText">없음</span> : null}
                </div>
              </div>

              <div className="field">
                <label>
                  프로젝트{" "}
                  {selectedProject ? (
                    <button type="button" className="linkButton" onClick={() => { setProjectId(""); setProjectQuery(""); }}>
                      {selectedProject.name} · 해제
                    </button>
                  ) : (
                    <span className="faintText">— 미분류로 저장</span>
                  )}
                </label>
                {!selectedProject ? (
                  <>
                    <input
                      value={projectQuery}
                      onChange={(event) => setProjectQuery(event.target.value)}
                      placeholder="프로젝트명 또는 고객사로 검색 (비워두면 미분류)"
                      autoComplete="off"
                    />
                    {filtered.length > 0 ? (
                      <div className="suggestList">
                        {filtered.map((project) => (
                          <button
                            key={project.id}
                            type="button"
                            className="suggestItem"
                            onClick={() => {
                              setProjectId(project.id);
                              setProjectQuery("");
                            }}
                          >
                            <strong>{project.name}</strong>
                            <span className="faintText">
                              {[project.company, project.folder].filter(Boolean).join(" · ")}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>

              <div className="modalRow">
                <div className="field">
                  <label>기한</label>
                  <input type="date" name="due_date" />
                </div>
                <div className="field">
                  <label>우선순위</label>
                  <select name="priority" defaultValue="normal">
                    <option value="low">낮음</option>
                    <option value="normal">보통</option>
                    <option value="high">높음</option>
                    <option value="urgent">긴급</option>
                  </select>
                </div>
              </div>

              <div className="formActions">
                <button className="secondaryButton" type="button" onClick={() => setOpen(false)}>
                  취소
                </button>
                <button className="primaryButton" type="submit">
                  생성
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
