"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

type AuthState = "checking" | "signed-in" | "signed-out";

function getClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) return null;
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

export function AuthButton() {
  const [authState, setAuthState] = useState<AuthState>("checking");

  useEffect(() => {
    const supabase = getClient();
    if (!supabase) {
      setAuthState("signed-out");
      return;
    }

    supabase.auth.getUser().then(({ data }) => {
      setAuthState(data.user ? "signed-in" : "signed-out");
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthState(session?.user ? "signed-in" : "signed-out");
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    const supabase = getClient();
    if (!supabase) {
      window.location.assign("/login");
      return;
    }
    await supabase.auth.signOut();
    window.location.assign("/login");
  }

  if (authState === "checking") {
    return (
      <button className="secondaryButton authButton" type="button" disabled>
        확인 중
      </button>
    );
  }

  if (authState === "signed-out") {
    return (
      <Link className="secondaryButton authButton" href="/login">
        로그인
      </Link>
    );
  }

  return (
    <button className="secondaryButton authButton" type="button" onClick={signOut}>
      로그아웃
    </button>
  );
}
