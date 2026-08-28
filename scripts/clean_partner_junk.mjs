// 파트너 명부에 남아 있는 임포트 부산물과 잘못 들어간 값을 정리한다.
//   node scripts/clean_partner_junk.mjs          # 미리보기
//   node scripts/clean_partner_junk.mjs --apply  # 실제 반영
//
// 정리 대상
//   1) network_profiles.memo  — 'cleaned_partners:...' 임포트 추적 문자열
//   2) network_profiles.agreement_status — 'Unknown' 자리표시자
//   3) network_profiles.core_field — 구분값·본인 이름·전화·지역이 잘못 들어간 것
//   4) people.memo 의 소개 문구 → network_profiles.recommender 로 이관

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv } from "./load_env.mjs";

loadLocalEnv();
const APPLY = process.argv.includes("--apply");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// core_field 에 들어와 있지만 실제로는 '구분'인 값. partner_status 가 이미 갖고 있거나, 비어 있으면 승격한다.
const STATUS_VALUES = {
  "협력사": "협력사", "파트너": "파트너", "파트너 후보": "파트너 후보",
  "후보": "파트너 후보", "외부전문가": "파트너 후보",
  "임원": "임원", "직원": "직원",
  "파트너 (비활성화)": null, "기업": null, "개인": null,
};
const REGION_VALUES = { "해외": "해외", "해외_독일": "독일", "해외_동남아": "동남아" };
const isPhone = (v) => /^[0-9][0-9\-\s]{8,}$/.test(v);

const { data: people, error: e1 } = await sb
  .from("people").select("id,name_ko,phone,region,memo").is("deleted_at", null).limit(5000);
if (e1) throw e1;
const { data: profiles, error: e2 } = await sb
  .from("network_profiles").select("*").limit(5000);
if (e2) throw e2;

const byId = Object.fromEntries(people.map((p) => [p.id, p]));
const nameSet = new Set(people.map((p) => p.name_ko));

fs.writeFileSync(`backup_partner_junk_${new Date().toISOString().slice(0,10).replace(/-/g,"")}.json`,
  JSON.stringify({ people, profiles }, null, 1));

const planNp = new Map();   // person_id -> patch
const planPp = new Map();   // person_id -> patch
const note = [];
const patchNp = (id, k, v) => { const m = planNp.get(id) ?? {}; m[k] = v; planNp.set(id, m); };
const patchPp = (id, k, v) => { const m = planPp.get(id) ?? {}; m[k] = v; planPp.set(id, m); };

// 1) 임포트 추적 메모
let memoCount = 0;
for (const np of profiles) {
  if (np.memo && /^(cleaned_partners|network_original):/.test(String(np.memo).trim())) {
    patchNp(np.person_id, "memo", null); memoCount += 1;
  }
}

// 2) Unknown 자리표시자
let agreeCount = 0;
for (const np of profiles) {
  if (np.agreement_status === "Unknown") { patchNp(np.person_id, "agreement_status", null); agreeCount += 1; }
}

