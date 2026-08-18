import { createSupabaseServer } from "@/lib/supabase/server";

type Ref = { id: string; name_ko: string } | null;

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export type DealRow = {
  id: string;
  name: string;
  project_type: string;
  status: string;
  contract_status: string | null;
  expected_revenue: number | null;
  latest_update: string | null;
  next_action: string | null;
  end_date: string | null;
  updated_at: string;
  folder_id: string | null;
  company: Ref;
  pl: Ref;
  pm: Ref;
};

const DEAL_SELECT =
  "id, name, project_type, status, contract_status, expected_revenue, latest_update, next_action, end_date, updated_at, folder_id, " +
  "company:companies!projects_company_id_fkey(id, name_ko), " +
  "pl:people!projects_primary_pl_person_id_fkey(id, name_ko), " +
  "pm:people!projects_candidate_pm_person_id_fkey(id, name_ko)";

function normalizeDeal(row: Record<string, unknown>): DealRow {
  return {
    ...(row as unknown as DealRow),
    company: one(row.company as Ref | Ref[]),
    pl: one(row.pl as Ref | Ref[]),
    pm: one(row.pm as Ref | Ref[]),
  };
}

function isRealDeal(row: DealRow) {
  return row.name !== "회사명" && row.company?.name_ko !== "회사명";
}

export async function getDeals(filters?: { status?: string; type?: string; folderId?: string; unsorted?: boolean }) {
  const supabase = await createSupabaseServer();
  let query = supabase
    .from("projects")
    .select(DEAL_SELECT)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.type) query = query.eq("project_type", filters.type);
  if (filters?.folderId) query = query.eq("folder_id", filters.folderId);
  if (filters?.unsorted) query = query.is("folder_id", null);
  const { data, error } = await query.limit(500);
  if (error) {
    console.error("getDeals", error.message);
    return [];
  }
  return (data as unknown as Record<string, unknown>[]).map(normalizeDeal).filter(isRealDeal);
}

export async function getDashboardStats() {
  const supabase = await createSupabaseServer();

  const count = async (table: string, apply?: (q: ReturnType<typeof supabase.from>["select"] extends never ? never : any) => any) => {
    let query = supabase.from(table).select("id", { count: "exact", head: true });
    if (["projects", "tasks", "people", "companies", "events"].includes(table)) {
      query = query.is("deleted_at", null);
    }
    if (apply) query = apply(query);
    const { count: value } = await query;
    return value ?? 0;
  };

  const [customers, activeProjects, confirmed, openDocs, openTasks, people] = await Promise.all([
    supabase.from("erp_customer_rows").select("id", { count: "exact", head: true }).then((r) => r.count ?? 0),
    count("projects", (q: any) => q.in("status", ["confirmed", "likely", "discussing", "managed"])),
    count("projects", (q: any) => q.eq("status", "confirmed")),
    count("document_requirements", (q: any) => q.in("status", ["needed", "requested", "expired"])),
    count("tasks", (q: any) => q.in("status", ["backlog", "in_progress", "waiting", "blocked"])),
    count("people"),
  ]);

  return { customers, activeProjects, confirmed, openDocs, openTasks, people };
}

export type CustomerRow = {
  id: string;
  customer_id: string;
  customer: string;
  industry: string;
  project_count: number;
  active_project_count: number;
  contract_count: number;
  document_gap_count: number;
  task_count: number;
  latest_status: string;
  next_action: string;
};

export async function getCustomers() {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.from("erp_customer_rows").select("*").limit(1000);
  if (error) {
    console.error("getCustomers", error.message);
    return [];
  }
  return (data ?? []) as CustomerRow[];
}

