import { DataTable } from "@/components/DataTable";
import { SectionHeader } from "@/components/SectionHeader";
import { taskRows } from "@/lib/mock-data";

export default function SearchPage() {
  return (
    <>
      <SectionHeader
        eyebrow="Search"
        title="Cross-entity operating search"
        description="Search must include names, companies, projects, events, documents, document requirements, weekly updates, source rows, and tasks."
      />
      <input
        className="searchBox"
        aria-label="Search XP ERP"
        placeholder="Search people, companies, documents, weekly updates, tasks..."
      />
      <section className="panel">
        <div className="panelHeader">
          <div>
            <div className="panelTitle">Example action results</div>
            <div className="panelMeta">Task rows are first-class search results</div>
          </div>
        </div>
        <DataTable
          columns={[
            { key: "title", label: "Result" },
            { key: "owner", label: "Owner" },
            { key: "link", label: "Area" },
            { key: "status", label: "Status" },
          ]}
          rows={taskRows}
        />
      </section>
    </>
  );
}

