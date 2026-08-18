// 전자계약 내보내기(고객사용/파트너용) 파싱 + 매칭 공통 로직

export const CONTRACT_SHEET = "계약매칭";

export const LINK_KIND = [
  ["person", "파트너"],
  ["company", "고객사"],
  ["skip", "연결 안 함"],
];

export const DOC_TYPES = [
  "NDA",
  "계약서",
  "파트너계약",
  "위촉계약",
  "근로계약",
  "MOU",
  "업무제휴",
  "투자계약",
  "증명서",
  "계약해지",
];

export const CONTRACT_COLUMNS = [
  { key: "contract_id", header: "계약ID (수정 금지)", width: 34, readOnly: true },
  { key: "source", header: "출처", width: 10, readOnly: true },
  { key: "contract_name", header: "계약이름", width: 52, readOnly: true },
  { key: "doc_type", header: "문서종류", width: 12, options: DOC_TYPES },
  { key: "signed_date", header: "체결일", width: 12, readOnly: true },
  { key: "counterparties", header: "서명 상대방", width: 40, readOnly: true },
  { key: "link_kind", header: "연결 종류", width: 12, options: LINK_KIND.map(([, d]) => d) },
  { key: "link_name", header: "연결 이름", width: 22 },
  { key: "match_note", header: "자동매칭 결과", width: 18, readOnly: true },
];

// ---------------------------------------------------------------- 문서 종류 판정

export function guessDocType(title) {
  const t = title ?? "";
  if (/계약해지|해지\s*합의/.test(t)) return "계약해지";
  if (/경력증명|증명서/.test(t)) return "증명서";
  if (/NDA|비밀유지/i.test(t)) return "NDA";
  if (/위촉계약/.test(t)) return "위촉계약";
  if (/근로계약/.test(t)) return "근로계약";
  if (/파트너\s*계약서|파트너계약/.test(t)) return "파트너계약";
  if (/MOU|양해각서/i.test(t)) return "MOU";
  if (/업무제휴|업무협력|영업계약|영업대행/.test(t)) return "업무제휴";
  if (/투자\s*계약/.test(t)) return "투자계약";
  return "계약서";
}

// ---------------------------------------------------------------- 서명 참여자

const XP_MARKERS = /xyzplus|엑스와이지플러스|xp@/i;

// "XYZPlus(xp@xyzplus.co), 여기훈(frog31017@youandus.co.kr)" 형태를 분해한다.
export function parseParticipants(raw) {
  if (!raw) return [];
  const parts = String(raw).split(/,\s*(?=[^)]*(?:\(|$))/);
  const out = [];
  for (const part of parts) {
    const match = part.match(/^\s*(.*?)\s*\(([^)]*)\)\s*$/);
    const name = (match ? match[1] : part).trim();
    const email = (match ? match[2] : "").trim().toLowerCase();
    if (!name && !email) continue;
    out.push({ name, email });
  }
  return out;
}

export function counterparties(raw) {
  return parseParticipants(raw).filter(
    (p) => !XP_MARKERS.test(p.email) && !XP_MARKERS.test(p.name)
  );
}

// 서명자 표시 이름이 실제 사람 이름인지(자리표시자가 아닌지) 판정
const PLACEHOLDER = /NDA|계약서|파트너|근로|위촉|XP|client|클라이언트/i;

// 사람 이름 자리에 들어오기 쉬운 문서 용어. 이런 단어가 섞이면 인명으로 보지 않는다.
const DOCUMENT_WORDS =
  /계약|협약|각서|증명|합의|자문|서약|용역|위탁|제휴|협력|투자|프로젝트|컨설팅|한글|영문|국문|날인|사본|원본|최종|수정|기업|법인|주식|회사/;

export function plausiblePersonName(value) {
  const name = (value ?? "").trim();
  if (!name || PLACEHOLDER.test(name)) return null;
  if (DOCUMENT_WORDS.test(name)) return null;
  if (/^[가-힣]{2,4}$/.test(name)) return name;
  return null;
}

// ---------------------------------------------------------------- 이름 매칭

// 제목 안에 등록된 이름이 그대로 들어 있는 경우를 찾는다.
// 여러 개가 걸리면 가장 긴 이름을 택한다 (부분 일치로 인한 오탐 감소).
export function longestNameInTitle(title, names) {
  const t = title ?? "";
  let best = null;
  for (const name of names) {
    if (!name || name.length < 2) continue;
    if (!t.includes(name)) continue;
    if (!best || name.length > best.length) best = name;
  }
  return best;
}

const NOISE_TOKENS = new Set([
  "nda", "kr", "파트너용", "partner", "xyzplus", "xyz", "xp", "plus",
  "파트너", "계약서", "위촉계약서", "근로계약서", "표준근로계약서", "인턴근로계약서",
  "비밀유지서약서", "비밀유지협약서", "이사회", "합의서", "계약해지", "날인용",
  "최종", "수정", "신규", "for", "엑스와이지플러스", "주식회사", "법인간",
  "위한", "위하여", "및", "관련", "외", "표준",
]);

function isDateLike(token) {
  return /^\d{4,8}$/.test(token) || /^\d{6}$/.test(token);
}

// 제목을 토큰으로 쪼개 사람 이름 후보를 뽑는다 (등록되지 않은 신규 인물 대비).
export function guessPersonNameFromTitle(title) {
  const cleaned = String(title ?? "").replace(/\[[^\]]*\]/g, " ");
  const tokens = cleaned.split(/[_\s\-.]+/).flatMap((token) => {
    const match = token.match(/^(.*?)\(([^)]*)\)$/);
    return match ? [match[1], match[2]] : [token];
  });

  const candidates = [];
  for (const token of tokens) {
    const value = token.trim();
    if (!value) continue;
    if (NOISE_TOKENS.has(value.toLowerCase())) continue;
    if (isDateLike(value)) continue;
    if (DOCUMENT_WORDS.test(value)) continue;
    if (/^[가-힣]{2,4}$/.test(value)) candidates.push(value);
  }
  // 뒤쪽 토큰일수록 인명일 확률이 높다(파일명 관례)
  return candidates.length > 0 ? candidates[candidates.length - 1] : null;
}

// ---------------------------------------------------------------- 날짜

export function parseYmd(value) {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).trim();
  const match = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const iso = text.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  return null;
}

export function linkKindToDb(display) {
  const hit = LINK_KIND.find(([, d]) => d === String(display ?? "").trim());
  return hit ? hit[0] : undefined;
}

export function linkKindToDisplay(value) {
  const hit = LINK_KIND.find(([v]) => v === value);
  return hit ? hit[1] : "연결 안 함";
}
