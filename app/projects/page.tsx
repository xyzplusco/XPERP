import Link from "next/link";
import { BulkTable, type BulkRow, type ColumnDef } from "@/components/BulkTable";
import { SaveNotice } from "@/components/SaveNotice";
import { getDeals, getFolderCounts, getFolders } from "@/lib/queries";
import { label, PROJECT_STATUS_OPTIONS, PROJECT_TYPE_OPTIONS, formatDate } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; folder?: string; saved?: string; trashed?: string; error?: string }>;
}) {
  const { status, folder = "all", saved, trashed, error } = await searchParams;

  const [folders, folderCounts] = await Promise.all([getFolders(), getFolderCounts()]);
  const activeFolder = folders.find((item) => item.id === folder);
  const deals = await getDeals({
    status,
    folderId: activeFolder?.id,
    unsorted: folder === "unsorted",
  });

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
    { key: "end_date", header: "종료일", width: "9%", kind: "date" },
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
      end_date: formatDate(deal.end_date) === "–" ? "" : formatDate(deal.end_date),
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

  const tabHref = (key: string) => `/projects?folder=${key}${status ? `&status=${status}` : ""}`;
  const returnPath = `/projects?folder=${folder}${status ? `&status=${status}` : ""}`;

  return (
    <>
      <div className="pageHeader">
        <h1>프로젝트</h1>
        <div className="pageHeaderMeta">{deals.length}건 · 셀을 더블클릭하면 바로 수정</div>
      </div>

      <SaveNotice saved={saved ?? trashed} error={error} />

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
