const LABELS: Record<string, string> = {
  // network segments
  xp_internal: "XP 내부",
  consulting_partner: "컨설팅 파트너",
  investment_finance_partner: "투자/재무 파트너",
  lp_investor: "LP/투자자",
  external_expert: "외부 전문가",
  vendor_advisor: "협력사",
  customer_contact: "고객사 담당자",
  event_invitee: "행사 참석자",
  unknown: "미분류",
  Unknown: "미분류",
  Unclassified: "미분류",

  // project types
  consulting: "사업컨설팅",
  reengineering: "리엔지니어링",
  investment: "투자/M&A",
  business_building: "비즈니스빌딩",
  go_global: "해외진출",
  event: "이벤트",
  internal_ops: "내부 운영",

  // project status
  confirmed: "확정",
  likely: "가능성 높음",
  discussing: "논의 중",
  managed: "진행 중",
  on_hold: "보류",
  done: "완료",
  dropped: "중단",

  // event status
  planning: "준비",
  inviting: "초대 중",
  completed: "완료",
  cancelled: "취소",

  // document requirement status
  not_required: "불필요",
  needed: "필요",
  requested: "요청됨",
  received: "수령",
  signed: "서명 완료",
  expired: "만료",
  waived: "면제",

  // task status
  backlog: "대기",
  in_progress: "진행 중",
  waiting: "회신 대기",
  blocked: "보류",

  // contract status (source values)
  Review: "검토",

  // roles
  admin: "관리자",
  partner: "파트너",
  member: "구성원",
  external_contributor: "외부 협력",
  pl: "PL",
  pm: "PM",
  owner: "총괄",
  coordinator: "코디네이터",
  viewer: "열람",
};

export function label(value: string | null | undefined): string {
  if (!value) return "";
  return LABELS[value] ?? value;
}

export const PROJECT_STATUS_OPTIONS = [
  "confirmed",
  "likely",
  "discussing",
  "managed",
  "on_hold",
  "done",
  "dropped",
] as const;

export const PROJECT_TYPE_OPTIONS = [
  "consulting",
  "reengineering",
  "investment",
  "business_building",
  "go_global",
  "event",
  "internal_ops",
  "unknown",
] as const;

export const EVENT_STATUS_OPTIONS = ["planning", "inviting", "confirmed", "completed", "cancelled"] as const;

export const DOC_REQUIREMENT_STATUS_OPTIONS = [
  "needed",
  "requested",
  "received",
  "signed",
  "expired",
  "waived",
  "not_required",
] as const;

export const TASK_STATUS_OPTIONS = ["backlog", "in_progress", "waiting", "blocked", "done", "dropped"] as const;

// 파트너 구분 (partner_status에 저장)
export const PARTNER_CLASS_OPTIONS = ["임원", "직원", "파트너", "파트너 후보", "협력사", "고객사 담당자", "외부 전문가", "기타"] as const;

const KNOWN_PARTNER_CLASSES = new Set<string>([...PARTNER_CLASS_OPTIONS, "후보", "파트너 (비활성화)"]);

export function partnerClass(
  partnerStatus: string | null | undefined,
  segment: string | null | undefined
): string {
  if (partnerStatus && KNOWN_PARTNER_CLASSES.has(partnerStatus)) {
    if (partnerStatus === "후보") return "파트너 후보";
    return partnerStatus;
  }
  if (segment && segment !== "unknown") return label(segment);
  return "미분류";
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "–";
  return value.slice(0, 10);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "–";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function formatAmount(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "–";
  const num = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(num)) return String(value);
  return num.toLocaleString("ko-KR");
}

export function truncate(value: string | null | undefined, max = 60): string {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max)}…` : value;
}
