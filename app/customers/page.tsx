import Link from "next/link";
import { BulkTable, type BulkRow, type ColumnDef } from "@/components/BulkTable";
import { SaveNotice } from "@/components/SaveNotice";
import { getCustomers } from "@/lib/queries";
import { canWrite, getSessionUser } from "@/lib/auth";
import { NewRecordDialog } from "@/components/NewRecordDialog";
import { createCompanyAction } from "@/lib/actions";
import { DEAL_STATUS_OPTIONS } from "@/lib/labels";

export const dynamic = "force-dynamic";

const KINDS = ["전체", "고객사", "소속처", "미연결"] as const;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; saved?: string; trashed?: string; error?: string }>;
}) {
  const { kind = "전체", saved, trashed, error } = await searchParams;
  const [user, all] = await Promise.all([getSessionUser(), getCustomers()]);

  const counts = {
    전체: all.length,
    고객사: all.filter((r) => r.kind === "고객사").length,
    소속처: all.filter((r) => r.kind === "소속처").length,
    미연결: all.filter((r) => r.kind === "미연결").length,
  };
  const customers = kind === "전체" ? all : all.filter((r) => r.kind === kind);

  const columns: ColumnDef[] = [
    { key: "name_ko", header: "고객사", width: 190, kind: "text" },
    { key: "kind", header: "구분", width: 80, kind: "readonly" },
    { key: "industry", header: "산업", width: 130, kind: "text" },
    { key: "representative_name", header: "대표", width: 100, kind: "text" },
    { key: "project_count", header: "프로젝트", width: 80, kind: "readonly", numeric: true },
    { key: "active_project_count", header: "진행", width: 70, kind: "readonly", numeric: true },
    { key: "partner_count", header: "파트너", width: 70, kind: "readonly", numeric: true },
    { key: "latest_status", header: "상태", width: 90, kind: "readonly" },
    { key: "next_action", header: "다음 액션", width: 320, kind: "text" },
  ];

  const rows: BulkRow[] = customers.map((row) => ({
    id: row.id,
    href: `/customers/${row.id}`,
    linkKey: "name_ko",
    display: {
      name_ko: row.customer,
      kind: row.kind,
      industry: row.industry,
      representative_name: row.representative,
      project_count: String(row.project_count),
      active_project_count: String(row.active_project_count),
      partner_count: String(row.partner_count),
      latest_status: row.latest_status,
      next_action: row.next_action,
    },
    raw: {
      name_ko: row.customer,
      industry: row.industry,
      representative_name: row.representative,
      next_action: row.next_action,
    },
  }));

  const returnPath = kind === "전체" ? "/customers" : `/customers?kind=${encodeURIComponent(kind)}`;

  return (
    <>
      <div className="pageHeader">
        <h1>고객사</h1>
        <div className="pageHeaderMeta">
          {customers.length}개사
          {canWrite(user) ? (
            <NewRecordDialog
              label="새 고객사"
              action={createCompanyAction}
              fields={[
                { name: "name_ko", label: "고객사명", required: true },
                { name: "industry", label: "산업" },
                { name: "representative_name", label: "대표" },
                { name: "website_url", label: "웹사이트" },
              ]}
            />
          ) : null}
        </div>
      </div>

      <SaveNotice saved={saved ?? trashed} error={error} />

      <div className="tabRow">
        {KINDS.map((item) => (
          <Link
            key={item}
            href={item === "전체" ? "/customers" : `/customers?kind=${encodeURIComponent(item)}`}
            className={kind === item ? "tab tabOn" : "tab"}
          >
            {item}
            <span className="tabCount">{counts[item]}</span>
          </Link>
        ))}
      </div>

      <div className="panel">
        <BulkTable
          storageKey="customers"
          entity="companies"
          columns={columns}
          rows={rows}
          returnPath={returnPath}
          emptyText="표시할 고객사가 없습니다."
        />
      </div>
    </>
  );
}
