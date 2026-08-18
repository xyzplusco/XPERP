// 계약 매칭 검토표 → DB 반영
//
//   npm run contracts:import -- --file XP_계약매칭검토_20260817.xlsx           (미리보기)
//   npm run contracts:import -- --file XP_계약매칭검토_20260817.xlsx --apply   (실제 반영)
//
// 반영 내용
//   1. documents 에 계약 문서 등록 (파일 실물은 전자계약 시스템에 있음. memo 에 계약ID 보관)
//   2. entity_documents 로 파트너/고객사에 연결
//   3. NDA 계약이면 network_profiles.nda_status = 'O'
//   4. 대상의 미충족 문서 요구사항(document_requirements)을 '서명 완료'로 처리
//   5. 변경 내역을 activity_logs 에 기록
//
// 같은 계약ID는 다시 넣어도 중복 생성되지 않는다.

import path from "node:path";
import ExcelJS from "exceljs";
import { loadLocalEnv } from "./load_env.mjs";
import { connect, requireDatabaseUrl } from "./lib/db.mjs";
import { CONTRACT_COLUMNS, CONTRACT_SHEET, DOC_TYPES, linkKindToDb } from "./lib/contracts.mjs";

loadLocalEnv();

const args = process.argv.slice(2);
function arg(name) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}
const APPLY = args.includes("--apply");
const filePath = arg("file");

if (!filePath) {
  console.error("사용법: npm run contracts:import -- --file <검토파일> [--apply]");
  process.exit(1);
}

const sql = connect(requireDatabaseUrl());

function cellText(cell) {
  const value = cell?.value;
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((p) => p.text).join("").trim() || null;
    if ("text" in value) return String(value.text).trim() || null;
    if ("result" in value) return String(value.result ?? "").trim() || null;
    return null;
  }
  const text = String(value).trim();
  return text === "" ? null : text;
}

// NDA 성격의 문서 종류
const NDA_TYPES = new Set(["NDA"]);
// 파트너 온보딩 문서 요구사항과 매칭할 키워드
const REQUIREMENT_KEYWORDS = {
  NDA: ["NDA", "비밀유지"],
  위촉계약: ["위촉"],
  파트너계약: ["파트너", "계약"],
  근로계약: ["근로"],
};

