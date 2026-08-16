import { Suspense } from "react";
import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <section className="loginPanel" aria-label="XP 로그인">
      <div className="sectionHeader">
        <div className="accentLine" />
        <h2>로그인</h2>
        <p>XP 내부 운영 데이터에 접근하려면 Supabase 계정으로 로그인해야 합니다.</p>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
    </section>
  );
}
