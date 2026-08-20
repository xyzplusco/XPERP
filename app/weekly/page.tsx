import Link from "next/link";
import { SaveNotice } from "@/components/SaveNotice";
import { saveWeeklyUpdatesAction } from "@/lib/actions";
import { isAdmin, requireUser } from "@/lib/auth";
import { getWeeklyBoard } from "@/lib/queries";
import { currentWeek, previousWeek, recentWeeks, type Week } from "@/lib/week";

export const dynamic = "force-dynamic";

export default async function WeeklyPage({
  searchParams,
}: {
  searchParams: Promise<{ label?: string; saved?: string; cleared?: string; failed?: string; error?: string }>;
}) {
  const { label, saved, cleared, failed, error } = await searchParams;
  const user = await requireUser();

  const weeks = recentWeeks(8);
  const week: Week = weeks.find((w) => w.label === label) ?? currentWeek();
  const prev = previousWeek(week);

  const rows = await getWeeklyBoard(user.personId, week.label, prev.label);
  const written = rows.filter((row) => row.current.trim() !== "").length;

  return (
    <>
      <div className="pageHeader">
        <h1>주간 업데이트</h1>
        <div className="pageHeaderMeta">
          {week.label} · {written}/{rows.length}건 작성
        </div>
      </div>

      {saved || cleared ? (
        <p className={Number(failed ?? 0) > 0 ? "notice noticeError" : "notice noticeOk"}>
          {[
            Number(saved ?? 0) > 0 ? `${saved}건 저장` : null,
            Number(cleared ?? 0) > 0 ? `${cleared}건 삭제` : null,
            Number(failed ?? 0) > 0 ? `${failed}건 실패` : null,
          ]
            .filter(Boolean)
            .join(" · ") || "변경 없음"}
        </p>
      ) : null}
      <SaveNotice error={error} />

      {isAdmin(user) ? (
        <div className="filterBar">
          <Link href={`/weekly/review?label=${encodeURIComponent(week.label)}`} className="smallButton">
            전사 확인 화면
          </Link>
        </div>
      ) : null}

      <div className="tabRow">
        {weeks.map((item) => (
          <Link
            key={item.label}
            href={`/weekly?label=${encodeURIComponent(item.label)}`}
            className={item.label === week.label ? "tab tabOn" : "tab"}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {!user.personId ? (
        <p className="notice noticeError">
          계정이 파트너와 연결되어 있지 않아 담당 프로젝트를 찾을 수 없습니다. 관리자에게 연결을 요청하세요.
        </p>
      ) : rows.length === 0 ? (
        <div className="panel">
          <div className="panelBody">
            <span className="faintText">담당하고 있는 프로젝트가 없습니다.</span>
          </div>
        </div>
      ) : (
        <form action={saveWeeklyUpdatesAction}>
          <input type="hidden" name="label" value={week.label} />
          <input type="hidden" name="date" value={week.date} />

          <div className="panel">
            <div className="panelHeader">
              <div className="panelTitle">{week.label} 작성</div>
              
            </div>

            <div className="weeklyList">
              {rows.map((row) => (
                <div className="weeklyItem" key={row.projectId}>
                  <div className="weeklyMeta">
                    <Link className="tableLink" href={`/projects/${row.projectId}`}>
                      {row.name}
                    </Link>
                    <div className="faintText" style={{ fontSize: 12 }}>
                      {[row.company, row.contract_status].filter(Boolean).join(" · ")}
                    </div>
                    {row.previous ? (
                      <div className="weeklyPrev">
                        <div className="faintText" style={{ fontSize: 11.5 }}>
                          {prev.label}
                        </div>
                        {row.previous}
                      </div>
                    ) : null}
                  </div>
                  <textarea
                    name={`body_${row.projectId}`}
                    defaultValue={row.current}
                    rows={4}
                    placeholder="이번 주 진행 내용"
                  />
                </div>
              ))}
            </div>

            <div className="panelBody" style={{ borderTop: "1px solid var(--line)" }}>
              <div className="formActions">
                <button className="primaryButton" type="submit">
                  {week.label} 저장
                </button>
              </div>
            </div>
          </div>
        </form>
      )}
    </>
  );
}