try {
  const absolute = path.resolve(filePath);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(absolute);
  const sheet = workbook.getWorksheet(CONTRACT_SHEET);
  if (!sheet) {
    console.error(`시트 '${CONTRACT_SHEET}' 를 찾을 수 없습니다.`);
    process.exit(1);
  }

  const headerToIndex = new Map();
  sheet.getRow(1).eachCell((cell, colNumber) => {
    const header = cellText(cell);
    if (header) headerToIndex.set(header, colNumber);
  });
  const missing = CONTRACT_COLUMNS.filter((c) => !headerToIndex.has(c.header)).map((c) => c.header);
  if (missing.length > 0) {
    console.error(`열 머리글이 없습니다: ${missing.join(", ")}`);
    process.exit(1);
  }

  const rows = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const excelRow = sheet.getRow(rowNumber);
    const record = { __row: rowNumber };
    for (const column of CONTRACT_COLUMNS) {
      record[column.key] = cellText(excelRow.getCell(headerToIndex.get(column.header)));
    }
    if (!record.contract_id) continue;
    rows.push(record);
  }

  // 현재 DB 상태
  const people = await sql`select id::text, name_ko from people`;
  const companies = await sql`select id::text, name_ko from companies`;
  const existing = await sql`select id::text, memo from documents where memo like 'contract_id=%'`;
  const existingContractIds = new Set(
    existing.map((row) => String(row.memo).replace(/^contract_id=/, "").split(" ")[0])
  );

  const nameIndex = (list) => {
    const index = new Map();
    for (const item of list) {
      const key = (item.name_ko ?? "").trim();
      if (!key) continue;
      index.set(key, index.has(key) ? "AMBIGUOUS" : item.id);
    }
    return index;
  };
  const personByName = nameIndex(people);
  const companyByName = nameIndex(companies);

  const planned = [];
  const errors = [];
  let skippedExisting = 0;
  let skippedByUser = 0;

  for (const row of rows) {
    if (existingContractIds.has(row.contract_id)) {
      skippedExisting += 1;
      continue;
    }

    const kind = linkKindToDb(row.link_kind);
    if (kind === undefined) {
      errors.push(`${row.__row}행: '연결 종류' 값이 올바르지 않습니다: "${row.link_kind}"`);
      continue;
    }
    if (kind === "skip") {
      skippedByUser += 1;
      continue;
    }

    if (!row.link_name) {
      errors.push(`${row.__row}행: '연결 이름' 이 비어 있습니다 (${row.contract_name}).`);
      continue;
    }

    const index = kind === "person" ? personByName : companyByName;
    const resolved = index.get(row.link_name);
    if (!resolved) {
      errors.push(
        `${row.__row}행: ${kind === "person" ? "파트너" : "고객사"} "${row.link_name}" 을(를) DB에서 찾을 수 없습니다.`
      );
      continue;
    }
    if (resolved === "AMBIGUOUS") {
      errors.push(`${row.__row}행: "${row.link_name}" 은(는) 동일 이름이 여러 건이라 연결할 수 없습니다.`);
      continue;
    }

    const docType = row.doc_type && DOC_TYPES.includes(row.doc_type) ? row.doc_type : "계약서";

    planned.push({
      contractId: row.contract_id,
      title: row.contract_name,
      docType,
      signedDate: row.signed_date && /^\d{4}-\d{2}-\d{2}$/.test(row.signed_date) ? row.signed_date : null,
      entityType: kind,
      entityId: resolved,
      entityName: row.link_name,
      source: row.source,
    });
  }

  const ndaPersonIds = new Set(
    planned.filter((p) => p.entityType === "person" && NDA_TYPES.has(p.docType)).map((p) => p.entityId)
  );

  console.log("");
  console.log(`파일: ${absolute}`);
  console.log(APPLY ? "모드: 실제 반영 (--apply)" : "모드: 미리보기 (DB 변경 없음)");
  console.log("");
  console.log(`  등록 예정 계약        ${planned.length}건`);
  console.log(`    파트너 연결         ${planned.filter((p) => p.entityType === "person").length}건`);
  console.log(`    고객사 연결         ${planned.filter((p) => p.entityType === "company").length}건`);
  console.log(`  NDA 상태 갱신 대상    ${ndaPersonIds.size}명`);
  console.log(`  이미 반영되어 건너뜀  ${skippedExisting}건`);
  console.log(`  '연결 안 함' 처리     ${skippedByUser}건`);
  console.log("");

  const byType = {};
  for (const item of planned) byType[item.docType] = (byType[item.docType] ?? 0) + 1;
  if (Object.keys(byType).length > 0) {
    console.log("  문서 종류별:");
    for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${type.padEnd(10)} ${count}건`);
    }
    console.log("");
  }

  if (errors.length > 0) {
    console.log(`오류 ${errors.length}건 (해당 행은 건너뜁니다):`);
    errors.slice(0, 40).forEach((message) => console.log(`    ${message}`));
    if (errors.length > 40) console.log(`    … 외 ${errors.length - 40}건`);
    console.log("");
  }

  if (planned.length === 0) {
    console.log("반영할 계약이 없습니다.");
    process.exit(0);
  }
  if (!APPLY) {
    console.log("실제 반영하려면 같은 명령에 --apply 를 붙여 다시 실행하세요.");
    process.exit(0);
  }

  const adminRows = await sql`select id::text from users where global_role = 'admin' order by created_at asc limit 1`;
  const actorUserId = adminRows.length > 0 ? adminRows[0].id : null;

  let requirementsSatisfied = 0;
  let ndaUpdated = 0;

  await sql.begin(async (tx) => {
    for (const item of planned) {
      const [doc] = await tx`
        insert into documents (
          document_type, title, sensitivity, file_name,
          uploaded_by_user_id, uploaded_at, memo
        ) values (
          ${item.docType},
          ${item.title},
          'confidential',
          ${item.title},
          ${actorUserId}::uuid,
          ${item.signedDate ? `${item.signedDate}T00:00:00Z` : null}::timestamptz,
          ${`contract_id=${item.contractId} source=전자계약 ${item.source}`}
        )
        returning id::text
      `;

      await tx`
        insert into entity_documents (document_id, entity_type, entity_id, relationship_type)
        values (${doc.id}::uuid, ${item.entityType}, ${item.entityId}::uuid, 'contract')
        on conflict do nothing
      `;

      // 대상의 미충족 문서 요구사항 충족 처리
      const keywords = REQUIREMENT_KEYWORDS[item.docType];
      if (keywords) {
        const pattern = `%${keywords[0]}%`;
        const column = item.entityType === "person" ? "person_id" : "company_id";
        const updated = await tx.unsafe(
          `update document_requirements
             set status = 'signed',
                 signed_at = coalesce($1::date, signed_at, current_date),
                 current_document_id = $2::uuid
           where ${column} = $3::uuid
             and status in ('needed', 'requested', 'expired')
             and (requirement_type ilike $4 or title ilike $4)
           returning id`,
          [item.signedDate, doc.id, item.entityId, pattern]
        );
        requirementsSatisfied += updated.length;
      }

      await tx`
        insert into activity_logs (actor_user_id, entity_type, entity_id, action, before_json, after_json)
        values (
          ${actorUserId}::uuid,
          ${item.entityType},
          ${item.entityId}::uuid,
          'contract_import',
          null::jsonb,
          ${JSON.stringify({ contract_id: item.contractId, title: item.title, doc_type: item.docType, signed_date: item.signedDate })}::jsonb
        )
      `;
    }

    // NDA 체결자는 파트너 프로필의 NDA 상태를 '완료'로
    for (const personId of ndaPersonIds) {
      const updated = await tx`
        insert into network_profiles (person_id, network_segment, nda_status)
        values (${personId}::uuid, 'unknown', 'O')
        on conflict (person_id) do update set nda_status = 'O'
        returning person_id
      `;
      ndaUpdated += updated.length;
    }
  });

  console.log(`반영 완료.`);
  console.log(`  계약 문서 등록      ${planned.length}건`);
  console.log(`  NDA 상태 갱신       ${ndaUpdated}명`);
  console.log(`  문서 요구사항 충족  ${requirementsSatisfied}건`);
} catch (caught) {
  console.error("");
  console.error("반영에 실패했습니다. DB는 변경 전 상태 그대로입니다.");
  console.error(caught.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
