import { createClient } from "@supabase/supabase-js";

type Row = Record<string, string>;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function getSupabase() {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });
}

function ko(value: string | null | undefined) {
  const map: Record<string, string> = {
    unknown: "미분류",
    xp_internal: "XP 내부",
    consulting_partner: "컨설팅 파트너",
    investment_finance_partner: "투자/재무 파트너",
    lp_investor: "LP/투자자",
    external_expert: "외부 전문가",
    vendor_advisor: "협력사",
    customer_contact: "고객사",
    event_invitee: "행사 참석자",
    consulting: "사업컨설팅",
    reengineering: "리엔지니어링",
    investment: "투자/M&A",
    business_building: "비즈니스빌딩",
    go_global: "해외진출",
    event: "이벤트",
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
    in_progress: "진행 중",
    waiting: "대기 중",
    blocked: "막힘",
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

export async function getSourceStats() {
  if (!isSupabaseConfigured()) {
    return [
      { label: "Supabase", value: "미연결", detail: "환경변수 설정 필요" },
      { label: "네트워크", value: "0", detail: "DB 연결 후 표시" },
      { label: "프로젝트", value: "0", detail: "DB 연결 후 표시" },
      { label: "문서", value: "0", detail: "DB 연결 후 표시" },
    ];
  }
  const [people, projects, tasks, documents] = await Promise.all([
    countRows("people"),
    countRows("projects"),
    countRows("tasks"),
    countRows("document_requirements"),
  ]);
  return [
    { label: "네트워크", value: String(people), detail: "Supabase people" },
    { label: "프로젝트", value: String(projects), detail: "Supabase projects" },
    { label: "액션", value: String(tasks), detail: "Supabase tasks" },
    { label: "문서 필요", value: String(documents), detail: "Supabase requirements" },
  ];
}

export async function getNetworkRows(limit = 12) {
  const rows = await readView<Row>("erp_network_rows", limit);
  return rows.map((row) => ({
    name: row.name || "",
    segment: ko(row.segment),
    company: row.company || "미지정",
    role: row.role || "검토",
    docs: row.docs || "확인 필요",
  }));
}

export async function getProjectRows(limit = 12) {
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
  const rows = await readView<Row>("erp_task_rows", limit);
  return rows.map((row) => ({
    title: row.title || "",
    owner: row.owner || "미지정",
    link: row.link || "검토",
    status: ko(row.status),
  }));
}

export async function getSearchRows(limit = 16) {
  return getTaskRows(limit);
}

export async function getSegmentSummary() {
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
