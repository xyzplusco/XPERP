import Link from "next/link";
import { SaveNotice } from "@/components/SaveNotice";
import { deleteNotificationAction, markNotificationsReadAction } from "@/lib/actions";
import { getSessionUser } from "@/lib/auth";
import { getNotifications, getStateAlerts } from "@/lib/notifications";
import { formatDateTime } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const user = await getSessionUser();
  const [alerts, items] = await Promise.all([getStateAlerts(user), getNotifications()]);

  const unread = items.filter((item) => !item.read_at);

  return (
    <>
      <div className="pageHeader">
        <h1>알림</h1>
        <div className="pageHeaderMeta">{unread.length > 0 ? `안 읽음 ${unread.length}건` : ""}</div>
      </div>

      <SaveNotice saved={saved} error={error} />

      {alerts.length > 0 ? (
        <div className="alertRow">
          {alerts.map((alert) => (
            <Link
              key={alert.key}
              href={alert.link}
              className={alert.urgent ? "alertCell alertUrgent" : "alertCell"}
            >
              <div className="alertLabel">{alert.title}</div>
              <div className="alertValue">{alert.count}</div>
            </Link>
          ))}
        </div>
      ) : null}

      <div className="panel">
        <div className="panelHeader">
          <div className="panelTitle">받은 알림</div>
          {unread.length > 0 ? (
            <form action={markNotificationsReadAction}>
              <input type="hidden" name="return_path" value="/inbox" />
              <button className="smallButton" type="submit">
                모두 읽음
              </button>
            </form>
          ) : null}
        </div>

        {items.length === 0 ? (
          <div className="panelBody">
            <span className="faintText">받은 알림이 없습니다.</span>
          </div>
        ) : (
          <div>
            {items.map((item) => (
              <div key={item.id} className={item.read_at ? "inboxItem" : "inboxItem inboxUnread"}>
                <div className="inboxMain">
                  <div className="inboxTitle">
                    {item.link ? (
                      <Link className="tableLink" href={item.link}>
                        {item.title}
                      </Link>
                    ) : (
                      item.title
                    )}
                  </div>
                  {item.body ? <div className="inboxBody">{item.body}</div> : null}
                </div>
                <div className="inboxTime">{formatDateTime(item.created_at)}</div>
                <form action={deleteNotificationAction.bind(null, item.id)}>
                  <button className="smallButton" type="submit">
                    삭제
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
