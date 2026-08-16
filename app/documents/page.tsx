import { DataTable } from "@/components/DataTable";
import { SectionHeader } from "@/components/SectionHeader";
import { documentGaps } from "@/lib/mock-data";

export default function DocumentsPage() {
  return (
    <>
      <SectionHeader
        eyebrow="Documents"
        title="Requirements before archive"
        description="This module tracks what must exist before the file exists: NDA, profile, appointment, MOU, contract, expiry, waiver, and owner."
      />
      <div className="toolbar" aria-label="Document filters">
        <span className="filterPill" data-selected="true">Missing</span>
        <span className="filterPill">Requested</span>
        <span className="filterPill">Received</span>
        <span className="filterPill">Signed</span>
        <span className="filterPill">Expiring</span>
      </div>
      <section className="panel">
        <div className="panelHeader">
          <div>
            <div className="panelTitle">Document requirement queue</div>
            <div className="panelMeta">Operational status, not a passive file list</div>
          </div>
        </div>
        <DataTable
          columns={[
            { key: "subject", label: "Subject" },
            { key: "type", label: "Requirement" },
            { key: "owner", label: "Owner" },
            { key: "status", label: "Status" },
            { key: "due", label: "Due" },
          ]}
          rows={documentGaps}
        />
      </section>
    </>
  );
}