export async function getCustomer(id: string) {
  const supabase = await createSupabaseServer();
  const [companyRes, projectsRes] = await Promise.all([
    supabase.from("companies").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("projects")
      .select(DEAL_SELECT)
      .eq("company_id", id)
      .order("updated_at", { ascending: false }),
  ]);

  if (!companyRes.data) return null;

  const projects = ((projectsRes.data ?? []) as unknown as Record<string, unknown>[])
    .map(normalizeDeal)
    .filter(isRealDeal);
  const projectIds = projects.map((p) => p.id);

  const [docReqRes, tasksRes, contactsRes] = await Promise.all([
    projectIds.length > 0
      ? supabase
          .from("document_requirements")
          .select("id, requirement_type, title, status, required_by, expires_at, project_id, company_id")
          .or(`company_id.eq.${id},project_id.in.(${projectIds.join(",")})`)
          .limit(100)
      : supabase
          .from("document_requirements")
          .select("id, requirement_type, title, status, required_by, expires_at, project_id, company_id")
          .eq("company_id", id)
          .limit(100),
    supabase
      .from("tasks")
      .select("id, title, status, due_date, project_id")
      .or(projectIds.length > 0 ? `company_id.eq.${id},project_id.in.(${projectIds.join(",")})` : `company_id.eq.${id}`)
      .limit(100),
    supabase
      .from("people")
      .select("id, name_ko, title, email, phone")
      .eq("primary_company_id", id)
      .limit(50),
  ]);

  const documents = await getEntityDocuments("company", id);

  return {
    company: companyRes.data as Record<string, string | number | null>,
    projects,
    documentRequirements: (docReqRes.data ?? []) as Record<string, string | null>[],
    tasks: (tasksRes.data ?? []) as Record<string, string | null>[],
    contacts: (contactsRes.data ?? []) as Record<string, string | null>[],
    documents,
    revenueSum: projects.reduce((sum, p) => sum + (Number(p.expected_revenue) || 0), 0),
  };
}

export type PartnerRow = {
  id: string;
  name_ko: string;
  name_en: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  company: Ref;
  profile: {
    network_segment: string;
    partner_status: string | null;
    xp_role: string | null;
    nda_status: string | null;
    profile_status: string | null;
    appointment_status: string | null;
    core_field: string | null;
    expertise_detail: string | null;
    memo: string | null;
  } | null;
};

export async function getPartners() {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("people")
    .select(
      "id, name_ko, name_en, title, email, phone, " +
        "company:companies!people_primary_company_id_fkey(id, name_ko), " +
        "profile:network_profiles(network_segment, partner_status, xp_role, nda_status, profile_status, appointment_status, core_field, expertise_detail, memo)"
    )
    .is("deleted_at", null)
    .order("name_ko", { ascending: true })
    .limit(1000);
  if (error) {
    console.error("getPartners", error.message);
    return [];
  }
  return (data as unknown as Record<string, unknown>[]).map((row) => ({
    ...(row as unknown as PartnerRow),
    company: one(row.company as Ref | Ref[]),
    profile: one(row.profile as PartnerRow["profile"] | PartnerRow["profile"][]),
  })) as PartnerRow[];
}

