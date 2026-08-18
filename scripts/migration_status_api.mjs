// Management API 로 마이그레이션/스키마 상태 확인 (db:status 의 HTTPS 버전)
//
//   SUPABASE_ACCESS_TOKEN=sbp_... npm run db:status:api

import fs from "node:fs/promises";
import path from "node:path";
import { loadLocalEnv } from "./load_env.mjs";

loadLocalEnv();

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN 이 필요합니다.");
  process.exit(1);
}
const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ref = process.env.SUPABASE_PROJECT_REF ?? new URL(projectUrl).hostname.split(".")[0];

async function run(query) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(text);
  return text ? JSON.parse(text) : [];
}

const REQUIRED = [
  ["table", "meeting_notes", "회의록"],
  ["table", "project_folders", "프로젝트 폴더 탭"],
  ["column", "projects.folder_id", "프로젝트 폴더 필터"],
  ["column", "tasks.assignee_person_id", "티켓 담당자"],
  ["column", "events.is_date_tbd", "이벤트 일시 미정"],
  ["column", "users.auth_user_id", "로그인/권한"],
];

const files = (await fs.readdir(path.join(process.cwd(), "supabase", "migrations")))
  .filter((f) => f.endsWith(".sql"))
  .sort();

const reg = await run("select to_regclass('public.schema_migrations') as reg");
const applied = new Set();
if (reg[0]?.reg) {
  (await run("select version from schema_migrations")).forEach((row) => applied.add(row.version));
}

console.log("");
console.log(`프로젝트: ${ref}`);
console.log("");
console.log("마이그레이션");
let pending = 0;
for (const file of files) {
  const ok = applied.has(file.replace(/\.sql$/, ""));
  if (!ok) pending += 1;
  console.log(`  ${ok ? "적용됨  " : "미적용  "} ${file}`);
}

const tables = new Set(
  (await run("select table_name from information_schema.tables where table_schema='public'")).map(
    (row) => row.table_name
  )
);
const columns = new Set(
  (
    await run(
      "select table_name, column_name from information_schema.columns where table_schema='public'"
    )
  ).map((row) => `${row.table_name}.${row.column_name}`)
);
const buckets = new Set((await run("select id from storage.buckets")).map((row) => row.id));

console.log("");
console.log("앱이 필요로 하는 항목");
let missing = 0;
for (const [kind, name, used] of REQUIRED) {
  const ok = kind === "table" ? tables.has(name) : columns.has(name);
  if (!ok) missing += 1;
  console.log(`  ${ok ? "있음  " : "없음  "} ${`${kind === "table" ? "테이블" : "컬럼"} ${name}`.padEnd(38)} ${used}`);
}
for (const [name, used] of [["xp-documents", "문서 보관"], ["xp-meeting-notes", "회의록 보관"]]) {
  const ok = buckets.has(name);
  if (!ok) missing += 1;
  console.log(`  ${ok ? "있음  " : "없음  "} ${`버킷 ${name}`.padEnd(38)} ${used}`);
}

console.log("");
if (pending === 0 && missing === 0) console.log("DB가 코드와 일치합니다.");
else console.log(`미적용 ${pending}건 / 누락 ${missing}건 — 해결: npm run db:migrate:api`);
console.log("");
