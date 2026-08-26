"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { canSeeRevenue, getSessionUser, isAdmin, isOwner } from "@/lib/auth";
import { createSupabaseAdmin, generatePassword } from "@/lib/supabase/admin";
import { getAssignablePeople, getProjectOptions } from "@/lib/queries";
import { adminUserIds, notify, userIdsForPeople } from "@/lib/notifications";
import { formatAmount, label } from "@/lib/labels";
import {
  EDITABLE,
  ENTITY_PATH,
  PROFILE_EDITABLE,
  isValidEntity,
  validateField,
  type EntityKey,
} from "@/lib/bulk";

// returnPath 에 이미 ?가 있을 수 있으므로 붙일 때 구분자를 골라 쓴다.
function withQuery(path: string, query: string) {
  return `${path}${path.includes("?") ? "&" : "?"}${query}`;
}

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

  const { data: previous } = await supabase
    .from("projects")
    .select("name, deal_status, pipeline_stage, expected_revenue")
    .eq("id", projectId)
    .maybeSingle();

  const payload: Record<string, string | number | null> = {
    // status / contract_status 는 트리거가 deal_status·pipeline_stage 에서 파생시킨다.
    pipeline_stage: text(formData, "pipeline_stage") ?? "미정리후보",
    deal_status: text(formData, "deal_status") ?? "미분류",
    service_sector: text(formData, "service_sector") ?? "기타·미정",
    summary: text(formData, "summary"),
    next_action: text(formData, "next_action"),
    start_date: text(formData, "start_date"),
    end_date: text(formData, "end_date"),
  };

  // 매출은 전사 열람 권한이 있는 역할만 수정할 수 있다 (PL/PM 화면에는 아예 없음)
  if (formData.has("expected_revenue") && canSeeRevenue(user)) {
    const revenue = text(formData, "expected_revenue");
    payload.expected_revenue = revenue === null ? null : Number(revenue.replace(/,/g, ""));
    if (Number.isNaN(payload.expected_revenue)) payload.expected_revenue = null;
  }

  if (isAdmin(user)) {
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
  await logActivity({
    entityType: "project",
    entityId: projectId,
    action: "update",
    before: previous,
    after: payload,
  });

  // 되돌리기 어려운 변경(계약 확정·중단·완료·매출)은 어드민에게 알린다.
  const watched: string[] = [];
  if (previous && payload.deal_status !== previous.deal_status) {
    if (["계약", "계약임박", "보류"].includes(String(payload.deal_status))) {
      watched.push(`상태 ${previous.deal_status} → ${payload.deal_status}`);
    }
  }
  if (previous && payload.pipeline_stage !== previous.pipeline_stage) {
    watched.push(`구간 ${previous.pipeline_stage ?? "–"} → ${payload.pipeline_stage ?? "–"}`);
  }
  if (
    previous &&
    "expected_revenue" in payload &&
    Number(payload.expected_revenue ?? 0) !== Number(previous.expected_revenue ?? 0)
  ) {
    watched.push(`매출 ${formatAmount(previous.expected_revenue)} → ${formatAmount(payload.expected_revenue as number | null)}`);
  }

  if (watched.length > 0) {
    await notify({
      recipientUserIds: await adminUserIds(),
      actorUserId: user?.appUserId,
      kind: "project_status_changed",
      title: `${previous?.name ?? "프로젝트"} 변경`,
      body: watched.join(" · "),
      link: `/projects/${projectId}`,
      entityType: "project",
      entityId: projectId,
    });
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
  if (!isAdmin(user)) redirect(`/customers/${companyId}?error=forbidden`);

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
  if (!isAdmin(user)) redirect(`/partners/${personId}?error=forbidden`);

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
    redirect(withQuery(returnPath, `error=upload`));
  }
  if (file.size > 50 * 1024 * 1024) {
    redirect(withQuery(returnPath, `error=toobig`));
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
    redirect(withQuery(returnPath, `error=upload`));
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
    redirect(withQuery(returnPath, `error=upload`));
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
  redirect(withQuery(returnPath, `saved=1`));
}

export async function updateUserAction(userId: string, formData: FormData) {
  const user = await getSessionUser();
  if (!isOwner(user)) redirect("/settings?error=forbidden");

  const supabase = await createSupabaseServer();
  const payload: Record<string, string | null> = {};

  const role = text(formData, "global_role");
  if (role && ["owner", "staff", "member", "viewer"].includes(role)) {
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

  if (!companyId && !projectId) redirect(withQuery(returnPath, `error=upload`));
  if (!(file instanceof File) || file.size === 0) redirect(withQuery(returnPath, `error=upload`));
  if (file.size > 50 * 1024 * 1024) redirect(withQuery(returnPath, `error=toobig`));

  const meetingDate = text(formData, "meeting_date");
  if (!meetingDate) redirect(withQuery(returnPath, `error=empty`));

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
    redirect(withQuery(returnPath, `error=upload`));
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
    redirect(withQuery(returnPath, `error=upload`));
  }

  revalidatePath(returnPath);
  redirect(withQuery(returnPath, `saved=1`));
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
    redirect(withQuery(returnPath, `error=forbidden`));
  }

  if (note?.storage_path) {
    await supabase.storage
      .from(note.storage_bucket ?? "xp-meeting-notes")
      .remove([note.storage_path as string]);
  }

  revalidatePath(returnPath);
  redirect(withQuery(returnPath, `saved=1`));
}

