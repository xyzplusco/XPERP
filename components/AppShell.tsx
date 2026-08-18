import Link from "next/link";
import { navigationItems } from "@/lib/navigation";
import { signOutAction } from "@/lib/actions";
import { label } from "@/lib/labels";
import type { SessionUser } from "@/lib/auth";
import { NavLinks } from "@/components/NavLinks";
import { TicketDialog } from "@/components/TicketDialog";
import { getAssignablePeople, getProjectOptions } from "@/lib/queries";

export async function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const [assignables, projects] = user.appUserId
    ? await Promise.all([getAssignablePeople(), getProjectOptions()])
    : [[], []];

  return (
    <div className="appShell">
      <aside className="sidebar">
        <Link href="/" className="brandLink">
          <img src="/logo.png" alt="XP" className="brandLogo" />
        </Link>
        <nav className="navList">
          <NavLinks items={navigationItems} />
        </nav>
        <div className="sidebarActions">
          <TicketDialog assignables={assignables} projects={projects} />
        </div>
        <div className="sidebarFooter">
          <div className="userEmail">{user.personName ?? user.email}</div>
          <div>{label(user.role)}</div>
          <form action={signOutAction}>
            <button className="logoutButton" type="submit">
              로그아웃
            </button>
          </form>
        </div>
      </aside>
      <div className="mainColumn">
        <main className="content">
          {user.appUserId === null ? (
            <p className="notice noticeError">
              이 계정은 아직 ERP에 등록되지 않았습니다. 관리자에게 계정 등록을 요청하세요.
            </p>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}
