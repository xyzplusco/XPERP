import Link from "next/link";
import { notFound } from "next/navigation";
import { SaveNotice } from "@/components/SaveNotice";
import {
  addActionItemAction,
  deleteMeetingAction,
  dismissActionItemAction,
  promoteActionItemAction,
} from "@/lib/actions";
import { canWrite, getSessionUser, isAdmin } from "@/lib/auth";
import { getMeeting, getPeopleNames } from "@/lib/queries";
import { formatDate } from "@/lib/labels";

export const dynamic = "force-dynamic";

const AI_LABEL: Record<string, string> = {
  none: "녹음 없음",
  pending: "분석 대기",
  processing: "분석 중",
  done: "분석 완료",
  failed: "분석 실패",
};

export default async function MeetingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string; reason?: string }>;
}) {
  const { id } = await params;
  const { saved, error, reason } = await searchParams;
  const [user, data, peopleNames] = await Promise.all([getSessionUser(), getMeeting(id), getPeopleNames()]);
  if (!data) notFound();

  const { note, items } = data;
  const open = items.filter((i) => !i.task_id && !i.dismissed_at);
  const done = items.filter((i) => i.task_id || i.dismissed_at);

  return (
    <>
      <div className="detailHeader">
        <div className="detailKicker">
          <Link href="/meetings">회의록</Link> / {formatDate(String(note.meeting_date ?? ""))}
        </div>
        <div className="detailTitleRow">
          <h1>{String(note.title ?? "")}</h1>
          <span className="detailBadge">{AI_LABEL[String(note.ai_status ?? "none")]}</span>
        </div>
        <div className="detailSub">
          {[note.project?.name, note.company?.name_ko, note.attendees]
            .filter(Boolean)
            .join(" · ") || "연결 없음"}
        </div>
      </div>

      <SaveNotice saved={saved} error={error} reason={reason} />

      <div className="panel">
        <div className="panelHeader">
          <div className="panelTitle">원본</div>
          {isAdmin(user) ? (
            <form action={deleteMeetingAction.bind(null, id)}>
              <button className="dangerButton" type="submit">
                삭제
              </button>
            </form>
          ) : null}
        </div>
        <div className="panelBody">
          {note.audioUrl ? (
            <audio controls src={note.audioUrl} style={{ width: "100%", marginBottom: 12 }} />
          ) : null}
          <div className="kvGrid">
            <div className="kvItem">
              <div className="kvLabel">파일</div>
              <div className="kvValue">
                {note.url || note.audioUrl ? (
                  <a href={(note.audioUrl ?? note.url) as string} target="_blank" rel="noreferrer">
                    {String(note.file_name ?? "열기")}
                  </a>
                ) : (
                  "–"
                )}
              </div>
            </div>
            <div className="kvItem">
              <div className="kvLabel">메모</div>
              <div className="kvValue">{String(note.summary ?? "") || "–"}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panelHeader">
          <div className="panelTitle">요약</div>
          <div className="panelMeta">{AI_LABEL[String(note.ai_status ?? "none")]}</div>
        </div>
        <div className="panelBody">
          {note.ai_summary ? (
            <div className="reviewText">{String(note.ai_summary)}</div>
          ) : String(note.ai_status) === "pending" ? (
            <span className="faintText">녹음이 등록됐습니다. 분석기가 연결되면 여기에 요약이 채워집니다.</span>
          ) : String(note.ai_status) === "failed" ? (
            <span className="notice noticeError">{String(note.ai_error ?? "분석에 실패했습니다.")}</span>
          ) : (
            <span className="faintText">–</span>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panelHeader">
          <div className="panelTitle">액션 아이템</div>
          <div className="panelMeta">{open.length > 0 ? `미처리 ${open.length}` : ""}</div>
        </div>

        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>내용</th>
                <th style={{ width: "12%" }}>담당</th>
                <th style={{ width: "12%" }}>기한</th>
                <th style={{ width: "10%" }}>출처</th>
                <th style={{ width: "20%" }} />
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="emptyCell">
                    액션 아이템이 없습니다.
                  </td>
                </tr>
              ) : (
                [...open, ...done].map((item) => (
                  <tr key={item.id} style={item.dismissed_at ? { opacity: 0.5 } : undefined}>
                    <td>{item.body}</td>
                    <td>{item.assignee?.name_ko ?? <span className="faintText">–</span>}</td>
                    <td className="mutedText">{formatDate(item.due_date)}</td>
                    <td>{item.origin === "ai" ? "자동" : "직접"}</td>
                    <td>
                      {item.task_id ? (
                        <Link className="tableLink" href={`/tasks/${item.task_id}`}>
                          과제로 등록됨
                        </Link>
                      ) : item.dismissed_at ? (
                        <span className="faintText">보류</span>
                      ) : canWrite(user) ? (
                        <div style={{ display: "flex", gap: 6 }}>
                          <form action={promoteActionItemAction.bind(null, item.id, id)}>
                            <button className="smallButton" type="submit">
                              과제로 만들기
                            </button>
                          </form>
                          <form action={dismissActionItemAction.bind(null, item.id, id)}>
                            <button className="smallButton" type="submit">
                              보류
                            </button>
                          </form>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {canWrite(user) ? (
          <div className="panelBody" style={{ borderTop: "1px solid var(--line)" }}>
            <form action={addActionItemAction.bind(null, id)} className="inlineForm">
              <div className="field" style={{ flex: 2 }}>
                <label>내용</label>
                <input name="body" required autoComplete="off" />
              </div>
              <div className="field">
                <label>담당</label>
                <input name="assignee_name" list="meeting-people" autoComplete="off" />
                <datalist id="meeting-people">
                  {peopleNames.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>
              <div className="field">
                <label>기한</label>
                <input type="date" name="due_date" />
              </div>
              <button className="smallButton" type="submit">
                추가
              </button>
            </form>
          </div>
        ) : null}
      </div>

      {note.transcript ? (
        <div className="panel">
          <div className="panelHeader">
            <div className="panelTitle">전사문</div>
          </div>
          <div className="panelBody">
            <div className="reviewText">{String(note.transcript)}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}
