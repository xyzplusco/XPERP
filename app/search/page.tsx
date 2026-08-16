import { DataTable } from "@/components/DataTable";
import { SectionHeader } from "@/components/SectionHeader";
import { getSearchRows } from "@/lib/operational-data";

export default async function SearchPage() {
  const taskRows = await getSearchRows(16);

  return (
    <>
      <SectionHeader
        eyebrow="검색"
        title="통합 운영 검색"
        description="이름, 회사, 프로젝트, 이벤트, 문서, 문서 필요 항목, 주차별 업데이트, 원본 행, 액션을 함께 검색해야 합니다."
      />
      <input
        className="searchBox"
        aria-label="XP ERP 검색"
        placeholder="사람, 회사, 문서, 주차별 업데이트, 액션 검색..."
      />
      <section className="panel">
        <div className="panelHeader">
          <div>
            <div className="panelTitle">액션 검색 결과</div>
            <div className="panelMeta">액션도 통합 검색의 핵심 결과입니다</div>
          </div>
        </div>
        <DataTable
          columns={[
            { key: "title", label: "결과" },
            { key: "owner", label: "담당" },
            { key: "link", label: "영역" },
            { key: "status", label: "상태" },
          ]}
          rows={taskRows}
        />
      </section>
    </>
  );
}
