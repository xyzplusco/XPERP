import fs from "node:fs/promises";
import postgres from "postgres";

const databaseUrl = process.env.SUPABASE_DB_URL;

if (!databaseUrl) {
  console.error("SUPABASE_DB_URL is required to import seed data.");
  process.exit(1);
}

const seed = JSON.parse(
  await fs.readFile(new URL("../data/processed/operational_seed_preview.json", import.meta.url), "utf8"),
);

const sql = postgres(databaseUrl, {
  max: 1,
  ssl: "require",
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

async function getOrCreateCompany(tx, name) {
  const companyName = clean(name);
  if (!companyName) return null;

  const normalized = normalize(companyName);
  const found = await tx`select id from companies where normalized_name = ${normalized} limit 1`;
  if (found.length > 0) return found[0].id;

  const inserted = await tx`
    insert into companies (name_ko, normalized_name)
    values (${companyName}, ${normalized})
    returning id
  `;
  return inserted[0].id;
}

async function getOrCreatePerson(tx, row, companyId) {
  const name = clean(row.name);
  if (!name) return null;

  const normalized = normalize(name);
  const email = clean(row.email);
  const found = email
    ? await tx`select id from people where email = ${email} limit 1`
    : await tx`select id from people where normalized_name = ${normalized} limit 1`;
  if (found.length > 0) return found[0].id;

  const inserted = await tx`
    insert into people (
      name_ko,
      normalized_name,
      email,
      phone,
      primary_company_id,
      title,
      source,
      memo
    )
    values (
      ${name},
      ${normalized},
      ${email},
      ${clean(row.phone)},
      ${companyId},
      ${clean(row.role)},
      ${clean(row.sourceRef)},
      ${clean(row.expertise)}
    )
    returning id
  `;
  return inserted[0].id;
}

async function getPersonByName(tx, name) {
  const normalized = normalize(name);
  if (!normalized) return null;
  const found = await tx`select id from people where normalized_name = ${normalized} limit 1`;
  return found[0]?.id ?? null;
}

try {
  await sql.begin(async (tx) => {
    await tx`delete from activity_logs`;
    await tx`delete from entity_documents`;
    await tx`update document_requirements set task_id = null, current_document_id = null`;
    await tx`update tasks set document_requirement_id = null`;
    await tx`delete from document_requirements`;
    await tx`delete from tasks`;
    await tx`delete from event_invitees`;
    await tx`delete from events`;
    await tx`delete from project_weekly_updates`;
    await tx`delete from project_members`;
    await tx`delete from projects`;
    await tx`delete from network_profiles`;
    await tx`delete from person_company_links`;
    await tx`delete from import_records`;
    await tx`delete from import_sources`;
    await tx`update users set person_id = null`;
    await tx`delete from people`;
    await tx`delete from companies`;

    const source = await tx`
      insert into import_sources (source_name, file_name, row_count, memo, imported_at)
      values ('operational_seed_preview', 'data/processed/operational_seed_preview.json', ${seed.summary.people + seed.summary.projects + seed.summary.tasks + seed.summary.documentRequirements}, 'Generated from XP source workbooks', now())
      returning id
    `;
    const importSourceId = source[0].id;

    for (const row of seed.network) {
      const companyId = await getOrCreateCompany(tx, row.company);
      const personId = await getOrCreatePerson(tx, row, companyId);
      if (!personId) continue;

      if (companyId) {
        await tx`
          insert into person_company_links (person_id, company_id, relationship_type, title, is_primary)
          values (${personId}, ${companyId}, 'affiliation', ${clean(row.role)}, true)
          on conflict do nothing
        `;
      }

      await tx`
        insert into network_profiles (
          person_id,
          network_segment,
          partner_status,
          xp_role,
          core_field,
          expertise_detail,
          recommender,
          nda_status,
          profile_status,
          appointment_status,
          agreement_status,
          memo
        )
        values (
          ${personId},
          ${segmentMap[row.segment] ?? "unknown"},
          ${clean(row.category)},
          ${clean(row.role)},
          ${clean(row.category)},
          ${clean(row.expertise)},
          ${clean(row.recommender)},
          ${clean(row.ndaStatus)},
          ${clean(row.profileStatus)},
          ${clean(row.appointmentStatus)},
          ${clean(row.appointmentStatus)},
          ${clean(row.sourceRef)}
        )
        on conflict (person_id) do update set
          network_segment = excluded.network_segment,
          partner_status = excluded.partner_status,
          xp_role = excluded.xp_role,
          nda_status = excluded.nda_status,
          profile_status = excluded.profile_status,
          appointment_status = excluded.appointment_status,
          memo = excluded.memo
      `;
    }

    for (const row of seed.projects) {
      const companyId = await getOrCreateCompany(tx, row.company);
      const plId = await getPersonByName(tx, row.pl);
      const pmId = await getPersonByName(tx, row.pm);
      const inserted = await tx`
        insert into projects (
          name,
          project_type,
          status,
          company_id,
          summary,
          client_need,
          xp_request,
          contract_status,
          primary_pl_person_id,
          candidate_pm_person_id,
          latest_update,
          next_action,
          memo
        )
        values (
          ${clean(row.company) ?? "미지정 프로젝트"},
          ${projectTypeMap[row.projectType] ?? "unknown"},
          'discussing',
          ${companyId},
          ${clean(row.business)},
          ${clean(row.clientNeed)},
          ${clean(row.xpRequest)},
          ${clean(row.contractStatus)},
          ${plId},
          ${pmId},
          ${clean(row.latestUpdate)},
          ${clean(row.nextAction)},
          ${clean(row.sourceRef)}
        )
        returning id
      `;
      const projectId = inserted[0].id;
      if (plId) {
        await tx`insert into project_members (project_id, person_id, project_role) values (${projectId}, ${plId}, 'pl') on conflict do nothing`;
      }
      if (pmId) {
        await tx`insert into project_members (project_id, person_id, project_role) values (${projectId}, ${pmId}, 'pm') on conflict do nothing`;
      }
      if (row.latestUpdate) {
        await tx`
          insert into project_weekly_updates (project_id, update_label, body)
          values (${projectId}, 'source_latest', ${row.latestUpdate})
        `;
      }
    }

    const eventByTitle = new Map();
    for (const row of seed.tasks) {
      let eventId = null;
      if (row.linkedArea === "Events") {
        if (!eventByTitle.has(row.title)) {
          const inserted = await tx`
            insert into events (name, event_type, status, description, next_action, memo)
            values (${clean(row.title)}, 'source_task', 'planning', ${clean(row.body)}, ${clean(row.body)}, ${clean(row.sourceRef)})
            returning id
          `;
          eventByTitle.set(row.title, inserted[0].id);
        }
        eventId = eventByTitle.get(row.title);
      }

      await tx`
        insert into tasks (title, description, status, priority, event_id, source_import_record_id)
        values (${clean(row.title)}, ${clean(row.body)}, ${taskStatusMap[row.status] ?? "backlog"}, 'normal', ${eventId}, null)
      `;
    }

    for (const row of seed.documentRequirements) {
      const personId = await getPersonByName(tx, row.subject);
      await tx`
        insert into document_requirements (
          requirement_type,
          title,
          status,
          person_id,
          memo
        )
        values (
          ${clean(row.type) ?? "문서"},
          ${`${row.subject} - ${row.type}`},
          ${requirementStatusMap[row.status] ?? "needed"},
          ${personId},
          ${clean(row.sourceRef)}
        )
      `;
    }

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
        ${sql.json(seed.summary)},
        'seed_batch',
        'created'
      )
    `;
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
