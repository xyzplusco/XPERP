import Link from "next/link";
import { SaveNotice } from "@/components/SaveNotice";
import { uploadMeetingAction } from "@/lib/actions";
import { canWrite, getSessionUser } from "@/lib/auth";
import { getCompanyNames, getMeetings, getProjectOptions } from "@/lib/queries";
import { formatDate } from "@/lib/labels";

export const dynamic = "force-dynamic";

const AI_LABEL: Record<string, string> = {
  none: "",
  pending: "분석 대기",
  processing: "분석 중",
  done: "분석 완료",
  failed: "분석 실패",
};

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; saved?: string; error?: string; reason?: string }>;
}) {
  const { q, saved, error, reason } = await searchParams;
  const [user, meetings, projects, companyNames] = await Promise.all([
    getSessionUser(),
    getMeetings(q),
    getProjectOptions(),
    getCompanyNames(),
  ]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="pageHeader">
        <h1>회의록</h1>
        <div className="pageHeaderMeta">{meetings.length}건</div>
      </div>

      <SaveNotice saved={saved} error={error} reason={reason} />

      <form className="filterBar" method="get">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="제목, 참석자, 요약, 전사문"
          autoComplete="off"
          style={{ flex: "0 1 360px" }}
        />
        <button className="smallButton" type="submit">
          검색
        </button>
        {q ? (
          <Link className="smallButton" href="/meetings">
            초기화
          </Link>
        ) : null}
      </form>

      {canWrite(user) ? (
        <div className="panel">
          <div className="panelHeader">
            <div className="panelTitle">회의록 등록</div>
          </div>
          <div className="panelBody">
            <form action={uploadMeetingAction} className="formGrid">
              <div className="field">
                <label>제목</label>
                <input name="title" required placeholder="캐치웰 2차 킥오프" autoComplete="off" />
              </div>
              <div className="field">
                <label>일자</label>
                <input type="date" name="meeting_date" defaultValue={today} required />
              </div>
              <div className="field">
                <label>프로젝트</label>
                <input name="project_name" list="meeting-projects" autoComplete="off" />
                <datalist id="meeting-projects">
                  {projects.map((project) => (
                    <option key={project.id} value={project.name} />
                  ))}
                </datalist>
              </div>
              <div className="field">
                <label>고객사</label>
                <input name="company_name" list="meeting-companies" autoComplete="off" />
                <datalist id="meeting-companies">
                  {companyNames.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>
              <div className="field full">
                <label>참석자</label>
                <input name="attendees" autoComplete="off" />
              </div>
              <div className="field full">
                <label>파일 — 녹음(mp3·m4a·wav) 또는 문서</label>
                <input type="file" name="file" accept="audio/*,video/mp4,.pdf,.docx,.txt,.md" />
              </div>
              <div className="field full">
                <label>메모</label>
                <textarea name="summary" rows={2} />
              </div>
              <div className="formActions full">
                <button className="primaryButton" type="submit">
                  등록
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <div className="panel">
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: "12%" }}>일자</th>
                <th style={{ width: "26%" }}>제목</th>
                <th style={{ width: "18%" }}>연결</th>
                <th style={{ width: "18%" }}>참석자</th>
                <th style={{ width: "10%" }}>분석</th>
                <th style={{ width: "10%" }}>액션</th>
                <th style={{ width: "6%" }} />
              </tr>
            </thead>
            <tbody>
              {meetings.length === 0 ? (
                <tr>
                  <td colSpan={7} className="emptyCell">
                    {q ? "검색 결과가 없습니다." : "등록된 회의록이 없습니다."}
                  </td>
                </tr>
              ) : (
                meetings.map((row) => (
                  <tr key={row.id}>
                    <td className="mutedText">{formatDate(row.meeting_date)}</td>
                    <td>
                      <Link className="tableLink" href={`/meetings/${row.id}`}>
                        {row.title}
                      </Link>
                    </td>
                    <td>
                      {row.projectId ? (
                        <Link className="tableLink" href={`/projects/${row.projectId}`}>
                          {row.project}
                        </Link>
                      ) : row.companyId ? (
                        <Link className="tableLink" href={`/customers/${row.companyId}`}>
                          {row.company}
                        </Link>
                      ) : (
                        <span className="faintText">–</span>
                      )}
                    </td>
                    <td className="mutedText">{row.attendees ?? "–"}</td>
                    <td>{AI_LABEL[row.ai_status] || <span className="faintText">–</span>}</td>
                    <td>
                      {row.actionCount > 0
                        ? `${row.actionCount}건${row.openActionCount > 0 ? ` (미처리 ${row.openActionCount})` : ""}`
                        : <span className="faintText">–</span>}
                    </td>
                    <td>
                      {row.audioUrl || row.url ? (
                        <a className="smallButton" href={(row.audioUrl ?? row.url) as string} target="_blank" rel="noreferrer">
                          열기
                        </a>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
