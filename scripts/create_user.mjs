// Supabase Auth 사용자 + ERP users 행을 만든다 (계정 발급 비상 경로).
//
// 평소에는 앱에서 만든다: 설정 → 계정 추가 (마스터 어드민만).
// 이 스크립트는 owner 계정을 잃었거나 화면이 안 뜰 때를 위한 복구 경로다.
//
// 사용법:
//   npm run user:create -- --email pl@xyzplus.co --role member --person "김수민"
//   npm run user:create -- --email ops@xyzplus.co --role staff --password 'MyPassw0rd!'
//
// --password 를 생략하면 임시 비밀번호를 만들어서 출력한다.
// --person 은 people.name_ko 와 정확히 일치해야 하고, PL/PM 권한(자기 프로젝트)의 근거가 된다.
//
// 역할: owner(마스터 어드민, 1명만) | staff(임직원) | member(PL·PM) | viewer(열람전용)
//
// 필요한 환경변수: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (.env.local)

import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv } from "./load_env.mjs";

loadLocalEnv();

const ROLES = ["owner", "staff", "member", "viewer"];

const args = process.argv.slice(2);
function arg(name) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

const email = arg("email")?.toLowerCase();
const role = arg("role") ?? "member";
const personName = arg("person");
let password = arg("password");

if (!email || !email.includes("@")) {
  console.error("사용법: npm run user:create -- --email <이메일> [--role owner|staff|member|viewer] [--person <이름>] [--password <비밀번호>]");
  process.exit(1);
}
if (!ROLES.includes(role)) {
  console.error(`역할이 잘못됐습니다: ${role} (가능: ${ROLES.join(", ")})`);
  process.exit(1);
}
if (password && password.length < 8) {
  console.error("비밀번호는 8자 이상이어야 합니다.");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 가 .env.local 에 있어야 합니다.");
  console.error("Supabase 대시보드 → Settings → API Keys → Legacy API Keys → service_role 복사.");
  process.exit(1);
}

function generatePassword(length = 12) {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i += 1) out += chars[bytes[i] % chars.length];
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8)}`;
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const fail = (label, message) => {
  console.error(`\n실패 — ${label}\n  ${message}\n`);
  process.exit(1);
};

// 1) 연결할 파트너 찾기
let personId = null;
if (personName) {
  const { data, error } = await admin.from("people").select("id, name_ko").eq("name_ko", personName).limit(3);
  if (error) fail("파트너 조회", error.message);
  if (!data || data.length === 0) fail("파트너 조회", `'${personName}' 이라는 이름의 파트너가 없습니다. 파트너 화면에서 이름을 정확히 확인하세요.`);
  if (data.length > 1) fail("파트너 조회", `'${personName}' 동명이인이 ${data.length}명입니다. 이름을 구분되게 바꾼 뒤 다시 시도하세요.`);
  personId = data[0].id;
}

// 2) owner 는 한 명뿐 — 이미 있으면 막는다
if (role === "owner") {
  const { data: owners } = await admin.from("users").select("email").eq("global_role", "owner");
  if (owners && owners.length > 0) {
    fail("역할", `마스터 어드민은 1명만 가능합니다. 현재: ${owners.map((o) => o.email).join(", ")}`);
  }
}

// 3) Auth 사용자 (있으면 비밀번호만 재설정)
password = password ?? generatePassword();
const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listError) fail("Auth 사용자 조회", listError.message);
const existing = list.users.find((u) => u.email?.toLowerCase() === email);

let authUserId;
if (existing) {
  const { error } = await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
  if (error) fail("Auth 비밀번호 재설정", error.message);
  authUserId = existing.id;
  console.log(`Auth 사용자가 이미 있어 비밀번호만 재설정했습니다: ${email}`);
} else {
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) fail("Auth 사용자 생성", error.message);
  authUserId = created.user.id;
  console.log(`Auth 사용자 생성: ${email}`);
}

// 4) ERP users 행
const { data: appUser, error: upsertError } = await admin
  .from("users")
  .upsert(
    { email, global_role: role, status: "active", auth_user_id: authUserId, person_id: personId },
    { onConflict: "email" }
  )
  .select("id, global_role, person_id")
  .single();
if (upsertError) fail("ERP 계정 행 생성", upsertError.message);

const ROLE_LABEL = { owner: "마스터 어드민", staff: "임직원", member: "PL/PM", viewer: "열람전용" };

console.log("");
console.log("계정 준비 완료");
console.log(`  이메일    ${email}`);
console.log(`  비밀번호  ${password}`);
console.log(`  역할      ${ROLE_LABEL[appUser.global_role] ?? appUser.global_role}`);
console.log(`  파트너    ${personName ?? "연결 안 됨"}`);
console.log("");
console.log("이 비밀번호는 여기서만 보입니다. 본인에게 전달하고 첫 로그인 후 바꾸도록 안내하세요.");
