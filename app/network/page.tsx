import { DataTable } from "@/components/DataTable";
import { SectionHeader } from "@/components/SectionHeader";
import { getNetworkRows, getSegmentSummary } from "@/lib/operational-data";

export default async function NetworkPage() {
  const [networkRows, segmentSummary] = await Promise.all([
    getNetworkRows(18),
    getSegmentSummary(),
  ]);

  return (
    <>
      <SectionHeader
        eyebrow="네트워크"
        title="사람과 관계 관리"
        description="Directory와 파트너 관리를 합친 운영 테이블입니다. 세그먼트, 문서 확인 항목, 다음 액션을 연락처와 함께 봅니다."
      />
      <div className="toolbar" aria-label="네트워크 필터">
        {segmentSummary.map((row, index) => (
          <span className="filterPill" data-selected={index === 0 ? "true" : undefined} key={row.segment}>
            {row.segment} {row.count}
          </span>
        ))}
      </div>
      <section className="panel">
        <div className="panelHeader">
          <div>
            <div className="panelTitle">네트워크 목록</div>
            <div className="panelMeta">세그먼트, 소속, 역할, 문서 상태</div>
          </div>
        </div>
        <DataTable
          columns={[
            { key: "name", label: "이름" },
            { key: "segment", label: "분류" },
            { key: "company", label: "소속" },
            { key: "role", label: "역할" },
            { key: "docs", label: "문서" },
          ]}
          rows={networkRows}
        />
      </section>
    </>
  );
}
