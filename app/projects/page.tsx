import Link from "next/link";
import { BulkTable, type BulkRow, type ColumnDef } from "@/components/BulkTable";
import { SaveNotice } from "@/components/SaveNotice";
import { getCompanyNames, getDeals, getFolderCounts, getFolders, getLastUpdateMap, getPersonOptions } from "@/lib/queries";
import { canWrite, getSessionUser } from "@/lib/auth";
import { NewRecordDialog } from "@/components/NewRecordDialog";
import { createProjectAction } from "@/lib/actions";
import {
  DEAL_STATUS_OPTIONS,
  PIPELINE_STAGE_OPTIONS,
  SERVICE_SECTOR_OPTIONS,
} from "@/lib/labels";
import { daysSince } from "@/lib/week";

export const dynamic = "force-dynamic";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string; view?: string; saved?: string; trashed?: string; error?: string }>;
}) {
  const { folder = "all", view = "all", saved, trashed, error } = await searchParams;

  const [folders, folderCounts, peopleOptions, user, companyNames] = await Promise.all([
    getFolders(),
    getFolderCounts(),
    getPersonOptions(),
    getSessionUser(),
    getCompanyNames(),
  ]);
  const activeFolder = folders.find((item) => item.id === folder);
  const allDeals = await getDeals({
    folderId: activeFolder?.id,
    unsorted: folder === "unsorted",
  });
  const lastMap = await getLastUpdateMap(allDeals.map((d) => d.id));

  const statusCounts = new Map<string, number>();
  for (const deal of allDeals) {
    statusCounts.set(deal.deal_status, (statusCounts.get(deal.deal_status) ?? 0) + 1);
  }
  const deals = view === "all" ? allDeals : allDeals.filter((d) => d.deal_status === view);

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

  const tabHref = (key: string) => `/projects?folder=${key}&view=${encodeURIComponent(view)}`;
  const viewHref = (key: string) => `/projects?folder=${folder}&view=${encodeURIComponent(key)}`;
  const returnPath = `/projects?folder=${folder}&view=${encodeURIComponent(view)}`;

  return (
    <>
      <div className="pageHeader">
        <h1>프로젝트</h1>
        <div className="pageHeaderMeta">
          {deals.length}건
          {canWrite(user) ? (
            <NewRecordDialog
              label="새 프로젝트"
              action={createProjectAction}
              fields={[
                { name: "name", label: "프로젝트명", required: true },
                { name: "company_name", label: "고객사", listId: "new-project-companies", listValues: companyNames },
                { name: "pipeline_stage", label: "구간", type: "select", options: [...PIPELINE_STAGE_OPTIONS] },
                { name: "deal_status", label: "상태", type: "select", options: [...DEAL_STATUS_OPTIONS] },
                { name: "service_sector", label: "서비스섹터", type: "select", options: [...SERVICE_SECTOR_OPTIONS] },
              ]}
            />
          ) : null}
        </div>
      </div>

      <SaveNotice saved={saved ?? trashed} error={error} />

      <div className="tabRow">
        <Link href={viewHref("all")} className={view === "all" ? "tab tabOn" : "tab"}>
          전체<span className="tabCount">{allDeals.length}</span>
        </Link>
        {DEAL_STATUS_OPTIONS.map((option) => (
          <Link key={option} href={viewHref(option)} className={view === option ? "tab tabOn" : "tab"}>
            {option}
            <span className="tabCount">{statusCounts.get(option) ?? 0}</span>
          </Link>
        ))}
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

      <div className="panel">
        <BulkTable
          entity="projects"
          columns={columns}
          rows={rows}
          returnPath={returnPath}
          storageKey="projects"
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
