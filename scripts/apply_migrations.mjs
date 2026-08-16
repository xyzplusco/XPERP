import fs from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { loadLocalEnv } from "./load_env.mjs";

loadLocalEnv();
const databaseUrl = process.env.SUPABASE_DB_URL;

if (!databaseUrl) {
  console.error("SUPABASE_DB_URL is required to apply migrations.");
  process.exit(1);
}

if (databaseUrl.includes("[YOUR-PASSWORD]")) {
  console.error("SUPABASE_DB_URL still contains [YOUR-PASSWORD]. Replace it with the real Supabase database password.");
  process.exit(1);
}

const root = process.cwd();
const migrationDir = path.join(root, "supabase", "migrations");
const sql = postgres(databaseUrl, {
  max: 1,
  ssl: "require",
  prepare: false,
});

try {
  await sql`create table if not exists schema_migrations (
    version text primary key,
    applied_at timestamptz not null default now()
  )`;

  const files = (await fs.readdir(migrationDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    const existing = await sql`select version from schema_migrations where version = ${version}`;
    if (existing.length > 0) {
      console.log(`skip ${file}`);
      continue;
    }

    const body = await fs.readFile(path.join(migrationDir, file), "utf8");
    console.log(`apply ${file}`);
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into schema_migrations (version) values (${version})`;
    });
  }
} finally {
  await sql.end();
}
