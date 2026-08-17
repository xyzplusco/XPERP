import { DataTable } from "@/components/DataTable";
import {
  getCustomerRows,
  getDocumentRequirementRows,
  getProjectRows,
  getSourceStats,
  getTaskRows,
} from "@/lib/operational-data";
import { CustomerTable } from "@/components/CustomerTable";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [sourceStats, customerRows, activeProjects, documentGaps, taskRows] = await Promise.all([
    getSourceStats(),
    getCustomerRows(8),
    getProjectRows(8),
    getDocumentRequirementRows(8),
    getTaskRows(8),
  ]);

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
              <div className="panelTitle">진행 프로젝트 관리</div>
              <div className="panelMeta">PL/PM, 프로젝트 유형, 다음 액션</div>
            </div>
            <div className="accentLine" />
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
        </div>

        <div className="panel">
          <div className="panelHeader">
            <div>
              <div className="panelTitle">문서 미비 항목</div>
              <div className="panelMeta">NDA, 프로필, 위촉, MOU</div>
            </div>
          </div>
          <DataTable
            columns={[
              { key: "subject", label: "대상" },
              { key: "type", label: "문서" },
              { key: "owner", label: "담당" },
              { key: "status", label: "상태" },
              { key: "due", label: "기한" },
            ]}
            rows={documentGaps}
          />
        </div>
      </section>

      <section className="panel">
        <div className="panelHeader">
          <div>
            <div className="panelTitle">고객사별 Deal 관리</div>
            <div className="panelMeta">Deals_0731 회사명 → 고객사 ID → 연결 프로젝트</div>
          </div>
        </div>
        <CustomerTable rows={customerRows} />
      </section>

      <section className="panel">
        <div className="panelHeader">
          <div>
            <div className="panelTitle">다음 액션</div>
            <div className="panelMeta">To Go List에서 정리한 운영 액션</div>
          </div>
        </div>
        <DataTable
          columns={[
            { key: "title", label: "액션" },
            { key: "owner", label: "담당" },
            { key: "link", label: "연결" },
            { key: "status", label: "상태" },
          ]}
          rows={taskRows}
        />
      </section>
    </>
  );
}
