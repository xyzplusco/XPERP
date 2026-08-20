import Link from "next/link";
import { deleteMeetingNoteAction, uploadMeetingNoteAction } from "@/lib/actions";
import { formatDate, formatDateTime } from "@/lib/labels";
import type { MeetingNote } from "@/lib/queries";
import { isAdmin, type SessionUser } from "@/lib/auth";

export function MeetingNotesPanel({
  companyId,
  projectId,
  returnPath,
  notes,
  user,
  showProjectColumn = false,
}: {
  companyId?: string;
  projectId?: string;
  returnPath: string;
  notes: MeetingNote[];
  user: SessionUser | null;
  showProjectColumn?: boolean;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const canRemove = (note: MeetingNote) =>
    isAdmin(user) || (user?.appUserId != null && note.uploaded_by_user_id === user.appUserId);

  return (
    <div className="panel">
      <div className="panelHeader">
        <div className="panelTitle">회의록</div>
        <div className="panelMeta">{notes.length}건 · 회의 일자 최신순</div>
      </div>

      <div className="updateList">
        {notes.length === 0 ? (
          <div className="updateItem">
            <span className="faintText">등록된 회의록이 없습니다.</span>
          </div>
        ) : (
          notes.map((note) => (
            <div className="updateItem" key={note.id}>
              <div className="updateDate">{formatDate(note.meeting_date)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div>
                  {note.url ? (
                    <a className="tableLink" href={note.url} target="_blank" rel="noreferrer">
                      {note.title}
                    </a>
                  ) : (
                    note.title
                  )}
                  {showProjectColumn && note.project ? (
                    <>
                      {" · "}
                      <Link className="tableLink" href={`/projects/${note.project.id}`}>
                        {note.project.name}
                      </Link>
                    </>
                  ) : null}
                </div>
                {note.attendees ? <div className="mutedText">참석 {note.attendees}</div> : null}
                {note.summary ? <div className="updateBody mutedText">{note.summary}</div> : null}
                <div className="faintText" style={{ fontSize: 12 }}>
                  {note.file_name ?? "파일 없음"} · 등록 {formatDateTime(note.created_at)}
                </div>
              </div>
              {canRemove(note) ? (
                <form action={deleteMeetingNoteAction.bind(null, note.id, returnPath)}>
                  <button className="smallButton" type="submit">
                    삭제
                  </button>
                </form>
              ) : null}
            </div>
          ))
        )}
      </div>

      <div className="panelBody" style={{ borderTop: "1px solid var(--line)" }}>
        <form action={uploadMeetingNoteAction} className="inlineForm">
          {companyId ? <input type="hidden" name="company_id" value={companyId} /> : null}
          {projectId ? <input type="hidden" name="project_id" value={projectId} /> : null}
          <input type="hidden" name="return_path" value={returnPath} />
          <div className="field">
            <label>회의 일자</label>
            <input type="date" name="meeting_date" defaultValue={today} required />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 200 }}>
            <label>제목</label>
            <input type="text" name="title" placeholder="비워두면 파일명" />
          </div>
          <div className="field">
            <label>참석자</label>
            <input type="text" name="attendees" placeholder="홍길동, 김철수" />
          </div>
          <div className="field">
            <label>파일</label>
            <input type="file" name="file" required />
          </div>
          <button className="primaryButton" type="submit">
            회의록 업로드
          </button>
        </form>
      </div>
    </div>
  );
}
