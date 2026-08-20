import { BulkTable, type BulkRow, type ColumnDef } from "@/components/BulkTable";
import { SaveNotice } from "@/components/SaveNotice";
import { createEventAction } from "@/lib/actions";
import { getEvents } from "@/lib/queries";
import { getSessionUser, isOwner } from "@/lib/auth";
import { EVENT_STATUS_OPTIONS, formatDateTime, label } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; trashed?: string; error?: string }>;
}) {
  const { saved, trashed, error } = await searchParams;
  const [user, events] = await Promise.all([getSessionUser(), getEvents()]);

  const statusOptions: [string, string][] = EVENT_STATUS_OPTIONS.map((v) => [v, label(v)]);

  const columns: ColumnDef[] = [
    { key: "name", header: "이벤트", width: 260, kind: "text" },
    { key: "event_type", header: "유형", width: 130, kind: "text" },
    { key: "status", header: "상태", width: 100, kind: "select", options: statusOptions },
    { key: "starts_at", header: "일시", width: 150, kind: "readonly" },
    { key: "location", header: "장소", width: 140, kind: "text" },
    { key: "invitee_count", header: "초대", width: 70, kind: "readonly", numeric: true },
    { key: "confirmed_count", header: "참가확정", width: 90, kind: "readonly", numeric: true },
    { key: "next_action", header: "다음 액션", width: 320, kind: "text" },
  ];

  const rows: BulkRow[] = events.map((event) => {
    const id = String(event.id);
    return {
      id,
      href: `/events/${id}`,
      linkKey: "name",
      display: {
        name: String(event.name ?? ""),
        event_type: String(event.event_type ?? ""),
        status: label(String(event.status ?? "")),
        starts_at: event.is_date_tbd ? "미정" : formatDateTime(event.starts_at as string | null),
        location: String(event.location ?? ""),
        invitee_count: String((event as unknown as { invitee_count: number }).invitee_count ?? 0),
        confirmed_count: String((event as unknown as { confirmed_count: number }).confirmed_count ?? 0),
        next_action: String(event.next_action ?? ""),
      },
      raw: {
        name: String(event.name ?? ""),
        event_type: String(event.event_type ?? ""),
        status: String(event.status ?? ""),
        location: String(event.location ?? ""),
        next_action: String(event.next_action ?? ""),
      },
    };
  });

  return (
    <>
      <div className="pageHeader">
        <h1>이벤트</h1>
        <div className="pageHeaderMeta">{events.length}건</div>
      </div>

      <SaveNotice saved={saved ?? trashed} error={error} />

      <div className="panel">
        <BulkTable
          storageKey="events"
          canPaste={isOwner(user)}
          entity="events"
          columns={columns}
          rows={rows}
          returnPath="/events"
          bulkActions={[{ field: "status", label: "상태 변경", options: statusOptions }]}
          emptyText="등록된 이벤트가 없습니다."
        />
      </div>

      <div className="panel">
        <div className="panelHeader">
          <div className="panelTitle">이벤트 등록</div>
        </div>
        <div className="panelBody">
          <form action={createEventAction} className="formGrid">
            <div className="field">
              <label>이벤트명</label>
              <input name="name" required placeholder="2026 상반기 파트너스데이" />
            </div>
            <div className="field">
              <label>유형</label>
              <input name="event_type" list="event-types" placeholder="파트너스데이" />
              <datalist id="event-types">
                <option value="파트너스데이" />
                <option value="얼라인먼트데이" />
                <option value="DARWIN" />
                <option value="커미티" />
              </datalist>
            </div>
            <div className="field">
              <label>상태</label>
              <select name="status" defaultValue="planning">
                {EVENT_STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>{label(option)}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>일시</label>
              <input name="starts_at" type="datetime-local" />
              <label style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4, fontWeight: 400 }}>
                <input type="checkbox" name="is_date_tbd" style={{ width: 15, height: 15, accentColor: "var(--green)" }} />
                일시 미정
              </label>
            </div>
            <div className="field">
              <label>장소</label>
              <input name="location" />
            </div>
            <div className="field full">
              <label>설명</label>
              <textarea name="description" />
            </div>
            <div className="formActions full">
              <button className="primaryButton" type="submit">등록</button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
