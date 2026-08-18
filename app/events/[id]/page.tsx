import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentsPanel } from "@/components/DocumentsPanel";
import { InviteeManager, type Invitee } from "@/components/InviteeManager";
import { SaveNotice } from "@/components/SaveNotice";
import { updateEventAction } from "@/lib/actions";
import { getEvent } from "@/lib/queries";
import { EVENT_STATUS_OPTIONS, formatDateTime, label } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { id } = await params;
  const { saved, error } = await searchParams;
  const data = await getEvent(id);
  if (!data) notFound();

  const { event, invitees, documents } = data;
  const updateAction = updateEventAction.bind(null, id);

  const toLocalInput = (value: unknown) => {
    if (!value || typeof value !== "string") return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };

  const isTbd = Boolean(event.is_date_tbd);

  return (
    <>
      <div className="detailHeader">
        <div className="detailKicker">
          <Link href="/events">이벤트</Link> / E-{id.replace(/-/g, "").slice(0, 8).toUpperCase()}
        </div>
        <div className="detailTitleRow">
          <h1>{String(event.name ?? "")}</h1>
          <span className="detailBadge">{label(String(event.status ?? ""))}</span>
        </div>
        <div className="detailSub">
          {[
            event.event_type,
            isTbd ? "일시 미정" : formatDateTime(event.starts_at as string | null),
            event.location,
          ]
            .filter((v) => v && v !== "–")
            .join(" · ") || "일시 미정"}
        </div>
      </div>

      <SaveNotice saved={saved} error={error} />

      <InviteeManager eventId={id} invitees={invitees as unknown as Invitee[]} />

      <DocumentsPanel
        entityType="event"
        entityId={id}
        returnPath={`/events/${id}`}
        documents={documents}
        title="관련 문서"
      />

      <div className="panel">
        <div className="panelHeader">
          <div className="panelTitle">이벤트 정보</div>
        </div>
        <div className="panelBody">
          <form action={updateAction} className="formGrid">
            <div className="field">
              <label>이벤트명</label>
              <input name="name" defaultValue={String(event.name ?? "")} required />
            </div>
            <div className="field">
              <label>유형</label>
              <input name="event_type" defaultValue={String(event.event_type ?? "")} list="event-types" />
              <datalist id="event-types">
                <option value="파트너스데이" />
                <option value="얼라인먼트데이" />
                <option value="DARWIN" />
                <option value="커미티" />
              </datalist>
            </div>
            <div className="field">
              <label>상태</label>
              <select name="status" defaultValue={String(event.status ?? "planning")}>
                {EVENT_STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {label(option)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>시작 일시</label>
              <input name="starts_at" type="datetime-local" defaultValue={toLocalInput(event.starts_at)} />
              <label style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4, fontWeight: 400 }}>
                <input
                  type="checkbox"
                  name="is_date_tbd"
                  defaultChecked={isTbd}
                  style={{ width: 15, height: 15, accentColor: "var(--green)" }}
                />
                일시 미정
              </label>
            </div>
            <div className="field">
              <label>종료 일시</label>
              <input name="ends_at" type="datetime-local" defaultValue={toLocalInput(event.ends_at)} />
            </div>
            <div className="field">
              <label>장소</label>
              <input name="location" defaultValue={String(event.location ?? "")} />
            </div>
            <div className="field full">
              <label>설명</label>
              <textarea name="description" defaultValue={String(event.description ?? "")} />
            </div>
            <div className="field full">
              <label>다음 액션</label>
              <input name="next_action" defaultValue={String(event.next_action ?? "")} />
            </div>
            <div className="formActions full">
              <button className="primaryButton" type="submit">
                저장
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
