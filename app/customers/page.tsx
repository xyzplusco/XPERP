import { CustomerTable } from "@/components/CustomerTable";
import { SectionHeader } from "@/components/SectionHeader";
import { getCustomerRows } from "@/lib/operational-data";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const customerRows = await getCustomerRows(40);

  return (
    <>
      <SectionHeader
        eyebrow="고객사"
        title="고객사별 딜/계약 관리"
        description="Deal list의 회사명을 고객사 ID로 정리하고, 각 고객사에 연결된 프로젝트, 계약성 딜, 문서 미비, 액션을 함께 봅니다."
      />
      <section className="panel">
        <div className="panelHeader">
          <div>
            <div className="panelTitle">고객사 목록</div>
            <div className="panelMeta">companies.id → projects.company_id 기준</div>
          </div>
        </div>
        <CustomerTable rows={customerRows} />
      </section>
    </>
  );
}
