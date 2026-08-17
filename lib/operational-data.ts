import { createClient } from "@supabase/supabase-js";
import seed from "@/data/processed/operational_seed_preview.json";

type Row = Record<string, string>;
type SeedProject = (typeof seed.projects)[number];
type SeedTask = (typeof seed.tasks)[number];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function getSupabase() {
  if (useSeedFallback() || !supabaseUrl || !supabaseAnonKey) return null;
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });
}

export function ko(value: string | null | undefined) {
  const map: Record<string, string> = {
    Unknown: "미분류",
    Unclassified: "미분류",
    unknown: "미분류",
    unclassified: "미분류",
    Operations: "운영",
    operations: "운영",
    xp_internal: "XP 내부",
    "XP internal": "XP 내부",
    consulting_partner: "컨설팅 파트너",
    "Consulting partner": "컨설팅 파트너",
    investment_finance_partner: "투자/재무 파트너",
    lp_investor: "LP/투자자",
    "LP / investor": "LP/투자자",
    external_expert: "외부 전문가",
    "External expert": "외부 전문가",
    vendor_advisor: "협력사",
    "Vendor advisor": "협력사",
    "Partner network": "파트너 네트워크",
    customer_contact: "고객사",
    event_invitee: "행사 참석자",
    consulting: "사업컨설팅",
    Consulting: "사업컨설팅",
    reengineering: "리엔지니어링",
    "Re-engineering": "리엔지니어링",
    investment: "투자/M&A",
    "Investment / M&A": "투자/M&A",
    business_building: "비즈니스빌딩",
    "Business building": "비즈니스빌딩",
    go_global: "해외진출",
    "Go Global": "해외진출",
    event: "이벤트",
    Events: "이벤트",
    Network: "네트워크",
    Documents: "문서",
    Projects: "프로젝트",
    internal_ops: "내부 운영",
    confirmed: "확정",
    likely: "가능성 높음",
    discussing: "논의 중",
    managed: "관리 중",
    on_hold: "보류",
    done: "완료",
    dropped: "중단",
    planning: "준비",
    inviting: "초대 중",
    completed: "완료",
    cancelled: "취소",
    needed: "필요",
    requested: "요청",
    received: "수령",
    signed: "서명 완료",
    expired: "만료",
    waived: "면제",
    backlog: "대기",
    Backlog: "대기",
    in_progress: "진행 중",
    waiting: "대기 중",
    blocked: "막힘",
    Needed: "필요",
    Review: "검토",
    review: "검토",
  };
  if (!value) return "";
  return map[value] ?? value;
}

async function countRows(table: string) {
  const supabase = getSupabase();
  if (!supabase) return 0;
  const { count } = await supabase.from(table).select("*", { count: "exact", head: true });
  return count ?? 0;
}

async function readView<T extends Row>(view: string, limit: number) {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase.from(view).select("*").limit(limit);
  if (error) {
    console.error(`Supabase view read failed: ${view}`, error.message);
    return [];
  }
  return (data ?? []) as T[];
}

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

function useSeedFallback() {
  return process.env.XP_FORCE_SEED_FALLBACK === "1" || !isSupabaseConfigured();
}

function isUsefulTask(task: SeedTask) {
  return Boolean(task.title) && task.classification !== "heading" && !/^\d+$/.test(task.title);
}

function projectType(project: SeedProject) {
  return ko(project.projectType) || "검토";
}

function seedCustomerSlug(company: string) {
  return `seed-${encodeURIComponent(company).replace(/%/g, "~")}`;
}

function companyFromSeedCustomerId(id: string) {
  if (!id.startsWith("seed-")) return "";
  return decodeURIComponent(id.slice(5).replace(/~/g, "%"));
}

function seedProjectsForCompany(customerId: string) {
  const company = companyFromSeedCustomerId(customerId);
  if (!company) return [];
  return seed.projects.filter((project) => project.company === company);
}

function buildSeedCustomerRows() {
  const grouped = new Map<string, SeedProject[]>();
  for (const project of seed.projects) {
    if (!project.company) continue;
    const rows = grouped.get(project.company) ?? [];
    rows.push(project);
    grouped.set(project.company, rows);
  }

  return Array.from(grouped.entries())
    .sort(([companyA, rowsA], [companyB, rowsB]) => rowsB.length - rowsA.length || companyA.localeCompare(companyB))
    .map(([company, projects], index) => {
      const first = projects[0];
      const tasks = seed.tasks.filter((task) => task.body.includes(company) || task.title.includes(company)).filter(isUsefulTask);
      const contracts = projects.filter((project) => ko(project.contractStatus) !== "검토").length || projects.length;

      return {
        id: seedCustomerSlug(company),
        customerId: `C-DEMO-${String(index + 1).padStart(3, "0")}`,
        customer: company,
        industry: first.business || "미지정",
        projects: String(projects.length),
        contracts: String(contracts),
        docs: "검토",
        tasks: String(tasks.length),
        status: ko(first.contractStatus) || "검토",
        next: first.nextAction || first.latestUpdate || "다음 액션 검토",
      };
    });
}

