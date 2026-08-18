import fs from "node:fs/promises";
import path from "node:path";
import { loadLocalEnv } from "./load_env.mjs";
import { connect, requireDatabaseUrl } from "./lib/db.mjs";

loadLocalEnv();
const databaseUrl = requireDatabaseUrl();

const root = process.cwd();
const migrationDir = path.join(root, "supabase", "migrations");
const sql = connect(databaseUrl);

try {
  await sql`create table if not exists schema_migrations (
    version text primary key,
    applied_at timestamptz not null default now()
  )`;

  let appliedNow = 0;
  const files = (await fs.readdir(migrationDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    const existing = await sql`select version from schema_migrations where version = ${version}`;
    if (existing.length > 0) {
      console.log(`건너뜀  ${file}`);
      continue;
    }

    const body = await fs.readFile(path.join(migrationDir, file), "utf8");
    console.log(`적용 중  ${file}`);
    try {
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`insert into schema_migrations (version) values (${version})`;
      });
      appliedNow += 1;
    } catch (caught) {
      console.error("");
      console.error(`실패: ${file}`);
      console.error(caught.message);
      console.error("");
      console.error("이 파일은 롤백되었습니다. 원인을 해결한 뒤 다시 실행하세요.");
      process.exitCode = 1;
      break;
    }
  }

  console.log("");
  console.log(appliedNow > 0 ? `마이그레이션 ${appliedNow}건 적용 완료.` : "새로 적용할 마이그레이션이 없습니다.");
  console.log("확인: npm run db:status");
} finally {
  await sql.end();
}
