// 전자계약 내보내기 → 매칭 검토용 엑셀 생성
//
//   npm run contracts:prepare
//   npm run contracts:prepare -- --customers data/contracts/contracts_customers.xlsx \
//                                --partners  data/contracts/contracts_partners.xlsx
//
// DB의 파트너/고객사 이름·이메일과 대조해 연결 대상을 추천한다.
// 결과 파일에서 '연결 종류'와 '연결 이름'을 확인·수정한 뒤
// `npm run contracts:import` 으로 반영한다.

import path from "node:path";
import fs from "node:fs";
import ExcelJS from "exceljs";
import { loadLocalEnv } from "./load_env.mjs";
import { connect, requireDatabaseUrl } from "./lib/db.mjs";
import {
  CONTRACT_COLUMNS,
  CONTRACT_SHEET,
  DOC_TYPES,
  LINK_KIND,
  counterparties,
  guessDocType,
  guessPersonNameFromTitle,
  linkKindToDisplay,
  longestNameInTitle,
  parseYmd,
  plausiblePersonName,
} from "./lib/contracts.mjs";

loadLocalEnv();

const args = process.argv.slice(2);
function arg(name, fallback) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
}

const customersFile = arg("customers", "data/contracts/contracts_customers.xlsx");
const partnersFile = arg("partners", "data/contracts/contracts_partners.xlsx");
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const outPath = path.resolve(arg("out", `XP_계약매칭검토_${stamp}.xlsx`));

for (const file of [customersFile, partnersFile]) {
  if (!fs.existsSync(path.resolve(file))) {
    console.error(`파일을 찾을 수 없습니다: ${file}`);
    process.exit(1);
  }
}

const sql = connect(requireDatabaseUrl());

async function loadContracts(file, sourceLabel) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path.resolve(file));
  const sheet = workbook.worksheets[0];

  const out = [];
  // 1행 한글 머리글, 2행 코드 머리글, 3행부터 데이터
  for (let rowNumber = 3; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const cell = (n) => {
      const value = row.getCell(n).value;
      if (value === null || value === undefined) return "";
      if (typeof value === "object") {
        if ("richText" in value) return value.richText.map((p) => p.text).join("");
        if ("text" in value) return value.text;
        if ("result" in value) return String(value.result ?? "");
        return "";
      }
      return String(value).trim();
    };

    const contractId = cell(1);
    const contractName = cell(2);
    if (!contractId || !contractName) continue;

    out.push({
      contract_id: contractId,
      source: sourceLabel,
      contract_name: contractName,
      status: cell(3),
      created_date: parseYmd(cell(5)),
      signed_date: parseYmd(cell(6)) ?? parseYmd(cell(5)),
      participants: cell(19),
    });
  }
  return out;
}