function seedTaskRows(limit: number) {
  return seed.tasks
    .filter(isUsefulTask)
    .slice(0, limit)
    .map((task) => ({
      title: task.title || "",
      owner: task.owner && task.owner !== "Unassigned" ? task.owner : "운영",
      link: ko(task.linkedArea) || "검토",
      status: ko(task.status) || "대기",
    }));
}

export async function getSourceStats() {
  if (useSeedFallback()) {
    return [
      {
        label: "데이터 소스",
        value: process.env.XP_FORCE_SEED_FALLBACK === "1" ? "Seed" : "Seed 대체",
        detail: isSupabaseConfigured() ? "강제 데모 모드" : "Supabase 환경값 없음",
      },
      { label: "네트워크", value: String(seed.summary.people), detail: "파트너/담당자" },
      { label: "고객사", value: String(buildSeedCustomerRows().length), detail: "Deal list 회사 기준" },
      { label: "프로젝트", value: String(seed.summary.projects), detail: "딜/운영 프로젝트" },
      { label: "이벤트", value: "23", detail: "To Go 이벤트 액션" },
      { label: "문서 필요", value: String(seed.summary.documentRequirements), detail: "NDA/프로필/계약" },
    ];
  }
  const [people, companies, projects, events, documents, tasks] = await Promise.all([
    countRows("people"),
    countRows("companies"),
    countRows("projects"),
    countRows("events"),
    countRows("document_requirements"),
    countRows("tasks"),
  ]);
  return [
    { label: "네트워크", value: String(people), detail: "파트너/담당자" },
    { label: "회사", value: String(companies), detail: "고객사/파트너사" },
    { label: "프로젝트", value: String(projects), detail: "딜/운영 프로젝트" },
    { label: "이벤트", value: String(events), detail: "미팅/출장/초대" },
    { label: "문서 필요", value: String(documents), detail: "NDA/프로필/계약" },
    { label: "액션", value: String(tasks), detail: "To Go List 전환" },
  ];
}

export async function getNetworkRows(limit = 12) {
  if (useSeedFallback()) {
    return seed.network.slice(0, limit).map((row) => ({
      name: row.name || "",
      segment: ko(row.segment || row.category),
      company: row.company || "미지정",
      role: row.role || "검토",
      docs: [row.ndaStatus, row.profileStatus, row.appointmentStatus].map(ko).filter(Boolean).join(" / ") || "확인 필요",
    }));
  }

  const rows = await readView<Row>("erp_network_rows", limit);
  return rows.map((row) => ({
    name: row.name || "",
    segment: ko(row.segment),
    company: row.company || "미지정",
    role: row.role || "검토",
    docs: row.docs || "확인 필요",
  }));
}

export async function getCustomerRows(limit = 24) {
  if (useSeedFallback()) {
    return buildSeedCustomerRows().slice(0, limit);
  }

  const rows = await readView<Row>("erp_customer_rows", limit);
  return rows.map((row) => ({
    id: row.id || "",
    customerId: row.customer_id || "",
    customer: row.customer || "",
    industry: row.industry || "미지정",
    projects: String(row.project_count ?? "0"),
    contracts: String(row.contract_count ?? "0"),
    docs: String(row.document_gap_count ?? "0"),
    tasks: String(row.task_count ?? "0"),
    status: ko(row.latest_status),
    next: row.next_action || "다음 액션 검토",
  }));
}

export async function getCustomerDetail(customerId: string) {
  if (useSeedFallback()) {
    const rows = buildSeedCustomerRows();
    const customer = rows.find((row) => row.id === customerId);
    if (!customer) return null;

    return {
      id: customer.id,
      customer_id: customer.customerId,
      customer: customer.customer,
      industry: customer.industry,
      project_count: customer.projects,
      contract_count: customer.contracts,
      document_gap_count: customer.docs,
      task_count: customer.tasks,
      latest_status: customer.status,
      next_action: customer.next,
    };
  }

  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("erp_customer_rows")
    .select("*")
    .eq("id", customerId)
    .single();

  if (error) {
    console.error("Supabase customer read failed", error.message);
    return null;
  }

  return data as Row;
}

export async function getCustomerProjectRows(customerId: string, limit = 30) {
  if (useSeedFallback()) {
    return seedProjectsForCompany(customerId).slice(0, limit).map((project) => ({
      project: project.xpRequest || project.clientNeed || project.company || "딜 검토",
      type: projectType(project),
      status: ko(project.contractStatus) || "검토",
      pl: project.pl || "검토",
      pm: project.pm || "검토",
      contract: ko(project.contractStatus) || "검토",
      next: project.nextAction || project.latestUpdate || "다음 액션 검토",
    }));
  }

  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("erp_customer_project_rows")
    .select("*")
    .eq("customer_row_id", customerId)
    .limit(limit);

  if (error) {
    console.error("Supabase customer project read failed", error.message);
    return [];
  }

  return ((data ?? []) as Row[]).map((row) => ({
    project: row.project || "",
    type: ko(row.type),
    status: ko(row.status),
    pl: row.pl || "검토",
    pm: row.pm || "검토",
    contract: ko(row.contract_status) || "검토",
    next: row.next_action || "다음 액션 검토",
  }));
}

