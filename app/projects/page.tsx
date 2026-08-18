import Link from "next/link";
import { DealTable } from "@/components/DealTable";
import { getDeals, getFolderCounts, getFolders } from "@/lib/queries";
import { label, PROJECT_STATUS_OPTIONS } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; folder?: string }>;
}) {
  const { status, folder = "all" } = await searchParams;

  const [folders, folderCounts] = await Promise.all([getFolders(), getFolderCounts()]);

  const activeFolder = folders.find((item) => item.id === folder);
  const deals = await getDeals({
    status,
    folderId: activeFolder?.id,
    unsorted: folder === "unsorted",
  });

  const tabHref = (key: string) =>
    `/projects?folder=${key}${status ? `&status=${status}` : ""}`;

  return (
    <>
      <div className="pageHeader">
        <h1>프로젝트</h1>
        <div className="pageHeaderMeta">{deals.length}건</div>
      </div>

      <div className="tabRow">
        <Link href={tabHref("all")} className={folder === "all" ? "tab tabOn" : "tab"}>
          전체
          <span className="tabCount">{folderCounts.total}</span>
        </Link>
        {folders.map((item) => (
          <Link
            key={item.id}
            href={tabHref(item.id)}
            className={folder === item.id ? "tab tabOn" : "tab"}
          >
            {item.name}
            <span className="tabCount">{folderCounts.counts.get(item.id) ?? 0}</span>
          </Link>
        ))}
        <Link href={tabHref("unsorted")} className={folder === "unsorted" ? "tab tabOn" : "tab"}>
          Unsorted
          <span className="tabCount">{folderCounts.unsorted}</span>
        </Link>
      </div>

      <form className="filterBar" method="get">
        <input type="hidden" name="folder" value={folder} />
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
      </form>

      <div className="panel">
        <DealTable rows={deals} />
      </div>
    </>
  );
}