try {
  console.log("계약 파일을 읽는 중…");
  const customerContracts = await loadContracts(customersFile, "고객사용");
  const partnerContracts = await loadContracts(partnersFile, "파트너용");
  const contracts = [...customerContracts, ...partnerContracts];
  console.log(`  고객사용 ${customerContracts.length}건 / 파트너용 ${partnerContracts.length}건`);

  console.log("DB에서 파트너·고객사 명단을 읽는 중…");
  const people = await sql`select id::text, name_ko, lower(coalesce(email, '')) as email from people`;
  const companies = await sql`
    select id::text, name_ko from companies
    where name_ko is not null and btrim(name_ko) <> '' and name_ko <> '회사명'`;
  const existingDocs = await sql`select memo from documents where memo like 'contract_id=%'`;
  const alreadyImported = new Set(
    existingDocs.map((row) => String(row.memo).replace(/^contract_id=/, "").split(" ")[0])
  );

  const personByEmail = new Map();
  for (const person of people) {
    if (person.email) {
      if (personByEmail.has(person.email)) personByEmail.set(person.email, "AMBIGUOUS");
      else personByEmail.set(person.email, person);
    }
  }
  const personNameCount = new Map();
  for (const person of people) {
    personNameCount.set(person.name_ko, (personNameCount.get(person.name_ko) ?? 0) + 1);
  }
  const companyNameCount = new Map();
  for (const company of companies) {
    companyNameCount.set(company.name_ko, (companyNameCount.get(company.name_ko) ?? 0) + 1);
  }
  const personNames = Array.from(personNameCount.keys());
  const companyNames = Array.from(companyNameCount.keys());

  let matchedByEmail = 0;
  let matchedByName = 0;
  let unmatched = 0;
  let skipped = 0;

  const reviewRows = contracts.map((contract) => {
    const parties = counterparties(contract.participants);
    const partiesText = parties.map((p) => `${p.name}${p.email ? ` <${p.email}>` : ""}`).join(", ");
    const isPartnerSheet = contract.source === "파트너용";

    let linkKind = null;
    let linkName = "";
    let note = "";

    // 1) 서명 이메일 정확 일치
    for (const party of parties) {
      if (!party.email) continue;
      const hit = personByEmail.get(party.email);
      if (hit && hit !== "AMBIGUOUS") {
        linkKind = "person";
        linkName = hit.name_ko;
        note = "이메일 일치";
        break;
      }
    }

    // 2) 제목 안의 등록된 이름/회사명
    if (!linkKind) {
      const companyHit = longestNameInTitle(contract.contract_name, companyNames);
      const personHit = longestNameInTitle(contract.contract_name, personNames);

      if (isPartnerSheet) {
        if (personHit && personNameCount.get(personHit) === 1) {
          linkKind = "person";
          linkName = personHit;
          note = "이름 일치";
        } else if (personHit) {
          linkKind = "person";
          linkName = personHit;
          note = "동명이인 확인 필요";
        } else if (companyHit) {
          // 파트너 시트에도 회사 상대 계약이 섞여 있다 (예: NDA_KR_캐치웰_XP)
          linkKind = "company";
          linkName = companyHit;
          note = companyNameCount.get(companyHit) === 1 ? "회사명 일치" : "동일 회사명 확인 필요";
        }
      } else if (companyHit && (!personHit || companyHit.length >= personHit.length)) {
        linkKind = "company";
        linkName = companyHit;
        note = companyNameCount.get(companyHit) === 1 ? "회사명 일치" : "동일 회사명 확인 필요";
      } else if (personHit && personNameCount.get(personHit) === 1) {
        linkKind = "person";
        linkName = personHit;
        note = "이름 일치";
      }
    }

    // 3) 서명자 표시 이름 / 제목 토큰에서 추정 (미등록 인물 가능성)
    if (!linkKind) {
      const fromParty = parties.map((p) => plausiblePersonName(p.name)).find(Boolean);
      const guessed = fromParty ?? guessPersonNameFromTitle(contract.contract_name);
      if (guessed) {
        linkKind = isPartnerSheet ? "person" : null;
        linkName = guessed;
        note = "후보 추정 — 확인 필요";
      } else {
        note = "후보 없음 — 직접 입력";
      }
    }

    if (note === "이메일 일치") matchedByEmail += 1;
    else if (note === "이름 일치" || note === "회사명 일치") matchedByName += 1;
    else unmatched += 1;

    if (alreadyImported.has(contract.contract_id)) {
      note = "이미 반영됨";
      linkKind = "skip";
      skipped += 1;
    }

    return {
      contract_id: contract.contract_id,
      source: contract.source,
      contract_name: contract.contract_name,
      doc_type: guessDocType(contract.contract_name),
      signed_date: contract.signed_date ?? "",
      counterparties: partiesText,
      link_kind: linkKindToDisplay(linkKind ?? "skip"),
      link_name: linkName,
      match_note: note,
    };
  });

  // ---------------------------------------------------------------- 파일 작성
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "XP ERP";
  const sheet = workbook.addWorksheet(CONTRACT_SHEET);

  sheet.columns = CONTRACT_COLUMNS.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width,
  }));
  const headerRow = sheet.getRow(1);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A3C2C" } };
    cell.alignment = { vertical: "middle" };
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: CONTRACT_COLUMNS.length } };

  for (const row of reviewRows) sheet.addRow(row);

  const lastRow = reviewRows.length + 1;
  CONTRACT_COLUMNS.forEach((column, index) => {
    const colNumber = index + 1;
    if (column.readOnly) {
      for (let r = 2; r <= lastRow; r += 1) {
        const cell = sheet.getCell(r, colNumber);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDEFED" } };
        cell.font = { color: { argb: "FF666666" }, size: 10 };
      }
    }
    if (column.options) {
      for (let r = 2; r <= lastRow; r += 1) {
        sheet.getCell(r, colNumber).dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [`"${column.options.join(",")}"`],
          showErrorMessage: true,
          errorStyle: "warning",
          errorTitle: "목록에 없는 값",
          error: "드롭다운에서 선택하세요.",
        };
      }
    }
  });

  const guide = workbook.addWorksheet("참고");
  guide.columns = [
    { header: "항목", key: "a", width: 20 },
    { header: "내용", key: "b", width: 96 },
  ];
  guide.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A3C2C" } };
  });
  [
    ["전체", `${contracts.length}건`],
    ["이메일 일치", `${matchedByEmail}건`],
    ["이름/회사명 일치", `${matchedByName}건`],
    ["확인 필요", `${unmatched}건`],
    ["이미 반영됨", `${skipped}건`],
    ["", ""],
    ["할 일", "'연결 종류'와 '연결 이름'을 확인하세요. 회색 열은 수정해도 반영되지 않습니다."],
    ["연결 이름", "파트너 시트의 이름 또는 고객사 시트의 고객사명과 정확히 같아야 합니다."],
    ["없는 이름", "DB에 없는 이름을 적으면 가져오기에서 오류로 보고됩니다. 먼저 db:export/db:import 로 등록하세요."],
    ["연결 안 함", "무시할 계약은 '연결 종류'를 '연결 안 함'으로 두세요."],
    ["반영 효과", "documents 등록 + 대상에 연결 + NDA 계약이면 파트너 NDA 상태가 '완료'로 갱신됩니다."],
    ["다음 단계", "npm run contracts:import -- --file <이 파일>  (미리보기) → --apply (반영)"],
  ].forEach(([a, b]) => guide.addRow({ a, b }));
  guide.getColumn(2).alignment = { wrapText: true, vertical: "top" };

  await workbook.xlsx.writeFile(outPath);

  console.log("");
  console.log(`저장 완료: ${outPath}`);
  console.log(`  전체 ${contracts.length}건`);
  console.log(`  이메일 일치 ${matchedByEmail} / 이름·회사명 일치 ${matchedByName} / 확인 필요 ${unmatched} / 이미 반영 ${skipped}`);
  console.log("");
  console.log("검토 후:");
  console.log(`  npm run contracts:import -- --file "${outPath}"            (미리보기)`);
  console.log(`  npm run contracts:import -- --file "${outPath}" --apply    (실제 반영)`);
} finally {
  await sql.end();
}
