import { createSupabaseServer } from "@/lib/supabase/server";
import { shortId } from "@/lib/ids";
import { ARCHIVED_DEAL_STATUS, topDealStatus } from "@/lib/labels";

type Ref = { id: string; name_ko: string } | null;

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

// limit 은 페이지네이션이 아니라 상한이다. 상한에 닿으면 조용히 일부가 빠지므로
// 최소한 서버 로그에 남긴다. 여기 걸리기 시작하면 페이지네이션을 붙일 때가 된 것이다.
function warnIfCapped(label: string, rows: unknown[] | null | undefined, cap: number) {
  if ((rows?.length ?? 0) >= cap) {
    console.warn(`[상한 도달] ${label}: ${cap}건에서 잘렸습니다. 페이지네이션이 필요합니다.`);
  }
}

export type DealRow = {
  id: string;
  name: string;
  project_type: string;
  status: string;
  contract_status: string | null;
  pipeline_stage: string;
  deal_status: string;
  service_sector: string;
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
  "id, name, project_type, status, contract_status, pipeline_stage, deal_status, service_sector, " +
  "expected_revenue, latest_update, next_action, end_date, updated_at, folder_id, " +
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
  if (filters?.status) query = query.eq("deal_status", filters.status);
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
    supabase.from("companies").select("id", { count: "exact", head: true }).is("deleted_at", null).then((r) => r.count ?? 0),
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
  representative: string;
  project_count: number;
  active_project_count: number;
  partner_count: number;
  latest_status: string;
  next_action: string;
  // 고객사 = 프로젝트 있음 / 소속처 = 파트너만 붙어 있음 / 미연결 = 아무것도 없음
  kind: "고객사" | "소속처" | "미연결";
};

// 숨김 뷰(erp_customer_rows)를 걷어내고 실제 테이블에서 직접 만든다.
// 화면에서 안 보이면 편집도 삭제도 못 하기 때문에, 감추지 않고 분류만 한다.
export async function getCustomers(): Promise<CustomerRow[]> {
  const supabase = await createSupabaseServer();

  const [companyRes, projectRes, peopleRes] = await Promise.all([
    supabase
      .from("companies")
      .select("id, name_ko, industry, sub_industry, representative_name, next_action")
      .is("deleted_at", null)
      .order("name_ko")
      .limit(2000),
    supabase
      .from("projects")
      .select("company_id, deal_status, next_action, latest_update, updated_at")
      .is("deleted_at", null)
      .limit(2000),
    supabase.from("people").select("primary_company_id").is("deleted_at", null).limit(2000),
  ]);

  warnIfCapped("고객사", companyRes.data, 2000);

  // 한 고객사에 프로젝트가 여러 개면 계약 → 계약임박 → 제안 → 가망 → 관리 → 보류 → 미분류
  // 순으로 앞선 상태를 그 고객사의 대표 상태로 쓴다.
  const byCompany = new Map<string, { total: number; active: number; statuses: string[]; next: string; at: string }>();
  for (const row of (projectRes.data ?? []) as {
    company_id: string | null; deal_status: string; next_action: string | null;
    latest_update: string | null; updated_at: string;
  }[]) {
    if (!row.company_id) continue;
    const cur = byCompany.get(row.company_id) ?? { total: 0, active: 0, statuses: [], next: "", at: "" };
    cur.total += 1;
    if (!ARCHIVED_DEAL_STATUS.has(row.deal_status)) cur.active += 1;
    cur.statuses.push(row.deal_status);
    if (row.updated_at > cur.at) {
      cur.at = row.updated_at;
      cur.next = row.next_action ?? row.latest_update ?? "";
    }
    byCompany.set(row.company_id, cur);
  }

  const partnerCount = new Map<string, number>();
  for (const row of (peopleRes.data ?? []) as { primary_company_id: string | null }[]) {
    if (!row.primary_company_id) continue;
    partnerCount.set(row.primary_company_id, (partnerCount.get(row.primary_company_id) ?? 0) + 1);
  }

  return ((companyRes.data ?? []) as Record<string, string | null>[]).map((row) => {
    const id = row.id as string;
    const stat = byCompany.get(id);
    const partners = partnerCount.get(id) ?? 0;
    const kind: CustomerRow["kind"] = stat ? "고객사" : partners > 0 ? "소속처" : "미연결";
    return {
      id,
      customer_id: shortId("C", id),
      customer: row.name_ko ?? "",
      industry: row.industry ?? row.sub_industry ?? "",
      representative: row.representative_name ?? "",
      project_count: stat?.total ?? 0,
      active_project_count: stat?.active ?? 0,
      partner_count: partners,
      latest_status: stat ? topDealStatus(stat.statuses) : "",
      next_action: stat?.next || (row.next_action ?? ""),
      kind,
    };
  });
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
    expertise_detail: string | null;
    recommender: string | null;
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
        "profile:network_profiles(network_segment, partner_status, xp_role, nda_status, profile_status, appointment_status, expertise_detail, recommender, memo)"
    )
    .is("deleted_at", null)
    .order("name_ko", { ascending: true })
    .limit(1000);
  if (error) {
    console.error("getPartners", error.message);
    return [];
  }
  warnIfCapped("파트너 명부", data, 1000);
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
      .select(
        "id, update_label, update_date, body, created_at, last_edited_at, edit_count, confirmed_at, review_note, " +
          "author:users!project_weekly_updates_updated_by_user_id_fkey(email, person:people!users_person_id_fkey(name_ko))"
      )
      .eq("project_id", id)
      .order("update_date", { ascending: false, nullsFirst: false })
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
    updates: (updatesRes.data ?? []) as unknown as (Record<string, string | null> & {
      author?: { email: string; person?: { name_ko: string } | { name_ko: string }[] } | { email: string; person?: { name_ko: string } | { name_ko: string }[] }[] | null;
      edit_count?: number | null;
    })[],
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

