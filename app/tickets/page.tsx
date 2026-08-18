import Link from "next/link";
import { SaveNotice } from "@/components/SaveNotice";
import { TicketTable } from "@/components/TicketTable";
import { getAssignablePeople, getProjectOptions, getTicketCounts, getTickets } from "@/lib/queries";

export const dynamic = "force-dynamic";

const SCOPES = [
  { key: "unsorted", label: "미분류" },
  { key: "open", label: "진행 중" },
  { key: "all", label: "전체" },
];

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; saved?: string; error?: string }>;
}) {
  const { scope = "unsorted", saved, error } = await searchParams;

  const [tickets, assignables, projects, counts] = await Promise.all([
    getTickets({ scope }),
    getAssignablePeople(),
    getProjectOptions(),
    getTicketCounts(),
  ]);

  const returnPath = `/tickets?scope=${scope}`;

  return (
    <>
      <div className="pageHeader">
        <h1>티켓</h1>
        <div className="pageHeaderMeta">{tickets.length}건 표시</div>
      </div>

      <SaveNotice saved={saved} error={error} />

      <div className="tabRow">
        {SCOPES.map((item) => (
          <Link
            key={item.key}
            href={`/tickets?scope=${item.key}`}
            className={scope === item.key ? "tab tabOn" : "tab"}
          >
            {item.label}
            <span className="tabCount">
              {item.key === "unsorted" ? counts.unsorted : item.key === "open" ? counts.open : counts.total}
            </span>
          </Link>
        ))}
      </div>

      <div className="panel">
        <div className="panelHeader">
          <div className="panelTitle">
            {scope === "unsorted" ? "프로젝트 미지정" : scope === "open" ? "진행 중" : "전체"}
          </div>
          <div className="panelMeta">담당자·프로젝트·상태는 표에서 바로 바꿀 수 있습니다</div>
        </div>
        <TicketTable
          tickets={tickets}
          assignables={assignables}
          projects={projects}
          returnPath={returnPath}
        />
      </div>
    </>
  );
}
