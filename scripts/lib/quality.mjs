// 임포트 과정에서 생긴 오염 행을 찾아내 엑셀에 경고로 표시한다.
// 가장 흔한 형태: 원본 시트에서 열이 한 칸씩 밀려
// 이름 칸에 직함이, 소속 칸에 이메일이 들어간 행.

const JOB_TITLES = new Set([
  "CEO", "CFO", "COO", "CTO", "CMO", "CSO", "CIO", "CBO", "CPO", "CDO", "GM",
  "대표", "대표이사", "이사", "사장", "부사장", "회장", "부회장", "전무", "상무",
  "본부장", "실장", "부장", "차장", "과장", "팀장", "매니저", "사원", "주임", "선임",
  "파트너", "고문", "자문", "위원", "위원장", "센터장", "지점장", "소장", "원장",
  "General Manager", "Manager", "Director", "Partner", "Founder", "Co-Founder",
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[\d\-+() .]{9,}$/;

export function looksLikeJobTitle(value) {
  const text = (value ?? "").trim();
  if (!text) return false;
  return JOB_TITLES.has(text) || JOB_TITLES.has(text.toUpperCase());
}

export function looksLikeEmail(value) {
  return EMAIL_RE.test((value ?? "").trim());
}

export function looksLikePhone(value) {
  const text = (value ?? "").trim();
  return PHONE_RE.test(text) && /\d{3}/.test(text);
}

// 파트너 행 경고
export function partnerWarnings(row, counts) {
  const warnings = [];
  const name = (row.name_ko ?? "").trim();

  if (looksLikeJobTitle(name)) warnings.push("이름 칸이 직함");
  if (looksLikeEmail(name)) warnings.push("이름 칸이 이메일");
  if (looksLikePhone(name)) warnings.push("이름 칸이 전화번호");
  if (looksLikeEmail(row.company_name)) warnings.push("소속 칸이 이메일");
  if (looksLikePhone(row.company_name)) warnings.push("소속 칸이 전화번호");
  if (looksLikeEmail(row.title)) warnings.push("직함 칸이 이메일");
  if (looksLikePhone(row.title)) warnings.push("직함 칸이 전화번호");

  if (name && (counts.nameCount.get(name) ?? 0) > 1) warnings.push("이름 중복");
  const email = (row.email ?? "").trim().toLowerCase();
  if (email && (counts.emailCount.get(email) ?? 0) > 1) warnings.push("이메일 중복");

  const empty = !row.email && !row.phone && !row.company_name && !row.title;
  if (empty && Number(row.project_count ?? 0) === 0) warnings.push("정보 없음");

  return warnings.join(" · ");
}

// 고객사 행 경고
export function customerWarnings(row, counts) {
  const warnings = [];
  const name = (row.name_ko ?? "").trim();

  if (name === "회사명") warnings.push("헤더 행");
  if (looksLikeEmail(name)) warnings.push("이름 칸이 이메일");
  if (looksLikePhone(name)) warnings.push("이름 칸이 전화번호");
  if (looksLikeJobTitle(name)) warnings.push("이름 칸이 직함");
  if (/^[A-Z]사$/.test(name)) warnings.push("익명 딜 (코드네임 필요)");
  if (counts.personNames.has(name)) warnings.push("사람 이름과 동일");
  if (name && (counts.nameCount.get(name) ?? 0) > 1) warnings.push("회사명 중복");
  if (Number(row.project_count ?? 0) === 0) warnings.push("연결 프로젝트 없음");

  return warnings.join(" · ");
}
