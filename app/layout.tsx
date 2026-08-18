import type { Metadata } from "next";
import "./globals.css";
import { getSessionUser } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "XP ERP",
  description: "XP 내부 운영 관리 시스템",
};

function isConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // 환경변수가 없으면 모든 페이지가 500이 되므로, 원인을 바로 알 수 있는 화면을 보여준다.
  if (!isConfigured()) {
    return (
      <html lang="ko">
        <body>
          <div className="loginPage">
            <div className="loginCard" style={{ width: 460 }}>
              <img src="/logo.png" alt="XP" className="brandLogo" />
              <h1 className="loginTitle">환경변수가 설정되지 않았습니다</h1>
              <p style={{ fontSize: 13, color: "var(--ink-soft)", margin: "0 0 12px" }}>
                배포 환경에 아래 두 값을 등록한 뒤 다시 배포하세요.
              </p>
              <pre
                style={{
                  background: "var(--surface-soft)",
                  border: "1px solid var(--line)",
                  padding: "10px 12px",
                  fontSize: 12.5,
                  margin: 0,
                  overflowX: "auto",
                }}
              >
{`NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY`}
              </pre>
              <p style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 0 }}>
                Vercel → Settings → Environment Variables. SUPABASE_DB_URL은 로컬 전용이므로 넣지 마세요.
              </p>
            </div>
          </div>
        </body>
      </html>
    );
  }

  let user = null;
  try {
    user = await getSessionUser();
  } catch {
    user = null;
  }

  return (
    <html lang="ko">
      <body>{user ? <AppShell user={user}>{children}</AppShell> : children}</body>
    </html>
  );
}
