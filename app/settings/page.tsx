import { SectionHeader } from "@/components/SectionHeader";

const settingsRows = [
  { key: "Backend", value: "Supabase recommended" },
  { key: "Document sensitivity", value: "internal / confidential / restricted" },
  { key: "Partner tags", value: "bod, employee, partner, partner_candidate, advisor" },
  { key: "Import mode", value: "idempotent with review queues" },
];

export default function SettingsPage() {
  return (
    <>
      <SectionHeader
        eyebrow="Settings"
        title="Operating rules"
        description="Settings should stay small in v1: users, roles, tags, source imports, and document sensitivity."
      />
      <section className="panel">
        <div className="panelHeader">
          <div>
            <div className="panelTitle">Decisions to carry into implementation</div>
            <div className="panelMeta">Defaults until changed by admin</div>
          </div>
        </div>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Setting</th>
                <th>Current direction</th>
              </tr>
            </thead>
            <tbody>
              {settingsRows.map((row) => (
                <tr key={row.key}>
                  <td>{row.key}</td>
                  <td>{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

