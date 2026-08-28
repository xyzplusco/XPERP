// 파트너 명부 엑셀(내보내기 → 사람이 수정 → 다시 반영) 을 DB 에 적용한다.
//   node scripts/apply_partner_sheet.mjs --file <경로>            미리보기
//   node scripts/apply_partner_sheet.mjs --file <경로> --apply    반영
//
// 대조는 엑셀의 'ID' 열로 한다. 이름으로 맞추면 동명이인(김민정 3명)이 뒤바뀌고,
// 행 순서로 맞추면 정렬 tiebreaker 가 없어 실행할 때마다 달라진다.
// ID 열이 없는 (구) 파일은 행 순서로 맞추되, 동명이인이 있으면 거부한다.

import ExcelJS from "exceljs";
import { makeRunner, lit } from "./lib/db.mjs";
import { loadLocalEnv } from "./load_env.mjs";

loadLocalEnv();

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const fi = args.indexOf("--file");
const FILE = fi >= 0 ? args[fi + 1] : "data/XP_파트너명부_수정본_20260826.xlsx";

const SEG = {
  "XP 내부": "xp_internal", "컨설팅 파트너": "consulting_partner",
  "투자/재무 파트너": "investment_finance_partner", "LP/투자자": "lp_investor",
  "외부 전문가": "external_expert", "협력사": "vendor_advisor",
  "고객사 담당자": "customer_contact", "행사 참석자": "event_invitee", "미분류": "unknown",
};
const DOC = { "완료": "O", "미비": "X", "미확인": "Unknown" };
// 의미 없는 자리표시자. 빈 값으로 취급한다.
const PLACEHOLDER = new Set(["Unclassified", "unclassified", "미분류", "-", "–"]);

const clean = (v) => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text ?? "").join("").trim();
    if ("text" in v) return String(v.text).trim();
    if ("result" in v) return String(v.result ?? "").trim();
  }
  return String(v).trim();
};

const { run, end } = makeRunner();

