import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login"];

// 세션 쿠키를 네트워크 호출 없이 읽는다.
// @supabase/ssr 은 `sb-<ref>-auth-token` 에 세션 JSON 을 base64 로 넣고,
// 길면 `.0` `.1` 로 쪼갠다. 만료가 넉넉히 남았으면 Supabase 에 물어볼 필요가 없다.
function readSessionExpiry(request: NextRequest): number | null {
  const parts: { name: string; value: string }[] = [];
  for (const cookie of request.cookies.getAll()) {
    if (/^sb-.*-auth-token(\.\d+)?$/.test(cookie.name)) parts.push(cookie);
  }
  if (parts.length === 0) return null;

  parts.sort((a, b) => a.name.localeCompare(b.name));
  const raw = parts.map((p) => p.value).join("");
  const encoded = raw.startsWith("base64-") ? raw.slice("base64-".length) : null;
  if (!encoded) return null;

  try {
    const json = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
    return typeof json?.expires_at === "number" ? json.expires_at : null;
  } catch {
    return null;
  }
}

export default async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return response;

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  // 빠른 경로: 액세스 토큰 만료가 2분 이상 남았으면 인증 왕복을 생략한다.
  // 실제 접근 통제는 RLS 와 페이지의 getSessionUser 가 하므로 여기서는 리다이렉트 판단만 한다.
  const expiresAt = readSessionExpiry(request);
  const stillFresh = expiresAt !== null && expiresAt - Math.floor(Date.now() / 1000) > 120;

  if (stillFresh) {
    if (pathname === "/login") {
      const homeUrl = request.nextUrl.clone();
      homeUrl.pathname = "/";
      homeUrl.search = "";
      return NextResponse.redirect(homeUrl);
    }
    return response;
  }

  if (expiresAt === null && !isPublic) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }

  // 느린 경로: 토큰이 곧 만료되거나 이미 만료됐다. 여기서 갱신한다.
  let refreshed = NextResponse.next({ request });
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        refreshed = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          refreshed.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublic) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }

  if (user && pathname === "/login") {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }

  return refreshed;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.png|.*\\.(?:png|jpg|svg|ico)$).*)"],
};
