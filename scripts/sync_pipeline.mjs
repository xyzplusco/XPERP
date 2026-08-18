// XP 통합 파이프라인 엑셀 → DB 동기화
//
//   npm run pipeline:sync -- --file data/XP_통합파이프라인_2026.xlsx           (미리보기)
//   npm run pipeline:sync -- --file data/XP_통합파이프라인_2026.xlsx --apply   (반영)
//
// 하는 일
//   1. 서비스섹터 → 폴더 매핑 (없는 폴더는 생성)
//   2. 회사명으로 기존 고객사를 찾아 산업/대표자 갱신
//   3. 회사당 프로젝트 1건으로 정리 — 대표 1건만 남기고 중복은 휴지통
//   4. 상태·구간·PL·PM·니즈·요청사항 반영
//   5. 주차별 활동 내용을 project_weekly_updates 로 임포트
//   6. 매출현황 탭의 합계를 expected_revenue 로 반영
//   7. 파이프라인에 없는 프로젝트는 휴지통으로 (복구 가능)
//
// 같은 파일을 다시 돌려도 중복이 생기지 않는다.

import path from "node:path";
import ExcelJS from "exceljs";
import { loadLocalEnv } from "./load_env.mjs";
import { lit, makeRunner } from "./lib/db.mjs";

loadLocalEnv();

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const APPLY = args.includes("--apply");
const FILE = arg("file") ?? "data/XP_통합파이프라인_2026.xlsx";
const YEAR = Number(arg("year") ?? 2026);

// ---------------------------------------------------------------- 매핑 규칙

const SECTOR_FOLDER = {
  bpr: "Re-Engineering",
  리엔지니어링: "Re-Engineering",
  bb: "Business Building",
  비즈니스빌딩: "Business Building",
  gx: "Go Global",
  해외: "Go Global",
  "해외 유통": "Go Global",
  ax: "AX",
  투자: "투자·M&A",
  "투자/매각": "투자·M&A",
  투자매각: "투자·M&A",
  매각: "투자·M&A",
  투자유치: "투자·M&A",
  "투자/전략": "투자·M&A",
  fim: "투자·M&A",
  "f.i.m": "투자·M&A",
  ir: "투자·M&A",
  영업: "영업·컨설팅",
  영업컨설팅: "영업·컨설팅",
  사업컨설팅: "영업·컨설팅",
};

const FOLDERS = [
  ["Re-Engineering", 10],
  ["Go Global", 20],
  ["AX", 30],
  ["XP 경영", 40],
  ["Business Building", 15],
  ["투자·M&A", 25],
  ["영업·컨설팅", 35],
];

// 파이프라인 '상태' → projects.status
const STATUS_MAP = {
  계약: "confirmed",
  계약임박: "likely",
  제안: "discussing",
  가망: "discussing",
  관리: "managed",
  보류: "on_hold",
  미분류: "discussing",
};

const normalize = (value) =>
  String(value ?? "").replace(/\s|\(주\)|주식회사|㈜/g, "").toLowerCase();

const cleanName = (value) => String(value ?? "").replace(/[()]/g, "").trim();

// '8월2차' → 2026-08-08 (1차=1일, 2차=8일, 3차=15일, 4차=22일)
function weekToDate(labelText, year) {
  const match = String(labelText).match(/^(\d+)월(\d+)차$/);
  if (!match) return null;
  const month = Number(match[1]);
  const day = [1, 1, 8, 15, 22][Number(match[2])] ?? 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// ---------------------------------------------------------------- 엑셀 읽기

function cellText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((p) => p.text).join("");
    if ("text" in value) return String(value.text);
    if ("result" in value) return String(value.result ?? "");
    return "";
  }
  return String(value).trim();
}

