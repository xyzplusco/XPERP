import Link from "next/link";
import { notFound } from "next/navigation";
import { DataTable } from "@/components/DataTable";
import { SectionHeader } from "@/components/SectionHeader";
import {
  getCustomerDetail,
  getCustomerDocumentRows,
  getCustomerProjectRows,
  ko,
} from "@/lib/operational-data";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [customer, projects, documents] = await Promise.all([
    getCustomerDetail(id),
    getCustomerProjectRows(id, 30),
    getCustomerDocumentRows(id, 20),
  ]);

  if (!customer) notFound();

  return (
    <>
      <SectionHeader
        eyebrow="고객사 상세"
        title={customer.customer || "고객사"}
        description={`${customer.customer_id || id} · ${customer.industry || "미지정"} · 연결 딜 ${customer.project_count || 0}건`}
      />

      <div className="toolbar">
        <Link href="/customers" className="filterPill">
        고객사 목록
      </Link>
      <span className="filterPill" data-selected="true">
          최신 상태 {ko(customer.latest_status) || "검토"}
      </span>
        <span className="filterPill">문서 미비 {customer.document_gap_count || 0}</span>
        <span className="filterPill">액션 {customer.task_count || 0}</span>
      </div>

      <section className="panel">
        <div className="panelHeader">
          <div>
            <div className="panelTitle">연결된 딜/계약/프로젝트</div>
            <div className="panelMeta">Deal list 행은 우선 projects로 연결하고, 계약서는 documents로 분리합니다</div>
          </div>
        </div>
        <DataTable
          columns={[
            { key: "project", label: "딜/프로젝트" },
            { key: "type", label: "유형" },
            { key: "status", label: "상태" },
            { key: "pl", label: "PL" },
            { key: "pm", label: "PM" },
            { key: "contract", label: "계약" },
            { key: "next", label: "다음 액션" },
          ]}
          rows={projects}
        />
      </section>

      <section className="panel">
        <div className="panelHeader">
          <div>
            <div className="panelTitle">문서 필요 항목</div>
            <div className="panelMeta">NDA, 계약서, 제안서, IR 자료는 파일 업로드 전부터 상태로 추적합니다</div>
          </div>
        </div>
        <DataTable
          columns={[
            { key: "title", label: "문서 항목" },
            { key: "type", label: "유형" },
            { key: "status", label: "상태" },
            { key: "due", label: "기한" },
          ]}
          rows={documents}
        />
      </section>
    </>
  );
}
