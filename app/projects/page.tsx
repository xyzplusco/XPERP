import { DataTable } from "@/components/DataTable";
import { SectionHeader } from "@/components/SectionHeader";
import { activeProjects } from "@/lib/mock-data";

export default function ProjectsPage() {
  return (
    <>
      <SectionHeader
        eyebrow="Projects"
        title="Deal and project pipeline"
        description="Project rows should preserve Deal list lineage, weekly updates, PL/PM ownership, document requirements, and next actions."
      />
      <div className="toolbar" aria-label="Project filters">
        <span className="filterPill" data-selected="true">All active</span>
        <span className="filterPill">Re-engineering</span>
        <span className="filterPill">Investment</span>
        <span className="filterPill">Business building</span>
        <span className="filterPill">Go Global</span>
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

