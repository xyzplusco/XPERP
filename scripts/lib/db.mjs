import postgres from "postgres";

// SUPABASE_DB_URL 로 접속한다.
// 로컬 테스트용으로 sslmode=disable 이 들어 있으면 SSL을 끈다.
export function connect(databaseUrl) {
  const disableSsl = /sslmode=disable/.test(databaseUrl) || /^postgres:\/\/[^@]*@\//.test(databaseUrl);
  return postgres(databaseUrl, {
    max: 1,
    ssl: disableSsl ? false : "require",
    prepare: false,
    // "policy ... does not exist, skipping" 같은 안내는 출력하지 않는다.
    onnotice: () => {},
  });
}

export function requireDatabaseUrl() {
  const databaseUrl = process.env.SUPABASE_DB_URL;
  if (!databaseUrl || databaseUrl.includes("[YOUR-PASSWORD]")) {
    console.error("SUPABASE_DB_URL이 필요합니다 (.env.local 확인).");
    process.exit(1);
  }
  return databaseUrl;
}