export async function getPartner(id: string) {
  const supabase = await createSupabaseServer();
  const { data: person } = await supabase
    .from("people")
    .select(
      "*, company:companies!people_primary_company_id_fkey(id, name_ko), profile:network_profiles(*)"
    )
    .eq("id", id)
    .maybeSingle();
  if (!person) return null;

  const [asPl, asPl2, asPm, memberships, docReqRes, linksRes] = await Promise.all([
    supabase.from("projects").select(DEAL_SELECT).eq("primary_pl_person_id", id),
    supabase.from("projects").select(DEAL_SELECT).eq("secondary_pl_person_id", id),
    supabase.from("projects").select(DEAL_SELECT).eq("candidate_pm_person_id", id),
    supabase
      .from("project_members")
      .select("project_role, project:projects!project_members_project_id_fkey(" + DEAL_SELECT + ")")
      .eq("person_id", id),
    supabase
      .from("document_requirements")
      .select("id, requirement_type, title, status, required_by, expires_at")
      .eq("person_id", id)
      .limit(50),
    supabase
      .from("person_company_links")
      .select("relationship_type, title, company:companies!person_company_links_company_id_fkey(id, name_ko)")
      .eq("person_id", id)
      .limit(20),
  ]);

  const projectMap = new Map<string, { deal: DealRow; roles: Set<string> }>();
  const addProject = (rows: unknown[] | null, role: string) => {
    for (const raw of rows ?? []) {
      const deal = normalizeDeal(raw as Record<string, unknown>);
      if (!isRealDeal(deal)) continue;
      const existing = projectMap.get(deal.id);
      if (existing) existing.roles.add(role);
      else projectMap.set(deal.id, { deal, roles: new Set([role]) });
    }
  };
  addProject(asPl.data, "PL");
  addProject(asPl2.data, "PL");
  addProject(asPm.data, "PM");
  for (const raw of memberships.data ?? []) {
    const record = raw as unknown as Record<string, unknown>;
    const projectRaw = one(record.project as Record<string, unknown> | Record<string, unknown>[]);
    if (!projectRaw) continue;
    const deal = normalizeDeal(projectRaw);
    if (!isRealDeal(deal)) continue;
    const role = String(record.project_role ?? "").toUpperCase();
    const existing = projectMap.get(deal.id);
    if (existing) existing.roles.add(role);
    else projectMap.set(deal.id, { deal, roles: new Set([role]) });
  }

  const documents = await getEntityDocuments("person", id);

  const personRecord = person as unknown as Record<string, unknown>;
  const personOut = Object.assign({}, personRecord, {
    company: one(personRecord.company as Ref | Ref[]),
    profile: one(personRecord.profile as Record<string, string | null> | Record<string, string | null>[]),
  }) as Record<string, unknown> & { company: Ref; profile: Record<string, string | null> | null };
  return {
    person: personOut,
    projects: Array.from(projectMap.values()).map(({ deal, roles }) => ({
      ...deal,
      roles: Array.from(roles).join(", "),
    })),
    documentRequirements: (docReqRes.data ?? []) as Record<string, string | null>[],
    companyLinks: ((linksRes.data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
      relationship_type: row.relationship_type as string,
      title: row.title as string | null,
      company: one(row.company as Ref | Ref[]),
    })),
    documents,
  };
}

