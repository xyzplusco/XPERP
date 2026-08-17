import fs from "node:fs/promises";
import postgres from "postgres";
import { loadLocalEnv } from "./load_env.mjs";

loadLocalEnv();

const databaseUrl = process.env.SUPABASE_DB_URL;

if (!databaseUrl) {
  console.error("SUPABASE_DB_URL is required to plan product reconciliation.");
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
  const existingPeople = await sql`select id, name_ko, normalized_name from people`;
  const personByNorm = new Map(existingPeople.filter((row) => row.normalized_name).map((row) => [row.normalized_name, row.id]));

  const staffNames = Array.from(
    new Set(seed.projects.flatMap((project) => [project.pl, project.pm]).filter(isPersonNameCandidate).map((name) => clean(name).replace(/[()]/g, ""))),
  );
  const personNameSet = new Set([
    ...staffNames,
    ...seed.network.map((person) => clean(person.name)).filter(Boolean),
  ]);
  const missingStaffNames = staffNames.filter((name) => !personByNorm.has(normalize(name)));

  const companies = await sql`select id, name_ko, normalized_name, industry, representative_name, business_summary, needs, next_action from companies`;
  const companyByNorm = new Map(companies.filter((row) => row.normalized_name).map((row) => [row.normalized_name, row]));

  const validDealCompanyNames = new Set(
    seed.projects
      .filter(isValidDealCompany)
      .map((project) => project.company)
      .filter((name) => !personNameSet.has(name)),
  );
  const companyNamesFromDeals = Array.from(validDealCompanyNames);
  const enrichableCompanies = companyNamesFromDeals
    .map((name) => companyByNorm.get(normalize(name)))
    .filter(Boolean)
    .filter((company) => !company.industry || !company.representative_name || !company.business_summary || !company.needs || !company.next_action);

  const projectRows = await sql`
    select p.id, p.memo, p.primary_pl_person_id, p.candidate_pm_person_id, p.company_id, c.name_ko as company_name
    from projects p
    left join companies c on c.id = p.company_id
  `;
  const projectBySource = new Map(projectRows.filter((row) => row.memo).map((row) => [row.memo, row]));
  const projectsNeedingOwnerLink = seed.projects
    .map((project) => {
      const row = projectBySource.get(project.sourceRef);
      if (!row) return null;
      const plNorm = normalize(clean(project.pl)?.replace(/[()]/g, ""));
      const pmNorm = normalize(clean(project.pm)?.replace(/[()]/g, ""));
      return {
        sourceRef: project.sourceRef,
        company: project.company,
        needsPl: Boolean(plNorm && !row.primary_pl_person_id),
        needsPm: Boolean(pmNorm && !row.candidate_pm_person_id),
      };
    })
    .filter((row) => row && (row.needsPl || row.needsPm));

  const projectsByCompany = new Map();
  for (const project of projectRows.filter((row) => row.company_id)) {
    const rows = projectsByCompany.get(project.company_id) ?? [];
    rows.push(project);
    projectsByCompany.set(project.company_id, rows);
  }

  const companyCandidates = companies
    .filter((row) => validDealCompanyNames.has(row.name_ko))
    .map((row) => ({ id: row.id, name: row.name_ko, normalized: normalize(row.name_ko) }))
    .filter((row) => row.normalized.length >= 2)
    .sort((a, b) => b.normalized.length - a.normalized.length);

  const personCandidates = existingPeople
    .filter((row) => isPersonNameCandidate(row.name_ko))
    .map((row) => ({ id: row.id, name: row.name_ko, normalized: normalize(row.name_ko) }))
    .sort((a, b) => b.normalized.length - a.normalized.length);

  const tasks = await sql`
    select id, title, description
    from tasks
    where company_id is null and project_id is null and person_id is null and document_requirement_id is null
  `;
  const taskMatches = [];
  for (const task of tasks) {
    const body = `${task.title ?? ""} ${task.description ?? ""}`;
    const company = matchByText(body, companyCandidates);
    const person = matchByText(body, personCandidates);
    const linkedProjects = company ? projectsByCompany.get(company.id) ?? [] : [];
    const projectId = linkedProjects.length === 1 ? linkedProjects[0].id : null;
    if (!company && !person && !projectId) continue;
    taskMatches.push({
      title: task.title,
      company: company?.name ?? null,
      person: person?.name ?? null,
      projectLinked: Boolean(projectId),
    });
  }

  const requirements = await sql`
    select id, title, subject_text
    from document_requirements
    where company_id is null and project_id is null and person_id is null and event_id is null and task_id is null
  `;
  const requirementMatches = [];
  for (const requirement of requirements) {
    const body = `${requirement.title ?? ""} ${requirement.subject_text ?? ""}`;
    const company = matchByText(body, companyCandidates);
    const person = matchByText(body, personCandidates);
    const linkedProjects = company ? projectsByCompany.get(company.id) ?? [] : [];
    const projectId = linkedProjects.length === 1 ? linkedProjects[0].id : null;
    if (!company && !person && !projectId) continue;
    requirementMatches.push({
      title: requirement.title,
      company: company?.name ?? null,
      person: person?.name ?? null,
      projectLinked: Boolean(projectId),
    });
  }

  console.log(
    JSON.stringify(
      {
        dryRun: true,
        proposed: {
          staffPeopleToCreate: missingStaffNames.length,
          companiesToEnrich: enrichableCompanies.length,
          projectsToOwnerLink: projectsNeedingOwnerLink.length,
          tasksToLink: taskMatches.length,
          documentRequirementsToLink: requirementMatches.length,
        },
        samples: {
          staffPeopleToCreate: missingStaffNames.slice(0, 20),
          tasksToLink: taskMatches.slice(0, 20),
          documentRequirementsToLink: requirementMatches.slice(0, 20),
        },
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end();
}
