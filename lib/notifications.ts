// 알림은 두 종류다.
//
//  사건 알림 — 티켓 배정, 보완 요청처럼 '그 순간'에만 알 수 있는 것. notifications 테이블에 쌓고 읽음 처리한다.
//  상태 알림 — 미작성 N건, 정체 N건처럼 '지금 세면 되는' 것. 저장하지 않고 볼 때마다 계산한다.
//              크론이 필요 없고 항상 정확하며, 해결되면 저절로 사라진다.

import { createSupabaseServer } from "@/lib/supabase/server";
import { canSeeAll, type SessionUser } from "@/lib/auth";
import { currentWeek } from "@/lib/week";

export type NotificationKind =
  | "ticket_assigned"
  | "ticket_comment"
  | "weekly_review_requested"
  | "weekly_confirmed"
  | "document_uploaded"
  | "meeting_note_uploaded"
  | "project_status_changed";

export type NotificationRow = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
  actor: string | null;
};

// ── 사건 알림 만들기 ────────────────────────────────────────────────────────
// 본인에게 가는 알림은 만들지 않는다 (내가 한 일을 나에게 알릴 이유가 없다).
export async function notify(input: {
  recipientUserIds: (string | null | undefined)[];
  actorUserId?: string | null;
  kind: NotificationKind;
  title: string;
  body?: string | null;
  link?: string | null;
  entityType?: string;
  entityId?: string;
}) {
  const recipients = Array.from(
    new Set(
      input.recipientUserIds.filter(
        (id): id is string => Boolean(id) && id !== input.actorUserId
      )
    )
  );
  if (recipients.length === 0) return;

  const supabase = await createSupabaseServer();
  const { error } = await supabase.from("notifications").insert(
    recipients.map((recipientUserId) => ({
      recipient_user_id: recipientUserId,
      actor_user_id: input.actorUserId ?? null,
      kind: input.kind,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
    }))
  );
  if (error) console.error("notify", error.message);
}

// 파트너(people) id 로 계정을 찾는다. 계정이 없으면 알림을 보낼 곳도 없다.
export async function userIdsForPeople(personIds: (string | null | undefined)[]) {
  const ids = Array.from(new Set(personIds.filter((v): v is string => Boolean(v))));
  if (ids.length === 0) return [];
  const supabase = await createSupabaseServer();
  const { data } = await supabase.from("users").select("id").in("person_id", ids).eq("status", "active");
  return ((data ?? []) as { id: string }[]).map((row) => row.id);
}

export async function adminUserIds() {
  const supabase = await createSupabaseServer();
  const { data } = await supabase
    .from("users")
    .select("id")
    .in("global_role", ["owner", "staff"])
    .eq("status", "active");
  return ((data ?? []) as { id: string }[]).map((row) => row.id);
}

// ── 알림함 ──────────────────────────────────────────────────────────────────
export async function getNotifications(limit = 100): Promise<NotificationRow[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("notifications")
    .select("id, kind, title, body, link, read_at, created_at, actor:users!notifications_actor_user_id_fkey(email)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("getNotifications", error.message);
    return [];
  }
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const actor = row.actor as { email: string } | { email: string }[] | null;
    return {
      id: row.id as string,
      kind: row.kind as string,
      title: row.title as string,
      body: (row.body as string) ?? null,
      link: (row.link as string) ?? null,
      read_at: (row.read_at as string) ?? null,
      created_at: row.created_at as string,
      actor: Array.isArray(actor) ? actor[0]?.email ?? null : actor?.email ?? null,
    };
  });
}

export async function getUnreadCount(): Promise<number> {
  const supabase = await createSupabaseServer();
  const { count } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .is("read_at", null);
  return count ?? 0;
}

// ── 상태 알림 ───────────────────────────────────────────────────────────────
export type StateAlert = {
  key: string;
  title: string;
  count: number;
  link: string;
  // 지금 손대야 하는 것 / 알고만 있으면 되는 것
  urgent: boolean;
};

// 금요일부터 주차 마감까지는 주간보고 독촉을 띄운다.
function weeklyDueSoon(now = new Date()) {
  return now.getDay() >= 5 || now.getDay() === 0;
}

