// 마이그레이션 적용 상태 확인
//
//   npm run db:status
//
// 어떤 마이그레이션이 적용됐고 무엇이 남았는지, 그리고 앱이 기대하는
// 주요 테이블/컬럼이 실제로 DB에 있는지 함께 확인한다.

import fs from "node:fs/promises";
import path from "node:path";
import { loadLocalEnv } from "./load_env.mjs";
import { connect, requireDatabaseUrl } from "./lib/db.mjs";

loadLocalEnv();
const sql = connect(requireDatabaseUrl());

// 앱이 반드시 필요로 하는 것들 (없으면 화면에서 오류가 난다)
const REQUIRED = [
  { kind: "table", name: "meeting_notes", since: "20260817020000", used: "회의록" },
  { kind: "table", name: "project_folders", since: "20260817030000", used: "프로젝트 폴더 탭" },
  { kind: "column", table: "projects", name: "folder_id", since: "20260817030000", used: "프로젝트 폴더 필터" },
  { kind: "column", table: "tasks", name: "assignee_person_id", since: "20260817030000", used: "티켓 담당자" },
  { kind: "column", table: "events", name: "is_date_tbd", since: "20260817030000", used: "이벤트 일시 미정" },
  { kind: "column", table: "users", name: "auth_user_id", since: "20260817010000", used: "로그인/권한" },
  { kind: "bucket", name: "xp-documents", since: "20260817010000", used: "문서 보관" },
  { kind: "bucket", name: "xp-meeting-notes", since: "20260817020000", used: "회의록 보관" },
];

try {
  const migrationDir = path.join(process.cwd(), "supabase", "migrations");
  const files = (await fs.readdir(migrationDir)).filter((f) => f.endsWith(".sql")).sort();

  const hasTable = await sql`select to_regclass('public.schema_migrations') as reg`;
  const applied = new Set();
  if (hasTable[0].reg) {
    const rows = await sql`select version from schema_migrations`;
    rows.forEach((row) => applied.add(row.version));
  }

  console.log("");
  console.log("마이그레이션");
  let pending = 0;
  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    const ok = applied.has(version);
    if (!ok) pending += 1;
    console.log(`  ${ok ? "적용됨  " : "미적용  "} ${file}`);
  }

  const tables = await sql`
    select table_name from information_schema.tables where table_schema = 'public'`;
  const tableSet = new Set(tables.map((row) => row.table_name));
  const columns = await sql`
    select table_name, column_name from information_schema.columns where table_schema = 'public'`;
  const columnSet = new Set(columns.map((row) => `${row.table_name}.${row.column_name}`));
  let buckets = new Set();
  try {
    const rows = await sql`select id from storage.buckets`;
    buckets = new Set(rows.map((row) => row.id));
  } catch {
    // storage 스키마가 없는 로컬 환경
  }

  console.log("");
  console.log("앱이 필요로 하는 항목");
  const missing = [];
  for (const item of REQUIRED) {
    let ok = false;
    let display = "";
    if (item.kind === "table") {
      ok = tableSet.has(item.name);
      display = `테이블 ${item.name}`;
    } else if (item.kind === "column") {
      ok = columnSet.has(`${item.table}.${item.name}`);
      display = `컬럼 ${item.table}.${item.name}`;
    } else {
      ok = buckets.has(item.name);
      display = `버킷 ${item.name}`;
    }
    if (!ok) missing.push(item);
    console.log(`  ${ok ? "있음  " : "없음  "} ${display.padEnd(38)} ${item.used}`);
  }

  console.log("");
  if (missing.length === 0 && pending === 0) {
    console.log("DB가 코드와 일치합니다.");
  } else {
    if (pending > 0) console.log(`미적용 마이그레이션 ${pending}건이 있습니다.`);
    if (missing.length > 0) {
      console.log(`앱이 기대하는 항목 ${missing.length}건이 DB에 없습니다. 해당 화면에서 오류가 납니다.`);
    }
    console.log("");
    console.log("해결: npm run db:migrate");
  }
  console.log("");
} finally {
  await sql.end();
}
