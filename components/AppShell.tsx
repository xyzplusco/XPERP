import Link from "next/link";
import { navigationItems } from "@/lib/navigation";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="appShell">
      <aside className="sidebar" aria-label="Main navigation">
        <div className="brand">
          <img src="/logo.png" alt="XP" className="brandLogo" />
          <div>
            <div className="brandName">XP ERP</div>
            <div className="brandMeta">Internal operations</div>
          </div>
        </div>
        <nav className="navList">
          {navigationItems.map((item) => (
            <Link key={item.href} href={item.href} className="navItem">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="sidebarFooter">
          <span>Source controlled</span>
          <strong>4 workbooks</strong>
        </div>
      </aside>
      <div className="mainColumn">
        <header className="topbar">
          <div>
            <div className="topbarLabel">XP Internal ERP</div>
            <h1>Operational control workspace</h1>
          </div>
          <div className="topbarActions">
            <button className="secondaryButton" type="button">Import review</button>
            <button className="primaryButton" type="button">New action</button>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}

