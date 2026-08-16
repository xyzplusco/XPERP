import { DataTable } from "@/components/DataTable";
import { SectionHeader } from "@/components/SectionHeader";
import { getDocumentRequirementRows } from "@/lib/operational-data";

export default async function DocumentsPage() {
  const documentGaps = await getDocumentRequirementRows(24);

  return (
    <>
      <SectionHeader
        eyebrow="문서"
        title="파일 보관보다 먼저 필요한 문서 상태"
        description="NDA, 프로필, 위촉, MOU, 계약서, 만료, 면제, 담당자를 파일 업로드 전부터 추적합니다."
      />
      <div className="toolbar" aria-label="문서 필터">
        <span className="filterPill" data-selected="true">미비</span>
        <span className="filterPill">요청</span>
        <span className="filterPill">수령</span>
        <span className="filterPill">서명 완료</span>
        <span className="filterPill">만료 예정</span>
      </div>
      <section className="panel">
        <div className="panelHeader">
          <div>
            <div className="panelTitle">문서 필요 항목</div>
            <div className="panelMeta">단순 파일 목록이 아니라 운영 상태 큐</div>
          </div>
        </div>
        <DataTable
          columns={[
            { key: "subject", label: "대상" },
            { key: "type", label: "필요 문서" },
            { key: "owner", label: "담당" },
            { key: "status", label: "상태" },
            { key: "due", label: "기한" },
          ]}
          rows={documentGaps}
        />
      </section>
    </>
  );
}
