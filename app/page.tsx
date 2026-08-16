import { DataTable } from "@/components/DataTable";
import { activeProjects, documentGaps, sourceStats, taskRows } from "@/lib/mock-data";

export default function DashboardPage() {
  return (
    <>
      <section className="gridStats" aria-label="Source stats">
        {sourceStats.map((stat) => (
          <div className="statCard" key={stat.label}>
            <div className="statLabel">{stat.label}</div>
            <div className="statValue">{stat.value}</div>
            <div className="statDetail">{stat.detail}</div>
          </div>
        ))}
      </section>

      <section className="twoColumn">
        <div className="panel">
          <div className="panelHeader">
            <div>
              <div className="panelTitle">Active project control</div>
              <div className="panelMeta">PL/PM, project type, next action</div>
            </div>
            <div className="accentLine" />
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
        </div>

        <div className="panel">
          <div className="panelHeader">
            <div>
              <div className="panelTitle">Document gaps</div>
              <div className="panelMeta">NDA, profile, appointment, MOU</div>
            </div>
          </div>
          <DataTable
            columns={[
              { key: "subject", label: "Subject" },
              { key: "type", label: "Type" },
              { key: "owner", label: "Owner" },
              { key: "status", label: "Status" },
              { key: "due", label: "Due" },
            ]}
            rows={documentGaps}
          />
        </div>
      </section>

      <section className="panel">
        <div className="panelHeader">
          <div>
            <div className="panelTitle">Next actions</div>
            <div className="panelMeta">Imported from To Go List and attached to operating entities</div>
          </div>
        </div>
        <DataTable
          columns={[
            { key: "title", label: "Action" },
            { key: "owner", label: "Owner" },
            { key: "link", label: "Linked area" },
            { key: "status", label: "Status" },
          ]}
          rows={taskRows}
        />
      </section>
    </>
  );
}

