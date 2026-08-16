"use client";

import { FormEvent, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

export function LoginForm() {
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/";
  const safeNextPath = nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const isConfigured = Boolean(supabaseUrl && supabaseAnonKey);

  const supabase = useMemo(
    () => (supabaseUrl && supabaseAnonKey ? createBrowserClient(supabaseUrl, supabaseAnonKey) : null),
    [supabaseAnonKey, supabaseUrl],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      setMessage("Supabase 환경변수가 설정되어 있지 않습니다.");
      return;
    }
    setIsSubmitting(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage("로그인 정보를 확인해 주세요.");
      setIsSubmitting(false);
      return;
    }

    window.location.assign(safeNextPath);
  }

  if (!isConfigured) {
    return (
      <div className="formMessage" role="alert">
        Supabase URL과 공개 키가 설정되어야 로그인할 수 있습니다.
      </div>
    );
  }

  return (
    <form className="loginForm" onSubmit={submit}>
      <label className="fieldLabel" htmlFor="email">
        이메일
      </label>
      <input
        id="email"
        className="textInput"
        type="email"
        value={email}
        autoComplete="email"
        onChange={(event) => setEmail(event.target.value)}
        required
      />

      <label className="fieldLabel" htmlFor="password">
        비밀번호
      </label>
      <input
        id="password"
        className="textInput"
        type="password"
        value={password}
        autoComplete="current-password"
        onChange={(event) => setPassword(event.target.value)}
        required
      />

      {message ? <p className="formMessage">{message}</p> : null}

      <button className="primaryButton loginSubmit" type="submit" disabled={isSubmitting}>
        {isSubmitting ? "확인 중" : "로그인"}
      </button>
    </form>
  );
}