// signed URL 은 파일 수만큼 왕복하면 안 된다. 버킷별로 한 번에 서명한다.
// (문서 138건이 들어오면 순차 발급으로는 페이지가 눈에 띄게 느려진다)
async function signMany(items: { bucket: string; path: string }[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (items.length === 0) return result;

  const supabase = await createSupabaseServer();
  const byBucket = new Map<string, string[]>();
  for (const item of items) {
    if (!item.path) continue;
    const list = byBucket.get(item.bucket) ?? [];
    list.push(item.path);
    byBucket.set(item.bucket, list);
  }

  await Promise.all(
    Array.from(byBucket.entries()).map(async ([bucket, paths]) => {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, 60 * 60);
      if (error) {
        console.error("signMany", bucket, error.message);
        return;
      }
      for (const row of data ?? []) {
        if (row.path && row.signedUrl) result.set(`${bucket}::${row.path}`, row.signedUrl);
      }
    })
  );
  return result;
}

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

  const docs = ((data ?? []) as unknown as Record<string, unknown>[])
    .map((raw) => one(raw.document as Record<string, string | null> | Record<string, string | null>[]))
    .filter((doc): doc is Record<string, string | null> => Boolean(doc));

  const signed = await signMany(
    docs
      .filter((doc) => !doc.external_url && doc.storage_path)
      .map((doc) => ({ bucket: doc.storage_bucket ?? "xp-documents", path: doc.storage_path as string }))
  );

  return docs.map((doc) => ({
    id: doc.id as string,
    title: (doc.title as string) ?? "",
    document_type: (doc.document_type as string) ?? "",
    file_name: doc.file_name as string | null,
    uploaded_at: doc.uploaded_at as string | null,
    sensitivity: (doc.sensitivity as string) ?? "internal",
    url:
      (doc.external_url as string) ??
      signed.get(`${doc.storage_bucket ?? "xp-documents"}::${doc.storage_path}`) ??
      null,
  }));
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

  const docRows = (docsRes.data ?? []) as Record<string, string | null>[];
  const signedDocs = await signMany(
    docRows
      .filter((doc) => !doc.external_url && doc.storage_path)
      .map((doc) => ({ bucket: doc.storage_bucket ?? "xp-documents", path: doc.storage_path as string }))
  );
  const documents: EntityDocument[] = docRows.map((doc) => ({
    id: doc.id as string,
    title: doc.title ?? "",
    document_type: doc.document_type ?? "",
    file_name: doc.file_name,
    uploaded_at: doc.uploaded_at,
    sensitivity: doc.sensitivity ?? "internal",
    url: doc.external_url ?? signedDocs.get(`${doc.storage_bucket ?? "xp-documents"}::${doc.storage_path}`) ?? null,
  }));

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
  const signed = await signMany(
    rows
      .filter((row) => row.storage_path)
      .map((row) => ({
        bucket: (row.storage_bucket as string) ?? "xp-meeting-notes",
        path: row.storage_path as string,
      }))
  );

  const notes: MeetingNote[] = [];
  for (const row of rows) {
    const url =
      signed.get(`${(row.storage_bucket as string) ?? "xp-meeting-notes"}::${row.storage_path}`) ?? null;
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

// ---------------------------------------------------------------- 폴더 / 과제

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

export type Task = {
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

function normalizeTask(row: Record<string, unknown>): Task {
  return {
    ...(row as unknown as Task),
    project: one(row.project as { id: string; name: string } | { id: string; name: string }[]),
    assignee: one(row.assignee as { id: string; name_ko: string } | { id: string; name_ko: string }[]),
    company: one(row.company as { id: string; name_ko: string } | { id: string; name_ko: string }[]),
  };
}

export async function getTasks(filters?: {
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
  if (filters?.status) query = query.eq("deal_status", filters.status);
  if (filters?.assigneePersonId) query = query.eq("assignee_person_id", filters.assigneePersonId);

  const { data, error } = await query.limit(500);
  if (error) {
    console.error("getTasks", error.message);
    return [];
  }
  return (data as unknown as Record<string, unknown>[])
    .map(normalizeTask)
    .filter((t) => t.title && !/^\d+$/.test(t.title));
}

export async function getTaskCounts() {
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
  { entity: "tasks", label: "과제", nameField: "title", extra: "status" },
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

// ---------------------------------------------------------------- 내 업무 / 주차 업데이트

// 내가 PL·PM·구성원으로 붙어 있는 프로젝트 id
async function myProjectIds(personId: string | null): Promise<string[]> {
  if (!personId) return [];
  const supabase = await createSupabaseServer();
  const [owned, member] = await Promise.all([
    supabase
      .from("projects")
      .select("id")
      .is("deleted_at", null)
      .or(
        `primary_pl_person_id.eq.${personId},secondary_pl_person_id.eq.${personId},candidate_pm_person_id.eq.${personId}`
      ),
    supabase.from("project_members").select("project_id").eq("person_id", personId),
  ]);
  const ids = new Set<string>();
  for (const row of (owned.data ?? []) as { id: string }[]) ids.add(row.id);
  for (const row of (member.data ?? []) as { project_id: string }[]) ids.add(row.project_id);
  return Array.from(ids);
}

export type MyProject = {
  id: string;
  name: string;
  status: string;
  deal_status: string;
  pipeline_stage: string;
  company: string | null;
  lastUpdateDate: string | null;
  lastUpdateLabel: string | null;
};

// 프로젝트별 마지막 주차 업데이트
async function lastUpdateByProject(projectIds: string[]) {
  const map = new Map<string, { date: string | null; label: string | null }>();
  if (projectIds.length === 0) return map;
  const supabase = await createSupabaseServer();
  const { data } = await supabase
    .from("project_weekly_updates")
    .select("project_id, update_date, update_label")
    .in("project_id", projectIds)
    .order("update_date", { ascending: false, nullsFirst: false })
    .limit(2000);
  for (const row of (data ?? []) as { project_id: string; update_date: string | null; update_label: string | null }[]) {
    if (!map.has(row.project_id)) map.set(row.project_id, { date: row.update_date, label: row.update_label });
  }
  return map;
}

export async function getMyWork(personId: string | null) {
  const supabase = await createSupabaseServer();
  const ids = await myProjectIds(personId);

  const [tasksRes, projectsRes] = await Promise.all([
    personId
      ? supabase
          .from("tasks")
          .select(TICKET_SELECT)
          .is("deleted_at", null)
          .eq("assignee_person_id", personId)
          .in("status", ["backlog", "in_progress", "waiting", "blocked"])
          .order("due_date", { ascending: true, nullsFirst: false })
          .limit(100)
      : Promise.resolve({ data: [] }),
    ids.length > 0
      ? supabase
          .from("projects")
          .select("id, name, deal_status, pipeline_stage, company:companies!projects_company_id_fkey(name_ko)")
          .in("id", ids)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] }),
  ]);

  const lastMap = await lastUpdateByProject(ids);

  const projects: MyProject[] = ((projectsRes.data ?? []) as unknown as Record<string, unknown>[])
    .map((row) => {
      const company = one(row.company as { name_ko: string } | { name_ko: string }[]);
      const last = lastMap.get(row.id as string);
      return {
        id: row.id as string,
        name: row.name as string,
        status: row.status as string,
        deal_status: (row.deal_status as string) ?? "미분류",
        pipeline_stage: (row.pipeline_stage as string) ?? "미정리후보",
        company: company?.name_ko ?? null,
        lastUpdateDate: last?.date ?? null,
        lastUpdateLabel: last?.label ?? null,
      };
    })
    .sort((a, b) => String(a.lastUpdateDate ?? "").localeCompare(String(b.lastUpdateDate ?? "")));

  const tasks = ((tasksRes.data ?? []) as unknown as Record<string, unknown>[]).map(normalizeTask);

  return { tasks, projects };
}

export type WeeklyRow = {
  projectId: string;
  name: string;
  company: string | null;
  deal_status: string;
  pipeline_stage: string;
  current: string;
  previous: string;
  // 이 주차 기록의 상태 — 누가 언제 썼고, 어드민이 확인했는지, 보완 요청이 걸렸는지
  updateId: string | null;
  author: string | null;
  editedAt: string | null;
  editCount: number;
  confirmedAt: string | null;
  reviewNote: string | null;
};

// 주차 작성 화면용 — 내 프로젝트 + 해당 주차 기존 내용 + 지난 주차 내용
export async function getWeeklyBoard(personId: string | null, label: string, previousLabel: string) {
  const supabase = await createSupabaseServer();
  const ids = await myProjectIds(personId);
  if (ids.length === 0) return [] as WeeklyRow[];

  const [projectsRes, updatesRes] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, deal_status, pipeline_stage, company:companies!projects_company_id_fkey(name_ko)")
      .in("id", ids)
      .is("deleted_at", null),
    supabase
      .from("project_weekly_updates")
      .select(
        "id, project_id, update_label, body, confirmed_at, review_note, last_edited_at, edit_count, " +
          "author:users!project_weekly_updates_updated_by_user_id_fkey(email, person:people!users_person_id_fkey(name_ko))"
      )
      .in("project_id", ids)
      .in("update_label", [label, previousLabel]),
  ]);

  type UpdateRow = {
    id: string; project_id: string; update_label: string; body: string;
    confirmed_at: string | null; review_note: string | null;
    last_edited_at: string | null; edit_count: number | null; author: unknown;
  };

  const authorName = (raw: unknown) => {
    const user = one(raw as { email: string; person: unknown } | { email: string; person: unknown }[]);
    if (!user) return null;
    const person = one(user.person as { name_ko: string } | { name_ko: string }[]);
    return person?.name_ko ?? user.email ?? null;
  };

  const current = new Map<string, UpdateRow>();
  const previous = new Map<string, string>();
  for (const row of (updatesRes.data ?? []) as unknown as UpdateRow[]) {
    if (row.update_label === label) current.set(row.project_id, row);
    else if (row.update_label === previousLabel) previous.set(row.project_id, row.body);
  }

  return ((projectsRes.data ?? []) as unknown as Record<string, unknown>[])
    .map((row) => {
      const company = one(row.company as { name_ko: string } | { name_ko: string }[]);
      const hit = current.get(row.id as string);
      return {
        projectId: row.id as string,
        name: row.name as string,
        company: company?.name_ko ?? null,
        deal_status: (row.deal_status as string) ?? "미분류",
        pipeline_stage: (row.pipeline_stage as string) ?? "미정리후보",
        current: hit?.body ?? "",
        previous: previous.get(row.id as string) ?? "",
        updateId: hit?.id ?? null,
        author: hit ? authorName(hit.author) : null,
        editedAt: hit?.last_edited_at ?? null,
        editCount: hit?.edit_count ?? 0,
        confirmedAt: hit?.confirmed_at ?? null,
        reviewNote: hit?.review_note ?? null,
      } satisfies WeeklyRow;
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

// 프로젝트 목록에 붙일 마지막 업데이트 (정체 감지용)
export async function getLastUpdateMap(projectIds: string[]) {
  return lastUpdateByProject(projectIds);
}

// ── 이벤트 참석자 검색용 경량 명부 ──────────────────────────────────────────
export type DirectoryPerson = {
  id: string;
  name: string;
  company: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
};

export async function getPeopleDirectory(): Promise<DirectoryPerson[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("people")
    .select("id, name_ko, title, email, phone, company:companies!people_primary_company_id_fkey(name_ko)")
    .is("deleted_at", null)
    .order("name_ko", { ascending: true })
    .limit(2000);
  if (error) {
    console.error("getPeopleDirectory", error.message);
    return [];
  }
  warnIfCapped("파트너 검색 명부", data, 2000);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const company = one(row.company as { name_ko: string } | { name_ko: string }[]);
    return {
      id: row.id as string,
      name: row.name_ko as string,
      company: company?.name_ko ?? null,
      title: (row.title as string) ?? null,
      email: (row.email as string) ?? null,
      phone: (row.phone as string) ?? null,
    };
  });
}