async function readWorkbook(file) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path.resolve(file));

  const sheet = workbook.getWorksheet("Pipeline");
  if (!sheet) throw new Error("'Pipeline' 시트를 찾을 수 없습니다.");

  const headers = [];
  sheet.getRow(2).eachCell((cell, col) => {
    headers[col] = cellText(cell.value);
  });

  const weekCols = [];
  headers.forEach((header, col) => {
    if (header && /^\d+월\d+차$/.test(header)) weekCols.push({ col, label: header });
  });

  const get = (row, name) => {
    const col = headers.indexOf(name);
    return col > 0 ? cellText(row.getCell(col).value) : "";
  };

  const rows = [];
  for (let r = 3; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    const company = get(row, "회사명");
    if (!company) continue;

    const weeks = [];
    const seen = new Set();
    for (const { col, label: weekLabel } of weekCols) {
      const body = cellText(row.getCell(col).value);
      if (!body) continue;
      // 헤더에 '7월2차'가 중복으로 들어 있어 라벨 기준으로 한 번만 담는다.
      const key = `${weekLabel}|${body}`;
      if (seen.has(key)) continue;
      seen.add(key);
      weeks.push({ label: weekLabel, body });
    }

    rows.push({
      company,
      segment: get(row, "구간"),
      status: get(row, "상태"),
      sector: get(row, "서비스섹터"),
      industry: get(row, "사업"),
      rep: get(row, "대표자"),
      intro: get(row, "소개"),
      pl: cleanName(get(row, "PL")),
      pm1: cleanName(get(row, "PM1")),
      pm2: cleanName(get(row, "PM2")),
      needs: get(row, "대표니즈"),
      request: get(row, "XP요청"),
      weeks,
    });
  }

  // 매출현황
  const revenue = new Map();
  const revSheet = workbook.getWorksheet("매출현황");
  if (revSheet) {
    const revHeaders = [];
    revSheet.getRow(2).eachCell((cell, col) => {
      revHeaders[col] = cellText(cell.value);
    });
    const totalCol = revHeaders.indexOf("합계");
    const nameCol = revHeaders.indexOf("회사명");
    for (let r = 3; r <= revSheet.rowCount; r += 1) {
      const row = revSheet.getRow(r);
      const name = nameCol > 0 ? cellText(row.getCell(nameCol).value) : "";
      if (!name) continue;
      const total = totalCol > 0 ? Number(cellText(row.getCell(totalCol).value)) : NaN;
      if (!Number.isNaN(total) && total > 0) revenue.set(normalize(name), total);
    }
  }

  return { rows, revenue };
}

// ---------------------------------------------------------------- 실행

const db = makeRunner();

