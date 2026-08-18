// 편집용 엑셀 → DB 반영
//
//   npm run db:import -- --file XP_ERP_편집용_20260817.xlsx           (미리보기, DB 변경 없음)
//   npm run db:import -- --file XP_ERP_편집용_20260817.xlsx --apply   (실제 반영)
//
// 규칙
//   - ID 열이 채워진 행  : 기존 행 수정 (바뀐 열만)
//   - ID 열이 빈 행      : 신규 등록
//   - '삭제' 열 = Y      : 삭제 (참조가 남아 있으면 오류로 보고하고 건너뜀)
//   - 드롭다운 밖의 값   : 오류로 보고하고 해당 행 건너뜀
//   - 변경 전 값은 activity_logs 에 기록된다.

import path from "node:path";
import ExcelJS from "exceljs";
import { loadLocalEnv } from "./load_env.mjs";
import { connect, requireDatabaseUrl } from "./lib/db.mjs";
import {
  COLUMNS,
  DATE_KEYS,
  DOC_STATE,
  NETWORK_SEGMENT,
  NUMBER_KEYS,
  PARTNER_CLASS,
  PROJECT_STATUS,
  PROJECT_TYPE,
  SHEETS,
  toDb,
} from "./lib/workbook_schema.mjs";

loadLocalEnv();

const args = process.argv.slice(2);
function arg(name) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}
const APPLY = args.includes("--apply");
const filePath = arg("file");

if (!filePath) {
  console.error("사용법: npm run db:import -- --file <엑셀파일> [--apply]");
  process.exit(1);
}

const databaseUrl = requireDatabaseUrl();
const sql = connect(databaseUrl);

// ---------------------------------------------------------------- 셀 값 읽기

function cellValue(cell) {
  const value = cell?.value;
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("text" in value) return value.text;
    if ("result" in value) return value.result;
    if ("hyperlink" in value) return value.hyperlink;
    return null;
  }
  return value;
}

function asText(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value).trim();
  return text === "" ? null : text;
}

function asDate(value) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value).trim();
  if (text === "") return null;
  const match = text.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (match) {
    return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return undefined; // undefined = 형식 오류
  return parsed.toISOString().slice(0, 10);
}

function asNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return value;
  const cleaned = String(value).replace(/[,\s₩원]/g, "");
  if (cleaned === "") return null;
  const num = Number(cleaned);
  return Number.isNaN(num) ? undefined : num; // undefined = 형식 오류
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------- 시트 읽기

function readSheet(workbook, sheetName, columns) {
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) return { rows: [], missing: true };

  const headerRow = sheet.getRow(1);
  const headerToIndex = new Map();
  headerRow.eachCell((cell, colNumber) => {
    const header = asText(cellValue(cell));
    if (header) headerToIndex.set(header, colNumber);
  });

  // 참고용(readOnly) 열은 가져오기에서 쓰지 않으므로 없어도 된다.
  // 이전 버전으로 내보낸 파일도 그대로 가져올 수 있게 하기 위함.
  const missingHeaders = columns
    .filter((column) => !column.readOnly && !headerToIndex.has(column.header))
    .map((column) => column.header);

  const rows = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const excelRow = sheet.getRow(rowNumber);
    const record = { __row: rowNumber };
    let hasAnyValue = false;

    for (const column of columns) {
      const colNumber = headerToIndex.get(column.header);
      if (!colNumber) continue;
      const raw = cellValue(excelRow.getCell(colNumber));
      record[column.key] = raw;
      if (!column.readOnly && asText(raw) !== null) hasAnyValue = true;
    }

    if (!hasAnyValue && asText(record.id) === null) continue; // 완전 빈 행
    rows.push(record);
  }

  return { rows, missingHeaders };
}

// ---------------------------------------------------------------- 변경 계획

const plan = {
  customers: { update: [], insert: [], delete: [] },
  partners: { update: [], insert: [], delete: [] },
  projects: { update: [], insert: [], delete: [] },
};
const errors = [];

function error(sheet, row, message) {
  errors.push({ sheet, row, message });
}