export async function getProject(id: string) {
  const supabase = await createSupabaseServer();
  const { data: raw } = await supabase
    .from("projects")
    .select(
      "*, company:companies!projects_company_id_fkey(id, name_ko), " +
        "pl:people!projects_primary_pl_person_id_fkey(id, name_ko), " +
        "pl2:people!projects_secondary_pl_person_id_fkey(id, name_ko), " +
        "pm:people!projects_candidate_pm_person_id_fkey(id, name_ko)"
    )
    .eq("id", id)
    .maybeSingle();
  if (!raw) return null;

  const [membersRes, updatesRes, tasksRes, docReqRes] = await Promise.all([
    supabase
      .from("project_members")
      .select("id, project_role, person:people!project_members_person_id_fkey(id, name_ko, title)")
      .eq("project_id", id),
    supabase
      .from("project_weekly_updates")
      .select("id, update_label, update_date, body, created_at")
      .eq("project_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("tasks")
      .select("id, title, status, due_date, priority")
      .eq("project_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("document_requirements")
      .select("id, requirement_type, title, status, required_by, expires_at")
      .eq("project_id", id)
      .limit(50),
  ]);

  const documents = await getEntityDocuments("project", id);

  const record = raw as unknown as Record<string, unknown>;
  const projectOut = Object.assign({}, record, {
    company: one(record.company as Ref | Ref[]),
    pl: one(record.pl as Ref | Ref[]),
    pl2: one(record.pl2 as Ref | Ref[]),
    pm: one(record.pm as Ref | Ref[]),
  }) as Record<string, unknown> & { company: Ref; pl: Ref; pl2: Ref; pm: Ref };
  return {
    project: projectOut,
    members: ((membersRes.data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
      id: row.id as string,
      project_role: row.project_role as string,
      person: one(row.person as { id: string; name_ko: string; title: string | null } | { id: string; name_ko: string; title: string | null }[]),
    })),
    updates: (updatesRes.data ?? []) as Record<string, string | null>[],
    tasks: (tasksRes.data ?? []) as Record<string, string | null>[],
    documentRequirements: (docReqRes.data ?? []) as Record<string, string | null>[],
    documents,
  };
}

export type EntityDocument = {
  id: string;
  title: string;
  document_type: string;
  file_name: string | null;
  uploaded_at: string | null;
  sensitivity: string;
  url: string | null;
};

export async function getEntityDocuments(entityType: string, entityId: string): Promise<EntityDocument[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("entity_documents")
    .select(
      "document:documents!entity_documents_document_id_fkey(id, title, document_type, file_name, storage_bucket, storage_path, external_url, uploaded_at, sensitivity)"
    )
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .limit(100);
  if (error) {
    console.error("getEntityDocuments", error.message);
    return [];
  }

  const documents: EntityDocument[] = [];
  for (const raw of (data ?? []) as unknown as Record<string, unknown>[]) {
    const doc = one(raw.document as Record<string, string | null> | Record<string, string | null>[]);
    if (!doc) continue;
    let url: string | null = (doc.external_url as string) ?? null;
    if (!url && doc.storage_path) {
      const { data: signed } = await supabase.storage
        .from(doc.storage_bucket ?? "xp-documents")
        .createSignedUrl(doc.storage_path, 60 * 60);
      url = signed?.signedUrl ?? null;
    }
    documents.push({
      id: doc.id as string,
      title: (doc.title as string) ?? "",
      document_type: (doc.document_type as string) ?? "",
      file_name: doc.file_name as string | null,
      uploaded_at: doc.uploaded_at as string | null,
      sensitivity: (doc.sensitivity as string) ?? "internal",
      url,
    });
  }
  return documents;
}

export async function getAllDocuments() {
  const supabase = await createSupabaseServer();
  const [docsRes, reqsRes] = await Promise.all([
    supabase
      .from("documents")
      .select("id, title, document_type, file_name, storage_path, storage_bucket, external_url, uploaded_at, sensitivity")
      .order("uploaded_at", { ascending: false, nullsFirst: false })
      .limit(200),
    supabase
      .from("document_requirements")
      .select(
        "id, requirement_type, title, subject_text, status, required_by, expires_at, " +
          "person:people!document_requirements_person_id_fkey(id, name_ko), " +
          "company:companies!document_requirements_company_id_fkey(id, name_ko), " +
          "project:projects!document_requirements_project_id_fkey(id, name)"
      )
      .in("status", ["needed", "requested", "expired"])
      .limit(300),
  ]);

  const documents: EntityDocument[] = [];
  for (const doc of (docsRes.data ?? []) as Record<string, string | null>[]) {
    let url: string | null = doc.external_url ?? null;
    if (!url && doc.storage_path) {
      const { data: signed } = await supabase.storage
        .from(doc.storage_bucket ?? "xp-documents")
        .createSignedUrl(doc.storage_path, 60 * 60);
      url = signed?.signedUrl ?? null;
    }
    documents.push({
      id: doc.id as string,
      title: doc.title ?? "",
      document_type: doc.document_type ?? "",
      file_name: doc.file_name,
      uploaded_at: doc.uploaded_at,
      sensitivity: doc.sensitivity ?? "internal",
      url,
    });
  }

  const requirements = ((reqsRes.data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    requirement_type: row.requirement_type as string,
    title: row.title as string,
    subject_text: row.subject_text as string | null,
    status: row.status as string,
    required_by: row.required_by as string | null,
    expires_at: row.expires_at as string | null,
    person: one(row.person as Ref | Ref[]),
    company: one(row.company as Ref | Ref[]),
    project: one(row.project as { id: string; name: string } | { id: string; name: string }[]),
  }));

  return { documents, requirements };
}