// ── 파트너 관리 보드 ────────────────────────────────────────────────────────
// 라벨(partner_status)이 382명 미분류이므로 라벨로 거르지 않는다.
// 프로젝트 배정 · 문서 보유 · 네트워크 분류 · 라벨 중 하나라도 있으면 '활동'으로 본다.
export type PartnerEvidence = "project" | "document" | "segment" | "label";

export type PartnerBoardRow = {
  id: string;
  name: string;
  company: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  partner_status: string | null;
  network_segment: string | null;
  nda_status: string | null;
  profile_status: string | null;
  appointment_status: string | null;
  projectCount: number;
  roles: string[];
  contractCount: number;
  negotiationCount: number;
  docCount: number;
  lastLabel: string | null;
  lastDate: string | null;
  evidence: PartnerEvidence[];
};

const DONE_DOC = new Set(["O", "Y", "완료"]);

export async function getPartnerBoard(): Promise<PartnerBoardRow[]> {
  const supabase = await createSupabaseServer();

  // 집계는 erp_partner_board 뷰가 한다 (security_invoker 라 RLS 는 그대로 적용된다).
  const { data, error } = await supabase.from("erp_partner_board").select("*").limit(5000);
  if (error) {
    console.error("getPartnerBoard", error.message);
    return [];
  }

  warnIfCapped("파트너 보드", data, 5000);
  const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const partnerStatus = (row.partner_status as string) ?? null;
    const segment = (row.network_segment as string) ?? null;
    const docCount = Number(row.doc_count ?? 0);

    const evidence: PartnerEvidence[] = [];
    if (Number(row.project_count ?? 0) > 0) evidence.push("project");
    if (
      docCount > 0 ||
      DONE_DOC.has((row.nda_status as string) ?? "") ||
      DONE_DOC.has((row.profile_status as string) ?? "") ||
      DONE_DOC.has((row.appointment_status as string) ?? "")
    ) {
      evidence.push("document");
    }
    if (segment && segment !== "unknown") evidence.push("segment");
    if (partnerStatus && partnerStatus.trim()) evidence.push("label");

    return {
      id: row.id as string,
      name: row.name as string,
      company: (row.company as string) ?? null,
      title: (row.title as string) ?? null,
      email: (row.email as string) ?? null,
      phone: (row.phone as string) ?? null,
      partner_status: partnerStatus,
      network_segment: segment,
      nda_status: (row.nda_status as string) ?? null,
      profile_status: (row.profile_status as string) ?? null,
      appointment_status: (row.appointment_status as string) ?? null,
      projectCount: Number(row.project_count ?? 0),
      roles: ((row.roles as string[]) ?? []).filter(Boolean),
      contractCount: Number(row.contract_count ?? 0),
      negotiationCount: Number(row.negotiation_count ?? 0),
      docCount,
      lastLabel: (row.last_label as string) ?? null,
      lastDate: (row.last_date as string) ?? null,
      evidence,
    } satisfies PartnerBoardRow;
  });

  return rows
    .filter((row) => row.evidence.length > 0)
    .sort((a, b) => b.projectCount - a.projectCount || a.name.localeCompare(b.name, "ko"));
}

