// 엑셀 왕복(export/import) 공통 정의.
// 시트/열 구성을 여기서만 바꾸면 내보내기와 가져오기가 함께 따라간다.

export const SHEETS = {
  customers: "고객사",
  partners: "파트너",
  projects: "프로젝트",
  reference: "참고",
};

export const ID_HEADER = "ID (수정 금지)";
export const DELETE_HEADER = "삭제";

// 드롭다운 목록. 저장값(DB) ↔ 표시값(엑셀) 매핑이 필요한 열은 options에 표시값을 쓰고
// toDb / fromDb 로 변환한다.
// [DB 저장값, 엑셀 표시값, 함께 허용할 표기들]
export const PROJECT_STATUS = [
  ["confirmed", "확정", ["계약 완료", "수주"]],
  ["likely", "가능성 높음", ["유력", "가능성높음"]],
  ["discussing", "논의 중", ["논의중", "협의 중", "협의중", "검토", "검토 중"]],
  ["managed", "진행 중", ["관리 중", "진행중", "관리중", "수행 중", "수행중"]],
  ["on_hold", "보류", ["홀드", "일시중지"]],
  ["done", "완료", ["종료", "완료됨"]],
  ["dropped", "중단", ["드롭", "무산", "취소"]],
];

export const PROJECT_TYPE = [
  ["consulting", "사업컨설팅"],
  ["reengineering", "리엔지니어링"],
  ["investment", "투자/M&A"],
  ["business_building", "비즈니스빌딩"],
  ["go_global", "해외진출"],
  ["event", "이벤트"],
  ["internal_ops", "내부 운영"],
  ["unknown", "미분류"],
];

export const NETWORK_SEGMENT = [
  ["xp_internal", "XP 내부"],
  ["consulting_partner", "컨설팅 파트너"],
  ["investment_finance_partner", "투자/재무 파트너"],
  ["lp_investor", "LP/투자자"],
  ["external_expert", "외부 전문가"],
  ["vendor_advisor", "협력사"],
  ["customer_contact", "고객사 담당자"],
  ["event_invitee", "행사 참석자"],
  ["unknown", "미분류"],
];

// 파트너 구분은 자유 텍스트 컬럼(partner_status)이지만 목록을 고정해 오염을 막는다.
export const PARTNER_CLASS = [
  ["임원", "임원", ["이사", "대표", "전무", "상무", "본부장", "총재"]],
  ["직원", "직원", ["사원", "팀장", "매니저"]],
  ["파트너", "파트너", ["파트너 (비활성화)"]],
  ["파트너 후보", "파트너 후보", ["후보"]],
  ["협력사", "협력사", ["벤더", "협력업체"]],
  ["고객사 담당자", "고객사 담당자", ["고객사"]],
  ["외부 전문가", "외부 전문가", ["전문가", "자문", "고문"]],
  ["기타", "기타", []],
];

export const DOC_STATE = [
  ["O", "완료", ["Y", "O", "o", "유", "있음", "확인", "보유", "체결", "완료됨"]],
  ["X", "미비", ["N", "X", "x", "무", "없음", "미완", "미체결"]],
  ["Unknown", "미확인", ["-", "–", "?", "미정", "확인 필요"]],
];

export const SENSITIVITY = [
  ["internal", "내부"],
  ["confidential", "대외비"],
  ["restricted", "제한"],
];

function looksLikeDate(value) {
  return /^\d{4}[-./]\d{1,2}[-./]\d{1,2}/.test(value) || /^\d{6,8}$/.test(value);
}

export function toDb(pairs, displayValue, options = {}) {
  if (displayValue === null || displayValue === undefined || displayValue === "") return null;
  const trimmed = String(displayValue).trim();

  // 1) 표시값 그대로
  const hit = pairs.find(([, display]) => display === trimmed);
  if (hit) return hit[0];

  // 2) DB 저장값을 직접 적은 경우
  const raw = pairs.find(([value]) => value === trimmed);
  if (raw) return raw[0];

  // 3) 실무에서 흔히 쓰는 다른 표기
  const lowered = trimmed.toLowerCase();
  const alias = pairs.find(([, , aliases]) =>
    (aliases ?? []).some((candidate) => candidate.toLowerCase() === lowered)
  );
  if (alias) return alias[0];

  // 4) 문서 상태 칸에 날짜를 적은 경우 = 그 날짜에 받았다는 뜻
  if (options.dateMeansDone && looksLikeDate(trimmed)) return "O";

  return undefined; // undefined = 해석 불가
}

