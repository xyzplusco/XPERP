import { cache } from "react";
import { cookies } from "next/headers";
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

// 쿠키에 담긴 액세스 토큰에서 사용자 id/이메일만 꺼낸다 (네트워크 호출 없음).
// 위조된 토큰이면 이어지는 모든 Supabase 질의가 서명 검증에서 막히므로,
// 여기서 얻은 값만으로는 아무 데이터도 볼 수 없다. 페이지마다 인증 왕복 한 번을 아끼기 위한 것.
async function readTokenClaims(): Promise<{ sub: string; email: string } | null> {
  const store = await cookies();
  const parts = store
    .getAll()
    .filter((cookie) => /^sb-.*-auth-token(\.\d+)?$/.test(cookie.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (parts.length === 0) return null;

  const raw = parts.map((p) => p.value).join("");
  if (!raw.startsWith("base64-")) return null;

  try {
    const session = JSON.parse(Buffer.from(raw.slice("base64-".length), "base64").toString("utf8"));
    const token = session?.access_token;
    if (typeof token !== "string") return null;
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString("utf8"));
    if (typeof payload?.sub !== "string") return null;
    if (typeof payload?.exp === "number" && payload.exp * 1000 < Date.now()) return null;
    return { sub: payload.sub, email: typeof payload.email === "string" ? payload.email : "" };
  } catch {
    return null;
  }
}

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createSupabaseServer();

  let claims = await readTokenClaims();
  if (!claims) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    claims = { sub: user.id, email: user.email ?? "" };
  }

  const { data: appUser } = await supabase
    .from("users")
    .select("id, global_role, person_id, people:person_id(name_ko)")
    .eq("auth_user_id", claims.sub)
    .maybeSingle();

  const person = appUser?.people as { name_ko: string } | { name_ko: string }[] | null | undefined;
  const personName = Array.isArray(person) ? person[0]?.name_ko ?? null : person?.name_ko ?? null;

  return {
    authUserId: claims.sub,
    appUserId: appUser?.id ?? null,
    email: claims.email,
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
