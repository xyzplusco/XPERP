import Link from "next/link";
import { notFound } from "next/navigation";
import { SaveNotice } from "@/components/SaveNotice";
import {
  addTaskCommentAction,
  deleteTaskCommentAction,
  deleteTicketAction,
  updateTicketDetailAction,
} from "@/lib/actions";
import { getAssignablePeople, getProjectOptions, getTicket } from "@/lib/queries";
import { formatDate, formatDateTime, label } from "@/lib/labels";
import { shortId } from "@/lib/ids";

export const dynamic = "force-dynamic";

const STATUS = [
  ["backlog", "대기"],
  ["in_progress", "진행 중"],
  ["waiting", "회신 대기"],
  ["blocked", "보류"],
  ["done", "완료"],
  ["dropped", "중단"],
];

const PRIORITY = [
  ["low", "낮음"],
  ["normal", "보통"],
  ["high", "높음"],
  ["urgent", "긴급"],
];

export default async function TicketDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string; reason?: string }>;
}) {
  const { id } = await params;
  const { saved, error, reason } = await searchParams;

  const [data, assignables, projects] = await Promise.all([
    getTicket(id),
    getAssignablePeople(),
    getProjectOptions(),
  ]);
  if (!data) notFound();

  const { task, comments, meetingNotes } = data;
  const updateAction = updateTicketDetailAction.bind(null, id);

  return (
    <>
      <div className="detailHeader">
        <div className="detailKicker">
          <Link href="/tickets">티켓</Link> / {shortId("T", id)}
        </div>
        <div className="detailTitleRow">
          <h1>{String(task.title ?? "")}</h1>
          <span className="detailBadge">{label(String(task.status ?? ""))}</span>
        </div>
        <div className="detailSub">
          {[
            task.assignee?.name_ko ? `담당 ${task.assignee.name_ko}` : "담당자 미지정",
            task.project?.name,
            task.company?.name_ko,
            task.due_date ? `기한 ${formatDate(String(task.due_date))}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </div>

      <SaveNotice saved={saved} error={error} reason={reason} />

      <div className="panel">
        <div className="panelHeader">
          <div className="panelTitle">티켓 정보</div>
          <form action={deleteTicketAction.bind(null, id, "/tickets")}>
            <button className="dangerButton" type="submit">
              휴지통으로
            </button>
          </form>
        </div>
        <div className="panelBody">
          <form action={updateAction} className="formGrid">
            <div className="field full">
              <label>내용</label>
              <input name="title" defaultValue={String(task.title ?? "")} required />
            </div>
            <div className="field full">
              <label>설명</label>
              <textarea name="description" rows={4} defaultValue={String(task.description ?? "")} />
            </div>
            <div className="field">
              <label>담당자</label>
              <select name="assignee_person_id" defaultValue={task.assignee?.id ?? ""}>
                <option value="">미지정</option>
                {assignables.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name_ko}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>프로젝트</label>
              <select name="project_id" defaultValue={task.project?.id ?? ""}>
                <option value="">미분류</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.company ? `${project.name} · ${project.company}` : project.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>상태</label>
              <select name="status" defaultValue={String(task.status ?? "backlog")}>
                {STATUS.map(([value, display]) => (
                  <option key={value} value={value}>
                    {display}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>우선순위</label>
              <select name="priority" defaultValue={String(task.priority ?? "normal")}>
                {PRIORITY.map(([value, display]) => (
                  <option key={value} value={value}>
                    {display}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>기한</label>
              <input type="date" name="due_date" defaultValue={String(task.due_date ?? "")} />
            </div>
            <div className="field">
              <label>등록</label>
              <div className="kvValue">
                {formatDate(String(task.created_at ?? ""))}
                {task.creator?.email ? ` · ${task.creator.email}` : ""}
              </div>
            </div>
            <div className="formActions full">
              <button className="primaryButton" type="submit">
                저장
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="panel">
        <div className="panelHeader">
          <div className="panelTitle">댓글</div>
          <div className="panelMeta">{comments.length}</div>
        </div>

        {comments.length > 0 ? (
          <div>
            {comments.map((comment) => (
              <div key={comment.id} className="inboxItem">
                <div className="inboxMain">
                  <div className="inboxTitle">{comment.author ?? "알 수 없음"}</div>
                  <div className="inboxBody">{comment.body}</div>
                </div>
                <div className="inboxTime">{formatDateTime(comment.created_at)}</div>
                <form action={deleteTaskCommentAction.bind(null, comment.id, id)}>
                  <button className="smallButton" type="submit">
                    삭제
                  </button>
                </form>
              </div>
            ))}
          </div>
        ) : null}

        <div className="panelBody" style={{ borderTop: comments.length > 0 ? "1px solid var(--line)" : undefined }}>
          <form action={addTaskCommentAction.bind(null, id)} className="formGrid">
            <div className="field full">
              <textarea name="body" rows={3} required placeholder="" />
            </div>
            <div className="formActions full">
              <button className="primaryButton" type="submit">
                댓글 등록
              </button>
            </div>
          </form>
        </div>
      </div>

      {task.project ? (
        <div className="panel">
          <div className="panelHeader">
            <div className="panelTitle">회의록</div>
            <div className="panelMeta">{task.project.name}</div>
          </div>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: "22%" }}>일자</th>
                  <th>제목</th>
                </tr>
              </thead>
              <tbody>
                {meetingNotes.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="emptyCell">
                      회의록이 없습니다.
                    </td>
                  </tr>
                ) : (
                  meetingNotes.map((note) => (
                    <tr key={note.id}>
                      <td className="mutedText">{formatDate(note.meeting_date)}</td>
                      <td>
                        <Link className="tableLink" href={`/projects/${task.project!.id}`}>
                          {note.title}
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </>
  );
}
