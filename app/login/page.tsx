import { signInAction } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="loginPage">
      <div className="loginCard">
        <img src="/logo.png" alt="XP" className="brandLogo" />
        <h1 className="loginTitle">XP ERP 로그인</h1>
        {error ? (
          <p className="notice noticeError">
            {error === "missing" ? "이메일과 비밀번호를 입력하세요." : "이메일 또는 비밀번호가 올바르지 않습니다."}
          </p>
        ) : null}
        <form action={signInAction}>
          <div className="field">
            <label htmlFor="email">이메일</label>
            <input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="field">
            <label htmlFor="password">비밀번호</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          <button className="primaryButton" type="submit">
            로그인
          </button>
        </form>
      </div>
    </div>
  );
}