export async function getCustomerDocumentRows(customerId: string, limit = 20) {
  if (useSeedFallback()) {
    const company = companyFromSeedCustomerId(customerId);
    if (!company) return [];

    return seed.documentRequirements
      .filter((row) => row.subject.includes(company))
      .slice(0, limit)
      .map((row) => ({
        title: row.subject || company,
        type: row.type || "문서",
        status: ko(row.status) || "검토",
        due: row.due || "검토",
      }));
  }

  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("document_requirements")
    .select("title, requirement_type, status, required_by, expires_at, project_id, company_id")
    .or(`company_id.eq.${customerId}`)
    .limit(limit);

  if (error) {
    console.error("Supabase customer document read failed", error.message);
    return [];
  }

  return ((data ?? []) as Row[]).map((row) => ({
    title: row.title || "",
    type: row.requirement_type || "",
    status: ko(row.status),
    due: row.required_by || row.expires_at || "검토",
  }));
}

export async function getProjectRows(limit = 12) {
  if (useSeedFallback()) {
    return seed.projects.slice(0, limit).map((project) => ({
      company: project.company || "",
      type: projectType(project),
      pl: project.pl || "검토",
      pm: project.pm || "검토",
      next: project.nextAction || project.latestUpdate || "다음 액션 검토",
    }));
  }

  const rows = await readView<Row>("erp_project_rows", limit);
  return rows.map((row) => ({
    company: row.company || "",
    type: ko(row.type),
    pl: row.pl || "검토",
    pm: row.pm || "검토",
    next: row.next || "다음 액션 검토",
  }));
}

export async function getEventRows(limit = 12) {
  if (useSeedFallback()) {
    return seed.tasks
      .filter((task) => task.linkedArea === "Events")
      .filter(isUsefulTask)
      .slice(0, limit)
      .map((task) => ({
        event: task.title || "",
        owner: task.owner && task.owner !== "Unassigned" ? task.owner : "운영",
        invitees: task.body || "초대 대상 검토",
        state: ko(task.status) || "대기",
        next: task.body || "다음 액션 검토",
      }));
  }

  const rows = await readView<Row>("erp_event_rows", limit);
  return rows.map((row) => ({
    event: row.event || "",
    owner: row.owner || "미지정",
    invitees: row.invitees || "초대 대상 검토",
    state: ko(row.state),
    next: row.next || "다음 액션 검토",
  }));
}

export async function getDocumentRequirementRows(limit = 16) {
  if (useSeedFallback()) {
    return seed.documentRequirements.slice(0, limit).map((row) => ({
      subject: row.subject || "",
      type: row.type || "",
      owner: row.owner === "Operations" ? "운영" : row.owner || "운영",
      status: ko(row.status),
      due: row.due || "검토",
    }));
  }

  const rows = await readView<Row>("erp_document_requirement_rows", limit);
  return rows.map((row) => ({
    subject: row.subject || "",
    type: row.type || "",
    owner: row.owner || "운영",
    status: ko(row.status),
    due: row.due || "검토",
  }));
}

export async function getTaskRows(limit = 16) {
  if (useSeedFallback()) return seedTaskRows(limit);

  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("tasks")
    .select("title, description, status, project_id, event_id, company_id, person_id, document_requirement_id")
    .order("created_at", { ascending: true })
    .limit(limit * 4);

  if (error) {
    console.error("Supabase task read failed", error.message);
    return [];
  }

  return ((data ?? []) as Row[])
    .filter((row) => row.title && !/^\d+$/.test(row.title))
    .slice(0, limit)
    .map((row) => ({
      title: row.title || "",
      owner: "운영",
      link:
        row.document_requirement_id ? "문서" :
        row.event_id ? "이벤트" :
        row.project_id ? "프로젝트" :
        row.person_id ? "네트워크" :
        row.company_id ? "회사" :
        "검토",
      status: ko(row.status),
    }));
}

export async function getSearchRows(limit = 16) {
  return getTaskRows(limit);
}

export async function getSegmentSummary() {
  if (useSeedFallback()) {
    return Object.entries(seed.summary.networkSegments).map(([segment, count]) => ({
      segment: ko(segment),
      count: String(count),
    }));
  }

  const rows = await readView<Row>("erp_network_rows", 1000);
  const counts = new Map<string, number>();
  for (const row of rows) {
    const label = ko(row.segment) || "미분류";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([segment, count]) => ({
    segment,
    count: String(count),
  }));
}

export async function getProjectTypeSummary() {
  if (useSeedFallback()) {
    return Object.entries(seed.summary.projectTypes).map(([type, count]) => ({
      type: ko(type),
      count: String(count),
    }));
  }

  const rows = await readView<Row>("erp_project_rows", 1000);
  const counts = new Map<string, number>();
  for (const row of rows) {
    const label = ko(row.type) || "검토";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([type, count]) => ({
    type,
    count: String(count),
  }));
}