// PL/PM 으로 지정할 수 있는 사람 — 구분이나 네트워크 분류가 잡힌 사람 + 이미 배정된 사람.
export async function getPersonOptions(): Promise<[string, string][]> {
  const supabase = await createSupabaseServer();
  const [profileRes, projectRes] = await Promise.all([
    supabase
      .from("network_profiles")
      .select("person_id, partner_status, network_segment, person:people!network_profiles_person_id_fkey(id, name_ko)")
      .limit(2000),
    supabase
      .from("projects")
      .select(
        "primary_pl:people!projects_primary_pl_person_id_fkey(id, name_ko), " +
          "secondary_pl:people!projects_secondary_pl_person_id_fkey(id, name_ko), " +
          "pm:people!projects_candidate_pm_person_id_fkey(id, name_ko)"
      )
      .is("deleted_at", null)
      .limit(1000),
  ]);

  const map = new Map<string, string>();
  const add = (person: { id: string; name_ko: string } | null) => {
    if (person?.id && !map.has(person.id)) map.set(person.id, person.name_ko);
  };

  for (const row of (profileRes.data ?? []) as unknown as Record<string, unknown>[]) {
    const labelled = Boolean((row.partner_status as string)?.trim());
    const segmented = (row.network_segment as string) !== "unknown";
    if (!labelled && !segmented) continue;
    add(one(row.person as { id: string; name_ko: string }));
  }
  for (const row of (projectRes.data ?? []) as unknown as Record<string, unknown>[]) {
    add(one(row.primary_pl as { id: string; name_ko: string }));
    add(one(row.secondary_pl as { id: string; name_ko: string }));
    add(one(row.pm as { id: string; name_ko: string }));
  }

  return Array.from(map.entries())
    .map(([id, name]) => [id, name] as [string, string])
    .sort((a, b) => a[1].localeCompare(b[1], "ko"));
}

