import Link from "next/link";
import { SaveNotice } from "@/components/SaveNotice";
import { createEventAction } from "@/lib/actions";
import { getSessionUser } from "@/lib/auth";
import { getEvents } from "@/lib/queries";
import { EVENT_STATUS_OPTIONS, formatDateTime, label } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const [user, events] = await Promise.all([getSessionUser(), getEvents()]);

  return (
    <>
      <div className="pageHeader">
        <h1>이벤트</h1>
        <div className="pageHeaderMeta">{events.length}건</div>
      </div>

      <SaveNotice saved={saved} error={error} />

      <div className="panel">
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>이벤트</th>
                <th>유형</th>
                <th>상태</th>
                <th>일시</th>
                <th>장소</th>
                <th className="numeric">초대</th>
                <th className="numeric">참가확정</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td colSpan={7} className="emptyCell">
                    등록된 이벤트가 없습니다.
                  </td>
                </tr>
              ) : (
                events.map((event) => (
                  <tr key={String(event.id)}>
                    <td>
                      <Link className="tableLink" href={`/events/${event.id}`}>
                        {event.name}
                      </Link>
                    </td>
                    <td>{event.event_type ?? "–"}</td>
                    <td>{label(event.status)}</td>
                    <td className="mutedText">
                      {event.is_date_tbd ? "미정" : formatDateTime(event.starts_at)}
                    </td>
                    <td>{event.location ?? "–"}</td>
                    <td className="numeric">{event.invitee_count ?? 0}</td>
                    <td className="numeric">{event.confirmed_count ?? 0}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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
                  <option key={option} value={option}>
                    {label(option)}
                  </option>
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
              <button className="primaryButton" type="submit">
                등록
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
