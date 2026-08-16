import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { loadLocalEnv } from "./load_env.mjs";

loadLocalEnv();
const databaseUrl = process.env.SUPABASE_DB_URL;

if (!databaseUrl) {
  console.error("SUPABASE_DB_URL is required to import seed data.");
  process.exit(1);
}

if (databaseUrl.includes("[YOUR-PASSWORD]")) {
  console.error("SUPABASE_DB_URL still contains [YOUR-PASSWORD]. Replace it with the real Supabase database password.");
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
const normalize = (value) => (value ? String(value).toLowerCase().replace(/\s+/g, "") : null);

const projectTypeMap = {
  "Re-engineering": "reengineering",
  "Investment / M&A": "investment",
  "Business building": "business_building",
  "Go Global": "go_global",
  Consulting: "consulting",
  Review: "unknown",
};

const segmentMap = {
  "XP internal": "xp_internal",
  "Partner network": "consulting_partner",
  "Vendor advisor": "vendor_advisor",
  "LP / investor": "lp_investor",
  "External expert": "external_expert",
  "Consulting partner": "consulting_partner",
  Unclassified: "unknown",
};

const requirementStatusMap = {
  Needed: "needed",
  Review: "needed",
  Mixed: "requested",
  "Needs audit": "needed",
};

const taskStatusMap = {
  Backlog: "backlog",
  Review: "backlog",
  Waiting: "waiting",
  "In progress": "in_progress",
};

async function getImportSource(tx) {
  const existing = await tx`
    select id from import_sources
    where source_name = 'operational_seed_preview'
      and file_name = 'data/processed/operational_seed_preview.json'
    limit 1
  `;
  if (existing.length > 0) return existing[0].id;

  const inserted = await tx`
    insert into import_sources (source_name, file_name, row_count, memo, imported_at)
    values (
      'operational_seed_preview',
      'data/processed/operational_seed_preview.json',
      ${seed.summary.people + seed.summary.projects + seed.summary.tasks + seed.summary.documentRequirements},
      'Generated from XP source workbooks',
      now()
    )
    returning id
  `;
  return inserted[0].id;
}

function uniqueValues(values) {
  return Array.from(new Set(values.map(clean).filter(Boolean)));
}

try {
  await sql.begin(async (tx) => {
    const importSourceId = await getImportSource(tx);

    console.log("prepare companies");
    const companyNames = uniqueValues([
      ...seed.network.map((row) => row.company),
      ...seed.projects.map((row) => row.company),
    ]);
    const existingCompanies = await tx`select id, normalized_name from companies where normalized_name is not null`;
    const companyByNorm = new Map(existingCompanies.map((row) => [row.normalized_name, row.id]));
    const companiesToInsert = [];

    for (const name of companyNames) {
      const normalized = normalize(name);
      if (!normalized || companyByNorm.has(normalized)) continue;
      const id = randomUUID();
      companyByNorm.set(normalized, id);
      companiesToInsert.push({
        id,
        name_ko: name,
        normalized_name: normalized,
      });
    }

    if (companiesToInsert.length > 0) {
      await tx`
        insert into companies ${tx(companiesToInsert, "id", "name_ko", "normalized_name")}
      `;
    }

    const companyId = (name) => {
      const normalized = normalize(name);
      return normalized ? companyByNorm.get(normalized) ?? null : null;
    };

    console.log(`inserted companies: ${companiesToInsert.length}`);

    console.log("prepare people");
    const existingPeople = await tx`select id, normalized_name, email from people`;
    const personByNorm = new Map(existingPeople.filter((row) => row.normalized_name).map((row) => [row.normalized_name, row.id]));
    const personByEmail = new Map(existingPeople.filter((row) => row.email).map((row) => [row.email, row.id]));
    const peopleToInsert = [];
    const linkRows = [];
    const profileRows = [];

    for (const row of seed.network) {
      const name = clean(row.name);
      if (!name) continue;
      const normalized = normalize(name);
      const email = clean(row.email);
      let id = email ? personByEmail.get(email) : null;
      id = id ?? (normalized ? personByNorm.get(normalized) : null);

      if (!id) {
        id = randomUUID();
        if (normalized) personByNorm.set(normalized, id);
        if (email) personByEmail.set(email, id);
        peopleToInsert.push({
          id,
          name_ko: name,
          normalized_name: normalized,
          email,
          phone: clean(row.phone),
          primary_company_id: companyId(row.company),
          title: clean(row.role),
          source: clean(row.sourceRef),
          memo: clean(row.expertise),
        });
      }

      const linkedCompanyId = companyId(row.company);
      if (linkedCompanyId) {
        linkRows.push({
          person_id: id,
          company_id: linkedCompanyId,
          relationship_type: "affiliation",
          title: clean(row.role),
          is_primary: true,
        });
      }

      profileRows.push({
        person_id: id,
        network_segment: segmentMap[row.segment] ?? "unknown",
        partner_status: clean(row.category),
        xp_role: clean(row.role),
        core_field: clean(row.category),
        expertise_detail: clean(row.expertise),
        recommender: clean(row.recommender),
        nda_status: clean(row.ndaStatus),
        profile_status: clean(row.profileStatus),
        appointment_status: clean(row.appointmentStatus),
        agreement_status: clean(row.appointmentStatus),
        memo: clean(row.sourceRef),
      });
    }

    if (peopleToInsert.length > 0) {
      await tx`
        insert into people ${tx(
          peopleToInsert,
          "id",
          "name_ko",
          "normalized_name",
          "email",
          "phone",
          "primary_company_id",
          "title",
          "source",
          "memo",
        )}
      `;
    }

    if (linkRows.length > 0) {
      await tx`
        insert into person_company_links ${tx(
          linkRows,
          "person_id",
          "company_id",
          "relationship_type",
          "title",
          "is_primary",
        )}
        on conflict do nothing
      `;
    }

    if (profileRows.length > 0) {
      await tx`
        insert into network_profiles ${tx(
          profileRows,
          "person_id",
          "network_segment",
          "partner_status",
          "xp_role",
          "core_field",
          "expertise_detail",
          "recommender",
          "nda_status",
          "profile_status",
          "appointment_status",
          "agreement_status",
          "memo",
        )}
        on conflict (person_id) do update set
          network_segment = excluded.network_segment,
          partner_status = excluded.partner_status,
          xp_role = excluded.xp_role,
          core_field = excluded.core_field,
          expertise_detail = excluded.expertise_detail,
          recommender = excluded.recommender,
          nda_status = excluded.nda_status,
          profile_status = excluded.profile_status,
          appointment_status = excluded.appointment_status,
          agreement_status = excluded.agreement_status,
          memo = excluded.memo
      `;
    }

    console.log(`inserted people: ${peopleToInsert.length}`);

    const personIdByName = (name) => {
      const normalized = normalize(name);
      return normalized ? personByNorm.get(normalized) ?? null : null;
    };

    console.log("prepare projects");
    const existingProjects = await tx`select id, memo from projects where memo is not null`;
    const projectBySource = new Map(existingProjects.map((row) => [row.memo, row.id]));
    const projectsToInsert = [];
    const memberRows = [];
    const updateRows = [];

    for (const row of seed.projects) {
      if (projectBySource.has(row.sourceRef)) continue;
      const id = randomUUID();
      projectBySource.set(row.sourceRef, id);
      const plId = personIdByName(row.pl);
      const pmId = personIdByName(row.pm);

      projectsToInsert.push({
        id,
        name: clean(row.company) ?? "미지정 프로젝트",
        project_type: projectTypeMap[row.projectType] ?? "unknown",
        status: "discussing",
        company_id: companyId(row.company),
        summary: clean(row.business),
        client_need: clean(row.clientNeed),
        xp_request: clean(row.xpRequest),
        contract_status: clean(row.contractStatus),
        primary_pl_person_id: plId,
        candidate_pm_person_id: pmId,
        latest_update: clean(row.latestUpdate),
        next_action: clean(row.nextAction),
        memo: clean(row.sourceRef),
      });

      if (plId) memberRows.push({ project_id: id, person_id: plId, project_role: "pl" });
      if (pmId) memberRows.push({ project_id: id, person_id: pmId, project_role: "pm" });
      if (row.latestUpdate) updateRows.push({ project_id: id, update_label: "source_latest", body: row.latestUpdate });
    }

    if (projectsToInsert.length > 0) {
      await tx`
        insert into projects ${tx(
          projectsToInsert,
          "id",
          "name",
          "project_type",
          "status",
          "company_id",
          "summary",
          "client_need",
          "xp_request",
          "contract_status",
          "primary_pl_person_id",
          "candidate_pm_person_id",
          "latest_update",
          "next_action",
          "memo",
        )}
      `;
    }

    if (memberRows.length > 0) {
      await tx`
        insert into project_members ${tx(memberRows, "project_id", "person_id", "project_role")}
        on conflict do nothing
      `;
    }

    if (updateRows.length > 0) {
      await tx`
        insert into project_weekly_updates ${tx(updateRows, "project_id", "update_label", "body")}
      `;
    }

    console.log(`inserted projects: ${projectsToInsert.length}`);

    console.log("prepare events/tasks");
    const existingEvents = await tx`select id, memo from events where memo is not null`;
    const eventBySource = new Map(existingEvents.map((row) => [row.memo, row.id]));
    const existingTasks = await tx`select title, description from tasks`;
    const taskKeys = new Set(existingTasks.map((row) => `${row.title}__${row.description ?? ""}`));
    const eventRows = [];
    const taskRows = [];

    for (const row of seed.tasks) {
      let eventId = null;
      if (row.linkedArea === "Events") {
        eventId = eventBySource.get(row.sourceRef);
        if (!eventId) {
          eventId = randomUUID();
          eventBySource.set(row.sourceRef, eventId);
          eventRows.push({
            id: eventId,
            name: clean(row.title) ?? "이벤트 검토",
            event_type: "source_task",
            status: "planning",
            description: clean(row.body),
            next_action: clean(row.body),
            memo: clean(row.sourceRef),
          });
        }
      }

      const taskKey = `${clean(row.title) ?? ""}__${clean(row.body) ?? ""}`;
      if (!taskKeys.has(taskKey)) {
        taskKeys.add(taskKey);
        taskRows.push({
          title: clean(row.title) ?? "액션 검토",
          description: clean(row.body),
          status: taskStatusMap[row.status] ?? "backlog",
          priority: "normal",
          event_id: eventId,
        });
      }
    }

    if (eventRows.length > 0) {
      await tx`
        insert into events ${tx(
          eventRows,
          "id",
          "name",
          "event_type",
          "status",
          "description",
          "next_action",
          "memo",
        )}
      `;
    }

    if (taskRows.length > 0) {
      await tx`
        insert into tasks ${tx(taskRows, "title", "description", "status", "priority", "event_id")}
      `;
    }

    console.log(`inserted tasks: ${taskRows.length}`);

    console.log("prepare document requirements");
    const existingRequirements = await tx`select title, memo from document_requirements`;
    const requirementKeys = new Set(existingRequirements.map((row) => `${row.title}__${row.memo ?? ""}`));
    const requirementRows = [];

    for (const row of seed.documentRequirements) {
      const title = `${row.subject} - ${row.type}`;
      const key = `${title}__${clean(row.sourceRef) ?? ""}`;
      if (requirementKeys.has(key)) continue;
      requirementKeys.add(key);
      requirementRows.push({
        requirement_type: clean(row.type) ?? "문서",
        title,
        subject_text: clean(row.subject),
        status: requirementStatusMap[row.status] ?? "needed",
        person_id: personIdByName(row.subject),
        memo: clean(row.sourceRef),
      });
    }

    if (requirementRows.length > 0) {
      await tx`
        insert into document_requirements ${tx(
          requirementRows,
          "requirement_type",
          "title",
          "subject_text",
          "status",
          "person_id",
          "memo",
        )}
      `;
    }

    console.log(`inserted document requirements: ${requirementRows.length}`);

    const existingImportRecord = await tx`
      select id from import_records
      where import_source_id = ${importSourceId}
        and source_key = 'operational_seed_preview'
      limit 1
    `;

    if (existingImportRecord.length === 0) {
      await tx`
        insert into import_records (
          import_source_id,
          source_row_number,
          source_key,
          raw_text,
          raw_json,
          mapped_entity_type,
          reconciliation_status
        )
        values (
          ${importSourceId},
          1,
          'operational_seed_preview',
          'Imported generated operational seed preview',
          ${tx.json(seed.summary)},
          'seed_batch',
          'created'
        )
      `;
    }
  });

  console.log(
    JSON.stringify({
      imported: true,
      people: seed.summary.people,
      projects: seed.summary.projects,
      tasks: seed.summary.tasks,
      documentRequirements: seed.summary.documentRequirements,
    }),
  );
} finally {
  await sql.end();
}