function normalizeForCompare(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

function changedFields(before, after) {
  const diff = {};
  for (const [key, value] of Object.entries(after)) {
    if (key.startsWith("__")) continue;
    const prev = normalizeForCompare(before[key]);
    const next = normalizeForCompare(value);
    if (prev === next) continue;

    // numeric(18,2) 은 "300000000.00" 처럼 돌아오므로 숫자로 비교한다.
    if (NUMBER_KEYS.has(key)) {
      const prevNum = prev === "" ? null : Number(prev);
      const nextNum = next === "" ? null : Number(next);
      if (prevNum === nextNum) continue;
      if (prevNum !== null && nextNum !== null && !Number.isNaN(prevNum) && !Number.isNaN(nextNum) && prevNum === nextNum) {
        continue;
      }
    }

    diff[key] = value ?? null;
  }
  return diff;
}

// 드롭다운 값 변환. 실패하면 오류를 남기고 sentinel 반환.
const INVALID = Symbol("invalid");
function pick(pairs, value, sheet, row, columnLabel, options) {
  const text = asText(value);
  if (text === null) return null;
  const converted = toDb(pairs, text, options);
  if (converted === undefined) {
    error(sheet, row, `'${columnLabel}' 열의 값 "${text}" 은(는) 허용 목록에 없습니다.`);
    return INVALID;
  }
  return converted;
}

// ---------------------------------------------------------------- 실행

try {
  const absolute = path.resolve(filePath);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(absolute);

  const customerSheet = readSheet(workbook, SHEETS.customers, COLUMNS.customers);
  const partnerSheet = readSheet(workbook, SHEETS.partners, COLUMNS.partners);
  const projectSheet = readSheet(workbook, SHEETS.projects, COLUMNS.projects);

  for (const [name, result] of [
    [SHEETS.customers, customerSheet],
    [SHEETS.partners, partnerSheet],
    [SHEETS.projects, projectSheet],
  ]) {
    if (result.missing) {
      console.error(`시트 '${name}' 를 찾을 수 없습니다. 내보내기 파일을 그대로 사용하세요.`);
      process.exit(1);
    }
    if (result.missingHeaders?.length) {
      console.error(`시트 '${name}' 에 다음 열 머리글이 없습니다: ${result.missingHeaders.join(", ")}`);
      console.error("머리글은 수정하지 마세요.");
      process.exit(1);
    }
  }

  // 현재 DB 상태
  const dbCompanies = await sql`
    select id::text, name_ko, industry, representative_name, location, website_url,
           core_product, business_summary, needs, next_action, memo
    from companies`;
  const dbPeople = await sql`
    select p.id::text, p.name_ko, p.title, p.email, p.phone, p.memo,
           p.primary_company_id::text as primary_company_id,
           np.partner_status, np.network_segment, np.nda_status, np.profile_status,
           np.appointment_status, np.core_field, np.expertise_detail
    from people p left join network_profiles np on np.person_id = p.id`;
  const dbProjects = await sql`
    select id::text, name, project_type, status, contract_status, company_id::text as company_id,
           primary_pl_person_id::text as primary_pl_person_id,
           candidate_pm_person_id::text as candidate_pm_person_id,
           start_date, end_date, expected_revenue, client_need, xp_request,
           summary, latest_update, next_action, memo
    from projects`;

  const companyById = new Map(dbCompanies.map((row) => [row.id, row]));
  const personById = new Map(dbPeople.map((row) => [row.id, row]));
  const projectById = new Map(dbProjects.map((row) => [row.id, row]));

  // 이름 → id 조회 (동명이인은 ambiguous 로 표시)
  function buildNameIndex(rows) {
    const index = new Map();
    for (const row of rows) {
      const key = (row.name_ko ?? "").trim();
      if (!key) continue;
      if (index.has(key)) index.set(key, "AMBIGUOUS");
      else index.set(key, row.id);
    }
    return index;
  }
  const companyByName = buildNameIndex(dbCompanies);
  const personByName = buildNameIndex(dbPeople);

  // 같은 파일 안에서 새로 만들어질 이름도 조회 대상에 넣는다 (미리보기에서 헛오류 방지)
  const pendingCompanyNames = new Set();
  const pendingPersonNames = new Set();

  const deletedCompanyIds = new Set();
  const deletedPersonIds = new Set();

  // 같은 파일에서 함께 삭제되는 프로젝트는 참조 검사에서 제외한다.
  // (쓰레기 회사 + 그에 딸린 쓰레기 프로젝트를 한 번에 지울 수 있도록)
  const projectIdsMarkedForDeletion = new Set();
  for (const row of projectSheet.rows) {
    const id = asText(row.id);
    if (id && UUID_RE.test(id) && (asText(row.delete) ?? "").toUpperCase() === "Y") {
      projectIdsMarkedForDeletion.add(id);
    }
  }
  const survivingProjects = dbProjects.filter((p) => !projectIdsMarkedForDeletion.has(p.id));

  function resolveName(index, pending, name, sheet, row, columnLabel, { required }) {
    const text = asText(name);
    if (text === null) {
      if (required) error(sheet, row, `'${columnLabel}' 은(는) 비울 수 없습니다.`);
      return required ? INVALID : null;
    }
    const hit = index.get(text);
    if (hit === "AMBIGUOUS") {
      error(sheet, row, `'${columnLabel}' 의 "${text}" 은(는) 동명이인/동일명이 있어 자동 연결할 수 없습니다.`);
      return INVALID;
    }
    if (!hit) {
      if (pending.has(text)) return "PENDING";
      error(sheet, row, `'${columnLabel}' 의 "${text}" 을(를) 찾을 수 없습니다. 해당 시트에 먼저 추가하세요.`);
      return INVALID;
    }
    return hit;
  }

  // ---------------- 고객사 ----------------
  const S1 = SHEETS.customers;
  for (const row of customerSheet.rows) {
    const id = asText(row.id);
    const isDelete = (asText(row.delete) ?? "").toUpperCase() === "Y";

    if (id && !UUID_RE.test(id)) {
      error(S1, row.__row, `ID 형식이 올바르지 않습니다: "${id}". ID 열은 수정하지 마세요.`);
      continue;
    }

    if (isDelete) {
      if (!id) {
        error(S1, row.__row, "ID 없는 행은 삭제할 수 없습니다.");
        continue;
      }
      const existing = companyById.get(id);
      if (!existing) {
        error(S1, row.__row, `삭제 대상 ID를 DB에서 찾을 수 없습니다: ${id}`);
        continue;
      }
      const linked = survivingProjects.filter((p) => p.company_id === id).length;
      if (linked > 0) {
        error(
          S1,
          row.__row,
          `'${existing.name_ko}' 에 연결된 프로젝트 ${linked}건이 남아 있어 삭제할 수 없습니다. 프로젝트 시트에서 해당 행도 함께 '삭제'=Y 로 표시하거나 다른 고객사로 옮기세요.`
        );
        continue;
      }
      deletedCompanyIds.add(id);
      plan.customers.delete.push({ id, name: existing.name_ko, before: existing });
      continue;
    }

    const payload = {
      name_ko: asText(row.name_ko),
      industry: asText(row.industry),
      representative_name: asText(row.representative_name),
      location: asText(row.location),
      website_url: asText(row.website_url),
      core_product: asText(row.core_product),
      business_summary: asText(row.business_summary),
      needs: asText(row.needs),
      next_action: asText(row.next_action),
      memo: asText(row.memo),
    };

    if (!payload.name_ko) {
      error(S1, row.__row, "'고객사명' 은(는) 비울 수 없습니다.");
      continue;
    }

    if (id) {
      const existing = companyById.get(id);
      if (!existing) {
        error(S1, row.__row, `ID를 DB에서 찾을 수 없습니다: ${id}`);
        continue;
      }
      const diff = changedFields(existing, payload);
      if (Object.keys(diff).length > 0) {
        plan.customers.update.push({ id, name: payload.name_ko, diff, before: existing });
      }
    } else {
      if (companyByName.has(payload.name_ko)) {
        error(S1, row.__row, `'${payload.name_ko}' 은(는) 이미 등록된 고객사입니다. 신규 등록 대신 해당 행을 수정하세요.`);
        continue;
      }
      pendingCompanyNames.add(payload.name_ko);
      plan.customers.insert.push({ name: payload.name_ko, payload, __row: row.__row });
    }
  }

  // ---------------- 파트너 ----------------
  const S2 = SHEETS.partners;
  for (const row of partnerSheet.rows) {
    const id = asText(row.id);
    const isDelete = (asText(row.delete) ?? "").toUpperCase() === "Y";

    if (id && !UUID_RE.test(id)) {
      error(S2, row.__row, `ID 형식이 올바르지 않습니다: "${id}". ID 열은 수정하지 마세요.`);
      continue;
    }

    if (isDelete) {
      if (!id) {
        error(S2, row.__row, "ID 없는 행은 삭제할 수 없습니다.");
        continue;
      }
      const existing = personById.get(id);
      if (!existing) {
        error(S2, row.__row, `삭제 대상 ID를 DB에서 찾을 수 없습니다: ${id}`);
        continue;
      }
      const linked = survivingProjects.filter(
        (p) => p.primary_pl_person_id === id || p.candidate_pm_person_id === id
      ).length;
      if (linked > 0) {
        error(
          S2,
          row.__row,
          `'${existing.name_ko}' 이(가) PL/PM으로 지정된 프로젝트 ${linked}건이 남아 있어 삭제할 수 없습니다. 프로젝트 시트에서 PL/PM을 먼저 비우세요.`
        );
        continue;
      }
      deletedPersonIds.add(id);
      plan.partners.delete.push({ id, name: existing.name_ko, before: existing });
      continue;
    }

    const partnerClass = pick(PARTNER_CLASS, row.partner_class, S2, row.__row, "구분");
    const segment = pick(NETWORK_SEGMENT, row.network_segment, S2, row.__row, "네트워크 분류");
    const nda = pick(DOC_STATE, row.nda_status, S2, row.__row, "NDA", { dateMeansDone: true });
    const profileState = pick(DOC_STATE, row.profile_status, S2, row.__row, "프로필", { dateMeansDone: true });
    const appointment = pick(DOC_STATE, row.appointment_status, S2, row.__row, "위촉", { dateMeansDone: true });
    if ([partnerClass, segment, nda, profileState, appointment].includes(INVALID)) continue;

    const companyName = asText(row.company_name);
    let companyId = null;
    if (companyName) {
      const resolved = resolveName(companyByName, pendingCompanyNames, companyName, S2, row.__row, "소속 회사", { required: false });
      if (resolved === INVALID) continue;
      companyId = resolved; // "PENDING" 가능
    }

    const personPayload = {
      name_ko: asText(row.name_ko),
      title: asText(row.title),
      email: asText(row.email),
      phone: asText(row.phone),
      memo: asText(row.memo),
      primary_company_id: companyId,
    };
    const profilePayload = {
      partner_status: partnerClass,
      network_segment: segment ?? "unknown",
      nda_status: nda,
      profile_status: profileState,
      appointment_status: appointment,
      core_field: asText(row.core_field),
      expertise_detail: asText(row.expertise_detail),
    };

    if (!personPayload.name_ko) {
      error(S2, row.__row, "'이름' 은(는) 비울 수 없습니다.");
      continue;
    }

    if (id) {
      const existing = personById.get(id);
      if (!existing) {
        error(S2, row.__row, `ID를 DB에서 찾을 수 없습니다: ${id}`);
        continue;
      }
      const comparablePerson = { ...personPayload };
      if (comparablePerson.primary_company_id === "PENDING") {
        comparablePerson.primary_company_id = "(신규 고객사)";
      }
      // PENDING 해소용 회사명을 함께 보관
      personPayload.__companyName = companyName;
      const personDiff = changedFields(existing, comparablePerson);
      const profileDiff = changedFields(existing, profilePayload);
      if (Object.keys(personDiff).length > 0 || Object.keys(profileDiff).length > 0) {
        plan.partners.update.push({
          id,
          name: personPayload.name_ko,
          diff: { ...personDiff, ...profileDiff },
          personPayload,
          profilePayload,
          before: existing,
        });
      }
    } else {
      if (personByName.has(personPayload.name_ko)) {
        error(S2, row.__row, `'${personPayload.name_ko}' 은(는) 이미 등록된 이름입니다. 동명이인이면 구분되는 이름으로 입력하세요.`);
        continue;
      }
      pendingPersonNames.add(personPayload.name_ko);
      plan.partners.insert.push({
        name: personPayload.name_ko,
        personPayload,
        profilePayload,
        companyName,
        __row: row.__row,
      });
    }
  }

  // ---------------- 프로젝트 ----------------
  const S3 = SHEETS.projects;
  for (const row of projectSheet.rows) {
    const id = asText(row.id);
    const isDelete = (asText(row.delete) ?? "").toUpperCase() === "Y";

    if (id && !UUID_RE.test(id)) {
      error(S3, row.__row, `ID 형식이 올바르지 않습니다: "${id}". ID 열은 수정하지 마세요.`);
      continue;
    }

    if (isDelete) {
      if (!id) {
        error(S3, row.__row, "ID 없는 행은 삭제할 수 없습니다.");
        continue;
      }
      const existing = projectById.get(id);
      if (!existing) {
        error(S3, row.__row, `삭제 대상 ID를 DB에서 찾을 수 없습니다: ${id}`);
        continue;
      }
      plan.projects.delete.push({ id, name: existing.name, before: existing });
      continue;
    }

    const type = pick(PROJECT_TYPE, row.project_type, S3, row.__row, "유형");
    const status = pick(PROJECT_STATUS, row.status, S3, row.__row, "상태");
    if ([type, status].includes(INVALID)) continue;

    const startDate = asDate(row.start_date);
    const endDate = asDate(row.end_date);
    const revenue = asNumber(row.expected_revenue);
    if (startDate === undefined) {
      error(S3, row.__row, `'시작일' 을(를) 날짜로 읽을 수 없습니다: "${asText(row.start_date)}"`);
      continue;
    }
    if (endDate === undefined) {
      error(S3, row.__row, `'종료일' 을(를) 날짜로 읽을 수 없습니다: "${asText(row.end_date)}"`);
      continue;
    }
    if (revenue === undefined) {
      error(S3, row.__row, `'예상 매출' 을(를) 숫자로 읽을 수 없습니다: "${asText(row.expected_revenue)}"`);
      continue;
    }

    const companyResolved = resolveName(companyByName, pendingCompanyNames, row.company_name, S3, row.__row, "고객사", { required: true });
    if (companyResolved === INVALID) continue;

    let plId = null;
    if (asText(row.pl_name)) {
      const resolved = resolveName(personByName, pendingPersonNames, row.pl_name, S3, row.__row, "PL", { required: false });
      if (resolved === INVALID) continue;
      plId = resolved;
    }
    let pmId = null;
    if (asText(row.pm_name)) {
      const resolved = resolveName(personByName, pendingPersonNames, row.pm_name, S3, row.__row, "PM", { required: false });
      if (resolved === INVALID) continue;
      pmId = resolved;
    }

    const payload = {
      name: asText(row.name),
      project_type: type ?? "unknown",
      status: status ?? "discussing",
      contract_status: asText(row.contract_status),
      company_id: companyResolved,
      primary_pl_person_id: plId,
      candidate_pm_person_id: pmId,
      start_date: startDate,
      end_date: endDate,
      expected_revenue: revenue,
      client_need: asText(row.client_need),
      xp_request: asText(row.xp_request),
      summary: asText(row.summary),
      latest_update: asText(row.latest_update),
      next_action: asText(row.next_action),
      memo: asText(row.memo),
    };

    if (!payload.name) {
      error(S3, row.__row, "'프로젝트명' 은(는) 비울 수 없습니다.");
      continue;
    }

    const refNames = {
      companyName: asText(row.company_name),
      plName: asText(row.pl_name),
      pmName: asText(row.pm_name),
    };

    if (id) {
      const existing = projectById.get(id);
      if (!existing) {
        error(S3, row.__row, `ID를 DB에서 찾을 수 없습니다: ${id}`);
        continue;
      }
      const comparable = { ...payload };
      for (const key of ["company_id", "primary_pl_person_id", "candidate_pm_person_id"]) {
        if (comparable[key] === "PENDING") comparable[key] = "(신규)";
      }
      const diff = changedFields(existing, comparable);
      if (Object.keys(diff).length > 0) {
        plan.projects.update.push({ id, name: payload.name, diff, payload, refNames, before: existing });
      }
    } else {
      plan.projects.insert.push({ name: payload.name, payload, refNames, __row: row.__row });
    }
  }

  // 삭제 예정 대상을 다른 행이 참조하는지 확인
  for (const item of plan.projects.update) {
    if (deletedCompanyIds.has(item.payload?.company_id)) {
      error(SHEETS.projects, "-", `'${item.name}' 이(가) 삭제 예정 고객사를 참조합니다.`);
    }
  }

  // ---------------- 결과 출력 ----------------
  const summarize = (key, labelText) => {
    const p = plan[key];
    return `  ${labelText.padEnd(6)}  수정 ${String(p.update.length).padStart(4)}  신규 ${String(p.insert.length).padStart(4)}  삭제 ${String(p.delete.length).padStart(4)}`;
  };

  console.log("");
  console.log(`파일: ${absolute}`);
  console.log(APPLY ? "모드: 실제 반영 (--apply)" : "모드: 미리보기 (DB 변경 없음)");
  console.log("");
  console.log(summarize("customers", "고객사"));
  console.log(summarize("partners", "파트너"));
  console.log(summarize("projects", "프로젝트"));
  console.log("");

  const showDetail = (key, labelText) => {
    const p = plan[key];
    const lines = [];
    for (const item of p.update.slice(0, 20)) {
      const fields = Object.keys(item.diff).join(", ");
      lines.push(`    [수정] ${item.name} — ${fields}`);
    }
    if (p.update.length > 20) lines.push(`    … 외 ${p.update.length - 20}건 수정`);
    for (const item of p.insert.slice(0, 20)) lines.push(`    [신규] ${item.name}`);
    if (p.insert.length > 20) lines.push(`    … 외 ${p.insert.length - 20}건 신규`);
    for (const item of p.delete) lines.push(`    [삭제] ${item.name}`);
    if (lines.length > 0) {
      console.log(`  ${labelText}`);
      lines.forEach((line) => console.log(line));
      console.log("");
    }
  };
  showDetail("customers", "고객사");
  showDetail("partners", "파트너");
  showDetail("projects", "프로젝트");

  if (errors.length > 0) {
    console.log("!".repeat(60));
    console.log(`오류 ${errors.length}건 — 아래 행은 반영되지 않습니다:`);
    console.log("!".repeat(60));
    for (const item of errors.slice(0, 60)) {
      console.log(`    ${item.sheet} ${item.row}행: ${item.message}`);
    }
    if (errors.length > 60) console.log(`    … 외 ${errors.length - 60}건`);
    console.log("");

    // 없는 회사/사람 때문에 막힌 건 한 번에 모아서 보여준다.
    const missingNames = new Map();
    for (const item of errors) {
      const match = item.message.match(/의 "(.+?)" 을\(를\) 찾을 수 없습니다/);
      if (match) missingNames.set(match[1], (missingNames.get(match[1]) ?? 0) + 1);
    }
    if (missingNames.size > 0) {
      console.log("먼저 등록해야 할 이름 (해당 시트에 행을 추가하고 ID는 비워 두세요):");
      for (const [name, count] of Array.from(missingNames).sort((a, b) => b[1] - a[1])) {
        console.log(`    ${name}  (${count}개 행에서 참조)`);
      }
      console.log("");
    }
  }

  const totalChanges =
    plan.customers.update.length + plan.customers.insert.length + plan.customers.delete.length +
    plan.partners.update.length + plan.partners.insert.length + plan.partners.delete.length +
    plan.projects.update.length + plan.projects.insert.length + plan.projects.delete.length;

  if (totalChanges === 0) {
    console.log("반영할 변경이 없습니다.");
    process.exit(0);
  }

  if (!APPLY) {
    console.log("실제 반영하려면 같은 명령에 --apply 를 붙여 다시 실행하세요.");
    process.exit(0);
  }

  // ---------------- 반영 ----------------
  let actorUserId = null;
  const adminRows = await sql`select id::text from users where global_role = 'admin' order by created_at asc limit 1`;
  if (adminRows.length > 0) actorUserId = adminRows[0].id;

  const logEntries = [];
  const newCompanyIdByName = new Map();
  const newPersonIdByName = new Map();

  await sql.begin(async (tx) => {
    // 1) 고객사
    for (const item of plan.customers.insert) {
      const [inserted] = await tx`insert into companies ${tx(item.payload)} returning id::text`;
      newCompanyIdByName.set(item.name, inserted.id);
      logEntries.push(["company", inserted.id, "insert", null, item.payload]);
    }
    for (const item of plan.customers.update) {
      await tx`update companies set ${tx(item.diff)} where id = ${item.id}::uuid`;
      logEntries.push(["company", item.id, "update", item.before, item.diff]);
    }

    // 2) 파트너
    const resolveCompanyRef = (value, name) =>
      value === "PENDING" ? newCompanyIdByName.get(name) ?? null : value;

    for (const item of plan.partners.insert) {
      const payload = { ...item.personPayload };
      delete payload.__companyName;
      payload.primary_company_id = resolveCompanyRef(payload.primary_company_id, item.companyName);
      const [inserted] = await tx`insert into people ${tx(payload)} returning id::text`;
      newPersonIdByName.set(item.name, inserted.id);
      await tx`insert into network_profiles ${tx({ ...item.profilePayload, person_id: inserted.id })}`;
      logEntries.push(["person", inserted.id, "insert", null, { ...payload, ...item.profilePayload }]);
    }
    for (const item of plan.partners.update) {
      const personPayload = { ...item.personPayload };
      const companyName = personPayload.__companyName;
      delete personPayload.__companyName;
      personPayload.primary_company_id = resolveCompanyRef(personPayload.primary_company_id, companyName);
      await tx`update people set ${tx(personPayload)} where id = ${item.id}::uuid`;
      await tx`
        insert into network_profiles ${tx({ ...item.profilePayload, person_id: item.id })}
        on conflict (person_id) do update set ${tx(item.profilePayload)}
      `;
      logEntries.push(["person", item.id, "update", item.before, item.diff]);
    }

    // 3) 프로젝트
    const resolveRefs = (payload, refNames) => {
      const next = { ...payload };
      if (next.company_id === "PENDING") {
        next.company_id = newCompanyIdByName.get(refNames?.companyName) ?? null;
      }
      if (next.primary_pl_person_id === "PENDING") {
        next.primary_pl_person_id = newPersonIdByName.get(refNames?.plName) ?? null;
      }
      if (next.candidate_pm_person_id === "PENDING") {
        next.candidate_pm_person_id = newPersonIdByName.get(refNames?.pmName) ?? null;
      }
      return next;
    };
    for (const item of plan.projects.insert) {
      const [inserted] = await tx`insert into projects ${tx(resolveRefs(item.payload, item.refNames))} returning id::text`;
      logEntries.push(["project", inserted.id, "insert", null, item.payload]);
    }
    for (const item of plan.projects.update) {
      await tx`update projects set ${tx(resolveRefs(item.payload, item.refNames))} where id = ${item.id}::uuid`;
      logEntries.push(["project", item.id, "update", item.before, item.diff]);
    }

    // 4) 삭제 (참조 정리 후)
    for (const item of plan.projects.delete) {
      await tx`delete from projects where id = ${item.id}::uuid`;
      logEntries.push(["project", item.id, "delete", item.before, null]);
    }
    for (const item of plan.partners.delete) {
      await tx`delete from people where id = ${item.id}::uuid`;
      logEntries.push(["person", item.id, "delete", item.before, null]);
    }
    for (const item of plan.customers.delete) {
      await tx`delete from companies where id = ${item.id}::uuid`;
      logEntries.push(["company", item.id, "delete", item.before, null]);
    }

    // 5) 변경 이력
    for (const [entityType, entityId, action, before, after] of logEntries) {
      await tx`
        insert into activity_logs (actor_user_id, entity_type, entity_id, action, before_json, after_json)
        values (
          ${actorUserId}::uuid,
          ${entityType},
          ${entityId}::uuid,
          ${`excel_${action}`},
          ${before ? JSON.stringify(before) : null}::jsonb,
          ${after ? JSON.stringify(after) : null}::jsonb
        )
      `;
    }
  });

  console.log(`반영 완료. 변경 ${logEntries.length}건이 activity_logs 에 기록되었습니다.`);
  console.log("앱을 새로고침하면 반영된 내용이 보입니다.");
} catch (caught) {
  console.error("");
  console.error("반영에 실패했습니다. DB는 변경 전 상태 그대로입니다.");
  console.error(caught.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}

function asTextSafe(value) {
  return value === null || value === undefined ? null : String(value);
}
