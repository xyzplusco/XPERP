import Link from "next/link";
import { BulkTable, type BulkRow, type ColumnDef } from "@/components/BulkTable";
import { SaveNotice } from "@/components/SaveNotice";
import { getDeals, getFolderCounts, getFolders, getLastUpdateMap } from "@/lib/queries";
import { label, PROJECT_STATUS_OPTIONS, PROJECT_TYPE_OPTIONS, formatDate } from "@/lib/labels";
import { daysSince } from "@/lib/week";

export const dynamic = "force-dynamic";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; folder?: string; view?: string; saved?: string; trashed?: string; error?: string }>;
}) {
  const { status, folder = "all", view = "active", saved, trashed, error } = await searchParams;

  const [folders, folderCounts] = await Promise.all([getFolders(), getFolderCounts()]);
  const activeFolder = folders.find((item) => item.id === folder);
  const allDeals = await getDeals({
    status,
    folderId: activeFolder?.id,
    unsorted: folder === "unsorted",
  });
  const lastMap = await getLastUpdateMap(allDeals.map((d) => d.id));

  // 아카이브 = 끝났거나 진행하지 않는 건 (완료·중단·보류·관리기업)
  const isArchived = (deal: (typeof allDeals)[number]) =>
    ["done", "dropped", "on_hold"].includes(deal.status) || deal.contract_status === "관리기업";

  const deals =
    view === "archive" ? allDeals.filter(isArchived)
    : view === "stale" ? allDeals.filter((d) => {
        const days = daysSince(lastMap.get(d.id)?.date ?? null);
        return !isArchived(d) && (days === null || days > 30);
      })
    : view === "all" ? allDeals
    : allDeals.filter((d) => !isArchived(d));

  const activeCount = allDeals.filter((d) => !isArchived(d)).length;
  const archiveCount = allDeals.length - activeCount;
  const staleCount = allDeals.filter((d) => {
    const days = daysSince(lastMap.get(d.id)?.date ?? null);
    return !isArchived(d) && (days === null || days > 30);
  }).length;

  const folderOptions: [string, string][] = folders.map((item) => [item.id, item.name]);
  const statusOptions: [string, string][] = PROJECT_STATUS_OPTIONS.map((v) => [v, label(v)]);
  const typeOptions: [string, string][] = PROJECT_TYPE_OPTIONS.map((v) => [v, label(v)]);

  const columns: ColumnDef[] = [
    { key: "company", header: "고객사", width: "14%", kind: "readonly" },
    { key: "name", header: "프로젝트명", width: "20%", kind: "text" },
    { key: "folder_id", header: "폴더", width: "11%", kind: "select", options: folderOptions },
    { key: "project_type", header: "유형", width: "10%", kind: "select", options: typeOptions },
    { key: "status", header: "상태", width: "9%", kind: "select", options: statusOptions },
    { key: "pl", header: "PL", width: "8%", kind: "readonly" },
    { key: "pm", header: "PM", width: "8%", kind: "readonly" },
    { key: "last_update", header: "마지막 업데이트", width: "11%", kind: "readonly" },
    { key: "next_action", header: "다음 액션", kind: "text" },
  ];

  const rows: BulkRow[] = deals.map((deal) => ({
    id: deal.id,
    href: `/projects/${deal.id}`,
    linkKey: "name",
    display: {
      company: deal.company?.name_ko ?? "",
      name: deal.name,
      folder_id: folders.find((f) => f.id === deal.folder_id)?.name ?? "Unsorted",
      project_type: label(deal.project_type),
      status: label(deal.status),
      pl: deal.pl?.name_ko ?? "",
      pm: deal.pm?.name_ko ?? "",
      last_update: (() => {
        const last = lastMap.get(deal.id);
        if (!last?.label) return "기록 없음";
        const days = daysSince(last.date);
        return days === null ? last.label : `${last.label} (${days}일)`;
      })(),
      next_action: deal.next_action ?? deal.latest_update ?? "",
    },
    raw: {
      name: deal.name,
      folder_id: deal.folder_id ?? "",
      project_type: deal.project_type,
      status: deal.status,
      end_date: deal.end_date ?? "",
      next_action: deal.next_action ?? "",
    },
  }));

  const tabHref = (key: string) =>
    `/projects?folder=${key}&view=${view}${status ? `&status=${status}` : ""}`;
  const viewHref = (key: string) =>
    `/projects?folder=${folder}&view=${key}${status ? `&status=${status}` : ""}`;
  const returnPath = `/projects?folder=${folder}&view=${view}${status ? `&status=${status}` : ""}`;

  return (
    <>
      <div className="pageHeader">
        <h1>프로젝트</h1>
        <div className="pageHeaderMeta">{deals.length}건 · 셀을 더블클릭하면 바로 수정</div>
      </div>

      <SaveNotice saved={saved ?? trashed} error={error} />

      <div className="filterBar">
        <Link href={viewHref("active")} className={view === "active" ? "smallButton navItemActive" : "smallButton"}>
          활성 {activeCount}
        </Link>
        <Link href={viewHref("stale")} className={view === "stale" ? "smallButton navItemActive" : "smallButton"}>
          정체 30일+ {staleCount}
        </Link>
        <Link href={viewHref("archive")} className={view === "archive" ? "smallButton navItemActive" : "smallButton"}>
          아카이브 {archiveCount}
        </Link>
        <Link href={viewHref("all")} className={view === "all" ? "smallButton navItemActive" : "smallButton"}>
          전체 {allDeals.length}
        </Link>
      </div>

      <div className="tabRow">
        <Link href={tabHref("all")} className={folder === "all" ? "tab tabOn" : "tab"}>
          전체<span className="tabCount">{folderCounts.total}</span>
        </Link>
        {folders.map((item) => (
          <Link key={item.id} href={tabHref(item.id)} className={folder === item.id ? "tab tabOn" : "tab"}>
            {item.name}<span className="tabCount">{folderCounts.counts.get(item.id) ?? 0}</span>
          </Link>
        ))}
        <Link href={tabHref("unsorted")} className={folder === "unsorted" ? "tab tabOn" : "tab"}>
          Unsorted<span className="tabCount">{folderCounts.unsorted}</span>
        </Link>
      </div>

      <form className="filterBar" method="get">
        <input type="hidden" name="folder" value={folder} />
        <input type="hidden" name="view" value={view} />
        <select name="status" defaultValue={status ?? ""}>
          <option value="">전체 상태</option>
          {PROJECT_STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>{label(option)}</option>
          ))}
        </select>
        <button className="smallButton" type="submit">적용</button>
      </form>

      <div className="panel">
        <BulkTable
          entity="projects"
          columns={columns}
          rows={rows}
          returnPath={returnPath}
          bulkActions={[
            { field: "folder_id", label: "폴더 이동", options: folderOptions },
            { field: "status", label: "상태 변경", options: statusOptions },
            { field: "project_type", label: "유형 변경", options: typeOptions },
          ]}
          emptyText="표시할 프로젝트가 없습니다."
        />
      </div>
    </>
  );
}
