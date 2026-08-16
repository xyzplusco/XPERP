import { DataTable } from "@/components/DataTable";
import { SectionHeader } from "@/components/SectionHeader";
import { getProjectRows, getProjectTypeSummary } from "@/lib/operational-data";

export default function ProjectsPage() {
  const activeProjects = getProjectRows(18);
  const projectTypeSummary = getProjectTypeSummary();

  return (
    <>
      <SectionHeader
        eyebrow="Projects"
        title="Deal and project pipeline"
        description="Project rows should preserve Deal list lineage, weekly updates, PL/PM ownership, document requirements, and next actions."
      />
      <div className="toolbar" aria-label="Project filters">
        {projectTypeSummary.map((row, index) => (
          <span className="filterPill" data-selected={index === 0 ? "true" : undefined} key={row.type}>
            {row.type} {row.count}
          </span>
        ))}
      </div>
      <section className="panel">
        <div className="panelHeader">
          <div>
            <div className="panelTitle">Pipeline</div>
            <div className="panelMeta">Previewed from Deal list and To Go List</div>
          </div>
        </div>
        <DataTable
          columns={[
            { key: "company", label: "Company" },
            { key: "type", label: "Type" },
            { key: "pl", label: "PL" },
            { key: "pm", label: "PM" },
            { key: "next", label: "Next action" },
          ]}
          rows={activeProjects}
        />
      </section>
    </>
  );
}
