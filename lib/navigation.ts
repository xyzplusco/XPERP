import type { SessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/auth";

type NavItem = { href: string; label: string; adminOnly?: boolean };

const ITEMS: NavItem[] = [
  { href: "/", label: "내 업무" },
  { href: "/customers", label: "고객사" },
  { href: "/partners", label: "파트너" },
  { href: "/projects", label: "프로젝트" },
  { href: "/weekly", label: "주간 업데이트" },
  { href: "/tickets", label: "티켓" },
  { href: "/events", label: "이벤트" },
  { href: "/documents", label: "문서" },
  { href: "/trash", label: "휴지통", adminOnly: true },
  { href: "/settings", label: "설정" },
];

export function navigationFor(user: SessionUser | null) {
  return ITEMS.filter((item) => !item.adminOnly || isAdmin(user));
}

// 하위 호환
export const navigationItems = ITEMS;
