// Supabase Management API 로 마이그레이션 적용 (HTTPS 443)
//
// Postgres 포트(5432/6543)가 막힌 환경에서 사용한다. 동작은 db:migrate 와 동일하며
// 같은 schema_migrations 테이블을 공유하므로 두 방식을 섞어 써도 안전하다.
//
//   SUPABASE_ACCESS_TOKEN=sbp_... npm run db:migrate:api
//
// 토큰: https://supabase.com/dashboard/account/tokens

import fs from "node:fs/promises";
import path from "node:path";
import { loadLocalEnv } from "./load_env.mjs";

loadLocalEnv();

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN 이 필요합니다.");
  console.error("https://supabase.com/dashboard/account/tokens 에서 발급하세요.");
  process.exit(1);
}

const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!projectUrl) {
  console.error("NEXT_PUBLIC_SUPABASE_URL 이 필요합니다 (.env.local).");
  process.exit(1);
}
const ref = process.env.SUPABASE_PROJECT_REF ?? new URL(projectUrl).hostname.split(".")[0];

async function run(query) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  const text = await response.text();
  if (!response.ok) {
    let message = text;
    try {
      message = JSON.parse(text).message ?? text;
    } catch {
      // 그대로 둔다
    }
    throw new Error(message);
  }
  return text ? JSON.parse(text) : [];
}

const migrationDir = path.join(process.cwd(), "supabase", "migrations");
const files = (await fs.readdir(migrationDir)).filter((f) => f.endsWith(".sql")).sort();

console.log(`프로젝트: ${ref}`);

await run(`create table if not exists schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
)`);

const appliedRows = await run("select version from schema_migrations");
const applied = new Set(appliedRows.map((row) => row.version));

let count = 0;
for (const file of files) {
  const version = file.replace(/\.sql$/, "");
  if (applied.has(version)) {
    console.log(`건너뜀  ${file}`);
    continue;
  }

  const body = await fs.readFile(path.join(migrationDir, file), "utf8");
  console.log(`적용 중  ${file}`);
  try {
    // 파일 전체를 하나의 트랜잭션으로 실행한다. 실패하면 전부 롤백된다.
    await run(
      `begin;\n${body}\ninsert into schema_migrations (version) values ('${version}');\ncommit;`
    );
    count += 1;
  } catch (caught) {
    await run("rollback").catch(() => {});
    console.error("");
    console.error(`실패: ${file}`);
    console.error(caught.message);
    console.error("");
    console.error("이 파일은 롤백되었습니다.");
    process.exit(1);
  }
}

console.log("");
console.log(count > 0 ? `마이그레이션 ${count}건 적용 완료.` : "새로 적용할 마이그레이션이 없습니다.");
