import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { loadLocalEnv } from "./load_env.mjs";

loadLocalEnv();

const databaseUrl = process.env.SUPABASE_DB_URL;

if (!databaseUrl) {
  console.error("SUPABASE_DB_URL is required to reconcile the product database.");
  process.exit(1);
}

const seed = JSON.parse(
  await fs.readFile(new URL("../data/processed/operational_seed_preview.json", import.meta.url), "utf8"),
);

const sql = postgres(databaseUrl, {
  max: 1,
  ssl: "require",
  prepare: false,
});

const clean = (value) => (value && String(value).trim() ? String(value).trim() : null);
const normalize = (value) => (value ? String(value).toLowerCase().replace(/\s+/g, "") : "");
const compactJoin = (values) => Array.from(new Set(values.map(clean).filter(Boolean))).join("\n");

function isPlaceholderCompany(name) {
  return !name || name === "회사명";
}

function isValidDealCompany(project) {
  if (isPlaceholderCompany(project.company)) return false;
  if (["대표", "담당", "고객사", "회사"].includes(project.company)) return false;
  if (isPersonNameCandidate(project.company) && !clean(project.business) && !clean(project.clientNeed) && !clean(project.xpRequest)) {
    return false;
  }
  return true;
}

function isPersonNameCandidate(name) {
  const value = clean(name)?.replace(/[()]/g, "");
  if (!value) return false;
  if (["정", "코디", "미정", "확인"].includes(value)) return false;
  return /^[가-힣]{2,4}$/.test(value) || /^[A-Za-z][A-Za-z\s.'-]{2,}$/.test(value);
}

function matchByText(text, candidates) {
  const haystack = normalize(text);
  if (!haystack) return null;
  return candidates.find((candidate) => candidate.normalized.length >= 2 && haystack.includes(candidate.normalized)) ?? null;
}

try {
  const result = await sql.begin(async (tx) => {
    const counters = {
      staffPeopleInserted: 0,
      companyProfilesUpdated: 0,
      projectsUpdated: 0,
      tasksLinked: 0,
      documentRequirementsLinked: 0,
    };

    const existingPeople = await tx`select id, normalized_name from people`;
    const personByNorm = new Map(existingPeople.filter((row) => row.normalized_name).map((row) => [row.normalized_name, row.id]));

    const staffNames = Array.from(
      new Set(seed.projects.flatMap((project) => [project.pl, project.pm]).filter(isPersonNameCandidate).map((name) => clean(name).replace(/[()]/g, ""))),
    );
    const personNameSet = new Set([
      ...staffNames,
      ...seed.network.map((person) => clean(person.name)).filter(Boolean),
    ]);

    const staffRows = [];
    const staffProfileRows = [];
    for (const name of staffNames) {
      const normalized = normalize(name);
      if (!normalized || personByNorm.has(normalized)) continue;
      const id = randomUUID();
      personByNorm.set(normalized, id);
      staffRows.push({
        id,
        name_ko: name,
        normalized_name: normalized,
        title: "XP 프로젝트 담당",
        source: "reconcile_product_db",
      });
      staffProfileRows.push({
        person_id: id,
        network_segment: "xp_internal",
        partner_status: "XP internal",
        xp_role: "XP 프로젝트 담당",
        memo: "Created from Deal list PL/PM reconciliation",
      });
    }

    if (staffRows.length > 0) {
      await tx`
        insert into people ${tx(staffRows, "id", "name_ko", "normalized_name", "title", "source")}
      `;
      await tx`
        insert into network_profiles ${tx(staffProfileRows, "person_id", "network_segment", "partner_status", "xp_role", "memo")}
        on conflict (person_id) do nothing
      `;
      counters.staffPeopleInserted = staffRows.length;
    }

    const companies = await tx`select id, name_ko, normalized_name from companies`;
    const companyByNorm = new Map(companies.filter((row) => row.normalized_name).map((row) => [row.normalized_name, row]));

    const companySeed = new Map();
    const validDealCompanyNames = new Set(
      seed.projects
        .filter(isValidDealCompany)
        .map((project) => project.company)
        .filter((name) => !personNameSet.has(name)),
    );

    for (const project of seed.projects) {
      if (!isValidDealCompany(project)) continue;
      const normalized = normalize(project.company);
      const current = companySeed.get(normalized) ?? {
        representatives: [],
        industries: [],
        needs: [],
        requests: [],
        updates: [],
        nextActions: [],
        sources: [],
      };
      current.representatives.push(project.representative);
      current.industries.push(project.business);
      current.needs.push(project.clientNeed);
      current.requests.push(project.xpRequest);
      current.updates.push(project.latestUpdate);
      current.nextActions.push(project.nextAction);
      current.sources.push(project.sourceRef);
      companySeed.set(normalized, current);
    }

    for (const [normalized, data] of companySeed.entries()) {
      const company = companyByNorm.get(normalized);
      if (!company) continue;
      const representative = clean(data.representatives.find(clean));
      const industry = clean(data.industries.find(clean));
      const needs = compactJoin([...data.needs, ...data.requests]);
      const nextAction = clean(data.nextActions.find(clean) ?? data.updates.find(clean));
      const memo = compactJoin(data.sources).slice(0, 4000);

      await tx`
        update companies
        set
          representative_name = coalesce(nullif(representative_name, ''), ${representative}),
          industry = coalesce(nullif(industry, ''), ${industry}),
          business_summary = coalesce(nullif(business_summary, ''), ${industry}),
          needs = coalesce(nullif(needs, ''), ${needs}),
          next_action = coalesce(${nextAction}, next_action),
          memo = coalesce(nullif(memo, ''), ${memo}),
          updated_at = now()
        where id = ${company.id}
      `;
      counters.companyProfilesUpdated += 1;
    }

    const personIdByName = (name) => {
      const normalized = normalize(clean(name)?.replace(/[()]/g, ""));
      return normalized ? personByNorm.get(normalized) ?? null : null;
    };

    for (const project of seed.projects) {
      if (!project.sourceRef) continue;
      const plId = personIdByName(project.pl);
      const pmId = personIdByName(project.pm);

      const updated = await tx`
        update projects
        set
          primary_pl_person_id = coalesce(primary_pl_person_id, ${plId}),
          candidate_pm_person_id = coalesce(candidate_pm_person_id, ${pmId}),
          latest_update = coalesce(nullif(latest_update, ''), ${clean(project.latestUpdate)}),
          next_action = coalesce(nullif(next_action, ''), ${clean(project.nextAction)}),
          updated_at = now()
        where memo = ${project.sourceRef}
        returning id
      `;
      counters.projectsUpdated += updated.length;

      if (updated.length > 0 && plId) {
        await tx`
          insert into project_members (project_id, person_id, project_role)
          values (${updated[0].id}, ${plId}, 'pl')
          on conflict do nothing
        `;
      }
      if (updated.length > 0 && pmId) {
        await tx`
          insert into project_members (project_id, person_id, project_role)
          values (${updated[0].id}, ${pmId}, 'pm')
          on conflict do nothing
        `;
      }
    }

    const projectRows = await tx`
      select p.id, p.company_id, c.name_ko as company_name
      from projects p
      left join companies c on c.id = p.company_id
      where p.company_id is not null
    `;
    const projectsByCompany = new Map();
    for (const project of projectRows) {
      const rows = projectsByCompany.get(project.company_id) ?? [];
      rows.push(project);
      projectsByCompany.set(project.company_id, rows);
    }

    const companyCandidates = companies
      .filter((row) => validDealCompanyNames.has(row.name_ko))
      .map((row) => ({ id: row.id, name: row.name_ko, normalized: normalize(row.name_ko) }))
      .filter((row) => row.normalized.length >= 2)
      .sort((a, b) => b.normalized.length - a.normalized.length);

    const people = await tx`select id, name_ko from people`;
    const personCandidates = people
      .filter((row) => isPersonNameCandidate(row.name_ko))
      .map((row) => ({ id: row.id, name: row.name_ko, normalized: normalize(row.name_ko) }))
      .sort((a, b) => b.normalized.length - a.normalized.length);

    const tasks = await tx`
      select id, title, description
      from tasks
      where company_id is null and project_id is null and person_id is null and document_requirement_id is null
    `;

    for (const task of tasks) {
      const body = `${task.title ?? ""} ${task.description ?? ""}`;
      const company = matchByText(body, companyCandidates);
      const person = matchByText(body, personCandidates);
      const linkedProjects = company ? projectsByCompany.get(company.id) ?? [] : [];
      const projectId = linkedProjects.length === 1 ? linkedProjects[0].id : null;

      if (!company && !person && !projectId) continue;

      await tx`
        update tasks
        set
          company_id = coalesce(company_id, ${company?.id ?? null}),
          project_id = coalesce(project_id, ${projectId}),
          person_id = coalesce(person_id, ${person?.id ?? null}),
          updated_at = now()
        where id = ${task.id}
      `;
      counters.tasksLinked += 1;
    }

    const requirements = await tx`
      select id, title, subject_text
      from document_requirements
      where company_id is null and project_id is null and person_id is null and event_id is null and task_id is null
    `;

    for (const requirement of requirements) {
      const body = `${requirement.title ?? ""} ${requirement.subject_text ?? ""}`;
      const company = matchByText(body, companyCandidates);
      const person = matchByText(body, personCandidates);
      const linkedProjects = company ? projectsByCompany.get(company.id) ?? [] : [];
      const projectId = linkedProjects.length === 1 ? linkedProjects[0].id : null;

      if (!company && !person && !projectId) continue;

      await tx`
        update document_requirements
        set
          company_id = coalesce(company_id, ${company?.id ?? null}),
          project_id = coalesce(project_id, ${projectId}),
          person_id = coalesce(person_id, ${person?.id ?? null}),
          updated_at = now()
        where id = ${requirement.id}
      `;
      counters.documentRequirementsLinked += 1;
    }

    return counters;
  });

  console.log(JSON.stringify(result, null, 2));
} finally {
  await sql.end();
}
