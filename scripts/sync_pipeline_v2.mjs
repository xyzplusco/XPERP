// 통합 파이프라인 엑셀 = 바이블. 프로젝트·고객사·주간업데이트를 맞춘다.
//
//   node scripts/sync_pipeline_v2.mjs                 미리보기 (DB 변경 없음)
//   node scripts/sync_pipeline_v2.mjs --apply         실제 반영
//   node scripts/sync_pipeline_v2.mjs --file <경로>   다른 파일로
//
// 정책: 병합 — 엑셀에 있으면 엑셀 값이 이긴다. DB 에만 있는 프로젝트는 건드리지 않는다.
// 회사가 아닌 행(이벤트 준비 항목·사람 이름·메모)은 프로젝트로 만들지 않고 목록으로 보고한다.

import { makeRunner, lit } from "./lib/db.mjs";
import { readPipeline, readRevenue } from "./lib/pipeline_source.mjs";
import { loadLocalEnv } from "./load_env.mjs";

loadLocalEnv();

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const fileIndex = args.indexOf("--file");
const FILE = fileIndex >= 0 ? args[fileIndex + 1] : "data/XP_통합파이프라인_2026.xlsx";

const { run, end } = makeRunner();
// 회사명 대조용 정규화. 법인 접두어와 공백·대소문자를 무시한다.
const norm = (v) =>
  (v ?? "")
    .replace(/\(주\)|㈜|주식회사|\(유\)|유한회사/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();

// 같은 회사인데 표기가 다른 것들. 확인된 것만 명시적으로 붙인다.
const ALIAS = new Map(Object.entries({
  "울타리usa": "울타리몰usa",
  "울타리몰usa": "울타리몰usa",
}));
const key = (v) => ALIAS.get(norm(v)) ?? norm(v);

// 회사명이 확실치 않아 사람이 확인해야 하는 것들
const NEEDS_REVIEW = new Set(["(김보경대표)", "썬데이 타이거 우즈", "100만장", "와인 굿즈"]);

function line(title) {
  console.log("\n" + "─".repeat(72) + `\n${title}\n` + "─".repeat(72));
}

try {
  const rows = await readPipeline(FILE);
  const revenue = await readRevenue(FILE);

  const projects = rows.filter((r) => r.kind === "project");
  const others = rows.filter((r) => r.kind !== "project");

  const dbProjects = await run(`
    select p.id, p.name, p.company_id, p.pipeline_stage, p.deal_status, p.service_sector,
           p.primary_pl_person_id, p.candidate_pm_person_id, c.name_ko as company
      from projects p left join companies c on c.id = p.company_id
     where p.deleted_at is null`);
  const dbCompanies = await run(`select id, name_ko from companies where deleted_at is null`);
  const dbPeople = await run(`select id, name_ko from people where deleted_at is null`);

  const companyByName = new Map(dbCompanies.map((c) => [key(c.name_ko), c]));
  const peopleByName = new Map();
  for (const p of dbPeople) {
    const key = norm(p.name_ko);
    peopleByName.set(key, peopleByName.has(key) ? null : p); // 동명이인은 null 로 두고 건너뛴다
  }
  const projectByCompany = new Map();
  for (const p of dbProjects) {
    const k = key(p.company ?? p.name);
    if (!projectByCompany.has(k)) projectByCompany.set(k, []);
    projectByCompany.get(k).push(p);
  }

  const plan = { newCompany: [], newProject: [], updateProject: [], dbOnly: [], missingPeople: new Set(), weekly: 0 };

  for (const row of projects) {
    const k = key(row.company);
    if (!companyByName.has(k)) plan.newCompany.push(row.company);

    // 같은 회사에 딜이 여러 개일 수 있다(유앤어스: BPR 협상 / 투자·매각 관리기업).
    // 서비스섹터가 같은 것을 먼저 붙이고, 없으면 남은 것 중 하나를 쓴다.
    const matches = projectByCompany.get(k) ?? [];
    let index = matches.findIndex((m) => m.service_sector === row.service_sector);
    if (index < 0) index = matches.findIndex((m) => m.pipeline_stage === row.pipeline_stage);
    if (index < 0) index = 0;
    const target = matches.splice(index, 1)[0];
    if (!target) {
      plan.newProject.push(row);
      continue;
    }
    const diff = [];
    if (target.pipeline_stage !== row.pipeline_stage) diff.push(`구간 ${target.pipeline_stage}→${row.pipeline_stage}`);
    if (target.deal_status !== row.deal_status) diff.push(`상태 ${target.deal_status}→${row.deal_status}`);
    if (target.service_sector !== row.service_sector) diff.push(`섹터 ${target.service_sector}→${row.service_sector}`);
    for (const [field, name] of [["primary_pl_person_id", row.pl], ["candidate_pm_person_id", row.pm1]]) {
      if (!name) continue;
      const person = peopleByName.get(norm(name));
      if (!person) { plan.missingPeople.add(name); continue; }
      if (target[field] !== person.id) diff.push(`${field === "primary_pl_person_id" ? "PL" : "PM"} →${name}`);
      row[`${field}__resolved`] = person.id;
    }
    if (diff.length) plan.updateProject.push({ row, target, diff });
    plan.weekly += row.weeks.length;
  }

  const excelKeys = new Set(projects.map((r) => key(r.company)));
  for (const p of dbProjects) {
    if (!excelKeys.has(key(p.company ?? p.name))) plan.dbOnly.push(p);
  }

  line("① 회사가 아닌 행 — 프로젝트로 만들지 않음");
  for (const r of others) {
    const what = { contact: "연락 메모", junk: "빈 행", person: "사람", event_item: "행사 준비 항목" }[r.kind];
    console.log(`  엑셀 ${String(r.excelRow).padStart(3)}행  ${r.company.padEnd(14)} → ${what}`);
  }

  line("② 신규 고객사");
  console.log(plan.newCompany.length ? "  " + plan.newCompany.join(", ") : "  없음");

  line("③ 신규 프로젝트");
  for (const r of plan.newProject) {
    console.log(`  ${r.company.padEnd(16)} ${r.pipeline_stage}/${r.deal_status}/${r.service_sector}  PL=${r.pl ?? "–"}`);
  }
  if (!plan.newProject.length) console.log("  없음");

  line("④ 값이 달라 고칠 프로젝트");
  for (const u of plan.updateProject) console.log(`  ${u.row.company.padEnd(16)} ${u.diff.join(" · ")}`);
  if (!plan.updateProject.length) console.log("  없음");

  line("⑤ DB 에만 있는 프로젝트 — 그대로 둠");
  for (const p of plan.dbOnly) console.log(`  ${(p.company ?? p.name)}  (${p.pipeline_stage}/${p.deal_status})`);
  if (!plan.dbOnly.length) console.log("  없음");

  line("⑥ 파트너 명부에 없는 담당자 이름");
  console.log(plan.missingPeople.size ? "  " + [...plan.missingPeople].join(", ") : "  없음");

  line("⑦ 회사명 확인 필요");
  const review = projects.filter((r) => NEEDS_REVIEW.has(r.company));
  for (const r of review) console.log(`  ${r.company.padEnd(18)} ${r.pipeline_stage}/${r.deal_status}  대표=${r.representative || "–"}`);
  if (!review.length) console.log("  없음");

  line("⑧ 주간 업데이트 / 매출");
  console.log(`  주차 기록 ${plan.weekly}건 · 매출현황 ${revenue.length}개사`);

  line("요약");
  console.log(`  엑셀 ${rows.length}행 = 프로젝트 ${projects.length} + 비프로젝트 ${others.length}`);
  console.log(`  신규 고객사 ${plan.newCompany.length} · 신규 프로젝트 ${plan.newProject.length} · 수정 ${plan.updateProject.length} · DB전용 ${plan.dbOnly.length}`);

  if (!APPLY) {
    console.log("\n미리보기입니다. 실제로 반영하려면 --apply 를 붙이세요.");
  } else {
    line("반영 중");

    // ── 1. 신규 고객사 (한 번에)
    if (plan.newCompany.length) {
      await run(`insert into companies (name_ko) values ${plan.newCompany.map((n) => `(${lit(n)})`).join(", ")}`);
    }
    const freshCompanies = await run(`select id, name_ko from companies where deleted_at is null`);
    const companyId = new Map(freshCompanies.map((c) => [key(c.name_ko), c.id]));
    console.log(`  고객사 신규 ${plan.newCompany.length}건`);

    const personId = (name) => {
      if (!name) return null;
      const person = peopleByName.get(norm(name));
      return person ? person.id : null;
    };

    // ── 2. 신규 프로젝트 (한 번에)
    if (plan.newProject.length) {
      const values = plan.newProject.map((row) => {
        const cid = companyId.get(key(row.company));
        const memo = NEEDS_REVIEW.has(row.company) ? "회사명 확인 필요 (파이프라인 원본 그대로 옮김)" : null;
        return `(${lit(row.company)}, ${cid ? lit(cid) : "null"}, ${lit(row.pipeline_stage)}, ${lit(row.deal_status)}, ${lit(row.service_sector)}, ${personId(row.pl) ? lit(personId(row.pl)) : "null"}, ${personId(row.pm1) ? lit(personId(row.pm1)) : "null"}, ${lit(row.client_need)}, ${lit(row.xp_request)}, ${lit(memo)})`;
      });
      await run(`insert into projects (name, company_id, pipeline_stage, deal_status, service_sector,
                 primary_pl_person_id, candidate_pm_person_id, client_need, xp_request, memo)
                 values ${values.join(", ")}`);
    }
    console.log(`  프로젝트 신규 ${plan.newProject.length}건`);

    // ── 3. 기존 프로젝트 갱신 (엑셀이 이긴다) — 한 문장으로
    if (plan.updateProject.length) {
      const values = plan.updateProject.map((u) =>
        `(${lit(u.target.id)}::uuid, ${lit(u.row.pipeline_stage)}, ${lit(u.row.deal_status)}, ${lit(u.row.service_sector)}, ` +
        `${personId(u.row.pl) ? lit(personId(u.row.pl)) : "null"}::uuid, ${personId(u.row.pm1) ? lit(personId(u.row.pm1)) : "null"}::uuid, ` +
        `${lit(u.row.client_need)}, ${lit(u.row.xp_request)})`
      );
      await run(`
        update projects p set
          pipeline_stage = v.stage,
          deal_status = v.status,
          service_sector = v.sector,
          primary_pl_person_id = coalesce(v.pl, p.primary_pl_person_id),
          candidate_pm_person_id = coalesce(v.pm, p.candidate_pm_person_id),
          client_need = coalesce(nullif(v.need, ''), p.client_need),
          xp_request = coalesce(nullif(v.req, ''), p.xp_request)
        from (values ${values.join(", ")}) as v(id, stage, status, sector, pl, pm, need, req)
        where p.id = v.id`);
    }
    console.log(`  프로젝트 갱신 ${plan.updateProject.length}건`);

    // ── 4. 대표자 (고객사) — 한 문장으로
    const reps = projects
      .filter((r) => r.representative && companyId.get(key(r.company)))
      .map((r) => `(${lit(companyId.get(key(r.company)))}::uuid, ${lit(r.representative)})`);
    if (reps.length) {
      await run(`
        update companies c set representative_name = v.rep
        from (values ${reps.join(", ")}) as v(id, rep)
        where c.id = v.id and coalesce(c.representative_name, '') = ''`);
    }
    console.log(`  대표자 반영 ${reps.length}건`);

    // ── 5. 주간 업데이트 (프로젝트 × 주차 유니크라 upsert)
    const idByCompany = new Map();
    for (const p of await run(`select p.id, coalesce(c.name_ko, p.name) as company, p.service_sector
                                 from projects p left join companies c on c.id = p.company_id
                                where p.deleted_at is null`)) {
      const k = key(p.company);
      if (!idByCompany.has(k)) idByCompany.set(k, []);
      idByCompany.get(k).push(p);
    }
    // 엑셀 헤더에 '7월2차' 가 두 번 있다. 같은 (프로젝트, 주차) 는 마지막 값만 남긴다.
    const weekMap = new Map();
    for (const row of projects) {
      const candidates = idByCompany.get(key(row.company)) ?? [];
      const hit = candidates.find((c) => c.service_sector === row.service_sector) ?? candidates[0];
      if (!hit) continue;
      for (const w of row.weeks) {
        const month = Number(w.label.match(/^(\d{1,2})월/)[1]);
        const nth = Number(w.label.match(/([1-4])차$/)[1]);
        const day = [1, 8, 15, 22][nth - 1];
        const date = `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        weekMap.set(`${hit.id}|${w.label}`, { id: hit.id, label: w.label, date, body: w.body });
      }
    }
    const batch = [...weekMap.values()].map(
      (w) => `(${lit(w.id)}, ${lit(w.label)}, ${lit(w.date)}, ${lit(w.body)})`
    );
    const weekCount = batch.length;
    for (let i = 0; i < batch.length; i += 200) {
      const chunk = batch.slice(i, i + 200);
      await run(`
        insert into project_weekly_updates (project_id, update_label, update_date, body)
        values ${chunk.join(", ")}
        on conflict (project_id, update_label) do update set body = excluded.body, update_date = excluded.update_date`);
    }
    console.log(`  주간 업데이트 ${weekCount}건`);

    // ── 6. 예상 매출
    const revValues = revenue
      .map((r) => ({ r, hit: (idByCompany.get(key(r.company)) ?? [])[0] }))
      .filter((x) => x.hit)
      .map((x) => `(${lit(x.hit.id)}::uuid, ${x.r.total}::numeric)`);
    if (revValues.length) {
      await run(`update projects p set expected_revenue = v.amount
                 from (values ${revValues.join(", ")}) as v(id, amount) where p.id = v.id`);
    }
    console.log(`  예상 매출 ${revValues.length}건`);

    // ── 7. latest_update 재계산
    await run(`
      update projects p
      set latest_update = w.body
      from (
        select distinct on (project_id) project_id, body
          from project_weekly_updates
         order by project_id, update_date desc nulls last
      ) w
      where w.project_id = p.id`);

    console.log("\n완료.");
  }
} finally {
  await end();
}
