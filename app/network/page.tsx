import { DataTable } from "@/components/DataTable";
import { SectionHeader } from "@/components/SectionHeader";
import { getNetworkRows, getSegmentSummary } from "@/lib/operational-data";

export default function NetworkPage() {
  const networkRows = getNetworkRows(18);
  const segmentSummary = getSegmentSummary();

  return (
    <>
      <SectionHeader
        eyebrow="Network"
        title="People and relationship control"
        description="The Network table combines Directory and partner management. Segments, document requirements, and next actions are visible beside contact data."
      />
      <div className="toolbar" aria-label="Network filters">
        {segmentSummary.map((row, index) => (
          <span className="filterPill" data-selected={index === 0 ? "true" : undefined} key={row.segment}>
            {row.segment} {row.count}
          </span>
        ))}
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