export async function getEvents() {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("events")
    .select(
      "id, name, event_type, status, starts_at, ends_at, location, description, next_action, is_date_tbd, " +
        "invitees:event_invitees!event_invitees_event_id_fkey(id, attendance_confirmed)"
    )
    .is("deleted_at", null)
    .order("starts_at", { ascending: false, nullsFirst: false })
    .limit(200);
  if (error) {
    console.error("getEvents", error.message);
    return [];
  }
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const invitees = (row.invitees ?? []) as { attendance_confirmed: boolean }[];
    return {
      ...(row as Record<string, string | null>),
      invitee_count: invitees.length,
      confirmed_count: invitees.filter((i) => i.attendance_confirmed).length,
    } as Record<string, string | null> & { invitee_count: number; confirmed_count: number };
  });
}

export async function getEvent(id: string) {
  const supabase = await createSupabaseServer();
  const [eventRes, inviteesRes] = await Promise.all([
    supabase.from("events").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("event_invitees")
      .select(
        "id, name, company_name, title, email, phone, will_attend, attendance_confirmed, " +
          "email_sent, sms_sent, response_received, person_id"
      )
      .eq("event_id", id)
      .order("created_at", { ascending: true })
      .limit(500),
  ]);
  if (!eventRes.data) return null;
  const documents = await getEntityDocuments("event", id);
  return {
    event: eventRes.data as Record<string, string | null>,
    invitees: (inviteesRes.data ?? []) as unknown as Record<string, string | boolean | null>[],
    documents,
  };
}

export async function getUsers() {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("users")
    .select("id, email, global_role, status, auth_user_id, person:people!users_person_id_fkey(id, name_ko)")
    .order("created_at", { ascending: true });
  if (error) {
    console.error("getUsers", error.message);
    return [];
  }
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    email: row.email as string,
    global_role: row.global_role as string,
    status: row.status as string,
    auth_user_id: row.auth_user_id as string | null,
    person: one(row.person as Ref | Ref[]),
  }));
}

export async function getPeopleNames() {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.from("people").select("name_ko").order("name_ko").limit(1000);
  return Array.from(new Set(((data ?? []) as { name_ko: string }[]).map((p) => p.name_ko))).filter(Boolean);
}

export type MeetingNote = {
  id: string;
  title: string;
  meeting_date: string;
  attendees: string | null;
  summary: string | null;
  file_name: string | null;
  created_at: string;
  uploaded_by_user_id: string | null;
  project: { id: string; name: string } | null;
  url: string | null;
};

async function decorateMeetingNotes(rows: Record<string, unknown>[]): Promise<MeetingNote[]> {
  const supabase = await createSupabaseServer();
  const notes: MeetingNote[] = [];
  for (const row of rows) {
    let url: string | null = null;
    if (row.storage_path) {
      const { data: signed } = await supabase.storage
        .from((row.storage_bucket as string) ?? "xp-meeting-notes")
        .createSignedUrl(row.storage_path as string, 60 * 60);
      url = signed?.signedUrl ?? null;
    }
    notes.push({
      id: row.id as string,
      title: (row.title as string) ?? "",
      meeting_date: row.meeting_date as string,
      attendees: (row.attendees as string) ?? null,
      summary: (row.summary as string) ?? null,
      file_name: (row.file_name as string) ?? null,
      created_at: row.created_at as string,
      uploaded_by_user_id: (row.uploaded_by_user_id as string) ?? null,
      project: one(row.project as { id: string; name: string } | { id: string; name: string }[]),
      url,
    });
  }
  return notes;
}

const MEETING_NOTE_SELECT =
  "id, title, meeting_date, attendees, summary, storage_bucket, storage_path, file_name, created_at, uploaded_by_user_id, " +
  "project:projects!meeting_notes_project_id_fkey(id, name)";