// ── 주간보고 확인 (어드민) ──────────────────────────────────────────────────
export type WeeklyReviewRow = {
  projectId: string;
  name: string;
  company: string | null;
  plName: string | null;
  plPersonId: string | null;
  updateId: string | null;
  body: string;
  confirmedAt: string | null;
  reviewNote: string | null;
};

export async function getWeeklyReview(label: string): Promise<WeeklyReviewRow[]> {
  const supabase = await createSupabaseServer();
  const [projectRes, updateRes] = await Promise.all([
    supabase
      .from("projects")
      .select(
        "id, name, primary_pl_person_id, " +
          "company:companies!projects_company_id_fkey(name_ko), " +
          "pl:people!projects_primary_pl_person_id_fkey(id, name_ko)"
      )
      .is("deleted_at", null)
      .in("status", ["confirmed", "likely", "discussing", "managed"])
      .limit(1000),
    supabase
      .from("project_weekly_updates")
      .select("id, project_id, body, confirmed_at, review_note")
      .eq("update_label", label)
      .limit(1000),
  ]);

  const updates = new Map(
    ((updateRes.data ?? []) as {
      id: string;
      project_id: string;
      body: string;
      confirmed_at: string | null;
      review_note: string | null;
    }[]).map((row) => [row.project_id, row])
  );

  return ((projectRes.data ?? []) as unknown as Record<string, unknown>[])
    .map((row) => {
      const company = one(row.company as { name_ko: string } | { name_ko: string }[]);
      const pl = one(row.pl as { id: string; name_ko: string } | { id: string; name_ko: string }[]);
      const update = updates.get(row.id as string);
      return {
        projectId: row.id as string,
        name: row.name as string,
        company: company?.name_ko ?? null,
        plName: pl?.name_ko ?? null,
        plPersonId: pl?.id ?? null,
        updateId: update?.id ?? null,
        body: update?.body ?? "",
        confirmedAt: update?.confirmed_at ?? null,
        reviewNote: update?.review_note ?? null,
      };
    })
    .sort((a, b) => {
      // 미작성 → 미확인 → 확인됨 순. 같은 그룹 안에서는 PL 이름 순.
      const rank = (row: WeeklyReviewRow) => (!row.updateId ? 0 : !row.confirmedAt ? 1 : 2);
      return rank(a) - rank(b) || (a.plName ?? "").localeCompare(b.plName ?? "", "ko") || a.name.localeCompare(b.name, "ko");
    });
}

