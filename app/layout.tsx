import type { Metadata } from "next";
import "./globals.css";
import { getSessionUser } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "XP ERP",
  description: "XP 내부 운영 관리 시스템",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
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