export function fromDb(pairs, dbValue) {
  if (dbValue === null || dbValue === undefined || dbValue === "") return "";
  const hit = pairs.find(([value]) => value === dbValue);
  return hit ? hit[1] : String(dbValue);
}

export function displayList(pairs) {
  return pairs.map(([, display]) => display);
}

// 각 시트의 열 정의.
//   key      : 코드에서 쓰는 이름
//   header   : 엑셀 헤더 (import는 이 헤더로 열을 찾는다. 헤더를 바꾸면 안 됨)
//   width    : 열 너비
//   options  : 드롭다운 목록(있으면 데이터 유효성 검사 적용)
//   readOnly : 참고용 열. import에서 무시한다.
//   multiline: 줄바꿈 표시
export const COLUMNS = {
  customers: [
    { key: "id", header: ID_HEADER, width: 38, readOnly: true },
    { key: "name_ko", header: "고객사명", width: 22 },
    { key: "industry", header: "산업", width: 16 },
    { key: "representative_name", header: "대표", width: 12 },
    { key: "location", header: "소재지", width: 14 },
    { key: "website_url", header: "웹사이트", width: 26 },
    { key: "core_product", header: "핵심 제품/서비스", width: 26 },
    { key: "business_summary", header: "사업 개요", width: 40, multiline: true },
    { key: "needs", header: "고객 니즈", width: 30, multiline: true },
    { key: "next_action", header: "다음 액션", width: 30 },
    { key: "memo", header: "메모", width: 30, multiline: true },
    { key: "project_count", header: "프로젝트 수", width: 11, readOnly: true },
    { key: "quality", header: "품질 경고", width: 26, readOnly: true },
    { key: "delete", header: DELETE_HEADER, width: 8 },
  ],
  partners: [
    { key: "id", header: ID_HEADER, width: 38, readOnly: true },
    { key: "name_ko", header: "이름", width: 16 },
    { key: "partner_class", header: "구분", width: 15, options: PARTNER_CLASS },
    { key: "company_name", header: "소속 회사", width: 22 },
    { key: "title", header: "직함", width: 16 },
    { key: "email", header: "이메일", width: 28 },
    { key: "phone", header: "연락처", width: 16 },
    { key: "network_segment", header: "네트워크 분류", width: 18, options: NETWORK_SEGMENT },
    { key: "nda_status", header: "NDA", width: 10, options: DOC_STATE },
    { key: "profile_status", header: "프로필", width: 10, options: DOC_STATE },
    { key: "appointment_status", header: "위촉", width: 10, options: DOC_STATE },
    { key: "core_field", header: "핵심 분야", width: 22 },
    { key: "expertise_detail", header: "전문성", width: 32, multiline: true },
    { key: "memo", header: "메모", width: 30, multiline: true },
    { key: "legacy_partner_status", header: "기존 구분값 (참고)", width: 18, readOnly: true },
    { key: "project_count", header: "참여 프로젝트", width: 12, readOnly: true },
    { key: "quality", header: "품질 경고", width: 30, readOnly: true },
    { key: "delete", header: DELETE_HEADER, width: 8 },
  ],
  projects: [
    { key: "id", header: ID_HEADER, width: 38, readOnly: true },
    { key: "company_name", header: "고객사", width: 22 },
    { key: "name", header: "프로젝트명", width: 30 },
    { key: "project_type", header: "유형", width: 16, options: PROJECT_TYPE },
    { key: "status", header: "상태", width: 14, options: PROJECT_STATUS },
    { key: "contract_status", header: "계약 상태", width: 14 },
    { key: "pl_name", header: "PL", width: 14 },
    { key: "pm_name", header: "PM", width: 14 },
    { key: "start_date", header: "시작일", width: 12 },
    { key: "end_date", header: "종료일", width: 12 },
    { key: "expected_revenue", header: "예상 매출", width: 16 },
    { key: "client_need", header: "고객 니즈", width: 30, multiline: true },
    { key: "xp_request", header: "XP 요청사항", width: 30, multiline: true },
    { key: "summary", header: "요약", width: 34, multiline: true },
    { key: "latest_update", header: "최근 업데이트", width: 34, multiline: true },
    { key: "next_action", header: "다음 액션", width: 30 },
    { key: "memo", header: "메모", width: 26, multiline: true },
    { key: "delete", header: DELETE_HEADER, width: 8 },
  ],
};

export const DATE_KEYS = new Set(["start_date", "end_date"]);
export const NUMBER_KEYS = new Set(["expected_revenue"]);
