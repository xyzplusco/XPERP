import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentsPanel } from "@/components/DocumentsPanel";
import { SaveNotice } from "@/components/SaveNotice";
import { addProjectUpdateAction, addTaskAction, updateProjectAction } from "@/lib/actions";
import { canEditProject, getSessionUser, isAdmin } from "@/lib/auth";
import { MeetingNotesPanel } from "@/components/MeetingNotesPanel";
import { getFolders, getPeopleNames, getProject, getProjectMeetingNotes } from "@/lib/queries";
import {
  formatAmount,
  formatDate,
  label,
  PROJECT_STATUS_OPTIONS,
  PROJECT_TYPE_OPTIONS,
} from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { id } = await params;
  const { saved, error } = await searchParams;
  const [user, data, meetingNotes] = await Promise.all([
    getSessionUser(),
    getProject(id),
    getProjectMeetingNotes(id),
  ]);
  if (!data) notFound();

  const { project, members, updates, tasks, documentRequirements, documents } = data;
  const admin = isAdmin(user);
  const editable = canEditProject(user, {
    primary_pl_person_id: project.primary_pl_person_id as string | null,
    secondary_pl_person_id: project.secondary_pl_person_id as string | null,
    candidate_pm_person_id: project.candidate_pm_person_id as string | null,
    memberPersonIds: members.map((m) => m.person?.id ?? "").filter(Boolean),
  });

  const [peopleNames, folders] = await Promise.all([
    admin ? getPeopleNames() : Promise.resolve([]),
    admin ? getFolders() : Promise.resolve([]),
  ]);
  const updateAction = updateProjectAction.bind(null, id);
  const addUpdate = addProjectUpdateAction.bind(null, id);
  const addTask = addTaskAction.bind(null, id);

  const company = project.company as { id: string; name_ko: string } | null;
  const pl = project.pl as { id: string; name_ko: string } | null;
  const pl2 = project.pl2 as { id: string; name_ko: string } | null;
  const pm = project.pm as { id: string; name_ko: string } | null;
  const folderName = folders.find((item) => item.id === project.folder_id)?.name ?? null;

  return (
    <>
      <div className="detailHeader">
        <div className="detailKicker">
          <Link href="/projects">프로젝트</Link> / D-{id.replace(/-/g, "").slice(0, 8).toUpperCase()}
        </div>
        <div className="detailTitleRow">
          <h1>{String(project.name ?? "")}</h1>
          <span className="detailBadge">{label(String(project.status ?? ""))}</span>
        </div>
        <div className="detailSub">
          {[
            company ? company.name_ko : null,
            label(String(project.project_type ?? "")),
            project.contract_status ? `계약: ${label(String(project.contract_status))}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </div>

      <SaveNotice saved={saved} error={error} />

      <div className="panel">
        <div className="panelHeader">
          <div className="panelTitle">개요</div>
        </div>
        <div className="panelBody">
          <div className="kvGrid">
            <div className="kvItem">
              <div className="kvLabel">폴더</div>
              <div className="kvValue">{folderName ?? "Unsorted"}</div>
            </div>
            <div className="kvItem">
              <div className="kvLabel">고객사</div>
              <div className="kvValue">
                {company ? <Link href={`/customers/${company.id}`}>{company.name_ko}</Link> : "–"}
              </div>
            </div>
            <div className="kvItem">
              <div className="kvLabel">PL</div>
              <div className="kvValue">
                {pl ? <Link href={`/partners/${pl.id}`}>{pl.name_ko}</Link> : "미지정"}
                {pl2 ? (
                  <>
                    {" · "}
                    <Link href={`/partners/${pl2.id}`}>{pl2.name_ko}</Link>
                  </>
                ) : null}
              </div>
            </div>
            <div className="kvItem">
              <div className="kvLabel">PM</div>
              <div className="kvValue">{pm ? <Link href={`/partners/${pm.id}`}>{pm.name_ko}</Link> : "미지정"}</div>
            </div>
            <div className="kvItem">
              <div className="kvLabel">계약 기간</div>
              <div className="kvValue">
                {formatDate(project.start_date as string | null)} ~ {formatDate(project.end_date as string | null)}
              </div>
            </div>
            <div className="kvItem">
              <div className="kvLabel">예상 매출</div>
              <div className="kvValue">{formatAmount(project.expected_revenue as number | null)}</div>
            </div>
            <div className="kvItem">
              <div className="kvLabel">고객 니즈</div>
              <div className="kvValue">{String(project.client_need ?? "") || "–"}</div>
            </div>
            <div className="kvItem">
              <div className="kvLabel">XP 요청 사항</div>
              <div className="kvValue">{String(project.xp_request ?? "") || "–"}</div>
            </div>
            <div className="kvItem">
              <div className="kvLabel">요약</div>
              <div className="kvValue">{String(project.summary ?? "") || "–"}</div>
            </div>
            <div className="kvItem">
              <div className="kvLabel">다음 액션</div>
              <div className="kvValue">{String(project.next_action ?? "") || "–"}</div>
            </div>
            <div className="kvItem">
              <div className="kvLabel">최근 업데이트</div>
              <div className="kvValue">{String(project.latest_update ?? "") || "–"}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="twoColumn">
        <div className="panel">
          <div className="panelHeader">
            <div className="panelTitle">진행 업데이트</div>
            <div className="panelMeta">{updates.length}건</div>
          </div>
          <div className="updateList">
            {updates.length === 0 ? (
              <div className="updateItem">
                <span className="faintText">기록된 업데이트가 없습니다.</span>
              </div>
            ) : (
              updates.slice(0, 20).map((update) => (
                <div className="updateItem" key={String(update.id)}>
                  <div className="updateDate">{formatDate(update.update_date ?? update.update_label)}</div>
                  <div className="updateBody">{update.body}</div>
                </div>
              ))
            )}
          </div>
          {editable ? (
            <div className="panelBody" style={{ borderTop: "1px solid var(--line)" }}>
              <form action={addUpdate} className="inlineForm">
                <div className="field" style={{ flex: 1 }}>
                  <label>새 업데이트</label>
                  <textarea name="body" required rows={2} />
                </div>
                <button className="primaryButton" type="submit">
                  기록
                </button>
              </form>
            </div>
          ) : null}
        </div>

        <div className="panel">
          <div className="panelHeader">
            <div className="panelTitle">액션</div>
            <div className="panelMeta">{tasks.length}건</div>
          </div>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>액션</th>
                  <th>상태</th>
                  <th>기한</th>
                </tr>
              </thead>
              <tbody>
                {tasks.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="emptyCell">
                      등록된 액션이 없습니다.
                    </td>
                  </tr>
                ) : (
                  tasks.map((task) => (
                    <tr key={String(task.id)}>
                      <td>{task.title}</td>
                      <td>{label(task.status)}</td>
                      <td className="mutedText">{formatDate(task.due_date)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {editable ? (
            <div className="panelBody" style={{ borderTop: "1px solid var(--line)" }}>
              <form action={addTask} className="inlineForm">
                <div className="field" style={{ flex: 1 }}>
                  <label>새 액션</label>
                  <input name="title" required />
                </div>
                <div className="field">
                  <label>기한</label>
                  <input name="due_date" type="date" />
                </div>
                <button className="primaryButton" type="submit">
                  추가
                </button>
              </form>
            </div>
          ) : null}
        </div>
      </div>

      <div className="panel">
        <div className="panelHeader">
          <div className="panelTitle">참여 구성원</div>
        </div>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>이름</th>
                <th>역할</th>
                <th>직함</th>
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <tr>
                  <td colSpan={3} className="emptyCell">
                    등록된 구성원이 없습니다.
                  </td>
                </tr>
              ) : (
                members.map((member) => (
                  <tr key={member.id}>
                    <td>
                      {member.person ? (
                        <Link className="tableLink" href={`/partners/${member.person.id}`}>
                          {member.person.name_ko}
                        </Link>
                      ) : (
                        "–"
                      )}
                    </td>
                    <td>{label(member.project_role)}</td>
                    <td>{member.person?.title ?? "–"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <div className="panelHeader">
          <div className="panelTitle">필요 문서</div>
        </div>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>문서</th>
                <th>종류</th>
                <th>상태</th>
                <th>기한</th>
              </tr>
            </thead>
            <tbody>
              {documentRequirements.length === 0 ? (
                <tr>
                  <td colSpan={4} className="emptyCell">
                    등록된 필요 문서가 없습니다.
                  </td>
                </tr>
              ) : (
                documentRequirements.map((req) => (
                  <tr key={String(req.id)}>
                    <td>{req.title}</td>
                    <td>{req.requirement_type}</td>
                    <td>{label(req.status)}</td>
                    <td className="mutedText">{formatDate(req.required_by ?? req.expires_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <MeetingNotesPanel
        companyId={company?.id}
        projectId={id}
        returnPath={`/projects/${id}`}
        notes={meetingNotes}
        user={user}
      />

      <DocumentsPanel
        entityType="project"
        entityId={id}
        returnPath={`/projects/${id}`}
        documents={documents}
        requirements={documentRequirements as { id: string; requirement_type: string | null; title: string | null; status: string | null }[]}
        title="보관 문서"
      />

      {editable ? (
        <div className="panel">
          <div className="panelHeader">
            <div className="panelTitle">프로젝트 수정</div>
            <div className="panelMeta">{admin ? "관리자" : "담당 PL/PM"}</div>
          </div>
          <div className="panelBody">
            <form action={updateAction} className="formGrid">
              <div className="field">
                <label>상태</label>
                <select name="status" defaultValue={String(project.status ?? "discussing")}>
                  {PROJECT_STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {label(option)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>계약 상태</label>
                <input name="contract_status" defaultValue={String(project.contract_status ?? "")} />
              </div>
              {admin ? (
                <div className="field">
                  <label>폴더</label>
                  <select name="folder_id" defaultValue={String(project.folder_id ?? "")}>
                    <option value="">Unsorted</option>
                    {folders.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              {admin ? (
                <div className="field">
                  <label>유형</label>
                  <select name="project_type" defaultValue={String(project.project_type ?? "unknown")}>
                    {PROJECT_TYPE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {label(option)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className="field">
                <label>예상 매출</label>
                <input name="expected_revenue" defaultValue={project.expected_revenue == null ? "" : String(project.expected_revenue)} />
              </div>
              <div className="field">
                <label>시작일</label>
                <input name="start_date" type="date" defaultValue={String(project.start_date ?? "")} />
              </div>
              <div className="field">
                <label>종료일 (계약 만료)</label>
                <input name="end_date" type="date" defaultValue={String(project.end_date ?? "")} />
              </div>
              {admin ? (
                <>
                  <div className="field">
                    <label>PL (이름)</label>
                    <input name="pl_name" defaultValue={pl?.name_ko ?? ""} list="people-names" />
                  </div>
                  <div className="field">
                    <label>PM (이름)</label>
                    <input name="pm_name" defaultValue={pm?.name_ko ?? ""} list="people-names" />
                  </div>
                  <datalist id="people-names">
                    {peopleNames.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </>
              ) : null}
              <div className="field full">
                <label>요약</label>
                <textarea name="summary" defaultValue={String(project.summary ?? "")} />
              </div>
              <div className="field full">
                <label>다음 액션</label>
                <input name="next_action" defaultValue={String(project.next_action ?? "")} />
              </div>
              <div className="formActions full">
                <button className="primaryButton" type="submit">
                  저장
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
