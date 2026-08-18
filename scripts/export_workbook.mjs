// DB → 편집용 엑셀 내보내기
//
//   npm run db:export
//   npm run db:export -- --out ~/Desktop/XP_ERP_편집용.xlsx
//
// 만들어진 파일을 엑셀에서 수정한 뒤 `npm run db:import` 으로 되돌린다.
// ID 열은 절대 수정하지 말 것. ID를 비운 새 행은 신규 등록으로 처리된다.

import path from "node:path";
import ExcelJS from "exceljs";
import { loadLocalEnv } from "./load_env.mjs";
import { connect, requireDatabaseUrl } from "./lib/db.mjs";
import { customerWarnings, partnerWarnings } from "./lib/quality.mjs";
import {
  COLUMNS,
  DATE_KEYS,
  DELETE_HEADER,
  NUMBER_KEYS,
  SHEETS,
  DOC_STATE,
  NETWORK_SEGMENT,
  PARTNER_CLASS,
  PROJECT_STATUS,
  PROJECT_TYPE,
  displayList,
  fromDb,
} from "./lib/workbook_schema.mjs";

loadLocalEnv();

const args = process.argv.slice(2);
function arg(name) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

const databaseUrl = requireDatabaseUrl();

const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const outPath = path.resolve(arg("out") ?? `XP_ERP_편집용_${stamp}.xlsx`);

const sql = connect(databaseUrl);

const HEADER_FILL = "FF1A3C2C";
const READONLY_FILL = "FFEDEFED";

function styleSheet(sheet, columns) {
  sheet.columns = columns.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width,
  }));

  const headerRow = sheet.getRow(1);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: "middle", horizontal: "left" };
    cell.border = { bottom: { style: "thin", color: { argb: "FF888888" } } };
  });

  sheet.views = [{ state: "frozen", xSplit: 1, ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };
}

function applyColumnRules(sheet, columns, rowCount) {
  const lastRow = Math.max(rowCount + 1, 2) + 200; // 아래 여유 행까지 규칙 적용 (신규 입력 대비)

  columns.forEach((column, index) => {
    const colNumber = index + 1;
    const col = sheet.getColumn(colNumber);

    if (column.multiline) {
      col.alignment = { wrapText: true, vertical: "top" };
    } else {
      col.alignment = { vertical: "top" };
    }

    if (column.readOnly) {
      for (let row = 2; row <= Math.max(rowCount + 1, 2); row += 1) {
        const cell = sheet.getCell(row, colNumber);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: READONLY_FILL } };
        cell.font = { color: { argb: "FF888888" }, size: 10 };
      }
    }

    if (column.options) {
      const list = displayList(column.options);
      for (let row = 2; row <= lastRow; row += 1) {
        sheet.getCell(row, colNumber).dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [`"${list.join(",")}"`],
          showErrorMessage: true,
          errorStyle: "warning",
          errorTitle: "목록에 없는 값",
          error: "드롭다운 목록에서 선택하세요. 그대로 두면 가져오기에서 오류로 보고됩니다.",
        };
      }
    }

    if (column.header === DELETE_HEADER) {
      for (let row = 2; row <= lastRow; row += 1) {
        sheet.getCell(row, colNumber).dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: ['"Y"'],
          showErrorMessage: true,
          errorStyle: "warning",
          errorTitle: "삭제 표시",
          error: "삭제할 행에만 Y를 입력하세요.",
        };
      }
    }

    if (DATE_KEYS.has(column.key)) col.numFmt = "yyyy-mm-dd";
    if (NUMBER_KEYS.has(column.key)) col.numFmt = "#,##0";
  });
}

function addRows(sheet, columns, records) {
  for (const record of records) {
    const row = sheet.addRow(
      columns.reduce((acc, column) => {
        acc[column.key] = record[column.key] ?? "";
        return acc;
      }, {})
    );
    row.alignment = { vertical: "top" };
  }
}

