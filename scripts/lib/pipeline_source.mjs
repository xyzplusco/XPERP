// 통합 파이프라인 엑셀(Pipeline 시트)을 읽어 정규화한다.
// 이 파일이 '엑셀 → DB' 해석의 단일 지점이다. 규칙을 고치려면 여기만 고친다.

import ExcelJS from "exceljs";

export const SECTOR_MAP = new Map(Object.entries({
  "BPR": "Re-Engineering",
  "리엔지니어링": "Re-Engineering",
  "BB": "Business Building",
  "비즈니스빌딩": "Business Building",
  "사업컨설팅": "Business Building",
  "투자/매각": "투자·매각",
  "투자": "투자·매각",
  "투자매각": "투자·매각",
  "투자유치": "투자·매각",
  "투자/전략": "투자·매각",
  "매각": "투자·매각",
  "IR": "투자·매각",
  "F.I.M": "투자·매각",
  "fim": "투자·매각",
  "영업": "영업",
  "영업컨설팅": "영업",
  "GX": "Go Global",
  "해외": "Go Global",
  "해외 유통": "Go Global",
  "AX": "AX",
}));

export const STAGES = new Set(["고객", "협상", "관리기업", "파트너협업건", "미정리후보"]);
export const STATUSES = new Set(["계약", "계약임박", "제안", "가망", "관리", "보류", "미분류"]);

// 회사가 아닌 행. 엑셀에 남아 있는 이벤트 준비 항목·사람 이름·메모 조각들.
// 프로젝트로 만들지 않고 따로 분류한다.
const NOT_A_COMPANY = new Map(Object.entries({
  "미아": "contact",
  "김수민": "junk",
  "이도경": "person",
  "백찬": "person",
  "마인드로 대표": "person",
  "현재 회신": "junk",
  "장소": "event_item",
  "음식": "event_item",
  "의전": "event_item",
  "하이더": "person",
  "안톤슐츠": "person",
}));

const XP_PEOPLE = new Set([
  "김수민", "이봉진", "윤권상", "정홍재", "한재연", "박지희", "유영아",
  "정원재", "박재범", "강진규", "홍기훈", "목민경", "김태정", "황룡",
]);

// ExcelJS 는 서식이 있는 셀을 객체로 돌려준다. 리치텍스트·수식·하이퍼링크를 전부 문자열로 편다.
function clean(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (Array.isArray(v)) return v.map(clean).join("").trim();
  if (typeof v === "object") {
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text ?? "").join("").trim();
    if ("text" in v) return clean(v.text);
    if ("result" in v) return clean(v.result);
    if ("hyperlink" in v) return clean(v.text ?? v.hyperlink);
    if ("error" in v) return "";
  }
  return String(v).trim();
}

// PL 칸에 '(김수민)' 처럼 괄호가 붙은 경우가 있다.
function cleanPerson(value) {
  const v = clean(value).replace(/^\(|\)$/g, "").trim();
  if (!v) return null;
  return v;
}

export function normalizeSector(raw) {
  const v = clean(raw);
  if (!v) return "기타·미정";
  return SECTOR_MAP.get(v) ?? "기타·미정";
}

export function normalizeStatus(raw, stage) {
  const v = clean(raw);
  if (STATUSES.has(v)) return v;
  // 상태가 비어 있으면 구간에서 합리적으로 유추한다.
  if (stage === "관리기업") return "관리";
  if (stage === "고객") return "계약";
  return "미분류";
}

export function normalizeStage(raw) {
  const v = clean(raw);
  return STAGES.has(v) ? v : "미정리후보";
}

export async function readPipeline(filePath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.getWorksheet("Pipeline");
  if (!ws) throw new Error("Pipeline 시트를 찾을 수 없습니다.");

  const header = [];
  ws.getRow(2).eachCell({ includeEmpty: true }, (cell, col) => {
    header[col] = clean(cell.value);
  });

  // 주차 컬럼 (1월1차 … 12월4차). 같은 이름이 두 번 나오는 경우가 있어 마지막 것을 쓴다.
  const weekCols = [];
  header.forEach((name, col) => {
    if (/^\d{1,2}월[1-4]차$/.test(name || "")) weekCols.push({ col, label: name });
  });

  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber < 3) return;
    const get = (name) => {
      const col = header.lastIndexOf(name);
      return col > 0 ? clean(row.getCell(col).value) : "";
    };
    const company = get("회사명");
    if (!company) return;

    const stage = normalizeStage(get("구간"));
    const kind = NOT_A_COMPANY.get(company);

    const weeks = [];
    for (const { col, label } of weekCols) {
      const body = clean(row.getCell(col).value);
      if (body) weeks.push({ label, body });
    }

    rows.push({
      excelRow: rowNumber,
      kind: kind ?? "project",
      company,
      representative: get("대표자"),
      introducer: get("소개"),
      pipeline_stage: stage,
      deal_status: normalizeStatus(get("상태"), stage),
      service_sector: normalizeSector(get("서비스섹터")),
      industry: get("사업"),
      pl: cleanPerson(get("PL")),
      pm1: cleanPerson(get("PM1")),
      pm2: cleanPerson(get("PM2")),
      client_need: get("대표니즈"),
      xp_request: get("XP요청"),
      weeks,
      unknownPeople: [cleanPerson(get("PL")), cleanPerson(get("PM1")), cleanPerson(get("PM2"))]
        .filter((v) => v && !XP_PEOPLE.has(v)),
    });
  });

  return rows;
}

export async function readRevenue(filePath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.getWorksheet("매출현황");
  if (!ws) return [];
  const out = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n < 3) return;
    const company = clean(row.getCell(1).value);
    if (!company) return;
    const total = Number(clean(row.getCell(14).value).replace(/,/g, ""));
    if (!Number.isFinite(total) || total <= 0) return;
    out.push({ company, pl: clean(row.getCell(2).value), total });
  });
  return out;
}
