import Link from "next/link";
import { DealTable } from "@/components/DealTable";
import { getDashboardStats, getDeals } from "@/lib/queries";
import { label, PROJECT_STATUS_OPTIONS } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const [stats, deals] = await Promise.all([
    getDashboardStats(),
    getDeals(status ? { status } : undefined),
  ]);

  return (
    <>
      <div className="pageHeader">
        <h1>대시보드</h1>
        <div className="pageHeaderMeta">{new Date().toLocaleDateString("ko-KR")} 기준</div>
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
          <div className="statLabel">파트너 네트워크</div>
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
          <form className="filterBar" method="get">
            <select name="status" defaultValue={status ?? ""}>
              <option value="">전체 상태</option>
              {PROJECT_STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {label(option)}
                </option>
              ))}
            </select>
            <button className="smallButton" type="submit">
              적용
            </button>
            <Link className="smallButton" href="/projects" style={{ display: "inline-block" }}>
              전체 보기
            </Link>
          </form>
        </div>
        <DealTable rows={deals.slice(0, 30)} />
      </div>
    </>
  );
}
