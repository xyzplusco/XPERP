import { DataTable } from "@/components/DataTable";
import { SectionHeader } from "@/components/SectionHeader";
import { eventRows } from "@/lib/mock-data";

export default function EventsPage() {
  return (
    <>
      <SectionHeader
        eyebrow="Events"
        title="Invitation and meeting operations"
        description="Events are spreadsheet-like operating lists for invitations, responses, attendance, and follow-up actions."
      />
      <section className="panel">
        <div className="panelHeader">
          <div>
            <div className="panelTitle">Event workbench</div>
            <div className="panelMeta">Owner, invitee set, state, next action</div>
          </div>
        </div>
        <DataTable
          columns={[
            { key: "event", label: "Event" },
            { key: "owner", label: "Owner" },
            { key: "invitees", label: "Invitees" },
            { key: "state", label: "State" },
            { key: "next", label: "Next action" },
          ]}
          rows={eventRows}
        />
      </section>
    </>
  );
}

