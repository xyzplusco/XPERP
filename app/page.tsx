import Link from "next/link";
import { DealTable } from "@/components/DealTable";
import { requireUser, isAdmin } from "@/lib/auth";
import { getDashboardStats, getDeals, getMyWork } from "@/lib/queries";
import { formatDate, label, truncate } from "@/lib/labels";
import { currentWeek, daysSince } from "@/lib/week";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await requireUser();
  const week = currentWeek();

  const [work, stats, deals] = await Promise.all([
    getMyWork(user.personId),
    isAdmin(user) ? getDashboardStats() : Promise.resolve(null),
    isAdmin(user) ? getDeals() : Promise.resolve([]),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const overdue = work.tickets.filter((t) => t.due_date && t.due_date < today);
  const dueToday = work.tickets.filter((t) => t.due_date === today);
  const noDate = work.tickets.filter((t) => !t.due_date);

  const unwritten = work.projects.filter((p) => p.lastUpdateLabel !== week.label);
  const stale = work.projects.filter((p) => {
    const days = daysSince(p.lastUpdateDate);
    return days === null || days > 30;
  });

  return (
    <>
      <div className="pageHeader">
        <h1>{user.personName ?? user.email}</h1>
        <div className="pageHeaderMeta">
          {week.label} · {new Date().toLocaleDateString("ko-KR")}
        </div>
      </div>

      <div className="statRow">
        <div className="statCell">
          <div className="statLabel">기한 지난 티켓</div>
          <div className="statValue">{overdue.length}</div>
        </div>
        <div className="statCell">
          <div className="statLabel">오늘 기한</div>
          <div className="statValue">{dueToday.length}</div>
        </div>
        <div className="statCell">
          <div className="statLabel">내 티켓 전체</div>
          <div className="statValue">{work.tickets.length}</div>
        </div>
        <div className="statCell">
          <div className="statLabel">내 프로젝트</div>
          <div className="statValue">{work.projects.length}</div>
        </div>
        <div className="statCell">
          <div className="statLabel">{week.label} 미작성</div>
          <div className="statValue">{unwritten.length}</div>
        </div>
        <div className="statCell">
          <div className="statLabel">30일 이상 정체</div>
          <div className="statValue">{stale.length}</div>
        </div>
      </div>

      {!user.personId ? (
        <p className="notice noticeError">
          이 계정이 파트너와 연결되어 있지 않아 담당 업무를 표시할 수 없습니다. 설정에서 연결하세요.
        </p>
      ) : null}

      <div className="workGrid">
        <div className="panel">
          <div className="panelHeader">
            <div className="panelTitle">내 티켓</div>
            <Link className="smallButton" href="/tickets?scope=open">
              전체 보기
            </Link>
          </div>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>내용</th>
                  <th style={{ width: "26%" }}>프로젝트</th>
                  <th style={{ width: "16%" }}>기한</th>
                </tr>
              </thead>
              <tbody>
                {work.tickets.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="emptyCell">
                      담당 티켓이 없습니다.
                    </td>
                  </tr>
                ) : (
                  [...overdue, ...dueToday, ...work.tickets.filter((t) => !overdue.includes(t) && !dueToday.includes(t) && !noDate.includes(t)), ...noDate]
                    .slice(0, 15)
                    .map((ticket) => (
                      <tr key={ticket.id}>
                        <td>{ticket.title}</td>
                        <td>
                          {ticket.project ? (
                            <Link className="tableLink" href={`/projects/${ticket.project.id}`}>
                              {truncate(ticket.project.name, 16)}
                            </Link>
                          ) : (
                            <span className="faintText">미분류</span>
                          )}
                        </td>
                        <td className={ticket.due_date && ticket.due_date < today ? "overdue" : "mutedText"}>
                          {formatDate(ticket.due_date)}
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="panelHeader">
            <div className="panelTitle">내 프로젝트</div>
            <Link className="smallButton" href="/weekly">
              {week.label} 업데이트 쓰기
            </Link>
          </div>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>프로젝트</th>
                  <th style={{ width: "16%" }}>구간</th>
                  <th style={{ width: "18%" }}>마지막 업데이트</th>
                </tr>
              </thead>
              <tbody>
                {work.projects.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="emptyCell">
                      담당 프로젝트가 없습니다.
                    </td>
                  </tr>
                ) : (
                  work.projects.slice(0, 15).map((project) => {
                    const days = daysSince(project.lastUpdateDate);
                    return (
                      <tr key={project.id}>
                        <td>
                          <Link className="tableLink" href={`/projects/${project.id}`}>
                            {project.name}
                          </Link>
                        </td>
                        <td>{project.contract_status ?? label(project.status)}</td>
                        <td className={days === null || days > 30 ? "staleDays staleWarn" : "staleDays mutedText"}>
                          {project.lastUpdateLabel
                            ? `${project.lastUpdateLabel}${days !== null ? ` (${days}일)` : ""}`
                            : "기록 없음"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {stats ? (
        <>
          <div className="pageHeader" style={{ marginTop: 8 }}>
            <h1 style={{ fontSize: 16 }}>전사 현황</h1>
            <div className="pageHeaderMeta">관리자</div>
          </div>

          <div className="statRow">
            <div className="statCell">
              <div className="statLabel">고객사</div>
              <div className="statValue">{stats.customers}</div>
            </div>
            <div className="statCell">
              <div className="statLabel">진행 프로젝트</div>
              <div className="statValue">{stats.activeProjects}</div>
            </div>
            <div className="statCell">
              <div className="statLabel">확정 계약</div>
              <div className="statValue">{stats.confirmed}</div>
            </div>
            <div className="statCell">
              <div className="statLabel">파트너</div>
              <div className="statValue">{stats.people}</div>
            </div>
            <div className="statCell">
              <div className="statLabel">문서 미비</div>
              <div className="statValue">{stats.openDocs}</div>
            </div>
            <div className="statCell">
              <div className="statLabel">미처리 액션</div>
              <div className="statValue">{stats.openTasks}</div>
            </div>
          </div>

          <div className="panel">
            <div className="panelHeader">
              <div className="panelTitle">Deal List</div>
              <Link className="smallButton" href="/projects">
                전체 보기
              </Link>
            </div>
            <DealTable rows={deals.slice(0, 20)} />
          </div>
        </>
      ) : null}
    </>
  );
}