// ---------------------------------------------------------------- 티켓

export async function createTicketAction(formData: FormData) {
  const title = text(formData, "title");
  const returnPath = text(formData, "return_path") ?? "/tickets";
  if (!title) redirect(withQuery(returnPath, `error=empty`));

  const supabase = await createSupabaseServer();
  const user = await getSessionUser();

  const assigneePersonId = text(formData, "assignee_person_id");
  const { data: created, error } = await supabase
    .from("tasks")
    .insert({
      title,
      description: text(formData, "description"),
      status: "backlog",
      priority: text(formData, "priority") ?? "normal",
      project_id: text(formData, "project_id"),
      assignee_person_id: assigneePersonId,
      due_date: text(formData, "due_date"),
      created_by_user_id: user?.appUserId ?? null,
    })
    .select("id")
    .single();
  if (error) {
    console.error("createTicketAction", error.message);
    redirect(withQuery(returnPath, `error=save`));
  }

  if (assigneePersonId && created) {
    await notify({
      recipientUserIds: await userIdsForPeople([assigneePersonId]),
      actorUserId: user?.appUserId,
      kind: "ticket_assigned",
      title: `티켓 배정 — ${title}`,
      link: `/tickets/${created.id}`,
      entityType: "task",
      entityId: created.id,
    });
  }

  revalidatePath("/tickets");
  revalidatePath(returnPath);
  redirect(withQuery(returnPath, `saved=1`));
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

  const { data: before } = await supabase
    .from("tasks")
    .select("assignee_person_id, title")
    .eq("id", ticketId)
    .maybeSingle();

  const { error } = await supabase.from("tasks").update(payload).eq("id", ticketId);
  if (error) {
    console.error("updateTicketAction", error.message);
    redirect(withQuery(returnPath, `error=save`));
  }

  if (payload.assignee_person_id && payload.assignee_person_id !== before?.assignee_person_id) {
    const user = await getSessionUser();
    await notify({
      recipientUserIds: await userIdsForPeople([payload.assignee_person_id]),
      actorUserId: user?.appUserId,
      kind: "ticket_assigned",
      title: `티켓 배정 — ${payload.title ?? before?.title ?? ""}`,
      link: `/tickets/${ticketId}`,
      entityType: "task",
      entityId: ticketId,
    });
  }

  revalidatePath("/tickets");
  revalidatePath(returnPath);
  redirect(withQuery(returnPath, `saved=1`));
}

// 목록의 일괄 삭제(bulkTrashAction)와 동작을 맞춘다. 하드 삭제가 아니라 휴지통행이다.
export async function deleteTicketAction(ticketId: string, returnPath: string) {
  const supabase = await createSupabaseServer();
  const user = await getSessionUser();
  const { error } = await supabase
    .from("tasks")
    .update({ deleted_at: new Date().toISOString(), deleted_by_user_id: user?.appUserId ?? null })
    .eq("id", ticketId);
  await logActivity({ entityType: "tasks", entityId: ticketId, action: "trash" });
  if (error) {
    console.error("deleteTicketAction", error.message);
    redirect(withQuery(returnPath, `error=forbidden`));
  }
  revalidatePath("/tickets");
  revalidatePath(returnPath);
  redirect(withQuery(returnPath, `saved=1`));
}

export async function setProjectFolderAction(projectId: string, formData: FormData) {
  const user = await getSessionUser();
  if (!isAdmin(user)) redirect(`/projects/${projectId}?error=forbidden`);

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
  if (!raw) redirect(withQuery(returnPath, `error=empty`));

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

  if (rows.length === 0) redirect(withQuery(returnPath, `error=empty`));

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
    redirect(withQuery(returnPath, `error=save`));
  }
  revalidatePath(returnPath);
  redirect(withQuery(returnPath, `saved=1`));
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
  return isAdmin(user);
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

  await logActivity({
    entityType: entity,
    entityId: id,
    action: "inline_update",
    after: { [field]: result.value },
  });

  // 화면은 클라이언트가 낙관적으로 이미 갱신했다.
  // 여기서 revalidatePath 를 하면 셀 하나 고칠 때마다 페이지 전체가 다시 그려져 눈에 띄게 느려진다.
  void returnPath;
  return { ok: true, message: "저장됨" };
}

