import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";

export type SessionUser = {
  authUserId: string;
  appUserId: string | null;
  email: string;
  role: "admin" | "partner" | "member" | "external_contributor";
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
    role: (appUser?.global_role as SessionUser["role"]) ?? "member",
    personId: appUser?.person_id ?? null,
    personName,
  };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export function isAdmin(user: SessionUser | null) {
  return user?.role === "admin";
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
  if (user.role === "admin") return true;
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
