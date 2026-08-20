import Link from "next/link";
import { navigationFor } from "@/lib/navigation";
import { signOutAction } from "@/lib/actions";

import { ROLE_LABEL, type SessionUser } from "@/lib/auth";
import { NavLinks } from "@/components/NavLinks";
import { TicketDialog } from "@/components/TicketDialog";
import { getUnreadCount } from "@/lib/notifications";

export async function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const unread = user.appUserId ? await getUnreadCount() : 0;

  return (
    <div className="appShell">
      <aside className="sidebar">
        <Link href="/" className="brandLink">
          <img src="/logo.png" alt="XP" className="brandLogo" />
        </Link>
        <nav className="navList">
          <NavLinks items={navigationFor(user)} badges={{ "/inbox": unread }} />
        </nav>
        <div className="sidebarActions">
          <TicketDialog />
        </div>
        <div className="sidebarFooter">
          <div className="userEmail">{user.personName ?? user.email}</div>
          <div>{ROLE_LABEL[user.role] ?? user.role}</div>
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
