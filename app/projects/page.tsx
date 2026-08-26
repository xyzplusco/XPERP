import Link from "next/link";
import { BulkTable, type BulkRow, type ColumnDef } from "@/components/BulkTable";
import { SaveNotice } from "@/components/SaveNotice";
import { getDeals, getFolderCounts, getFolders, getLastUpdateMap, getPersonOptions } from "@/lib/queries";
import { getSessionUser, isAdmin } from "@/lib/auth";
import {
  ARCHIVED_DEAL_STATUS,
  DEAL_STATUS_OPTIONS,
  PIPELINE_STAGE_OPTIONS,
  SERVICE_SECTOR_OPTIONS,
} from "@/lib/labels";
import { daysSince } from "@/lib/week";

export const dynamic = "force-dynamic";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; folder?: string; view?: string; saved?: string; trashed?: string; error?: string }>;
}) {
  const { status, folder = "all", view = "active", saved, trashed, error } = await searchParams;

  const [folders, folderCounts, peopleOptions, user] = await Promise.all([
    getFolders(),
    getFolderCounts(),
    getPersonOptions(),
    getSessionUser(),
  ]);
  const activeFolder = folders.find((item) => item.id === folder);
  const allDeals = await getDeals({
    status,
    folderId: activeFolder?.id,
    unsorted: folder === "unsorted",
  });
  const lastMap = await getLastUpdateMap(allDeals.map((d) => d.id));

  // 아카이브 = 더 진행하지 않는 건 (상태가 관리·보류)
  const isArchived = (deal: (typeof allDeals)[number]) => ARCHIVED_DEAL_STATUS.has(deal.deal_status);

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
  const stageOptions: [string, string][] = PIPELINE_STAGE_OPTIONS.map((v) => [v, v]);
  const statusOptions: [string, string][] = DEAL_STATUS_OPTIONS.map((v) => [v, v]);
  const sectorOptions: [string, string][] = SERVICE_SECTOR_OPTIONS.map((v) => [v, v]);

  const columns: ColumnDef[] = [
    { key: "company", header: "고객사", width: 120, kind: "readonly" },
    { key: "name", header: "프로젝트명", width: 200, kind: "text" },
    { key: "pipeline_stage", header: "구간", width: 110, kind: "select", options: stageOptions },
    { key: "deal_status", header: "상태", width: 90, kind: "select", options: statusOptions },
    { key: "service_sector", header: "서비스섹터", width: 140, kind: "select", options: sectorOptions },
    { key: "folder_id", header: "폴더", width: 130, kind: "select", options: folderOptions },
    { key: "primary_pl_person_id", header: "PL", width: 100, kind: "select", options: peopleOptions },
    { key: "candidate_pm_person_id", header: "PM", width: 100, kind: "select", options: peopleOptions },
    { key: "last_update", header: "마지막 업데이트", width: 130, kind: "readonly" },
    { key: "next_action", header: "다음 액션", width: 320, kind: "text" },
  ];

  const rows: BulkRow[] = deals.map((deal) => ({
    id: deal.id,
    href: `/projects/${deal.id}`,
    linkKey: "name",
    display: {
      company: deal.company?.name_ko ?? "",
      name: deal.name,
      pipeline_stage: deal.pipeline_stage,
      deal_status: deal.deal_status,
      service_sector: deal.service_sector,
      folder_id: folders.find((f) => f.id === deal.folder_id)?.name ?? "Unsorted",
      primary_pl_person_id: deal.pl?.name_ko ?? "",
      candidate_pm_person_id: deal.pm?.name_ko ?? "",
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
      primary_pl_person_id: deal.pl?.id ?? "",
      candidate_pm_person_id: deal.pm?.id ?? "",
      folder_id: deal.folder_id ?? "",
      pipeline_stage: deal.pipeline_stage,
      deal_status: deal.deal_status,
      service_sector: deal.service_sector,
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
        <div className="pageHeaderMeta">{deals.length}건</div>
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
          {DEAL_STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>{option}</option>
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
          storageKey="projects"
          canPaste={isAdmin(user)}
          bulkActions={[
            { field: "deal_status", label: "상태 변경", options: statusOptions },
            { field: "pipeline_stage", label: "구간 변경", options: stageOptions },
            { field: "service_sector", label: "서비스섹터 변경", options: sectorOptions },
            { field: "folder_id", label: "폴더 이동", options: folderOptions },
            { field: "primary_pl_person_id", label: "PL 지정", options: peopleOptions },
            { field: "candidate_pm_person_id", label: "PM 지정", options: peopleOptions },
          ]}
          emptyText="표시할 프로젝트가 없습니다."
        />
      </div>
    </>
  );
}
