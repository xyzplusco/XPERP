"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/auth";
import {
  EDITABLE,
  ENTITY_PATH,
  PROFILE_EDITABLE,
  isValidEntity,
  validateField,
  type EntityKey,
} from "@/lib/bulk";

function text(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export async function signInAction(formData: FormData) {
  const email = text(formData, "email");
  const password = formData.get("password");
  if (!email || typeof password !== "string" || password === "") {
    redirect("/login?error=missing");
  }
  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect("/login?error=invalid");
  }
  redirect("/");
}

export async function signOutAction() {
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  redirect("/login");
}

async function findPersonIdByName(name: string | null): Promise<string | null | undefined> {
  // undefined = 지정 안 함(변경 없음), null = 해제
  if (name === null) return null;
  const supabase = await createSupabaseServer();
  const { data } = await supabase.from("people").select("id").eq("name_ko", name).limit(2);
  if (!data || data.length === 0) return undefined;
  if (data.length > 1) return undefined;
  return data[0].id;
}

export async function updateProjectAction(projectId: string, formData: FormData) {
  const supabase = await createSupabaseServer();
  const user = await getSessionUser();

  const payload: Record<string, string | number | null> = {
    status: text(formData, "status") ?? "discussing",
    contract_status: text(formData, "contract_status"),
    summary: text(formData, "summary"),
    next_action: text(formData, "next_action"),
    start_date: text(formData, "start_date"),
    end_date: text(formData, "end_date"),
  };

  const revenue = text(formData, "expected_revenue");
  payload.expected_revenue = revenue === null ? null : Number(revenue.replace(/,/g, ""));
  if (Number.isNaN(payload.expected_revenue)) payload.expected_revenue = null;

  if (user?.role === "admin") {
    const type = text(formData, "project_type");
    if (type) payload.project_type = type;
    if (formData.has("folder_id")) payload.folder_id = text(formData, "folder_id");

    const plName = text(formData, "pl_name");
    const pmName = text(formData, "pm_name");
    if (formData.has("pl_name")) {
      const plId = await findPersonIdByName(plName);
      if (plId !== undefined) payload.primary_pl_person_id = plId;
    }
    if (formData.has("pm_name")) {
      const pmId = await findPersonIdByName(pmName);
      if (pmId !== undefined) payload.candidate_pm_person_id = pmId;
    }
  }

  const { error } = await supabase.from("projects").update(payload).eq("id", projectId);
  if (error) {
    console.error("updateProjectAction", error.message);
    redirect(`/projects/${projectId}?error=save`);
  }
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/");
  redirect(`/projects/${projectId}?saved=1`);
}

export async function addProjectUpdateAction(projectId: string, formData: FormData) {
  const body = text(formData, "body");
  if (!body) redirect(`/projects/${projectId}?error=empty`);

  const supabase = await createSupabaseServer();
  const user = await getSessionUser();
  const today = new Date().toISOString().slice(0, 10);

  const { error } = await supabase.from("project_weekly_updates").insert({
    project_id: projectId,
    update_label: today,
    update_date: today,
    body,
    created_by_user_id: user?.appUserId ?? null,
  });
  if (error) {
    console.error("addProjectUpdateAction", error.message);
    redirect(`/projects/${projectId}?error=save`);
  }

  await supabase.from("projects").update({ latest_update: body }).eq("id", projectId);

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/");
  redirect(`/projects/${projectId}?saved=1`);
}