// 선택한 여러 행에 같은 값을 적용한다.
export async function bulkUpdateAction(formData: FormData) {
  const entity = text(formData, "entity") ?? "";
  const field = text(formData, "field") ?? "";
  const value = text(formData, "value");
  const returnPath = text(formData, "return_path") ?? "/";
  const ids = formData.getAll("id").filter((v): v is string => typeof v === "string");

  if (!isValidEntity(entity) || ids.length === 0) redirect(withQuery(returnPath, `error=empty`));

  const isProfileField = entity === "people" && field in PROFILE_EDITABLE;
  const spec = isProfileField ? PROFILE_EDITABLE[field] : EDITABLE[entity][field];
  const result = validateField(spec, value);
  if (!result.ok) redirect(withQuery(returnPath, `error=save`));
  if (!(await assertAdminFor(entity, field))) redirect(withQuery(returnPath, `error=forbidden`));

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
      redirect(withQuery(returnPath, `error=save`));
    }
  } else {
    const { error } = await supabase.from(entity).update({ [field]: result.value }).in("id", ids);
    if (error) {
      console.error("bulkUpdateAction", error.message);
      redirect(withQuery(returnPath, `error=save`));
    }
  }

  for (const id of ids) {
    await logActivity({ entityType: entity, entityId: id, action: "bulk_update", after: { [field]: result.value } });
  }

  revalidatePath(returnPath);
  redirect(withQuery(returnPath, `saved=${ids.length}`));
}