// 회의 일자 최신순. 같은 날짜면 등록 시각이 늦은 것이 위로 온다.
export async function getCompanyMeetingNotes(companyId: string) {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("meeting_notes")
    .select(MEETING_NOTE_SELECT)
    .eq("company_id", companyId)
    .order("meeting_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    console.error("getCompanyMeetingNotes", error.message);
    return [];
  }
  return decorateMeetingNotes((data ?? []) as unknown as Record<string, unknown>[]);
}

export async function getProjectMeetingNotes(projectId: string) {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("meeting_notes")
    .select(MEETING_NOTE_SELECT)
    .eq("project_id", projectId)
    .order("meeting_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    console.error("getProjectMeetingNotes", error.message);
    return [];
  }
  return decorateMeetingNotes((data ?? []) as unknown as Record<string, unknown>[]);
}

// ---------------------------------------------------------------- 폴더 / 티켓

export type Folder = { id: string; name: string; sort_order: number };

export async function getFolders(): Promise<Folder[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("project_folders")
    .select("id, name, sort_order")
    .order("sort_order", { ascending: true });
  if (error) {
    console.error("getFolders", error.message);
    return [];
  }
  return (data ?? []) as Folder[];
}

export type Ticket = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  created_at: string;
  project: { id: string; name: string } | null;
  assignee: { id: string; name_ko: string } | null;
  company: { id: string; name_ko: string } | null;
};

const TICKET_SELECT =
  "id, title, description, status, priority, due_date, created_at, " +
  "project:projects!tasks_project_id_fkey(id, name), " +
  "assignee:people!tasks_assignee_person_id_fkey(id, name_ko), " +
  "company:companies!tasks_company_id_fkey(id, name_ko)";

function normalizeTicket(row: Record<string, unknown>): Ticket {
  return {
    ...(row as unknown as Ticket),
    project: one(row.project as { id: string; name: string } | { id: string; name: string }[]),
    assignee: one(row.assignee as { id: string; name_ko: string } | { id: string; name_ko: string }[]),
    company: one(row.company as { id: string; name_ko: string } | { id: string; name_ko: string }[]),
  };
}

export async function getTickets(filters?: {
  scope?: string;
  status?: string;
  assigneePersonId?: string;
}) {
  const supabase = await createSupabaseServer();
  let query = supabase
    .from("tasks")
    .select(TICKET_SELECT)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (filters?.scope === "unsorted") query = query.is("project_id", null);
  if (filters?.scope === "open") query = query.in("status", ["backlog", "in_progress", "waiting", "blocked"]);
  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.assigneePersonId) query = query.eq("assignee_person_id", filters.assigneePersonId);

  const { data, error } = await query.limit(500);
  if (error) {
    console.error("getTickets", error.message);
    return [];
  }
  return (data as unknown as Record<string, unknown>[])
    .map(normalizeTicket)
    .filter((t) => t.title && !/^\d+$/.test(t.title));
}

export async function getTicketCounts() {
  const supabase = await createSupabaseServer();
  const open = ["backlog", "in_progress", "waiting", "blocked"];
  const [unsorted, openCount, total] = await Promise.all([
    supabase.from("tasks").select("id", { count: "exact", head: true }).is("deleted_at", null).is("project_id", null).in("status", open),
    supabase.from("tasks").select("id", { count: "exact", head: true }).is("deleted_at", null).in("status", open),
    supabase.from("tasks").select("id", { count: "exact", head: true }).is("deleted_at", null),
  ]);
  return {
    unsorted: unsorted.count ?? 0,
    open: openCount.count ?? 0,
    total: total.count ?? 0,
  };
}

// 담당자로 지정할 만한 사람: XP 내부 · 계정 보유자 · 프로젝트 PL/PM
export type Assignable = { id: string; name_ko: string; hint: string };