export async function addTaskAction(projectId: string, formData: FormData) {
  const title = text(formData, "title");
  if (!title) redirect(`/projects/${projectId}?error=empty`);

  const supabase = await createSupabaseServer();
  const user = await getSessionUser();
  const { error } = await supabase.from("tasks").insert({
    title,
    status: "backlog",
    due_date: text(formData, "due_date"),
    project_id: projectId,
    created_by_user_id: user?.appUserId ?? null,
  });
  if (error) {
    console.error("addTaskAction", error.message);
    redirect(`/projects/${projectId}?error=save`);
  }
  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}?saved=1`);
}

export async function setTaskStatusAction(taskId: string, status: string, returnPath: string) {
  const supabase = await createSupabaseServer();
  const payload: Record<string, string | null> = { status };
  payload.completed_at = status === "done" ? new Date().toISOString() : null;
  const { error } = await supabase.from("tasks").update(payload).eq("id", taskId);
  if (error) console.error("setTaskStatusAction", error.message);
  revalidatePath(returnPath);
}

export async function updateCustomerAction(companyId: string, formData: FormData) {
  const user = await getSessionUser();
  if (user?.role !== "admin") redirect(`/customers/${companyId}?error=forbidden`);

  const supabase = await createSupabaseServer();
  const { error } = await supabase
    .from("companies")
    .update({
      name_ko: text(formData, "name_ko") ?? undefined,
      industry: text(formData, "industry"),
      representative_name: text(formData, "representative_name"),
      location: text(formData, "location"),
      website_url: text(formData, "website_url"),
      business_summary: text(formData, "business_summary"),
      core_product: text(formData, "core_product"),
      needs: text(formData, "needs"),
      next_action: text(formData, "next_action"),
      memo: text(formData, "memo"),
    })
    .eq("id", companyId);
  if (error) {
    console.error("updateCustomerAction", error.message);
    redirect(`/customers/${companyId}?error=save`);
  }
  revalidatePath(`/customers/${companyId}`);
  redirect(`/customers/${companyId}?saved=1`);
}

export async function updatePartnerAction(personId: string, formData: FormData) {
  const user = await getSessionUser();
  if (user?.role !== "admin") redirect(`/partners/${personId}?error=forbidden`);

  const supabase = await createSupabaseServer();

  const { error: personError } = await supabase
    .from("people")
    .update({
      name_ko: text(formData, "name_ko") ?? undefined,
      title: text(formData, "title"),
      email: text(formData, "email"),
      phone: text(formData, "phone"),
      memo: text(formData, "memo"),
    })
    .eq("id", personId);
  if (personError) {
    console.error("updatePartnerAction people", personError.message);
    redirect(`/partners/${personId}?error=save`);
  }

  const profilePayload = {
    person_id: personId,
    partner_status: text(formData, "partner_status"),
    network_segment: text(formData, "network_segment") ?? "unknown",
    nda_status: text(formData, "nda_status"),
    profile_status: text(formData, "profile_status"),
    appointment_status: text(formData, "appointment_status"),
    core_field: text(formData, "core_field"),
  };
  const { error: profileError } = await supabase
    .from("network_profiles")
    .upsert(profilePayload, { onConflict: "person_id" });
  if (profileError) {
    console.error("updatePartnerAction profile", profileError.message);
    redirect(`/partners/${personId}?error=save`);
  }

  revalidatePath(`/partners/${personId}`);
  revalidatePath("/partners");
  redirect(`/partners/${personId}?saved=1`);
}

const UPLOAD_ENTITY_TYPES = new Set(["person", "company", "project", "event"]);

export async function uploadDocumentAction(formData: FormData) {
  const entityType = text(formData, "entity_type");
  const entityId = text(formData, "entity_id");
  const returnPath = text(formData, "return_path") ?? "/documents";
  const file = formData.get("file");

  if (!entityType || !entityId || !UPLOAD_ENTITY_TYPES.has(entityType) || !(file instanceof File) || file.size === 0) {
    redirect(`${returnPath}?error=upload`);
  }
  if (file.size > 50 * 1024 * 1024) {
    redirect(`${returnPath}?error=toobig`);
  }

  const supabase = await createSupabaseServer();
  const user = await getSessionUser();

  const safeName = file.name.replace(/[^\w.\-가-힣 ]/g, "_");
  const storagePath = `${entityType}/${entityId}/${Date.now()}_${safeName}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: storageError } = await supabase.storage
    .from("xp-documents")
    .upload(storagePath, arrayBuffer, { contentType: file.type || "application/octet-stream" });
  if (storageError) {
    console.error("uploadDocumentAction storage", storageError.message);
    redirect(`${returnPath}?error=upload`);
  }

  const { data: docRow, error: docError } = await supabase
    .from("documents")
    .insert({
      document_type: text(formData, "document_type") ?? "일반",
      title: text(formData, "title") ?? file.name,
      sensitivity: text(formData, "sensitivity") ?? "internal",
      storage_bucket: "xp-documents",
      storage_path: storagePath,
      file_name: file.name,
      mime_type: file.type || null,
      file_size: file.size,
      uploaded_by_user_id: user?.appUserId ?? null,
      uploaded_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (docError || !docRow) {
    console.error("uploadDocumentAction insert", docError?.message);
    redirect(`${returnPath}?error=upload`);
  }

  const { error: linkError } = await supabase.from("entity_documents").insert({
    document_id: docRow.id,
    entity_type: entityType,
    entity_id: entityId,
    relationship_type: "related",
  });
  if (linkError) console.error("uploadDocumentAction link", linkError.message);

  const requirementId = text(formData, "requirement_id");
  if (requirementId) {
    const { error: reqError } = await supabase
      .from("document_requirements")
      .update({
        status: "received",
        received_at: new Date().toISOString().slice(0, 10),
        current_document_id: docRow.id,
      })
      .eq("id", requirementId);
    if (reqError) console.error("uploadDocumentAction requirement", reqError.message);
  }

  revalidatePath(returnPath);
  redirect(`${returnPath}?saved=1`);
}

export async function updateUserAction(userId: string, formData: FormData) {
  const user = await getSessionUser();
  if (user?.role !== "admin") redirect("/settings?error=forbidden");

  const supabase = await createSupabaseServer();
  const payload: Record<string, string | null> = {};

  const role = text(formData, "global_role");
  if (role && ["admin", "partner", "member", "external_contributor"].includes(role)) {
    payload.global_role = role;
  }
  const status = text(formData, "status");
  if (status && ["active", "invited", "disabled"].includes(status)) {
    payload.status = status;
  }

  if (formData.has("person_name")) {
    const personName = text(formData, "person_name");
    if (personName === null) {
      payload.person_id = null;
    } else {
      const personId = await findPersonIdByName(personName);
      if (personId === undefined) redirect("/settings?error=person");
      payload.person_id = personId;
    }
  }

  const { error } = await supabase.from("users").update(payload).eq("id", userId);
  if (error) {
    console.error("updateUserAction", error.message);
    redirect("/settings?error=save");
  }
  revalidatePath("/settings");
  redirect("/settings?saved=1");
}

export async function createEventAction(formData: FormData) {
  const user = await getSessionUser();
  const name = text(formData, "name");
  if (!name) redirect("/events?error=empty");

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("events")
    .insert({
      name,
      event_type: text(formData, "event_type"),
      status: text(formData, "status") ?? "planning",
      starts_at: text(formData, "starts_at"),
      is_date_tbd: formData.get("is_date_tbd") === "on",
      location: text(formData, "location"),
      description: text(formData, "description"),
      owner_user_id: user?.appUserId ?? null,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("createEventAction", error?.message);
    redirect("/events?error=save");
  }
  revalidatePath("/events");
  redirect(`/events/${data.id}?saved=1`);
}

export async function updateEventAction(eventId: string, formData: FormData) {
  const supabase = await createSupabaseServer();
  const { error } = await supabase
    .from("events")
    .update({
      name: text(formData, "name") ?? undefined,
      event_type: text(formData, "event_type"),
      status: text(formData, "status") ?? "planning",
      starts_at: text(formData, "starts_at"),
      is_date_tbd: formData.get("is_date_tbd") === "on",
      ends_at: text(formData, "ends_at"),
      location: text(formData, "location"),
      description: text(formData, "description"),
      next_action: text(formData, "next_action"),
    })
    .eq("id", eventId);
  if (error) {
    console.error("updateEventAction", error.message);
    redirect(`/events/${eventId}?error=save`);
  }
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events");
  redirect(`/events/${eventId}?saved=1`);
}

// ---------------------------------------------------------------- 회의록

export async function uploadMeetingNoteAction(formData: FormData) {
  const companyId = text(formData, "company_id");
  const projectId = text(formData, "project_id");
  const returnPath = text(formData, "return_path") ?? "/";
  const file = formData.get("file");

  if (!companyId && !projectId) redirect(`${returnPath}?error=upload`);
  if (!(file instanceof File) || file.size === 0) redirect(`${returnPath}?error=upload`);
  if (file.size > 50 * 1024 * 1024) redirect(`${returnPath}?error=toobig`);

  const meetingDate = text(formData, "meeting_date");
  if (!meetingDate) redirect(`${returnPath}?error=empty`);

  const supabase = await createSupabaseServer();
  const user = await getSessionUser();

  const safeName = file.name.replace(/[^\w.\-가-힣 ]/g, "_");
  const scope = companyId ? `company/${companyId}` : `project/${projectId}`;
  const storagePath = `${scope}/${meetingDate}_${Date.now()}_${safeName}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: storageError } = await supabase.storage
    .from("xp-meeting-notes")
    .upload(storagePath, arrayBuffer, { contentType: file.type || "application/octet-stream" });
  if (storageError) {
    console.error("uploadMeetingNoteAction storage", storageError.message);
    redirect(`${returnPath}?error=upload`);
  }

  const { error } = await supabase.from("meeting_notes").insert({
    company_id: companyId,
    project_id: projectId,
    title: text(formData, "title") ?? file.name,
    meeting_date: meetingDate,
    attendees: text(formData, "attendees"),
    summary: text(formData, "summary"),
    storage_bucket: "xp-meeting-notes",
    storage_path: storagePath,
    file_name: file.name,
    mime_type: file.type || null,
    file_size: file.size,
    uploaded_by_user_id: user?.appUserId ?? null,
  });
  if (error) {
    console.error("uploadMeetingNoteAction insert", error.message);
    await supabase.storage.from("xp-meeting-notes").remove([storagePath]);
    redirect(`${returnPath}?error=upload`);
  }

  revalidatePath(returnPath);
  redirect(`${returnPath}?saved=1`);
}

export async function deleteMeetingNoteAction(noteId: string, returnPath: string) {
  const supabase = await createSupabaseServer();

  const { data: note } = await supabase
    .from("meeting_notes")
    .select("storage_bucket, storage_path")
    .eq("id", noteId)
    .maybeSingle();

  const { error } = await supabase.from("meeting_notes").delete().eq("id", noteId);
  if (error) {
    console.error("deleteMeetingNoteAction", error.message);
    redirect(`${returnPath}?error=forbidden`);
  }

  if (note?.storage_path) {
    await supabase.storage
      .from(note.storage_bucket ?? "xp-meeting-notes")
      .remove([note.storage_path as string]);
  }

  revalidatePath(returnPath);
  redirect(`${returnPath}?saved=1`);
}

// ---------------------------------------------------------------- 티켓

export async function createTicketAction(formData: FormData) {
  const title = text(formData, "title");
  const returnPath = text(formData, "return_path") ?? "/tickets";
  if (!title) redirect(`${returnPath}?error=empty`);

  const supabase = await createSupabaseServer();
  const user = await getSessionUser();

  const { error } = await supabase.from("tasks").insert({
    title,
    description: text(formData, "description"),
    status: "backlog",
    priority: text(formData, "priority") ?? "normal",
    project_id: text(formData, "project_id"),
    assignee_person_id: text(formData, "assignee_person_id"),
    due_date: text(formData, "due_date"),
    created_by_user_id: user?.appUserId ?? null,
  });
  if (error) {
    console.error("createTicketAction", error.message);
    redirect(`${returnPath}?error=save`);
  }

  revalidatePath("/tickets");
  revalidatePath(returnPath);
  redirect(`${returnPath}?saved=1`);
}

export async function updateTicketAction(ticketId: string, formData: FormData) {
  const returnPath = text(formData, "return_path") ?? "/tickets";
  const supabase = await createSupabaseServer();

  const payload: Record<string, string | null> = {};
  if (formData.has("project_id")) payload.project_id = text(formData, "project_id");
  if (formData.has("assignee_person_id")) payload.assignee_person_id = text(formData, "assignee_person_id");
  if (formData.has("status")) {
    const status = text(formData, "status");
    if (status) {
      payload.status = status;
      payload.completed_at = status === "done" ? new Date().toISOString() : null;
    }
  }
  if (formData.has("due_date")) payload.due_date = text(formData, "due_date");
  if (formData.has("priority")) payload.priority = text(formData, "priority") ?? "normal";
  if (formData.has("title")) {
    const title = text(formData, "title");
    if (title) payload.title = title;
  }

  const { error } = await supabase.from("tasks").update(payload).eq("id", ticketId);
  if (error) {
    console.error("updateTicketAction", error.message);
    redirect(`${returnPath}?error=save`);
  }
  revalidatePath("/tickets");
  revalidatePath(returnPath);
  redirect(`${returnPath}?saved=1`);
}

export async function deleteTicketAction(ticketId: string, returnPath: string) {
  const supabase = await createSupabaseServer();
  const { error } = await supabase.from("tasks").delete().eq("id", ticketId);
  if (error) {
    console.error("deleteTicketAction", error.message);
    redirect(`${returnPath}?error=forbidden`);
  }
  revalidatePath("/tickets");
  revalidatePath(returnPath);
  redirect(`${returnPath}?saved=1`);
}

export async function setProjectFolderAction(projectId: string, formData: FormData) {
  const user = await getSessionUser();
  if (user?.role !== "admin") redirect(`/projects/${projectId}?error=forbidden`);

  const supabase = await createSupabaseServer();
  const { error } = await supabase
    .from("projects")
    .update({ folder_id: text(formData, "folder_id") })
    .eq("id", projectId);
  if (error) {
    console.error("setProjectFolderAction", error.message);
    redirect(`/projects/${projectId}?error=save`);
  }
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  redirect(`/projects/${projectId}?saved=1`);
}

// ---------------------------------------------------------------- 이벤트 참석자

// 엑셀에서 복사한 여러 줄을 한 번에 등록한다.
// 열 순서: 이름 / 회사 / 직함 / 이메일 / 전화  (탭 또는 콤마 구분, 뒤쪽 열은 없어도 됨)
export async function addInviteesAction(eventId: string, formData: FormData) {
  const raw = text(formData, "bulk");
  const returnPath = `/events/${eventId}`;
  if (!raw) redirect(`${returnPath}?error=empty`);

  const supabase = await createSupabaseServer();
  const user = await getSessionUser();

  const rows: Record<string, string | null>[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\t|,(?![^(]*\))/).map((p) => p.trim());
    const [name, company, title, email, phone] = parts;
    if (!name) continue;

    // 이메일·전화가 순서와 다르게 들어와도 알아본다.
    const all = parts.filter(Boolean);
    const foundEmail = all.find((p) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p)) ?? email ?? null;
    const foundPhone = all.find((p) => /^[\d][\d\-\s()]{7,}$/.test(p)) ?? phone ?? null;

    rows.push({
      event_id: eventId,
      name,
      company_name: company && company !== foundEmail && company !== foundPhone ? company : null,
      title: title && title !== foundEmail && title !== foundPhone ? title : null,
      email: foundEmail,
      phone: foundPhone,
      owner_user_id: user?.appUserId ?? null,
    });
  }

  if (rows.length === 0) redirect(`${returnPath}?error=empty`);

  // 이름이 정확히 일치하는 파트너가 한 명뿐이면 자동으로 연결한다.
  const names = Array.from(new Set(rows.map((r) => r.name as string)));
  const { data: people } = await supabase.from("people").select("id, name_ko, email").in("name_ko", names);
  const counts = new Map<string, number>();
  for (const person of people ?? []) counts.set(person.name_ko, (counts.get(person.name_ko) ?? 0) + 1);
  for (const row of rows) {
    const match = (people ?? []).find((p) => p.name_ko === row.name);
    if (match && counts.get(match.name_ko) === 1) {
      row.person_id = match.id;
      if (!row.email && match.email) row.email = match.email;
    }
  }

  const { error } = await supabase.from("event_invitees").insert(rows);
  if (error) {
    console.error("addInviteesAction", error.message);
    redirect(`${returnPath}?error=save`);
  }
  revalidatePath(returnPath);
  redirect(`${returnPath}?saved=1`);
}

export async function updateInviteeAction(inviteeId: string, eventId: string, formData: FormData) {
  const supabase = await createSupabaseServer();
  const payload: Record<string, string | boolean | null> = {};

  for (const flag of ["email_sent", "sms_sent", "response_received", "attendance_confirmed"]) {
    if (formData.has(flag)) payload[flag] = formData.get(flag) === "on" || formData.get(flag) === "true";
  }
  if (formData.has("will_attend")) {
    const value = text(formData, "will_attend");
    payload.will_attend = value === "yes" ? true : value === "no" ? false : null;
  }
  for (const field of ["name", "company_name", "title", "email", "phone", "memo"]) {
    if (formData.has(field)) payload[field] = text(formData, field);
  }

  const { error } = await supabase.from("event_invitees").update(payload).eq("id", inviteeId);
  if (error) console.error("updateInviteeAction", error.message);
  revalidatePath(`/events/${eventId}`);
}

export async function deleteInviteeAction(inviteeId: string, eventId: string) {
  const supabase = await createSupabaseServer();
  const { error } = await supabase.from("event_invitees").delete().eq("id", inviteeId);
  if (error) console.error("deleteInviteeAction", error.message);
  revalidatePath(`/events/${eventId}`);
}

export async function bulkInviteeFlagAction(eventId: string, formData: FormData) {
  const ids = formData.getAll("invitee_id").filter((v): v is string => typeof v === "string");
  const flag = text(formData, "flag");
  const value = text(formData, "value") === "true";
  const allowed = ["email_sent", "sms_sent", "response_received", "attendance_confirmed"];
  if (ids.length === 0 || !flag || !allowed.includes(flag)) {
    redirect(`/events/${eventId}?error=empty`);
  }

  const supabase = await createSupabaseServer();
  const { error } = await supabase.from("event_invitees").update({ [flag]: value }).in("id", ids);
  if (error) {
    console.error("bulkInviteeFlagAction", error.message);
    redirect(`/events/${eventId}?error=save`);
  }
  revalidatePath(`/events/${eventId}`);
  redirect(`/events/${eventId}?saved=1`);
}

// ---------------------------------------------------------------- 대량 편집 / 휴지통

async function assertAdminFor(entity: EntityKey, field: string) {
  const spec = entity === "people" && field in PROFILE_EDITABLE
    ? PROFILE_EDITABLE[field]
    : EDITABLE[entity][field];
  if (!spec?.adminOnly) return true;
  const user = await getSessionUser();
  return user?.role === "admin";
}

// 셀 하나를 바로 수정한다.
export async function inlineUpdateAction(
  entity: string,
  id: string,
  field: string,
  rawValue: string,
  returnPath: string
) {
  if (!isValidEntity(entity)) return { ok: false, message: "잘못된 대상입니다." };

  const isProfileField = entity === "people" && field in PROFILE_EDITABLE;
  const spec = isProfileField ? PROFILE_EDITABLE[field] : EDITABLE[entity][field];
  const result = validateField(spec, rawValue);
  if (!result.ok) return { ok: false, message: result.reason };

  if (!(await assertAdminFor(entity, field))) {
    return { ok: false, message: "관리자만 수정할 수 있습니다." };
  }

  const supabase = await createSupabaseServer();

  if (isProfileField) {
    const { error } = await supabase
      .from("network_profiles")
      .upsert({ person_id: id, network_segment: "unknown", [field]: result.value }, { onConflict: "person_id" });
    if (error) return { ok: false, message: error.message };
  } else {
    const { error } = await supabase.from(entity).update({ [field]: result.value }).eq("id", id);
    if (error) return { ok: false, message: error.message };
  }

  revalidatePath(returnPath);
  return { ok: true, message: "저장됨" };
}

// 선택한 여러 행에 같은 값을 적용한다.
export async function bulkUpdateAction(formData: FormData) {
  const entity = text(formData, "entity") ?? "";
  const field = text(formData, "field") ?? "";
  const value = text(formData, "value");
  const returnPath = text(formData, "return_path") ?? "/";
  const ids = formData.getAll("id").filter((v): v is string => typeof v === "string");

  if (!isValidEntity(entity) || ids.length === 0) redirect(`${returnPath}?error=empty`);

  const isProfileField = entity === "people" && field in PROFILE_EDITABLE;
  const spec = isProfileField ? PROFILE_EDITABLE[field] : EDITABLE[entity][field];
  const result = validateField(spec, value);
  if (!result.ok) redirect(`${returnPath}?error=save`);
  if (!(await assertAdminFor(entity, field))) redirect(`${returnPath}?error=forbidden`);

  const supabase = await createSupabaseServer();

  if (isProfileField) {
    const rows = ids.map((personId) => ({
      person_id: personId,
      network_segment: "unknown",
      [field]: result.value,
    }));
    const { error } = await supabase.from("network_profiles").upsert(rows, { onConflict: "person_id" });
    if (error) {
      console.error("bulkUpdateAction profile", error.message);
      redirect(`${returnPath}?error=save`);
    }
  } else {
    const { error } = await supabase.from(entity).update({ [field]: result.value }).in("id", ids);
    if (error) {
      console.error("bulkUpdateAction", error.message);
      redirect(`${returnPath}?error=save`);
    }
  }

  revalidatePath(returnPath);
  redirect(`${returnPath}?saved=${ids.length}`);
}

// 휴지통으로 보낸다 (실제로 지우지 않는다).
export async function bulkTrashAction(formData: FormData) {
  const entity = text(formData, "entity") ?? "";
  const returnPath = text(formData, "return_path") ?? "/";
  const ids = formData.getAll("id").filter((v): v is string => typeof v === "string");
  if (!isValidEntity(entity) || ids.length === 0) redirect(`${returnPath}?error=empty`);

  const supabase = await createSupabaseServer();
  const user = await getSessionUser();

  const { error } = await supabase
    .from(entity)
    .update({ deleted_at: new Date().toISOString(), deleted_by_user_id: user?.appUserId ?? null })
    .in("id", ids);
  if (error) {
    console.error("bulkTrashAction", error.message);
    redirect(`${returnPath}?error=save`);
  }

  revalidatePath(returnPath);
  revalidatePath("/trash");
  redirect(`${returnPath}?trashed=${ids.length}`);
}

export async function restoreAction(entity: string, id: string) {
  if (!isValidEntity(entity)) redirect("/trash?error=save");
  const supabase = await createSupabaseServer();
  const { error } = await supabase
    .from(entity)
    .update({ deleted_at: null, deleted_by_user_id: null })
    .eq("id", id);
  if (error) {
    console.error("restoreAction", error.message);
    redirect("/trash?error=save");
  }
  revalidatePath("/trash");
  const path = ENTITY_PATH[entity as EntityKey];
  if (path) revalidatePath(path);
  redirect("/trash?saved=1");
}

export async function purgeAction(entity: string, id: string) {
  const user = await getSessionUser();
  if (user?.role !== "admin") redirect("/trash?error=forbidden");
  if (!isValidEntity(entity)) redirect("/trash?error=save");

  const supabase = await createSupabaseServer();
  const { error } = await supabase.from(entity).delete().eq("id", id);
  if (error) {
    console.error("purgeAction", error.message);
    redirect("/trash?error=purge");
  }
  revalidatePath("/trash");
  redirect("/trash?saved=1");
}

export async function emptyTrashAction(entity: string) {
  const user = await getSessionUser();
  if (user?.role !== "admin") redirect("/trash?error=forbidden");
  if (!isValidEntity(entity)) redirect("/trash?error=save");

  const supabase = await createSupabaseServer();
  const { error } = await supabase.from(entity).delete().not("deleted_at", "is", null);
  if (error) {
    console.error("emptyTrashAction", error.message);
    redirect("/trash?error=purge");
  }
  revalidatePath("/trash");
  redirect("/trash?saved=1");
}

// ---------------------------------------------------------------- 주차 업데이트

// 한 화면에서 여러 프로젝트의 주차 업데이트를 한 번에 저장한다.
// PL 이 직접 쓰면 그게 곧 파이프라인이 된다 (경영지원 재입력 제거).
export async function saveWeeklyUpdatesAction(formData: FormData) {
  const label = text(formData, "label");
  const date = text(formData, "date");
  if (!label) redirect("/weekly?error=empty");

  const supabase = await createSupabaseServer();
  const user = await getSessionUser();

  const entries: { projectId: string; body: string | null }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("body_")) continue;
    const projectId = key.slice(5);
    const body = typeof value === "string" ? value.trim() : "";
    entries.push({ projectId, body: body === "" ? null : body });
  }
  if (entries.length === 0) redirect(`/weekly?label=${encodeURIComponent(label)}&error=empty`);

  let saved = 0;
  let cleared = 0;

  for (const entry of entries) {
    const { data: existing } = await supabase
      .from("project_weekly_updates")
      .select("id")
      .eq("project_id", entry.projectId)
      .eq("update_label", label)
      .maybeSingle();

    if (entry.body === null) {
      // 비우면 해당 주차 기록을 지운다 (오기입 정정)
      if (existing) {
        await supabase.from("project_weekly_updates").delete().eq("id", existing.id);
        cleared += 1;
      }
      continue;
    }

    if (existing) {
      const { error } = await supabase
        .from("project_weekly_updates")
        .update({ body: entry.body, update_date: date })
        .eq("id", existing.id);
      if (error) {
        console.error("saveWeeklyUpdatesAction update", error.message);
        continue;
      }
    } else {
      const { error } = await supabase.from("project_weekly_updates").insert({
        project_id: entry.projectId,
        update_label: label,
        update_date: date,
        body: entry.body,
        created_by_user_id: user?.appUserId ?? null,
      });
      if (error) {
        console.error("saveWeeklyUpdatesAction insert", error.message);
        continue;
      }
    }

    // 딜 목록에 바로 반영되도록 최신 내용도 갱신
    await supabase.from("projects").update({ latest_update: entry.body }).eq("id", entry.projectId);
    saved += 1;
  }

  revalidatePath("/weekly");
  revalidatePath("/");
  revalidatePath("/projects");
  redirect(`/weekly?label=${encodeURIComponent(label)}&saved=${saved}&cleared=${cleared}`);
}
