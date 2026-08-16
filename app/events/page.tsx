import { DataTable } from "@/components/DataTable";
import { SectionHeader } from "@/components/SectionHeader";
import { getEventRows } from "@/lib/operational-data";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const eventRows = await getEventRows(14);

  return (
    <>
      <SectionHeader
        eyebrow="이벤트"
        title="초대 및 모임 운영"
        description="이벤트는 초대, 회신, 참석 여부, 후속 액션을 빠르게 갱신하는 운영 테이블입니다."
      />
      <section className="panel">
        <div className="panelHeader">
          <div>
            <div className="panelTitle">이벤트 워크벤치</div>
            <div className="panelMeta">담당, 초대 대상, 상태, 다음 액션</div>
          </div>
        </div>
        <DataTable
          columns={[
            { key: "event", label: "이벤트" },
            { key: "owner", label: "담당" },
            { key: "invitees", label: "초대 대상" },
            { key: "state", label: "상태" },
            { key: "next", label: "다음 액션" },
          ]}
          rows={eventRows}
        />
      </section>
    </>
  );
}
