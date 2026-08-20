import { createClient } from "@supabase/supabase-js";

// service_role 키를 쓰는 클라이언트. RLS 를 무시하므로 **계정 생성/삭제에만** 사용한다.
// 절대 클라이언트 컴포넌트로 넘기지 말 것 (NEXT_PUBLIC_ 접두어 없는 서버 전용 환경변수).
export function createSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function isAccountAdminReady() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// 읽기 쉬운 임시 비밀번호 (혼동되는 문자 제외)
export function generatePassword(length = 12) {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i += 1) out += chars[bytes[i] % chars.length];
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8)}`;
}
