"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({
  items,
  badges = {},
}: {
  items: { href: string; label: string }[];
  badges?: Record<string, number>;
}) {
  const pathname = usePathname();
  return (
    <>
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        const badge = badges[item.href] ?? 0;
        return (
          <Link key={item.href} href={item.href} className={active ? "navItem navItemActive" : "navItem"}>
            {item.label}
            {badge > 0 ? <span className="navBadge">{badge}</span> : null}
          </Link>
        );
      })}
    </>
  );
}
