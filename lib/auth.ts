import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";

// owner  마스터 어드민 — 전부 + 영구삭제 + 계정 관리 (1명)
// staff  임직원(경영지원) — 전부 열람·편집
// member PL/PM — 자기 프로젝트 범위만
// viewer 열람전용 — 전부 열람, 쓰기 없음
export type Role = "owner" | "staff" | "member" | "viewer";

export const ROLE_LABEL: Record<Role, string> = {
  owner: "마스터 어드민",
  staff: "임직원",
  member: "PL/PM",
  viewer: "열람전용",
};

export type SessionUser = {
  authUserId: string;
  appUserId: string | null;
  email: string;
  role: Role;
  personId: string | null;
  personName: string | null;
};

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: appUser } = await supabase
    .from("users")
    .select("id, global_role, person_id, people:person_id(name_ko)")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const person = appUser?.people as { name_ko: string } | { name_ko: string }[] | null | undefined;
  const personName = Array.isArray(person) ? person[0]?.name_ko ?? null : person?.name_ko ?? null;

  return {
    authUserId: user.id,
    appUserId: appUser?.id ?? null,
    email: user.email ?? "",
    role: (appUser?.global_role as Role) ?? "member",
    personId: appUser?.person_id ?? null,
    personName,
  };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

// 전사 편집 권한 (owner + staff). 기존 호출부 호환을 위해 이름을 유지한다.
export function isAdmin(user: SessionUser | null) {
  return user?.role === "owner" || user?.role === "staff";
}

// 계정 관리·영구삭제
export function isOwner(user: SessionUser | null) {
  return user?.role === "owner";
}

// 전사 열람 (viewer 포함)
export function canSeeAll(user: SessionUser | null) {
  return user?.role === "owner" || user?.role === "staff" || user?.role === "viewer";
}

// 쓰기 가능 (viewer 제외)
export function canWrite(user: SessionUser | null) {
  return user?.role === "owner" || user?.role === "staff" || user?.role === "member";
}

// 매출 금액 열람 — PL/PM 에게는 숨긴다
export function canSeeRevenue(user: SessionUser | null) {
  return canSeeAll(user);
}

export function canEditProject(
  user: SessionUser | null,
  project: {
    primary_pl_person_id?: string | null;
    secondary_pl_person_id?: string | null;
    candidate_pm_person_id?: string | null;
    memberPersonIds?: string[];
  }
) {
  if (!user) return false;
  if (!canWrite(user)) return false;
  if (user.role === "owner" || user.role === "staff") return true;
  if (!user.personId) return false;
  if (
    project.primary_pl_person_id === user.personId ||
    project.secondary_pl_person_id === user.personId ||
    project.candidate_pm_person_id === user.personId
  ) {
    return true;
  }
  return project.memberPersonIds?.includes(user.personId) ?? false;
}