// 3) core_field 정리
// 이름 칸에 회사명, core_field 에 담당자 이름이 들어간 것으로 확인된 행
const SWAP = new Map([["현PE", "강수훈"], ["스탠더스", "이상록"]]);
const swaps = [];
const buckets = { 구분: 0, 본인이름: 0, 전화: 0, 지역: 0, 전문분야이관: 0, 승격: 0, 이름소속교정: 0 };
for (const np of profiles) {
  const raw = String(np.core_field ?? "").trim();
  if (!raw) continue;
  const person = byId[np.person_id];
  if (!person) continue;

  if (raw in STATUS_VALUES) {
    patchNp(np.person_id, "core_field", null); buckets.구분 += 1;
    const promote = STATUS_VALUES[raw];
    if (promote && !np.partner_status) { patchNp(np.person_id, "partner_status", promote); buckets.승격 += 1; }
    continue;
  }
  if (raw === person.name_ko) { patchNp(np.person_id, "core_field", null); buckets.본인이름 += 1; continue; }
  if (isPhone(raw)) {
    patchNp(np.person_id, "core_field", null); buckets.전화 += 1;
    if (!person.phone) patchPp(np.person_id, "phone", raw);
    continue;
  }
  if (raw in REGION_VALUES) {
    patchNp(np.person_id, "core_field", null); buckets.지역 += 1;
    if (!person.region) patchPp(np.person_id, "region", REGION_VALUES[raw]);
    continue;
  }
  // 이름 칸에 회사명이 들어가고 core_field 에 실제 담당자 이름이 들어간 행. 이름↔소속을 제자리로 돌린다.
  if (SWAP.has(person.name_ko) && SWAP.get(person.name_ko) === raw) {
    patchNp(np.person_id, "core_field", null);
    swaps.push({ personId: np.person_id, company: person.name_ko, name: raw });
    buckets.이름소속교정 += 1;
    continue;
  }
  // 남은 것
  patchNp(np.person_id, "core_field", null);
  const d = String(np.expertise_detail ?? "").trim();
  patchNp(np.person_id, "expertise_detail", d ? `${d}; ${raw}` : raw);
  note.push(`${person.name_ko}: core_field '${raw}' → 전문 상세`);
  buckets.전문분야이관 += 1;
}

// 4) people.memo 의 소개 문구 → recommender
const INTRO = /^(.+?)\s*(?:님)?\s*(소개|지인|추천)$/;
let introCount = 0;
for (const p of people) {
  const memo = String(p.memo ?? "").trim();
  const m = memo.match(INTRO);
  if (!m) continue;
  const who = m[1].trim();
  const np = profiles.find((x) => x.person_id === p.id);
  if (np && !np.recommender) patchNp(p.id, "recommender", who);
  patchPp(p.id, "memo", null);
  note.push(`${p.name_ko}: 메모 '${memo}' → 추천인 '${who}'`);
  introCount += 1;
}

console.log("network_profiles.memo (임포트 추적)  ", memoCount);
console.log("agreement_status 'Unknown'          ", agreeCount);
console.log("core_field 정리                      ", Object.entries(buckets).map(([k, v]) => `${k} ${v}`).join(" · "));
console.log("people.memo 소개문구 → 추천인        ", introCount);
console.log("network_profiles 갱신 대상            ", planNp.size);
console.log("people 갱신 대상                     ", planPp.size);
if (swaps.length) { console.log("\n이름↔소속 교정:"); swaps.forEach((s) => console.log(`   ${s.company} → 이름 '${s.name}' · 소속 '${s.company}'`)); }
if (note.length) { console.log("\n개별 판단:"); note.forEach((n) => console.log("  ", n)); }

if (!APPLY) { console.log("\n미리보기입니다. 반영하려면 --apply"); process.exit(0); }

let ok = 0, fail = 0;
for (const [personId, patch] of planNp) {
  const { error } = await sb.from("network_profiles").update(patch).eq("person_id", personId);
  if (error) { fail += 1; console.error("np", byId[personId]?.name_ko, error.message); } else ok += 1;
}
for (const [personId, patch] of planPp) {
  const { error } = await sb.from("people").update(patch).eq("id", personId);
  if (error) { fail += 1; console.error("pp", byId[personId]?.name_ko, error.message); } else ok += 1;
}
for (const s of swaps) {
  let companyId = null;
  const { data: found } = await sb.from("companies").select("id").eq("name_ko", s.company).is("deleted_at", null).limit(1);
  if (found?.length) companyId = found[0].id;
  else {
    const { data: made, error } = await sb.from("companies").insert({ name_ko: s.company }).select("id").single();
    if (error) { fail += 1; console.error("company", s.company, error.message); continue; }
    companyId = made.id;
  }
  const { error } = await sb.from("people")
    .update({ name_ko: s.name, primary_company_id: companyId }).eq("id", s.personId);
  if (error) { fail += 1; console.error("swap", s.company, error.message); } else ok += 1;
}
console.log(`\n반영 완료 — 성공 ${ok} · 실패 ${fail}`);
