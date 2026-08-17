import Link from "next/link";
import { navigationItems } from "@/lib/navigation";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="appShell">
      <aside className="sidebar" aria-label="주요 메뉴">
        <Link href="/" className="brandLink" aria-label="대시보드로 이동">
          <div className="brand">
            <img src="/logo.png" alt="XP" className="brandLogo" />
          </div>
          <div className="brandName">XP Dashboard</div>
        </Link>
        <nav className="navList">
          {navigationItems.map((item) => (
            <Link key={item.href} href={item.href} className="navItem">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="sidebarFooter">
          <span>데이터 소스</span>
          <strong>Supabase</strong>
        </div>
      </aside>
      <div className="mainColumn">
        <header className="topbar">
          <div>
            <div className="topbarLabel">XP Dashboard</div>
            <h1>운영 관리 대시보드</h1>
          </div>
          <div className="topbarActions">
            <button className="secondaryButton" type="button">가져오기 검토</button>
            <button className="primaryButton" type="button">새 액션</button>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
