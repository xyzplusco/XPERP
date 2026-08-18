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

// SUPABASE_DB_URL 이 있으면 Postgres 로, 없으면 Management API(HTTPS)로 SQL 을 실행한다.
// 방화벽으로 5432/6543 이 막힌 환경에서도 같은 스크립트를 쓸 수 있게 하기 위함.
export function makeRunner() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  // XP_DB_MODE=api 로 강제하면 Postgres 가 있어도 HTTPS 경로를 쓴다.
  const forceApi = process.env.XP_DB_MODE === "api";

  if (!forceApi && dbUrl && !dbUrl.includes("[YOUR-PASSWORD]")) {
    const sql = connect(dbUrl);
    return {
      mode: "postgres",
      run: (query) => sql.unsafe(query),
      end: () => sql.end(),
    };
  }

  if (!token) {
    console.error("SUPABASE_DB_URL 또는 SUPABASE_ACCESS_TOKEN 중 하나가 필요합니다.");
    process.exit(1);
  }

  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const ref = process.env.SUPABASE_PROJECT_REF ?? new URL(projectUrl).hostname.split(".")[0];
  return {
    mode: "api",
    run: async (query) => {
      const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const text = await response.text();
      if (!response.ok) {
        let message = text;
        try { message = JSON.parse(text).message ?? text; } catch { /* 원문 유지 */ }
        throw new Error(message);
      }
      return text ? JSON.parse(text) : [];
    },
    end: async () => {},
  };
}

// SQL 리터럴. 한글·줄바꿈·따옴표가 섞여 있으므로 달러 인용을 쓴다.
export function lit(value) {
  if (value === null || value === undefined || value === "") return "null";
  if (typeof value === "number") return String(value);
  const text = String(value);
  let tag = "xq";
  let i = 0;
  while (text.includes(`$${tag}$`)) tag = `xq${i++}`;
  return `$${tag}$${text}$${tag}$`;
}
