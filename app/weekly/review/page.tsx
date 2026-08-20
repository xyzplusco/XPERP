import Link from "next/link";
import { notFound } from "next/navigation";
import { SaveNotice } from "@/components/SaveNotice";
import { confirmWeeklyUpdateAction, requestWeeklyReviewAction } from "@/lib/actions";
import { getSessionUser, isAdmin } from "@/lib/auth";
import { getWeeklyReview } from "@/lib/queries";
import { currentWeek, recentWeeks, type Week } from "@/lib/week";

export const dynamic = "force-dynamic";

export default async function WeeklyReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ label?: string; view?: string; saved?: string; error?: string; reason?: string }>;
}) {
  const { label, view = "todo", saved, error, reason } = await searchParams;
  const user = await getSessionUser();
  if (!isAdmin(user)) notFound();

  const weeks = recentWeeks(8);
  const week: Week = weeks.find((w) => w.label === label) ?? currentWeek();
  const rows = await getWeeklyReview(week.label);

  const missing = rows.filter((row) => !row.updateId);
  const pending = rows.filter((row) => row.updateId && !row.confirmedAt);
  const confirmed = rows.filter((row) => row.confirmedAt);

  const shown = view === "missing" ? missing : view === "confirmed" ? confirmed : view === "all" ? rows : pending;

  const plMissing = new Map<string, number>();
  for (const row of missing) {
    const key = row.plName ?? "PL 미배정";
    plMissing.set(key, (plMissing.get(key) ?? 0) + 1);
  }

  const base = `/weekly/review?label=${encodeURIComponent(week.label)}`;
  const viewHref = (key: string) => `${base}&view=${key}`;
  const returnPath = `${base}&view=${view}`;

  return (
    <>
      <div className="pageHeader">
        <h1>주간보고 확인</h1>
        <div className="pageHeaderMeta">
          {week.label} · 작성 {rows.length - missing.length}/{rows.length}
        </div>
      </div>

      <SaveNotice saved={saved} error={error} reason={reason} />

      <div className="filterBar">
        <Link href={`/weekly?label=${encodeURIComponent(week.label)}`} className="smallButton">
          내 작성 화면
        </Link>
      </div>

      <div className="tabRow">
        {weeks.map((item) => (
          <Link
            key={item.label}
            href={`/weekly/review?label=${encodeURIComponent(item.label)}&view=${view}`}
            className={item.label === week.label ? "tab tabOn" : "tab"}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <div className="summaryRow">
        <div className="summaryCell">
          <div className="summaryLabel">대상 프로젝트</div>
          <div className="summaryValue">{rows.length}</div>
        </div>
        <div className="summaryCell">
          <div className="summaryLabel">미작성</div>
          <div className="summaryValue">{missing.length}</div>
        </div>
        <div className="summaryCell">
          <div className="summaryLabel">확인 대기</div>
          <div className="summaryValue">{pending.length}</div>
        </div>
        <div className="summaryCell">
          <div className="summaryLabel">확인 완료</div>
          <div className="summaryValue">{confirmed.length}</div>
        </div>
      </div>

      {plMissing.size > 0 ? (
        <div className="panel">
          <div className="panelHeader">
            <div className="panelTitle">미작성 담당</div>
          </div>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: "30%" }}>PL</th>
                  <th>미작성</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(plMissing.entries())
                  .sort((a, b) => b[1] - a[1])
                  .map(([name, count]) => (
                    <tr key={name}>
                      <td>{name}</td>
                      <td>{count}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="tabRow">
        <Link href={viewHref("todo")} className={view === "todo" ? "tab tabOn" : "tab"}>
          확인 대기<span className="tabCount">{pending.length}</span>
        </Link>
        <Link href={viewHref("missing")} className={view === "missing" ? "tab tabOn" : "tab"}>
          미작성<span className="tabCount">{missing.length}</span>
        </Link>
        <Link href={viewHref("confirmed")} className={view === "confirmed" ? "tab tabOn" : "tab"}>
          확인 완료<span className="tabCount">{confirmed.length}</span>
        </Link>
        <Link href={viewHref("all")} className={view === "all" ? "tab tabOn" : "tab"}>
          전체<span className="tabCount">{rows.length}</span>
        </Link>
      </div>

      <div className="panel">
        {shown.length === 0 ? (
          <div className="panelBody">
            <span className="faintText">해당하는 항목이 없습니다.</span>
          </div>
        ) : (
          <div className="weeklyList">
            {shown.map((row) => (
              <div className="weeklyItem reviewItem" key={row.projectId}>
                <div className="weeklyMeta">
                  <Link className="tableLink" href={`/projects/${row.projectId}`}>
                    {row.name}
                  </Link>
                  <div className="faintText" style={{ fontSize: 12 }}>
                    {[row.company, row.plName ?? "PL 미배정"].filter(Boolean).join(" · ")}
                  </div>
                  {row.confirmedAt ? <div className="reviewState">확인됨</div> : null}
                  {row.reviewNote ? <div className="reviewNote">{row.reviewNote}</div> : null}
                </div>

                <div className="reviewBody">
                  {row.updateId ? (
                    <>
                      <div className="reviewText">{row.body}</div>
                      <div className="reviewActions">
                        {!row.confirmedAt ? (
                          <form action={confirmWeeklyUpdateAction.bind(null, row.updateId)}>
                            <input type="hidden" name="return_path" value={returnPath} />
                            <button className="smallButton" type="submit">
                              확인
                            </button>
                          </form>
                        ) : null}
                        <form action={requestWeeklyReviewAction.bind(null, row.updateId)} className="reviewForm">
                          <input type="hidden" name="return_path" value={returnPath} />
                          <input name="note" placeholder="보완 요청 내용" autoComplete="off" />
                          <button className="smallButton" type="submit">
                            보완 요청
                          </button>
                        </form>
                      </div>
                    </>
                  ) : (
                    <span className="faintText">미작성</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