try {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);
  const ws = wb.getWorksheet("파트너 명부");
  if (!ws) throw new Error("'파트너 명부' 시트를 찾을 수 없습니다.");

  const header = [];
  ws.getRow(2).eachCell({ includeEmpty: true }, (cell, col) => (header[col] = clean(cell.value)));
  const col = (name) => header.indexOf(name);

  const sheet = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n < 3) return;
    const get = (name) => {
      const c = col(name);
      return c > 0 ? clean(row.getCell(c).value) : "";
    };
    if (!get("이름")) return;
    sheet.push({
      excelRow: n,
      id: get("ID"),
      name: get("이름"), name_en: get("영문명"),
      partner_status: get("구분") === "미분류" ? "" : get("구분"),
      network_segment: SEG[get("네트워크 분류")] ?? "unknown",
      company: get("소속"), title: get("직함"), xp_role: get("XP 역할"),
      email: get("이메일"), phone: get("연락처"), region: get("지역"),
      expertise_detail: get("전문 상세"),
      nda_status: DOC[get("NDA")] ?? "Unknown",
      profile_status: DOC[get("프로필")] ?? "Unknown",
      appointment_status: DOC[get("위촉")] ?? "Unknown",
      recommender: get("추천인"), source: get("출처"), memo: get("메모"),
    });
  });

  // DB 쪽은 내보내기와 같은 정렬로 다시 가져와 행 순서를 맞춘다.
  const db = await run(`
    select p.id, p.name_ko, coalesce(p.name_en,'') name_en, coalesce(p.title,'') title,
      coalesce(p.email,'') email, coalesce(p.phone,'') phone, coalesce(p.region,'') region,
      coalesce(p.memo,'') memo, coalesce(p.source,'') source, coalesce(c.name_ko,'') company,
      coalesce(np.partner_status,'') partner_status, coalesce(np.network_segment,'') network_segment,
      coalesce(np.xp_role,'') xp_role,
      coalesce(np.expertise_detail,'') expertise_detail, coalesce(np.nda_status,'') nda_status,
      coalesce(np.profile_status,'') profile_status, coalesce(np.appointment_status,'') appointment_status,
      coalesce(np.recommender,'') recommender
    from people p
    left join network_profiles np on np.person_id = p.id
    left join companies c on c.id = p.primary_company_id
    where p.deleted_at is null
    order by
      case coalesce(np.partner_status,'zz')
        when '임원' then '1' when '직원' then '2' when '파트너' then '3'
        when '파트너 후보' then '4' when '협력사' then '5' else '9' end,
      p.name_ko, p.id`);

  if (db.length !== sheet.length) {
    console.error(`행 수가 다릅니다. DB ${db.length} vs 엑셀 ${sheet.length}. 최신 내보내기 파일인지 확인하세요.`);
    process.exit(1);
  }

  const hasIds = sheet.every((r) => r.id);
  let pairs;
  if (hasIds) {
    // 엑셀에는 UUID 앞 8자만 넣는다 (사람이 보기에 짧게). 그 접두어로 대조한다.
    const byId = new Map(db.map((d) => [String(d.id).slice(0, 8), d]));
    const missing = sheet.filter((r) => !byId.has(r.id));
    if (missing.length) {
      console.error(`엑셀의 ID ${missing.length}건이 DB 에 없습니다: ${missing.slice(0, 3).map((r) => r.name).join(", ")}`);
      process.exit(1);
    }
    pairs = sheet.map((r) => [byId.get(r.id), r]);
  } else {
    const dupNames = new Set(
      Object.entries(db.reduce((acc, d) => ((acc[d.name_ko] = (acc[d.name_ko] ?? 0) + 1), acc), {}))
        .filter(([, n]) => n > 1).map(([name]) => name)
    );
    if (dupNames.size) {
      console.error(`ID 열이 없는 파일인데 동명이인이 있습니다 (${[...dupNames].join(", ")}). 행이 뒤바뀔 수 있어 중단합니다.`);
      console.error("npm run partners:export 로 다시 내보낸 뒤 편집하세요.");
      process.exit(1);
    }
    const misaligned = db.filter((d, i) => d.name_ko !== sheet[i].name);
    if (misaligned.length) {
      console.error(`행 순서가 어긋납니다 (${misaligned.length}건).`);
      process.exit(1);
    }
    pairs = db.map((d, i) => [d, sheet[i]]);
  }

  const companies = await run(`select id, name_ko from companies where deleted_at is null`);
  const nm = (v) => (v ?? "").replace(/\(주\)|㈜|주식회사/g, "").replace(/\s+/g, "").toLowerCase();
  const companyId = new Map(companies.map((c) => [nm(c.name_ko), c.id]));
  const usable = (v) => v && v.length >= 2 && !v.includes("@") && !/^[0-9][0-9\-+() ]{7,}$/.test(v);

  const PERSON = ["name_en", "title", "email", "phone", "region", "memo", "source"];
  const PROFILE = ["partner_status", "network_segment", "xp_role",
    "expertise_detail", "nda_status", "profile_status", "appointment_status", "recommender"];

  const diffs = [], newCompanies = new Set(), unknownCompanies = new Set();
  for (const [before, after] of pairs) {
    const changed = [];
    for (const f of [...PERSON, ...PROFILE]) {
      const b = f === "network_segment" ? (before[f] || "unknown") : before[f];
      if ((after[f] ?? "") !== b) changed.push(f);
    }
    let targetCompany = before.company ? companyId.get(nm(before.company)) ?? null : null;
    if ((after.company ?? "") !== before.company) {
      if (!after.company) targetCompany = null;
      else if (companyId.has(nm(after.company))) targetCompany = companyId.get(nm(after.company));
      else if (usable(after.company)) { newCompanies.add(after.company); targetCompany = "NEW"; }
      else { unknownCompanies.add(after.company); }
      changed.push("company");
    }
    if (changed.length) diffs.push({ before, after, changed, targetCompany });
  }

  const counts = {};
  for (const d of diffs) for (const f of d.changed) counts[f] = (counts[f] ?? 0) + 1;

  console.log(`대조 ${db.length}행 · 변경 ${diffs.length}명`);
  console.log("\n열별 변경 건수");
  for (const [f, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`  ${f.padEnd(20)} ${n}`);
  if (newCompanies.size) console.log("\n신규 고객사:", [...newCompanies].join(", "));
  if (unknownCompanies.size) console.log("회사명으로 쓸 수 없어 건너뜀:", [...unknownCompanies].join(", "));

  if (!APPLY) { console.log("\n미리보기입니다. --apply 로 반영하세요."); await end(); process.exit(0); }

  if (newCompanies.size) {
    await run(`insert into companies (name_ko) values ${[...newCompanies].map((n) => `(${lit(n)})`).join(", ")}`);
    for (const c of await run(`select id, name_ko from companies where deleted_at is null`)) {
      companyId.set(nm(c.name_ko), c.id);
    }
  }

  const chunk = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));

  for (const part of chunk(diffs, 120)) {
    const values = part.map((d) => {
      const cid = d.targetCompany === "NEW" ? companyId.get(nm(d.after.company)) : d.targetCompany;
      return `(${lit(d.before.id)}::uuid, ${lit(d.after.name_en)}, ${lit(d.after.title)}, ${lit(d.after.email)}, ` +
        `${lit(d.after.phone)}, ${lit(d.after.region)}, ${lit(d.after.memo)}, ${lit(d.after.source)}, ${cid ? lit(cid) : "null"}::uuid)`;
    });
    await run(`
      update people p set
        name_en = nullif(v.name_en, ''), title = nullif(v.title, ''), email = nullif(v.email, ''),
        phone = nullif(v.phone, ''), region = nullif(v.region, ''), memo = nullif(v.memo, ''),
        source = nullif(v.source, ''), primary_company_id = v.company_id
      from (values ${values.join(", ")}) as v(id, name_en, title, email, phone, region, memo, source, company_id)
      where p.id = v.id`);
  }

  for (const part of chunk(diffs, 120)) {
    const values = part.map((d) =>
      `(${lit(d.before.id)}::uuid, ${lit(d.after.partner_status)}, ${lit(d.after.network_segment)}, ${lit(d.after.xp_role)}, ` +
      `${lit(d.after.expertise_detail)}, ${lit(d.after.nda_status)}, ` +
      `${lit(d.after.profile_status)}, ${lit(d.after.appointment_status)}, ${lit(d.after.recommender)})`
    );
    await run(`
      insert into network_profiles (person_id, partner_status, network_segment, xp_role,
                                    expertise_detail, nda_status, profile_status, appointment_status, recommender)
      select v.id, nullif(v.ps,''), v.seg, nullif(v.role,''), nullif(v.field,''), nullif(v.detail,''),
             v.nda, v.prof, v.appt, nullif(v.rec,'')
      from (values ${values.join(", ")}) as v(id, ps, seg, role, field, detail, nda, prof, appt, rec)
      on conflict (person_id) do update set
        partner_status = excluded.partner_status, network_segment = excluded.network_segment,
        xp_role = excluded.xp_role,
        expertise_detail = excluded.expertise_detail, nda_status = excluded.nda_status,
        profile_status = excluded.profile_status, appointment_status = excluded.appointment_status,
        recommender = excluded.recommender`);
  }

  console.log(`\n반영 완료 — ${diffs.length}명 · 신규 고객사 ${newCompanies.size}개`);
} finally {
  await end();
}