// 과제 상세
export async function getTask(id: string) {
  const supabase = await createSupabaseServer();
  const { data: task } = await supabase
    .from("tasks")
    .select(
      "id, title, description, status, priority, due_date, created_at, completed_at, project_id, assignee_person_id, " +
        "project:projects!tasks_project_id_fkey(id, name), " +
        "assignee:people!tasks_assignee_person_id_fkey(id, name_ko), " +
        "company:companies!tasks_company_id_fkey(id, name_ko), " +
        "creator:users!tasks_created_by_user_id_fkey(email)"
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!task) return null;

  const record = task as unknown as Record<string, unknown>;
  const project = one(record.project as { id: string; name: string } | { id: string; name: string }[]);

  const [commentRes, notes] = await Promise.all([
    supabase
      .from("task_comments")
      .select("id, body, created_at, author:users!task_comments_author_user_id_fkey(email)")
      .eq("task_id", id)
      .order("created_at", { ascending: true })
      .limit(200),
    project
      ? supabase
          .from("meeting_notes")
          .select("id, title, meeting_date, storage_path")
          .eq("project_id", project.id)
          .order("meeting_date", { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [] }),
  ]);

  return {
    task: Object.assign({}, record, {
      project,
      assignee: one(record.assignee as { id: string; name_ko: string } | { id: string; name_ko: string }[]),
      company: one(record.company as { id: string; name_ko: string } | { id: string; name_ko: string }[]),
      creator: one(record.creator as { email: string } | { email: string }[]),
    }) as Record<string, unknown> & {
      project: { id: string; name: string } | null;
      assignee: { id: string; name_ko: string } | null;
      company: { id: string; name_ko: string } | null;
      creator: { email: string } | null;
    },
    comments: ((commentRes.data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
      id: row.id as string,
      body: row.body as string,
      created_at: row.created_at as string,
      author: one(row.author as { email: string } | { email: string }[])?.email ?? null,
    })),
    meetingNotes: (notes.data ?? []) as unknown as {
      id: string;
      title: string;
      meeting_date: string | null;
      storage_path: string | null;
    }[],
  };
}

export async function getCompanyNames(): Promise<string[]> {
  const supabase = await createSupabaseServer();
  const { data } = await supabase
    .from("companies")
    .select("name_ko")
    .is("deleted_at", null)
    .order("name_ko")
    .limit(2000);
  return Array.from(new Set(((data ?? []) as { name_ko: string }[]).map((c) => c.name_ko))).filter(Boolean);
}

// ── 회의록 ──────────────────────────────────────────────────────────────────
export type MeetingRow = {
  id: string;
  title: string;
  meeting_date: string | null;
  attendees: string | null;
  summary: string | null;
  ai_summary: string | null;
  ai_status: string;
  file_name: string | null;
  audio_path: string | null;
  company: string | null;
  companyId: string | null;
  project: string | null;
  projectId: string | null;
  actionCount: number;
  openActionCount: number;
  url: string | null;
  audioUrl: string | null;
};

