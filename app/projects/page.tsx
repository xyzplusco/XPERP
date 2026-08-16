import { DataTable } from "@/components/DataTable";
import { SectionHeader } from "@/components/SectionHeader";
import { getProjectRows, getProjectTypeSummary } from "@/lib/operational-data";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const [activeProjects, projectTypeSummary] = await Promise.all([
    getProjectRows(18),
    getProjectTypeSummary(),
  ]);

  return (
    <>
      <SectionHeader
        eyebrow="프로젝트"
        title="딜 및 프로젝트 파이프라인"
        description="Deal list 이력, 주차별 업데이트, PL/PM, 문서 필요 항목, 다음 액션을 함께 관리합니다."
      />
      <div className="toolbar" aria-label="프로젝트 필터">
        {projectTypeSummary.map((row, index) => (
          <span className="filterPill" data-selected={index === 0 ? "true" : undefined} key={row.type}>
            {row.type} {row.count}
          </span>
        ))}
      </div>
      <section className="panel">
        <div className="panelHeader">
          <div>
            <div className="panelTitle">프로젝트 목록</div>
            <div className="panelMeta">Supabase projects 기준</div>
          </div>
        </div>
        <DataTable
          columns={[
            { key: "company", label: "회사" },
            { key: "type", label: "유형" },
            { key: "pl", label: "PL" },
            { key: "pm", label: "PM" },
            { key: "next", label: "다음 액션" },
          ]}
          rows={activeProjects}
        />
      </section>
    </>
  );
}
