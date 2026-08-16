import { DataTable } from "@/components/DataTable";
import { SectionHeader } from "@/components/SectionHeader";
import { networkRows } from "@/lib/mock-data";

export default function NetworkPage() {
  return (
    <>
      <SectionHeader
        eyebrow="Network"
        title="People and relationship control"
        description="The Network table combines Directory and partner management. Segments, document requirements, and next actions are visible beside contact data."
      />
      <div className="toolbar" aria-label="Network filters">
        <span className="filterPill" data-selected="true">All</span>
        <span className="filterPill">XP internal</span>
        <span className="filterPill">Partners</span>
        <span className="filterPill">LP / investors</span>
        <span className="filterPill">External experts</span>
        <span className="filterPill">Vendors</span>
      </div>
      <section className="panel">
        <div className="panelHeader">
          <div>
            <div className="panelTitle">Network records</div>
            <div className="panelMeta">Segment, company, role, document state</div>
          </div>
        </div>
        <DataTable
          columns={[
            { key: "name", label: "Name" },
            { key: "segment", label: "Segment" },
            { key: "company", label: "Company" },
            { key: "role", label: "Role" },
            { key: "docs", label: "Documents" },
          ]}
          rows={networkRows}
        />
      </section>
    </>
  );
}