export async function getAssignablePeople(): Promise<Assignable[]> {
  const supabase = await createSupabaseServer();

  const [internalRes, accountRes, leadRes] = await Promise.all([
    supabase
      .from("network_profiles")
      .select("person:people!network_profiles_person_id_fkey(id, name_ko)")
      .in("network_segment", ["xp_internal"])
      .limit(100),
    supabase.from("users").select("person:people!users_person_id_fkey(id, name_ko)").not("person_id", "is", null),
    supabase.from("projects").select("pl:people!projects_primary_pl_person_id_fkey(id, name_ko)").not("primary_pl_person_id", "is", null).limit(500),
  ]);

  const map = new Map<string, Assignable>();
  const add = (person: { id: string; name_ko: string } | null, hint: string) => {
    if (!person?.id) return;
    if (!map.has(person.id)) map.set(person.id, { id: person.id, name_ko: person.name_ko, hint });
  };

  for (const row of (internalRes.data ?? []) as unknown as Record<string, unknown>[]) {
    add(one(row.person as { id: string; name_ko: string }), "XP");
  }
  for (const row of (accountRes.data ?? []) as unknown as Record<string, unknown>[]) {
    add(one(row.person as { id: string; name_ko: string }), "계정");
  }
  for (const row of (leadRes.data ?? []) as unknown as Record<string, unknown>[]) {
    add(one(row.pl as { id: string; name_ko: string }), "PL");
  }

  return Array.from(map.values()).sort((a, b) => a.name_ko.localeCompare(b.name_ko, "ko"));
}

export async function getProjectOptions() {
  const supabase = await createSupabaseServer();
  const { data } = await supabase
    .from("projects")
    .select("id, name, folder:project_folders!projects_folder_id_fkey(id, name), company:companies!projects_company_id_fkey(name_ko)")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(500);
  return ((data ?? []) as unknown as Record<string, unknown>[])
    .map((row) => {
      const company = one(row.company as { name_ko: string } | { name_ko: string }[]);
      const folder = one(row.folder as { id: string; name: string } | { id: string; name: string }[]);
      return {
        id: row.id as string,
        name: row.name as string,
        company: company?.name_ko ?? null,
        folder: folder?.name ?? null,
      };
    })
    .filter((row) => row.name !== "회사명");
}


export async function getFolderCounts() {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.from("projects").select("folder_id, name").is("deleted_at", null).limit(1000);
  const rows = ((data ?? []) as { folder_id: string | null; name: string }[]).filter(
    (row) => row.name !== "회사명"
  );
  const counts = new Map<string, number>();
  let unsorted = 0;
  for (const row of rows) {
    if (!row.folder_id) unsorted += 1;
    else counts.set(row.folder_id, (counts.get(row.folder_id) ?? 0) + 1);
  }
  return { counts, unsorted, total: rows.length };
}


// ---------------------------------------------------------------- 휴지통

export type TrashRow = {
  id: string;
  name: string;
  deleted_at: string;
  detail: string;
};

const TRASH_SOURCES: { entity: string; label: string; nameField: string; extra: string }[] = [
  { entity: "projects", label: "프로젝트", nameField: "name", extra: "status" },
  { entity: "events", label: "이벤트", nameField: "name", extra: "event_type" },
  { entity: "companies", label: "고객사", nameField: "name_ko", extra: "industry" },
  { entity: "people", label: "파트너", nameField: "name_ko", extra: "title" },
  { entity: "tasks", label: "티켓", nameField: "title", extra: "status" },
];

export async function getTrash() {
  const supabase = await createSupabaseServer();

  const groups = await Promise.all(
    TRASH_SOURCES.map(async (source) => {
      const { data, error } = await supabase
        .from(source.entity)
        .select(`id, ${source.nameField}, ${source.extra}, deleted_at`)
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false })
        .limit(500);
      if (error) {
        console.error("getTrash", source.entity, error.message);
        return { ...source, rows: [] as TrashRow[] };
      }
      const rows = ((data ?? []) as unknown as Record<string, string>[]).map((row) => ({
        id: row.id,
        name: row[source.nameField] ?? "",
        deleted_at: row.deleted_at,
        detail: row[source.extra] ?? "",
      }));
      return { ...source, rows };
    })
  );

  return groups;
}