export async function getMeetings(query?: string): Promise<MeetingRow[]> {
  const supabase = await createSupabaseServer();

  let request = supabase
    .from("meeting_notes")
    .select(
      "id, title, meeting_date, attendees, summary, ai_summary, ai_status, file_name, " +
        "storage_bucket, storage_path, audio_bucket, audio_path, " +
        "company:companies!meeting_notes_company_id_fkey(id, name_ko), " +
        "project:projects!meeting_notes_project_id_fkey(id, name)"
    )
    .order("meeting_date", { ascending: false, nullsFirst: false })
    .limit(500);

  if (query) {
    const q = `%${query}%`;
    request = request.or(`title.ilike.${q},attendees.ilike.${q},summary.ilike.${q},ai_summary.ilike.${q},transcript.ilike.${q}`);
  }

  const { data, error } = await request;
  if (error) {
    console.error("getMeetings", error.message);
    return [];
  }

  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const ids = rows.map((r) => r.id as string);

  const { data: actions } = ids.length
    ? await supabase.from("meeting_action_items").select("meeting_note_id, task_id, dismissed_at").in("meeting_note_id", ids)
    : { data: [] };

  const total = new Map<string, number>();
  const open = new Map<string, number>();
  for (const a of (actions ?? []) as { meeting_note_id: string; task_id: string | null; dismissed_at: string | null }[]) {
    total.set(a.meeting_note_id, (total.get(a.meeting_note_id) ?? 0) + 1);
    if (!a.task_id && !a.dismissed_at) open.set(a.meeting_note_id, (open.get(a.meeting_note_id) ?? 0) + 1);
  }

  const signed = await signMany([
    ...rows.filter((r) => r.storage_path).map((r) => ({ bucket: (r.storage_bucket as string) ?? "xp-meeting-notes", path: r.storage_path as string })),
    ...rows.filter((r) => r.audio_path).map((r) => ({ bucket: (r.audio_bucket as string) ?? "xp-meeting-audio", path: r.audio_path as string })),
  ]);

  return rows.map((row) => {
    const company = one(row.company as { id: string; name_ko: string } | { id: string; name_ko: string }[]);
    const project = one(row.project as { id: string; name: string } | { id: string; name: string }[]);
    return {
      id: row.id as string,
      title: (row.title as string) ?? "",
      meeting_date: (row.meeting_date as string) ?? null,
      attendees: (row.attendees as string) ?? null,
      summary: (row.summary as string) ?? null,
      ai_summary: (row.ai_summary as string) ?? null,
      ai_status: (row.ai_status as string) ?? "none",
      file_name: (row.file_name as string) ?? null,
      audio_path: (row.audio_path as string) ?? null,
      company: company?.name_ko ?? null,
      companyId: company?.id ?? null,
      project: project?.name ?? null,
      projectId: project?.id ?? null,
      actionCount: total.get(row.id as string) ?? 0,
      openActionCount: open.get(row.id as string) ?? 0,
      url: row.storage_path
        ? signed.get(`${(row.storage_bucket as string) ?? "xp-meeting-notes"}::${row.storage_path}`) ?? null
        : null,
      audioUrl: row.audio_path
        ? signed.get(`${(row.audio_bucket as string) ?? "xp-meeting-audio"}::${row.audio_path}`) ?? null
        : null,
    };
  });
}

// 문서 검색 — 제목·파일명·유형으로 찾는다. 연결된 대상도 같이 보여준다.
export type DocumentSearchRow = {
  id: string;
  title: string;
  document_type: string;
  file_name: string | null;
  uploaded_at: string | null;
  sensitivity: string;
  url: string | null;
  linkedTo: string;
  linkHref: string | null;
};