try {
  const { rows, revenue } = await readWorkbook(FILE);
  console.log("");
  console.log(`파일: ${path.resolve(FILE)}`);
  console.log(`접속: ${db.mode === "api" ? "Management API" : "Postgres"}`);
  console.log(APPLY ? "모드: 실제 반영 (--apply)" : "모드: 미리보기 (DB 변경 없음)");
  console.log("");
  console.log(`파이프라인 ${rows.length}건 / 주차 업데이트 ${rows.reduce((n, r) => n + r.weeks.length, 0)}건 / 매출 ${revenue.size}건`);

  const companies = await db.run(
    "select id::text as id, name_ko, industry, representative_name from companies where deleted_at is null"
  );
  const projects = await db.run(
    "select id::text as id, name, company_id::text as company_id, updated_at from projects where deleted_at is null"
  );
  const people = await db.run("select id::text as id, name_ko from people where deleted_at is null");

  const companyByNorm = new Map();
  for (const company of companies) {
    const key = normalize(company.name_ko);
    if (!companyByNorm.has(key)) companyByNorm.set(key, company);
  }
  const personByName = new Map();
  for (const person of people) {
    if (!personByName.has(person.name_ko)) personByName.set(person.name_ko, person.id);
    else personByName.set(person.name_ko, "AMBIGUOUS");
  }
  const projectsByCompany = new Map();
  for (const project of projects) {
    if (!project.company_id) continue;
    if (!projectsByCompany.has(project.company_id)) projectsByCompany.set(project.company_id, []);
    projectsByCompany.get(project.company_id).push(project);
  }

  const plan = { update: [], create: [], trash: [], updates: 0, folders: [] };
  const errors = [];
  const keepProjectIds = new Set();

  const existingFolders = await db.run("select id::text as id, name from project_folders");
  const folderByName = new Map(existingFolders.map((f) => [f.name, f.id]));
  for (const [name] of FOLDERS) if (!folderByName.has(name)) plan.folders.push(name);

  for (const row of rows) {
    const company = companyByNorm.get(normalize(row.company));
    if (!company) {
      errors.push(`고객사를 찾을 수 없음: ${row.company}`);
      continue;
    }

    // 같은 회사가 파이프라인에 여러 번 나오면(서로 다른 건) 각각 별도 프로젝트로 유지한다.
    const candidates = (projectsByCompany.get(company.id) ?? []).filter((p) => !keepProjectIds.has(p.id));
    const sorted = [...candidates].sort((a, b) => {
      const aExact = normalize(a.name) === normalize(row.company) ? 0 : 1;
      const bExact = normalize(b.name) === normalize(row.company) ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      return String(b.updated_at).localeCompare(String(a.updated_at));
    });
    const keep = sorted[0];

    const folderName = SECTOR_FOLDER[String(row.sector).toLowerCase().trim()] ?? null;
    const plId = row.pl && personByName.get(row.pl) !== "AMBIGUOUS" ? personByName.get(row.pl) : null;
    const pmId = row.pm1 && personByName.get(row.pm1) !== "AMBIGUOUS" ? personByName.get(row.pm1) : null;
    const pm2Id = row.pm2 && personByName.get(row.pm2) !== "AMBIGUOUS" ? personByName.get(row.pm2) : null;
    if (row.pl && !plId) errors.push(`PL 매칭 실패: ${row.company} → ${row.pl}`);
    if (row.pm1 && !pmId) errors.push(`PM 매칭 실패: ${row.company} → ${row.pm1}`);

    const latest = row.weeks.length > 0 ? row.weeks[row.weeks.length - 1] : null;

    const record = {
      companyId: company.id,
      companyName: company.name_ko,
      projectId: keep?.id ?? null,
      folderName,
      row,
      plId,
      pmId,
      pm2Id,
      latest,
      revenue: revenue.get(normalize(row.company)) ?? null,
      industryChanged: row.industry && row.industry !== company.industry,
      repChanged: row.rep && row.rep !== company.representative_name,
    };

    if (keep) {
      keepProjectIds.add(keep.id);
      plan.update.push(record);
      for (const extra of sorted.slice(1)) plan.trash.push({ id: extra.id, name: extra.name, reason: "중복" });
    } else {
      plan.create.push(record);
    }
    plan.updates += row.weeks.length;
  }

  for (const project of projects) {
    if (keepProjectIds.has(project.id)) continue;
    if (plan.trash.some((t) => t.id === project.id)) continue;
    plan.trash.push({ id: project.id, name: project.name, reason: "파이프라인 외" });
  }

  console.log("");
  console.log(`  폴더 신규 생성      ${plan.folders.length}건 ${plan.folders.length ? `(${plan.folders.join(", ")})` : ""}`);
  console.log(`  프로젝트 갱신       ${plan.update.length}건`);
  console.log(`  프로젝트 신규       ${plan.create.length}건`);
  console.log(`  주차별 업데이트     ${plan.updates}건`);
  console.log(`  매출 반영           ${plan.update.filter((r) => r.revenue).length}건`);
  console.log(`  휴지통으로          ${plan.trash.length}건 (중복 ${plan.trash.filter((t) => t.reason === "중복").length} / 파이프라인 외 ${plan.trash.filter((t) => t.reason === "파이프라인 외").length})`);
  console.log("");

  if (errors.length > 0) {
    console.log(`확인 필요 ${errors.length}건:`);
    errors.slice(0, 30).forEach((message) => console.log(`    ${message}`));
    console.log("");
  }

  if (!APPLY) {
    console.log("실제 반영하려면 --apply 를 붙여 다시 실행하세요.");
    process.exit(0);
  }

  // ---------------------------------------------------------------- 반영
  for (const [name, order] of FOLDERS) {
    await db.run(
      `insert into project_folders (name, sort_order, is_system) values (${lit(name)}, ${order}, true)
       on conflict (name) do update set sort_order = ${order}`
    );
  }
  const folders = await db.run("select id::text as id, name from project_folders");
  const folderId = new Map(folders.map((f) => [f.name, f.id]));

  // 신규 프로젝트는 먼저 만들어 id 를 확보한다.
  for (const record of plan.create) {
    const inserted = await db.run(
      `insert into projects (name, company_id) values (${lit(record.companyName)}, ${lit(record.companyId)}::uuid) returning id::text as id`
    );
    record.projectId = inserted[0].id;
  }

  // Management API 는 요청 수 제한이 있으므로 여러 건을 한 번에 묶어 보낸다.
  const BATCH = 10;
  const all = [...plan.update, ...plan.create];
  let done = 0;

  for (let start = 0; start < all.length; start += BATCH) {
    const chunk = all.slice(start, start + BATCH);
    const statements = [];

    for (const record of chunk) {
      const { row } = record;
      const projectId = record.projectId;
      const status = STATUS_MAP[row.status] ?? "discussing";
      const projectType =
        record.folderName === "Go Global" ? "go_global"
          : record.folderName === "Re-Engineering" ? "reengineering"
          : record.folderName === "투자·M&A" ? "investment"
          : record.folderName === "Business Building" ? "business_building"
          : record.folderName === "영업·컨설팅" ? "consulting"
          : "unknown";

      const fields = [
        `name = ${lit(record.companyName)}`,
        `status = ${lit(status)}`,
        `contract_status = ${lit(row.segment || null)}`,
        `folder_id = ${record.folderName ? `${lit(folderId.get(record.folderName))}::uuid` : "null"}`,
        `client_need = ${lit(row.needs || null)}`,
        `xp_request = ${lit(row.request || null)}`,
        `primary_pl_person_id = ${record.plId ? `${lit(record.plId)}::uuid` : "null"}`,
        `candidate_pm_person_id = ${record.pmId ? `${lit(record.pmId)}::uuid` : "null"}`,
        `secondary_pl_person_id = ${record.pm2Id ? `${lit(record.pm2Id)}::uuid` : "null"}`,
        `latest_update = ${lit(record.latest ? record.latest.body : null)}`,
        `expected_revenue = ${record.revenue ?? "null"}`,
        `project_type = ${lit(projectType)}`,
        `memo = ${lit(row.intro ? `소개: ${row.intro}` : null)}`,
        `deleted_at = null`,
      ].join(", ");

      statements.push(`update projects set ${fields} where id = ${lit(projectId)}::uuid;`);

      const companyFields = [];
      if (record.industryChanged) companyFields.push(`industry = ${lit(row.industry)}`);
      if (record.repChanged) companyFields.push(`representative_name = ${lit(row.rep)}`);
      if (companyFields.length > 0) {
        statements.push(
          `update companies set ${companyFields.join(", ")} where id = ${lit(record.companyId)}::uuid;`
        );
      }

      statements.push(`delete from project_weekly_updates where project_id = ${lit(projectId)}::uuid;`);
      if (row.weeks.length > 0) {
        const values = row.weeks
          .map((week) => {
            const date = weekToDate(week.label, YEAR);
            return `(${lit(projectId)}::uuid, ${lit(week.label)}, ${date ? `${lit(date)}::date` : "null"}, ${lit(week.body)})`;
          })
          .join(", ");
        statements.push(
          `insert into project_weekly_updates (project_id, update_label, update_date, body) values ${values};`
        );
      }

      statements.push(`delete from project_members where project_id = ${lit(projectId)}::uuid;`);
      const members = [];
      if (record.plId) members.push(`(${lit(projectId)}::uuid, ${lit(record.plId)}::uuid, 'pl', true)`);
      if (record.pmId) members.push(`(${lit(projectId)}::uuid, ${lit(record.pmId)}::uuid, 'pm', true)`);
      if (record.pm2Id && record.pm2Id !== record.pmId) {
        members.push(`(${lit(projectId)}::uuid, ${lit(record.pm2Id)}::uuid, 'pm', true)`);
      }
      if (members.length > 0) {
        statements.push(
          `insert into project_members (project_id, person_id, project_role, can_edit) values ${members.join(", ")} on conflict do nothing;`
        );
      }
    }

    await db.run(`begin;\n${statements.join("\n")}\ncommit;`);
    done += chunk.length;
    console.log(`  ${done}/${all.length} 처리`);
  }

  // 휴지통
  if (plan.trash.length > 0) {
    const ids = plan.trash.map((t) => `${lit(t.id)}::uuid`).join(", ");
    await db.run(
      `update projects set deleted_at = now() where id in (${ids}) and deleted_at is null`
    );
  }

  console.log("");
  console.log("반영 완료.");
  console.log(`  프로젝트 ${done}건 갱신/생성, 주차별 업데이트 ${plan.updates}건, 휴지통 ${plan.trash.length}건`);
} catch (caught) {
  console.error("");
  console.error("실패:", caught.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
