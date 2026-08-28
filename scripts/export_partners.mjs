// 파트너 명부를 엑셀로 내보낸다. 이 파일을 편집해 apply_partner_sheet.mjs 로 되돌린다.
//   node scripts/export_partners.mjs [--out <경로>]
//
// 첫 열의 ID 는 왕복 대조용이다. 지우면 동명이인이 뒤바뀔 수 있으니 남겨 둘 것.

import ExcelJS from "exceljs";
import { makeRunner } from "./lib/db.mjs";
import { loadLocalEnv } from "./load_env.mjs";

loadLocalEnv();

const args = process.argv.slice(2);
const oi = args.indexOf("--out");
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const OUT = oi >= 0 ? args[oi + 1] : `XP_파트너명부_${stamp}.xlsx`;

const SEG = {
  xp_internal: "XP 내부", consulting_partner: "컨설팅 파트너",
  investment_finance_partner: "투자/재무 파트너", lp_investor: "LP/투자자",
  external_expert: "외부 전문가", vendor_advisor: "협력사",
  customer_contact: "고객사 담당자", event_invitee: "행사 참석자", unknown: "미분류",
};
const doc = (v) => (v === "O" || v === "Y" ? "완료" : v === "X" ? "미비" : "미확인");

const COLS = [
  ["ID", "id", 10], ["이름", "name_ko", 13], ["영문명", "name_en", 14],
  ["구분", "partner_status", 12], ["네트워크 분류", "network_segment", 15],
  ["소속", "company", 20], ["직함", "title", 14], ["XP 역할", "xp_role", 12],
  ["이메일", "email", 26], ["연락처", "phone", 15], ["지역", "region", 10],
  ["전문 분야", "expertise_detail", 34],
  ["NDA", "nda_status", 8], ["프로필", "profile_status", 8], ["위촉", "appointment_status", 8],
  ["추천인", "recommender", 12], ["참여 프로젝트", "project_count", 12], ["역할", "roles", 9],
  ["출처", "source", 22], ["메모", "memo", 30], ["등록일", "created", 11],
];

const { run, end } = makeRunner();

try {
  const rows = await run(`
    select p.id::text, p.name_ko, coalesce(p.name_en,'') name_en,
      coalesce(np.partner_status,'미분류') partner_status,
      coalesce(np.network_segment,'unknown') network_segment,
      coalesce(c.name_ko,'') company, coalesce(p.title,'') title, coalesce(np.xp_role,'') xp_role,
      coalesce(p.email,'') email, coalesce(p.phone,'') phone, coalesce(p.region,'') region,
      coalesce(np.expertise_detail,'') expertise_detail,
      coalesce(np.nda_status,'') nda_status, coalesce(np.profile_status,'') profile_status,
      coalesce(np.appointment_status,'') appointment_status, coalesce(np.recommender,'') recommender,
      coalesce(p.source,'') source, coalesce(p.memo,'') memo,
      to_char(p.created_at,'YYYY-MM-DD') created,
      coalesce(pj.cnt,0) project_count, coalesce(pj.roles,'') roles
    from people p
    left join network_profiles np on np.person_id = p.id
    left join companies c on c.id = p.primary_company_id
    left join (
      select person_id, count(distinct project_id) cnt, string_agg(distinct role,'·') roles
      from (
        select x.person_id, pr.id project_id, x.role from projects pr
        cross join lateral (values (pr.primary_pl_person_id,'PL'),(pr.secondary_pl_person_id,'PL'),(pr.candidate_pm_person_id,'PM')) x(person_id, role)
        where pr.deleted_at is null and x.person_id is not null
      ) t group by person_id
    ) pj on pj.person_id = p.id
    where p.deleted_at is null
    order by
      case coalesce(np.partner_status,'zz')
        when '임원' then '1' when '직원' then '2' when '파트너' then '3'
        when '파트너 후보' then '4' when '협력사' then '5' else '9' end,
      p.name_ko, p.id`);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("파트너 명부");

  ws.mergeCells(1, 1, 1, COLS.length);
  const title = ws.getCell(1, 1);
  title.value = `XP 파트너 명부 — ${rows.length}명 · 추출 ${new Date().toISOString().slice(0, 10)}`;
  title.font = { name: "Arial", size: 13, bold: true };

  COLS.forEach(([label, , width], i) => {
    const cell = ws.getCell(2, i + 1);
    cell.value = label;
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A3C2C" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    ws.getColumn(i + 1).width = width;
  });
  ws.getRow(2).height = 22;

  rows.forEach((row, r) => {
    COLS.forEach(([, key], i) => {
      let v = row[key] ?? "";
      if (key === "network_segment") v = SEG[v] ?? v;
      if (["nda_status", "profile_status", "appointment_status"].includes(key)) v = doc(v);
      if (key === "id") v = String(v).slice(0, 8);
      const cell = ws.getCell(r + 3, i + 1);
      cell.value = v;
      cell.font = { name: "Arial", size: 10 };
      cell.alignment = { vertical: "top", wrapText: ["expertise_detail", "memo"].includes(key) };
    });
  });

  ws.views = [{ state: "frozen", ySplit: 2 }];
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: rows.length + 2, column: COLS.length } };

  await wb.xlsx.writeFile(OUT);
  console.log(`${OUT} — ${rows.length}명`);
} finally {
  await end();
}