export async function searchDocuments(query?: string): Promise<DocumentSearchRow[]> {
  const supabase = await createSupabaseServer();

  let request = supabase
    .from("documents")
    .select("id, title, document_type, file_name, storage_bucket, storage_path, external_url, uploaded_at, sensitivity")
    .order("uploaded_at", { ascending: false, nullsFirst: false })
    .limit(500);

  if (query) {
    const q = `%${query}%`;
    request = request.or(`title.ilike.${q},file_name.ilike.${q},document_type.ilike.${q},memo.ilike.${q}`);
  }

  const { data, error } = await request;
  if (error) {
    console.error("searchDocuments", error.message);
    return [];
  }
  const docs = (data ?? []) as Record<string, string | null>[];
  warnIfCapped("문서", docs, 500);

  const ids = docs.map((d) => d.id as string);
  const { data: links } = ids.length
    ? await supabase.from("entity_documents").select("document_id, entity_type, entity_id").in("document_id", ids)
    : { data: [] };

  const linkRows = (links ?? []) as { document_id: string; entity_type: string; entity_id: string }[];
  const companyIds = linkRows.filter((l) => l.entity_type === "company").map((l) => l.entity_id);
  const projectIds = linkRows.filter((l) => l.entity_type === "project").map((l) => l.entity_id);
  const personIds = linkRows.filter((l) => l.entity_type === "person").map((l) => l.entity_id);

  const [cs, ps, pe] = await Promise.all([
    companyIds.length ? supabase.from("companies").select("id, name_ko").in("id", companyIds) : Promise.resolve({ data: [] }),
    projectIds.length ? supabase.from("projects").select("id, name").in("id", projectIds) : Promise.resolve({ data: [] }),
    personIds.length ? supabase.from("people").select("id, name_ko").in("id", personIds) : Promise.resolve({ data: [] }),
  ]);
  const nameOf = new Map<string, string>();
  for (const c of (cs.data ?? []) as { id: string; name_ko: string }[]) nameOf.set(`company:${c.id}`, c.name_ko);
  for (const p of (ps.data ?? []) as { id: string; name: string }[]) nameOf.set(`project:${p.id}`, p.name);
  for (const p of (pe.data ?? []) as { id: string; name_ko: string }[]) nameOf.set(`person:${p.id}`, p.name_ko);

  const linkByDoc = new Map<string, { type: string; id: string }>();
  for (const l of linkRows) if (!linkByDoc.has(l.document_id)) linkByDoc.set(l.document_id, { type: l.entity_type, id: l.entity_id });

  const signed = await signMany(
    docs.filter((d) => !d.external_url && d.storage_path)
      .map((d) => ({ bucket: d.storage_bucket ?? "xp-documents", path: d.storage_path as string }))
  );

  const PATH: Record<string, string> = { company: "/customers", project: "/projects", person: "/partners" };

  return docs.map((doc) => {
    const link = linkByDoc.get(doc.id as string);
    const name = link ? nameOf.get(`${link.type}:${link.id}`) ?? "" : "";
    return {
      id: doc.id as string,
      title: doc.title ?? "",
      document_type: doc.document_type ?? "",
      file_name: doc.file_name,
      uploaded_at: doc.uploaded_at,
      sensitivity: doc.sensitivity ?? "internal",
      url: doc.external_url ?? signed.get(`${doc.storage_bucket ?? "xp-documents"}::${doc.storage_path}`) ?? null,
      linkedTo: name,
      linkHref: link && PATH[link.type] ? `${PATH[link.type]}/${link.id}` : null,
    };
  });
}

export async function getMeeting(id: string) {
  const supabase = await createSupabaseServer();
  const { data: note } = await supabase
    .from("meeting_notes")
    .select(
      "id, title, meeting_date, attendees, summary, ai_summary, ai_status, ai_error, transcript, " +
        "file_name, storage_bucket, storage_path, audio_bucket, audio_path, created_at, " +
        "company:companies!meeting_notes_company_id_fkey(id, name_ko), " +
        "project:projects!meeting_notes_project_id_fkey(id, name)"
    )
    .eq("id", id)
    .maybeSingle();
  if (!note) return null;

  const row = note as unknown as Record<string, unknown>;
  const { data: items } = await supabase
    .from("meeting_action_items")
    .select("id, body, due_date, origin, task_id, dismissed_at, assignee:people!meeting_action_items_assignee_person_id_fkey(id, name_ko)")
    .eq("meeting_note_id", id)
    .order("created_at");

  const signed = await signMany([
    ...(row.storage_path ? [{ bucket: (row.storage_bucket as string) ?? "xp-meeting-notes", path: row.storage_path as string }] : []),
    ...(row.audio_path ? [{ bucket: (row.audio_bucket as string) ?? "xp-meeting-audio", path: row.audio_path as string }] : []),
  ]);

  return {
    note: Object.assign({}, row, {
      company: one(row.company as { id: string; name_ko: string } | { id: string; name_ko: string }[]),
      project: one(row.project as { id: string; name: string } | { id: string; name: string }[]),
      url: row.storage_path ? signed.get(`${(row.storage_bucket as string) ?? "xp-meeting-notes"}::${row.storage_path}`) ?? null : null,
      audioUrl: row.audio_path ? signed.get(`${(row.audio_bucket as string) ?? "xp-meeting-audio"}::${row.audio_path}`) ?? null : null,
    }) as Record<string, unknown> & {
      company: { id: string; name_ko: string } | null;
      project: { id: string; name: string } | null;
      url: string | null;
      audioUrl: string | null;
    },
    items: ((items ?? []) as unknown as Record<string, unknown>[]).map((item) => ({
      id: item.id as string,
      body: item.body as string,
      due_date: (item.due_date as string) ?? null,
      origin: item.origin as string,
      task_id: (item.task_id as string) ?? null,
      dismissed_at: (item.dismissed_at as string) ?? null,
      assignee: one(item.assignee as { id: string; name_ko: string } | { id: string; name_ko: string }[]),
    })),
  };
}