try {
  console.log("DB에서 데이터를 읽는 중…");

  const customers = await sql`
    select
      c.id::text as id,
      c.name_ko,
      c.industry,
      c.representative_name,
      c.location,
      c.website_url,
      c.core_product,
      c.business_summary,
      c.needs,
      c.next_action,
      c.memo,
      (select count(*) from projects p where p.company_id = c.id)::int as project_count
    from companies c
    order by (select count(*) from projects p where p.company_id = c.id) desc, c.name_ko asc
  `;

  const partners = await sql`
    select
      p.id::text as id,
      p.name_ko,
      np.partner_status,
      co.name_ko as company_name,
      p.title,
      p.email,
      p.phone,
      coalesce(np.network_segment, 'unknown') as network_segment,
      np.nda_status,
      np.profile_status,
      np.appointment_status,
      np.core_field,
      np.expertise_detail,
      p.memo,
      (
        select count(distinct pr.id)
        from projects pr
        where pr.primary_pl_person_id = p.id
           or pr.secondary_pl_person_id = p.id
           or pr.candidate_pm_person_id = p.id
      )::int as project_count
    from people p
    left join network_profiles np on np.person_id = p.id
    left join companies co on co.id = p.primary_company_id
    order by p.name_ko asc
  `;

  const projects = await sql`
    select
      pr.id::text as id,
      co.name_ko as company_name,
      pr.name,
      pr.project_type,
      pr.status,
      pr.contract_status,
      pl.name_ko as pl_name,
      pm.name_ko as pm_name,
      pr.start_date,
      pr.end_date,
      pr.expected_revenue,
      pr.client_need,
      pr.xp_request,
      pr.summary,
      pr.latest_update,
      pr.next_action,
      pr.memo
    from projects pr
    left join companies co on co.id = pr.company_id
    left join people pl on pl.id = pr.primary_pl_person_id
    left join people pm on pm.id = pr.candidate_pm_person_id
    order by co.name_ko asc nulls last, pr.updated_at desc
  `;

  // --- 품질 경고 계산 ---
  const personNameCount = new Map();
  const personEmailCount = new Map();
  for (const row of partners) {
    const name = (row.name_ko ?? "").trim();
    if (name) personNameCount.set(name, (personNameCount.get(name) ?? 0) + 1);
    const email = (row.email ?? "").trim().toLowerCase();
    if (email) personEmailCount.set(email, (personEmailCount.get(email) ?? 0) + 1);
  }
  const companyNameCount = new Map();
  for (const row of customers) {
    const name = (row.name_ko ?? "").trim();
    if (name) companyNameCount.set(name, (companyNameCount.get(name) ?? 0) + 1);
  }
  const personNameSet = new Set(personNameCount.keys());

  const partnerCounts = { nameCount: personNameCount, emailCount: personEmailCount };
  const customerCounts = { nameCount: companyNameCount, personNames: personNameSet };

  let warnedPartners = 0;
  let warnedCustomers = 0;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "XP ERP";
  workbook.created = new Date();

  // --- 고객사 ---
  const customerSheet = workbook.addWorksheet(SHEETS.customers);
  styleSheet(customerSheet, COLUMNS.customers);
  addRows(
    customerSheet,
    COLUMNS.customers,
    customers.map((row) => {
      const quality = customerWarnings(row, customerCounts);
      if (quality) warnedCustomers += 1;
      return { ...row, quality, delete: "" };
    })
  );
  applyColumnRules(customerSheet, COLUMNS.customers, customers.length);

  // --- 파트너 ---
  const partnerSheet = workbook.addWorksheet(SHEETS.partners);
  styleSheet(partnerSheet, COLUMNS.partners);
  addRows(
    partnerSheet,
    COLUMNS.partners,
    partners.map((row) => {
      // partner_status 원본에는 사람 이름/전화번호 같은 오염값이 섞여 있다.
      // 목록에 있는 값만 구분 열에 두고, 나머지는 참고 열로 밀어내 다시 고르게 한다.
      const known = PARTNER_CLASS.some(([value]) => value === row.partner_status);
      const quality = partnerWarnings(row, partnerCounts);
      if (quality) warnedPartners += 1;
      return {
        ...row,
        partner_class: known ? row.partner_status : "",
        legacy_partner_status: known ? "" : row.partner_status ?? "",
        network_segment: fromDb(NETWORK_SEGMENT, row.network_segment),
        nda_status: fromDb(DOC_STATE, row.nda_status),
        profile_status: fromDb(DOC_STATE, row.profile_status),
        appointment_status: fromDb(DOC_STATE, row.appointment_status),
        quality,
        delete: "",
      };
    })
  );
  applyColumnRules(partnerSheet, COLUMNS.partners, partners.length);

  // --- 프로젝트 ---
  const projectSheet = workbook.addWorksheet(SHEETS.projects);
  styleSheet(projectSheet, COLUMNS.projects);
  addRows(
    projectSheet,
    COLUMNS.projects,
    projects.map((row) => ({
      ...row,
      project_type: fromDb(PROJECT_TYPE, row.project_type),
      status: fromDb(PROJECT_STATUS, row.status),
      start_date: row.start_date ? new Date(row.start_date) : "",
      end_date: row.end_date ? new Date(row.end_date) : "",
      expected_revenue: row.expected_revenue === null ? "" : Number(row.expected_revenue),
      delete: "",
    }))
  );
  applyColumnRules(projectSheet, COLUMNS.projects, projects.length);

  // --- 참고 시트 ---
  const reference = workbook.addWorksheet(SHEETS.reference);
  reference.columns = [
    { header: "항목", key: "a", width: 22 },
    { header: "내용", key: "b", width: 96 },
  ];
  const refHeader = reference.getRow(1);
  refHeader.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  });
  [
    ["내보낸 시각", new Date().toISOString().replace("T", " ").slice(0, 19)],
    ["고객사", `${customers.length}행 (품질 경고 ${warnedCustomers}행)`],
    ["파트너", `${partners.length}행 (품질 경고 ${warnedPartners}행)`],
    ["프로젝트", `${projects.length}행`],
    ["", ""],
    ["품질 경고", "'품질 경고' 열에 필터를 걸면 정리 대상 행만 모아 볼 수 있습니다. 확인 후 '삭제'=Y 또는 값 수정."],
    ["규칙 1", "회색 ID 열은 절대 수정하지 마세요. 이 값으로 기존 행을 찾습니다."],
    ["규칙 2", "행을 추가하고 ID를 비워 두면 신규 등록됩니다."],
    ["규칙 3", "삭제할 행은 맨 끝 '삭제' 열에 Y를 입력하세요. 엑셀에서 행을 지우면 무시될 뿐 삭제되지 않습니다."],
    ["규칙 4", "드롭다운이 있는 열은 목록에서 고르세요. 목록에 없는 값은 가져오기에서 오류로 보고됩니다."],
    ["규칙 5", "프로젝트 시트의 PL/PM과 고객사는 '이름'으로 적습니다. 파트너/고객사 시트에 있는 이름과 정확히 같아야 합니다."],
    ["규칙 6", "동명이인이 있으면 자동 매칭되지 않고 오류로 보고됩니다. 파트너 시트에서 한쪽 이름을 구분되게 바꾸세요."],
    ["규칙 7", "회색 참고 열(프로젝트 수 등)은 수정해도 반영되지 않습니다."],
    ["", ""],
    ["되돌리기", "가져오기는 변경 전 값을 activity_logs 테이블에 기록합니다. 잘못 넣어도 추적/복구가 가능합니다."],
    ["가져오기", "먼저 `npm run db:import -- --file <파일>` 로 미리보기, 확인 후 `--apply` 를 붙여 실제 반영."],
  ].forEach(([a, b]) => reference.addRow({ a, b }));
  reference.getColumn(2).alignment = { wrapText: true, vertical: "top" };

  await workbook.xlsx.writeFile(outPath);

  console.log("");
  console.log(`저장 완료: ${outPath}`);
  console.log(`  고객사 ${customers.length}행 / 파트너 ${partners.length}행 / 프로젝트 ${projects.length}행`);
  console.log("");
  console.log("수정 후:");
  console.log(`  npm run db:import -- --file "${outPath}"            (미리보기)`);
  console.log(`  npm run db:import -- --file "${outPath}" --apply    (실제 반영)`);
} finally {
  await sql.end();
}