export async function getStateAlerts(user: SessionUser | null): Promise<StateAlert[]> {
  if (!user?.appUserId) return [];
  const supabase = await createSupabaseServer();
  const week = currentWeek();
  const alerts: StateAlert[] = [];
  const today = new Date().toISOString().slice(0, 10);

  if (user.personId) {
    const [{ data: mine }, { data: written }, overdue] = await Promise.all([
      supabase
        .from("projects")
        .select("id")
        .is("deleted_at", null)
        .or(
          `primary_pl_person_id.eq.${user.personId},secondary_pl_person_id.eq.${user.personId},candidate_pm_person_id.eq.${user.personId}`
        ),
      supabase.from("project_weekly_updates").select("project_id").eq("update_label", week.label),
      supabase
        .from("tasks")
        .select("*", { count: "exact", head: true })
        .is("deleted_at", null)
        .eq("assignee_person_id", user.personId)
        .in("status", ["backlog", "in_progress", "waiting", "blocked"])
        .lt("due_date", today),
    ]);

    const mineIds = new Set(((mine ?? []) as { id: string }[]).map((r) => r.id));
    const writtenIds = new Set(((written ?? []) as { project_id: string }[]).map((r) => r.project_id));
    const missing = Array.from(mineIds).filter((id) => !writtenIds.has(id)).length;

    if (missing > 0) {
      alerts.push({
        key: "weekly_missing",
        title: `${week.label} 주간보고 미작성`,
        count: missing,
        link: `/weekly?label=${encodeURIComponent(week.label)}`,
        urgent: weeklyDueSoon(),
      });
    }
    if ((overdue.count ?? 0) > 0) {
      alerts.push({
        key: "ticket_overdue",
        title: "기한 지난 내 티켓",
        count: overdue.count ?? 0,
        link: "/tickets?scope=open",
        urgent: true,
      });
    }
  }

  if (canSeeAll(user)) {
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const [allProjects, weekWritten, unconfirmed, unsortedTickets, recentUpdates] = await Promise.all([
      supabase
        .from("projects")
        .select("id, primary_pl_person_id")
        .is("deleted_at", null)
        .in("status", ["confirmed", "likely", "discussing", "managed"]),
      supabase.from("project_weekly_updates").select("project_id").eq("update_label", week.label),
      supabase
        .from("project_weekly_updates")
        .select("*", { count: "exact", head: true })
        .eq("update_label", week.label)
        .is("confirmed_at", null),
      supabase
        .from("tasks")
        .select("*", { count: "exact", head: true })
        .is("deleted_at", null)
        .is("project_id", null)
        .in("status", ["backlog", "in_progress", "waiting", "blocked"]),
      supabase.from("project_weekly_updates").select("project_id").gte("update_date", cutoff),
    ]);

    const active = (allProjects.data ?? []) as { id: string; primary_pl_person_id: string | null }[];
    const writtenIds = new Set(((weekWritten.data ?? []) as { project_id: string }[]).map((r) => r.project_id));
    const freshIds = new Set(((recentUpdates.data ?? []) as { project_id: string }[]).map((r) => r.project_id));

    const missingAll = active.filter((p) => !writtenIds.has(p.id)).length;
    const noPl = active.filter((p) => !p.primary_pl_person_id).length;
    const stale = active.filter((p) => !freshIds.has(p.id)).length;

    if (missingAll > 0) {
      alerts.push({
        key: "weekly_missing_all",
        title: `${week.label} 전사 미작성`,
        count: missingAll,
        link: `/weekly/review?label=${encodeURIComponent(week.label)}`,
        urgent: weeklyDueSoon(),
      });
    }
    if ((unconfirmed.count ?? 0) > 0) {
      alerts.push({
        key: "weekly_unconfirmed",
        title: `${week.label} 미확인 업데이트`,
        count: unconfirmed.count ?? 0,
        link: `/weekly/review?label=${encodeURIComponent(week.label)}`,
        urgent: false,
      });
    }
    if (noPl > 0) {
      alerts.push({ key: "no_pl", title: "PL 미배정 프로젝트", count: noPl, link: "/projects?view=active", urgent: false });
    }
    if (stale > 0) {
      alerts.push({ key: "stale", title: "30일 이상 업데이트 없음", count: stale, link: "/projects?view=stale", urgent: false });
    }
    if ((unsortedTickets.count ?? 0) >= 20) {
      alerts.push({
        key: "unsorted_tickets",
        title: "미분류 티켓",
        count: unsortedTickets.count ?? 0,
        link: "/tickets?scope=unsorted",
        urgent: false,
      });
    }
  }

  return alerts;
}