// 휴지통으로 보낸다 (실제로 지우지 않는다).
export async function bulkTrashAction(formData: FormData) {
  const entity = text(formData, "entity") ?? "";
  const returnPath = text(formData, "return_path") ?? "/";
  const ids = formData.getAll("id").filter((v): v is string => typeof v === "string");
  if (!isValidEntity(entity) || ids.length === 0) redirect(withQuery(returnPath, `error=empty`));

  const supabase = await createSupabaseServer();
  const user = await getSessionUser();

  const { error } = await supabase
    .from(entity)
    .update({ deleted_at: new Date().toISOString(), deleted_by_user_id: user?.appUserId ?? null })
    .in("id", ids);
  if (error) {
    console.error("bulkTrashAction", error.message);
    redirect(withQuery(returnPath, `error=save`));
  }

  for (const id of ids) {
    await logActivity({ entityType: entity, entityId: id, action: "trash" });
  }

  revalidatePath(returnPath);
  revalidatePath("/trash");
  redirect(withQuery(returnPath, `trashed=${ids.length}`));
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
  if (!isOwner(user)) redirect("/trash?error=forbidden");
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
  if (!isOwner(user)) redirect("/trash?error=forbidden");
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

  let failed = 0;

  for (const entry of entries) {
    // maybeSingle() 은 행이 2개 이상이면 오류를 낸다. 오류를 무시하면 '기록 없음' 으로 보고
    // insert 를 또 해서 중복이 계속 늘어난다. limit(1) + 오류 확인으로 바꾼다.
    const { data: existingRows, error: lookupError } = await supabase
      .from("project_weekly_updates")
      .select("id")
      .eq("project_id", entry.projectId)
      .eq("update_label", label)
      .limit(1);
    if (lookupError) {
      console.error("saveWeeklyUpdatesAction lookup", lookupError.message);
      failed += 1;
      continue;
    }
    const existing = existingRows?.[0] ?? null;

    if (entry.body === null) {
      // 비우면 해당 주차 기록을 지운다 (오기입 정정)
      if (existing) {
        const { error } = await supabase.from("project_weekly_updates").delete().eq("id", existing.id);
        if (error) {
          console.error("saveWeeklyUpdatesAction delete", error.message);
          failed += 1;
          continue;
        }
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
        failed += 1;
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
        failed += 1;
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
  redirect(
    `/weekly?label=${encodeURIComponent(label)}&saved=${saved}&cleared=${cleared}` +
      (failed > 0 ? `&failed=${failed}` : "")
  );
}

// ---------------------------------------------------------------- 계정 관리 (마스터 어드민)

export async function createAccountAction(formData: FormData) {
  const owner = await getSessionUser();
  if (!isOwner(owner)) redirect("/settings?error=forbidden");

  const admin = createSupabaseAdmin();
  if (!admin) redirect("/settings?error=nokey");

  const email = text(formData, "email")?.toLowerCase();
  const role = text(formData, "global_role") ?? "member";
  const personName = text(formData, "person_name");
  const customPassword = text(formData, "password");

  if (!email || !email.includes("@")) redirect("/settings?error=email");
  if (!["owner", "staff", "member", "viewer"].includes(role)) redirect("/settings?error=save");
  if (role === "owner") redirect("/settings?error=owner");

  const supabase = await createSupabaseServer();

  let personId: string | null = null;
  if (personName) {
    const { data } = await supabase.from("people").select("id").eq("name_ko", personName).limit(2);
    if (!data || data.length === 0) redirect("/settings?error=person");
    if (data.length > 1) redirect("/settings?error=duplicate");
    personId = data[0].id;
  }

  const password = customPassword && customPassword.length >= 8 ? customPassword : generatePassword();

  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authError || !created?.user) {
    const message = authError?.message ?? "Auth 사용자를 만들지 못했습니다";
    console.error("createAccountAction auth", message);
    if (/already/i.test(message)) redirect("/settings?error=exists");
    redirect(`/settings?error=save&reason=${encodeURIComponent(message.slice(0, 300))}`);
  }

  const { error: rowError } = await admin.from("users").insert({
    email,
    global_role: role,
    status: "active",
    auth_user_id: created.user.id,
    person_id: personId,
  });
  if (rowError) {
    // 계정 행 생성이 실패하면 Auth 사용자도 되돌린다 (고아 계정 방지)
    await admin.auth.admin.deleteUser(created.user.id);
    console.error("createAccountAction row", rowError.message);
    redirect(`/settings?error=save&reason=${encodeURIComponent(rowError.message.slice(0, 300))}`);
  }

  revalidatePath("/settings");
  redirect(`/settings?created=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`);
}

export async function resetPasswordAction(userId: string) {
  const owner = await getSessionUser();
  if (!isOwner(owner)) redirect("/settings?error=forbidden");

  const admin = createSupabaseAdmin();
  if (!admin) redirect("/settings?error=nokey");

  const { data: row } = await admin.from("users").select("email, auth_user_id").eq("id", userId).maybeSingle();
  if (!row?.auth_user_id) redirect("/settings?error=save");

  const password = generatePassword();
  const { error } = await admin.auth.admin.updateUserById(row.auth_user_id as string, { password });
  if (error) {
    console.error("resetPasswordAction", error.message);
    redirect(`/settings?error=save&reason=${encodeURIComponent(error.message.slice(0, 300))}`);
  }

  revalidatePath("/settings");
  redirect(`/settings?created=${encodeURIComponent(row.email as string)}&password=${encodeURIComponent(password)}&reset=1`);
}

export async function deleteAccountAction(userId: string) {
  const owner = await getSessionUser();
  if (!isOwner(owner)) redirect("/settings?error=forbidden");
  if (owner?.appUserId === userId) redirect("/settings?error=self");

  const admin = createSupabaseAdmin();
  if (!admin) redirect("/settings?error=nokey");

  const { data: row } = await admin.from("users").select("auth_user_id, global_role").eq("id", userId).maybeSingle();
  if (row?.global_role === "owner") redirect("/settings?error=owner");

  await admin.from("users").delete().eq("id", userId);
  if (row?.auth_user_id) await admin.auth.admin.deleteUser(row.auth_user_id as string);

  revalidatePath("/settings");
  redirect("/settings?saved=1");
}

// ── 이벤트 참석자: 파트너 DB 검색 추가 / 인라인 신규 등록 ────────────────────
type InviteeResult = { ok: boolean; message: string };

export async function addInviteeFromPersonAction(
  eventId: string,
  personId: string
): Promise<InviteeResult> {
  const supabase = await createSupabaseServer();
  const user = await getSessionUser();

  const { data: person } = await supabase
    .from("people")
    .select("id, name_ko, title, email, phone, company:companies!people_primary_company_id_fkey(name_ko)")
    .eq("id", personId)
    .maybeSingle();
  if (!person) return { ok: false, message: "파트너를 찾을 수 없습니다" };

  const { data: existing } = await supabase
    .from("event_invitees")
    .select("id")
    .eq("event_id", eventId)
    .eq("person_id", personId)
    .limit(1);
  if (existing && existing.length > 0) {
    return { ok: false, message: `${person.name_ko} 은(는) 이미 명단에 있습니다` };
  }

  const company = person.company as { name_ko: string } | { name_ko: string }[] | null;
  const companyName = Array.isArray(company) ? company[0]?.name_ko ?? null : company?.name_ko ?? null;

  const { error } = await supabase.from("event_invitees").insert({
    event_id: eventId,
    person_id: person.id,
    name: person.name_ko,
    company_name: companyName,
    title: person.title ?? null,
    email: person.email ?? null,
    phone: person.phone ?? null,
    owner_user_id: user?.appUserId ?? null,
  });
  if (error) {
    console.error("addInviteeFromPersonAction", error.message);
    return { ok: false, message: "추가하지 못했습니다" };
  }
  revalidatePath(`/events/${eventId}`);
  return { ok: true, message: `${person.name_ko} 추가됨` };
}

export async function createPersonAndInviteAction(
  eventId: string,
  input: { name: string; company: string; title: string; email: string; phone: string }
): Promise<InviteeResult> {
  const supabase = await createSupabaseServer();
  const user = await getSessionUser();

  const name = input.name.trim();
  if (!name) return { ok: false, message: "이름을 입력하세요" };

  const clean = (value: string) => {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  };
  const companyName = clean(input.company);

  // 소속이 기존 고객사와 정확히 일치하면 연결한다. 없으면 회사 행은 만들지 않는다.
  let companyId: string | null = null;
  if (companyName) {
    const { data: matched } = await supabase
      .from("companies")
      .select("id")
      .eq("name_ko", companyName)
      .is("deleted_at", null)
      .limit(2);
    if (matched && matched.length === 1) companyId = matched[0].id;
  }

  const { data: created, error: personError } = await supabase
    .from("people")
    .insert({
      name_ko: name,
      title: clean(input.title),
      email: clean(input.email),
      phone: clean(input.phone),
      primary_company_id: companyId,
      source: "event_invitee",
    })
    .select("id")
    .single();

  if (personError || !created) {
    console.error("createPersonAndInviteAction/person", personError?.message);
    return { ok: false, message: "파트너를 만들지 못했습니다" };
  }

  // 프로필이 없으면 파트너 목록/보드에서 구분을 못 잡으므로 함께 만든다.
  const { error: profileError } = await supabase
    .from("network_profiles")
    .insert({ person_id: created.id, network_segment: "event_invitee" });
  if (profileError) console.error("createPersonAndInviteAction/profile", profileError.message);

  const { error } = await supabase.from("event_invitees").insert({
    event_id: eventId,
    person_id: created.id,
    name,
    company_name: companyName,
    title: clean(input.title),
    email: clean(input.email),
    phone: clean(input.phone),
    company_id: companyId,
    owner_user_id: user?.appUserId ?? null,
  });
  if (error) {
    console.error("createPersonAndInviteAction/invitee", error.message);
    return { ok: false, message: "파트너는 만들어졌지만 명단 추가에 실패했습니다" };
  }
  revalidatePath(`/events/${eventId}`);
  return { ok: true, message: `${name} 신규 등록 후 추가됨` };
}

// 티켓 창을 열 때만 담당자·프로젝트 목록을 가져온다 (사이드바 때문에 전 페이지가 느려지지 않도록).
export async function getTicketOptionsAction() {
  const user = await getSessionUser();
  if (!user?.appUserId) return { assignables: [], projects: [] };
  const [assignables, projects] = await Promise.all([getAssignablePeople(), getProjectOptions()]);
  return { assignables, projects };
}

// 엑셀에서 복사한 표를 그대로 붙여넣어 여러 칸을 한 번에 고친다. 마스터 어드민 전용.
export async function gridUpdateAction(
  entity: string,
  cells: { id: string; field: string; value: string }[]
): Promise<{ ok: boolean; results: { id: string; field: string; ok: boolean; message: string }[] }> {
  const results: { id: string; field: string; ok: boolean; message: string }[] = [];
  const reject = (message: string) => ({
    ok: false,
    results: cells.map((cell) => ({ id: cell.id, field: cell.field, ok: false, message })),
  });

  if (!isValidEntity(entity)) return reject("잘못된 대상입니다.");
  if (cells.length === 0) return { ok: true, results };
  if (cells.length > 2000) return reject("한 번에 2000칸까지 붙여넣을 수 있습니다.");

  const user = await getSessionUser();
  if (!isAdmin(user)) return reject("전사 편집 권한이 있는 계정만 붙여넣기로 수정할 수 있습니다.");

  const supabase = await createSupabaseServer();

  // 같은 (필드, 값) 끼리 묶어 왕복 횟수를 줄인다.
  const groups = new Map<string, { field: string; value: string | number | null; ids: string[]; profile: boolean }>();

  for (const cell of cells) {
    const isProfileField = entity === "people" && cell.field in PROFILE_EDITABLE;
    const spec = isProfileField ? PROFILE_EDITABLE[cell.field] : EDITABLE[entity as EntityKey][cell.field];
    const validated = validateField(spec, cell.value);
    if (!validated.ok) {
      results.push({ id: cell.id, field: cell.field, ok: false, message: validated.reason });
      continue;
    }
    const key = `${isProfileField ? "p" : "e"}|${cell.field}|${String(validated.value)}`;
    const group = groups.get(key) ?? { field: cell.field, value: validated.value, ids: [], profile: isProfileField };
    group.ids.push(cell.id);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    const { error } = group.profile
      ? await supabase.from("network_profiles").upsert(
          group.ids.map((personId) => ({
            person_id: personId,
            network_segment: "unknown",
            [group.field]: group.value,
          })),
          { onConflict: "person_id" }
        )
      : await supabase.from(entity).update({ [group.field]: group.value }).in("id", group.ids);

    for (const id of group.ids) {
      results.push({
        id,
        field: group.field,
        ok: !error,
        message: error ? error.message : "저장됨",
      });
    }
  }

  for (const row of results.filter((r) => r.ok)) {
    await logActivity({ entityType: entity, entityId: row.id, action: "grid_paste", after: { [row.field]: true } });
  }

  return { ok: results.every((r) => r.ok), results };
}

// 본인 비밀번호 변경.
export async function changePasswordAction(formData: FormData) {
  const next = formData.get("password");
  const confirm = formData.get("password_confirm");
  if (typeof next !== "string" || next.length < 8) redirect("/settings?error=weak");
  if (next !== confirm) redirect("/settings?error=mismatch");

  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) {
    console.error("changePasswordAction", error.message);
    redirect(`/settings?error=save&reason=${encodeURIComponent(error.message.slice(0, 300))}`);
  }
  redirect("/settings?saved=1");
}

// ── 알림 ────────────────────────────────────────────────────────────────────
export async function markNotificationsReadAction(formData: FormData) {
  const returnPath = text(formData, "return_path") ?? "/inbox";
  const ids = formData.getAll("id").filter((v): v is string => typeof v === "string");
  const supabase = await createSupabaseServer();
  const now = new Date().toISOString();

  const query = supabase.from("notifications").update({ read_at: now }).is("read_at", null);
  const { error } = ids.length > 0 ? await query.in("id", ids) : await query;
  if (error) console.error("markNotificationsReadAction", error.message);

  revalidatePath("/inbox");
  revalidatePath(returnPath);
  redirect(returnPath);
}

export async function deleteNotificationAction(notificationId: string) {
  const supabase = await createSupabaseServer();
  await supabase.from("notifications").delete().eq("id", notificationId);
  revalidatePath("/inbox");
}

// ── 주간 업데이트 확인 / 보완 요청 ──────────────────────────────────────────
export async function confirmWeeklyUpdateAction(updateId: string, formData: FormData) {
  const returnPath = text(formData, "return_path") ?? "/weekly/review";
  const user = await getSessionUser();
  if (!isAdmin(user)) redirect(withQuery(returnPath, `error=forbidden`));

  const supabase = await createSupabaseServer();
  const { error } = await supabase
    .from("project_weekly_updates")
    .update({
      confirmed_at: new Date().toISOString(),
      confirmed_by_user_id: user?.appUserId ?? null,
      review_note: null,
      review_requested_at: null,
    })
    .eq("id", updateId);
  if (error) {
    console.error("confirmWeeklyUpdateAction", error.message);
    redirect(withQuery(returnPath, `error=save&reason=${encodeURIComponent(error.message.slice(0, 200))}`));
  }
  revalidatePath(returnPath);
  redirect(returnPath);
}

export async function requestWeeklyReviewAction(updateId: string, formData: FormData) {
  const returnPath = text(formData, "return_path") ?? "/weekly/review";
  const note = text(formData, "note");
  const user = await getSessionUser();
  if (!isAdmin(user)) redirect(withQuery(returnPath, `error=forbidden`));
  if (!note) redirect(withQuery(returnPath, `error=empty`));

  const supabase = await createSupabaseServer();
  const { data: row } = await supabase
    .from("project_weekly_updates")
    .select("project_id, update_label, project:projects!project_weekly_updates_project_id_fkey(name, primary_pl_person_id, secondary_pl_person_id, candidate_pm_person_id)")
    .eq("id", updateId)
    .maybeSingle();

  const { error } = await supabase
    .from("project_weekly_updates")
    .update({
      review_note: note,
      review_requested_at: new Date().toISOString(),
      review_requested_by_user_id: user?.appUserId ?? null,
      confirmed_at: null,
      confirmed_by_user_id: null,
    })
    .eq("id", updateId);
  if (error) {
    console.error("requestWeeklyReviewAction", error.message);
    redirect(withQuery(returnPath, `error=save&reason=${encodeURIComponent(error.message.slice(0, 200))}`));
  }

  const project = Array.isArray(row?.project) ? row?.project[0] : row?.project;
  if (project) {
    const recipients = await userIdsForPeople([
      project.primary_pl_person_id,
      project.secondary_pl_person_id,
      project.candidate_pm_person_id,
    ]);
    await notify({
      recipientUserIds: recipients,
      actorUserId: user?.appUserId,
      kind: "weekly_review_requested",
      title: `${project.name} — ${row?.update_label} 보완 요청`,
      body: note,
      link: `/weekly?label=${encodeURIComponent(String(row?.update_label ?? ""))}`,
      entityType: "project",
      entityId: row?.project_id as string,
    });
  }

  revalidatePath(returnPath);
  redirect(returnPath);
}

// ── 티켓 댓글 ───────────────────────────────────────────────────────────────
export async function addTaskCommentAction(taskId: string, formData: FormData) {
  const body = text(formData, "body");
  const returnPath = `/tickets/${taskId}`;
  if (!body) redirect(withQuery(returnPath, `error=empty`));

  const user = await getSessionUser();
  const supabase = await createSupabaseServer();
  const { error } = await supabase
    .from("task_comments")
    .insert({ task_id: taskId, author_user_id: user?.appUserId ?? null, body });
  if (error) {
    console.error("addTaskCommentAction", error.message);
    redirect(withQuery(returnPath, `error=save&reason=${encodeURIComponent(error.message.slice(0, 200))}`));
  }

  const { data: task } = await supabase
    .from("tasks")
    .select("title, assignee_person_id, created_by_user_id")
    .eq("id", taskId)
    .maybeSingle();
  if (task) {
    const assignees = await userIdsForPeople([task.assignee_person_id]);
    await notify({
      recipientUserIds: [...assignees, task.created_by_user_id],
      actorUserId: user?.appUserId,
      kind: "ticket_comment",
      title: `${task.title} — 댓글`,
      body,
      link: returnPath,
      entityType: "task",
      entityId: taskId,
    });
  }

  revalidatePath(returnPath);
  redirect(withQuery(returnPath, `saved=1`));
}

export async function deleteTaskCommentAction(commentId: string, taskId: string) {
  const supabase = await createSupabaseServer();
  await supabase.from("task_comments").delete().eq("id", commentId);
  revalidatePath(`/tickets/${taskId}`);
}

// 티켓 상세 편집 (상세 화면 폼)
export async function updateTicketDetailAction(taskId: string, formData: FormData) {
  const returnPath = `/tickets/${taskId}`;
  const supabase = await createSupabaseServer();
  const user = await getSessionUser();

  const { data: before } = await supabase
    .from("tasks")
    .select("assignee_person_id, title")
    .eq("id", taskId)
    .maybeSingle();

  const payload: Record<string, string | null> = {
    title: text(formData, "title"),
    description: text(formData, "description"),
    status: text(formData, "status"),
    priority: text(formData, "priority"),
    due_date: text(formData, "due_date"),
    assignee_person_id: text(formData, "assignee_person_id"),
    project_id: text(formData, "project_id"),
  };
  if (!payload.title) redirect(withQuery(returnPath, `error=empty`));

  const { error } = await supabase.from("tasks").update(payload).eq("id", taskId);
  if (error) {
    console.error("updateTicketDetailAction", error.message);
    redirect(withQuery(returnPath, `error=save&reason=${encodeURIComponent(error.message.slice(0, 200))}`));
  }

  if (payload.assignee_person_id && payload.assignee_person_id !== before?.assignee_person_id) {
    const recipients = await userIdsForPeople([payload.assignee_person_id]);
    await notify({
      recipientUserIds: recipients,
      actorUserId: user?.appUserId,
      kind: "ticket_assigned",
      title: `티켓 배정 — ${payload.title}`,
      link: returnPath,
      entityType: "task",
      entityId: taskId,
    });
  }

  revalidatePath(returnPath);
  revalidatePath("/tickets");
  redirect(withQuery(returnPath, `saved=1`));
}

// ── 활동 로그 ───────────────────────────────────────────────────────────────
// activity_logs 는 지금까지 엑셀 임포트 스크립트만 기록해 왔다(536건 전부 excel_*).
// 화면에서 일어난 변경도 같은 표에 남겨야 '활동 이력' 이 의미를 갖는다.
async function logActivity(input: {
  entityType: string;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
}) {
  try {
    const supabase = await createSupabaseServer();
    const user = await getSessionUser();
    await supabase.from("activity_logs").insert({
      actor_user_id: user?.appUserId ?? null,
      entity_type: input.entityType,
      entity_id: input.entityId,
      action: input.action,
      before_json: input.before ?? null,
      after_json: input.after ?? null,
    });
  } catch (error) {
    // 로그 실패가 본 작업을 막으면 안 된다.
    console.error("logActivity", error);
  }
}

// ── 고객사 병합 ─────────────────────────────────────────────────────────────
// 같은 회사가 다른 이름으로 들어온 경우(플링캐스트 / 주식회사 플링캐스트)를 하나로 합친다.
export async function mergeCompanyAction(targetId: string, formData: FormData) {
  const returnPath = `/customers/${targetId}`;
  const user = await getSessionUser();
  if (!isAdmin(user)) redirect(withQuery(returnPath, "error=forbidden"));

  const sourceName = text(formData, "source_name");
  if (!sourceName) redirect(withQuery(returnPath, "error=empty"));

  const supabase = await createSupabaseServer();
  const { data: matches } = await supabase
    .from("companies")
    .select("id, name_ko")
    .eq("name_ko", sourceName)
    .is("deleted_at", null)
    .limit(2);

  if (!matches || matches.length === 0) redirect(withQuery(returnPath, "error=company"));
  if (matches.length > 1) redirect(withQuery(returnPath, "error=duplicate"));

  const sourceId = matches[0].id;
  if (sourceId === targetId) redirect(withQuery(returnPath, "error=self"));

  // 참조를 전부 대상 회사로 옮긴 뒤 원본을 휴지통으로 보낸다.
  const moves: [string, string][] = [
    ["projects", "company_id"],
    ["people", "primary_company_id"],
    ["tasks", "company_id"],
    ["document_requirements", "company_id"],
    ["meeting_notes", "company_id"],
    ["person_company_links", "company_id"],
  ];
  for (const [table, column] of moves) {
    const { error } = await supabase.from(table).update({ [column]: targetId }).eq(column, sourceId);
    if (error) {
      console.error("mergeCompanyAction", table, error.message);
      redirect(withQuery(returnPath, `error=save&reason=${encodeURIComponent(error.message.slice(0, 200))}`));
    }
  }
  await supabase
    .from("entity_documents")
    .update({ entity_id: targetId })
    .eq("entity_type", "company")
    .eq("entity_id", sourceId);

  await supabase
    .from("companies")
    .update({ deleted_at: new Date().toISOString(), deleted_by_user_id: user?.appUserId ?? null })
    .eq("id", sourceId);

  await logActivity({
    entityType: "companies",
    entityId: targetId,
    action: "merge",
    before: { merged_from: sourceName, source_id: sourceId },
  });

  revalidatePath(returnPath);
  revalidatePath("/customers");
  redirect(withQuery(returnPath, "saved=1"));
}

export async function deleteCompanyAction(companyId: string) {
  const user = await getSessionUser();
  if (!isAdmin(user)) redirect(withQuery(`/customers/${companyId}`, "error=forbidden"));

  const supabase = await createSupabaseServer();
  const { count } = await supabase
    .from("projects")
    .select("*", { count: "exact", head: true })
    .eq("company_id", companyId)
    .is("deleted_at", null);
  if ((count ?? 0) > 0) redirect(withQuery(`/customers/${companyId}`, "error=hasprojects"));

  await supabase
    .from("companies")
    .update({ deleted_at: new Date().toISOString(), deleted_by_user_id: user?.appUserId ?? null })
    .eq("id", companyId);
  await logActivity({ entityType: "companies", entityId: companyId, action: "trash" });

  revalidatePath("/customers");
  redirect(withQuery("/customers", "trashed=1"));
}

// 주차 기록 삭제. '비우면 삭제' 라는 숨은 규칙 대신 화면에 버튼으로 드러낸다.
export async function deleteWeeklyUpdateAction(updateId: string, label: string) {
  const returnPath = `/weekly?label=${encodeURIComponent(label)}`;
  const supabase = await createSupabaseServer();
  const { error } = await supabase.from("project_weekly_updates").delete().eq("id", updateId);
  if (error) {
    console.error("deleteWeeklyUpdateAction", error.message);
    redirect(withQuery(returnPath, `error=save&reason=${encodeURIComponent(error.message.slice(0, 200))}`));
  }
  revalidatePath(returnPath);
  revalidatePath("/weekly/review");
  redirect(withQuery(returnPath, "cleared=1"));
}
