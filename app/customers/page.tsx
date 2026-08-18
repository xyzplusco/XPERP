import { BulkTable, type BulkRow, type ColumnDef } from "@/components/BulkTable";
import { SaveNotice } from "@/components/SaveNotice";
import { getCustomers } from "@/lib/queries";
import { label } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; trashed?: string; error?: string }>;
}) {
  const { saved, trashed, error } = await searchParams;
  const customers = await getCustomers();

  const columns: ColumnDef[] = [
    { key: "customer_id", header: "ID", width: "9%", kind: "readonly" },
    { key: "name_ko", header: "고객사", width: "18%", kind: "text" },
    { key: "industry", header: "산업", width: "13%", kind: "text" },
    { key: "project_count", header: "프로젝트", width: "7%", kind: "readonly", numeric: true },
    { key: "active_project_count", header: "진행", width: "7%", kind: "readonly", numeric: true },
    { key: "document_gap_count", header: "문서 미비", width: "8%", kind: "readonly", numeric: true },
    { key: "task_count", header: "액션", width: "6%", kind: "readonly", numeric: true },
    { key: "latest_status", header: "상태", width: "9%", kind: "readonly" },
    { key: "next_action", header: "다음 액션", kind: "text" },
  ];

  const rows: BulkRow[] = customers.map((row) => ({
    id: row.id,
    href: `/customers/${row.id}`,
    linkKey: "name_ko",
    display: {
      customer_id: row.customer_id,
      name_ko: row.customer,
      industry: row.industry,
      project_count: String(row.project_count),
      active_project_count: String(row.active_project_count),
      document_gap_count: String(row.document_gap_count),
      task_count: String(row.task_count),
      latest_status: label(row.latest_status),
      next_action: row.next_action,
    },
    raw: {
      name_ko: row.customer,
      industry: row.industry === "미지정" ? "" : row.industry,
      next_action: row.next_action,
    },
  }));

  return (
    <>
      <div className="pageHeader">
        <h1>고객사</h1>
        <div className="pageHeaderMeta">{customers.length}개사 · 셀을 더블클릭하면 바로 수정</div>
      </div>

      <SaveNotice saved={saved ?? trashed} error={error} />

      <div className="panel">
        <BulkTable
          entity="companies"
          columns={columns}
          rows={rows}
          returnPath="/customers"
          emptyText="표시할 고객사가 없습니다."
        />
      </div>
    </>
  );
}
