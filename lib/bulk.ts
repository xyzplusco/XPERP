// 대량 편집 / 인라인 수정 / 휴지통에서 다룰 수 있는 대상과 필드를 여기서만 정의한다.
// 서버 액션은 반드시 이 화이트리스트를 통과한 값만 DB에 쓴다.

export type EntityKey = "projects" | "events" | "companies" | "people" | "tasks";

type FieldSpec = {
  // 자유 텍스트
  text?: boolean;
  // 허용값 목록 (DB 저장값)
  options?: readonly string[];
  // 날짜 (YYYY-MM-DD)
  date?: boolean;
  // 숫자
  number?: boolean;
  // 다른 테이블의 id (uuid 형식만 확인)
  ref?: boolean;
  // 관리자만 수정 가능
  adminOnly?: boolean;
};

const PROJECT_STATUS = ["confirmed", "likely", "discussing", "managed", "on_hold", "done", "dropped"] as const;
const PROJECT_TYPE = [
  "consulting", "reengineering", "investment", "business_building",
  "go_global", "event", "internal_ops", "unknown",
] as const;
const EVENT_STATUS = ["planning", "inviting", "confirmed", "completed", "cancelled"] as const;
const TASK_STATUS = ["backlog", "in_progress", "waiting", "blocked", "done", "dropped"] as const;
const PIPELINE_STAGE = ["고객", "협상", "관리기업", "파트너협업건", "미정리후보"] as const;
const DEAL_STATUS = ["계약", "계약임박", "제안", "가망", "관리", "보류", "미분류"] as const;
const SERVICE_SECTOR = [
  "Re-Engineering", "Business Building", "투자·매각", "영업", "Go Global", "AX", "기타·미정",
] as const;
const PARTNER_CLASS = [
  "임원", "직원", "파트너", "파트너 후보", "협력사", "고객사 담당자", "외부 전문가", "기타",
] as const;
const NETWORK_SEGMENT = [
  "xp_internal", "consulting_partner", "investment_finance_partner", "lp_investor",
  "external_expert", "vendor_advisor", "customer_contact", "event_invitee", "unknown",
] as const;

export const EDITABLE: Record<EntityKey, Record<string, FieldSpec>> = {
  projects: {
    name: { text: true },
    pipeline_stage: { options: PIPELINE_STAGE },
    deal_status: { options: DEAL_STATUS },
    service_sector: { options: SERVICE_SECTOR },
    // status / project_type 은 deal_status·service_sector 에서 파생된다. 직접 쓰지 말 것.
    status: { options: PROJECT_STATUS },
    project_type: { options: PROJECT_TYPE, adminOnly: true },
    folder_id: { ref: true, adminOnly: true },
    contract_status: { text: true },
    expected_revenue: { number: true, adminOnly: true },
    start_date: { date: true },
    end_date: { date: true },
    next_action: { text: true },
    primary_pl_person_id: { ref: true },
    candidate_pm_person_id: { ref: true },
  },
  events: {
    name: { text: true },
    event_type: { text: true },
    status: { options: EVENT_STATUS },
    location: { text: true },
    next_action: { text: true },
  },
  companies: {
    name_ko: { text: true },
    industry: { text: true },
    representative_name: { text: true },
    location: { text: true },
    next_action: { text: true },
  },
  people: {
    name_ko: { text: true },
    title: { text: true },
    email: { text: true },
    phone: { text: true },
  },
  tasks: {
    title: { text: true },
    status: { options: TASK_STATUS },
    due_date: { date: true },
    assignee_person_id: { ref: true },
    project_id: { ref: true },
  },
};

// people 의 구분/분류는 network_profiles 에 있으므로 별도로 처리한다.
export const PROFILE_EDITABLE: Record<string, FieldSpec> = {
  partner_status: { options: PARTNER_CLASS },
  network_segment: { options: NETWORK_SEGMENT },
  nda_status: { options: ["O", "X", "Unknown"] },
  profile_status: { options: ["O", "X", "Unknown"] },
  appointment_status: { options: ["O", "X", "Unknown"] },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type Validated = { ok: true; value: string | number | null } | { ok: false; reason: string };

export function validateField(spec: FieldSpec | undefined, raw: string | null): Validated {
  if (!spec) return { ok: false, reason: "수정할 수 없는 항목입니다." };

  const value = raw === null ? null : raw.trim();
  if (value === null || value === "") {
    return { ok: true, value: null };
  }

  if (spec.options) {
    if (!spec.options.includes(value)) return { ok: false, reason: `허용되지 않은 값: ${value}` };
    return { ok: true, value };
  }
  if (spec.ref) {
    if (!UUID_RE.test(value)) return { ok: false, reason: "올바른 대상이 아닙니다." };
    return { ok: true, value };
  }
  if (spec.date) {
    if (!DATE_RE.test(value)) return { ok: false, reason: "날짜 형식이 아닙니다 (YYYY-MM-DD)." };
    return { ok: true, value };
  }
  if (spec.number) {
    const num = Number(value.replace(/,/g, ""));
    if (Number.isNaN(num)) return { ok: false, reason: "숫자가 아닙니다." };
    return { ok: true, value: num };
  }
  if (spec.text) {
    if (value.length > 2000) return { ok: false, reason: "너무 깁니다." };
    return { ok: true, value };
  }
  return { ok: false, reason: "수정할 수 없는 항목입니다." };
}

export function isValidEntity(value: string): value is EntityKey {
  return ["projects", "events", "companies", "people", "tasks"].includes(value);
}

export const ENTITY_LABEL: Record<EntityKey, string> = {
  projects: "프로젝트",
  events: "이벤트",
  companies: "고객사",
  people: "파트너",
  tasks: "티켓",
};

export const ENTITY_NAME_FIELD: Record<EntityKey, string> = {
  projects: "name",
  events: "name",
  companies: "name_ko",
  people: "name_ko",
  tasks: "title",
};

export const ENTITY_PATH: Record<EntityKey, string | null> = {
  projects: "/projects",
  events: "/events",
  companies: "/customers",
  people: "/partners",
  tasks: null,
};
