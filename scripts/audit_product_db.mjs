import postgres from "postgres";
import { loadLocalEnv } from "./load_env.mjs";

loadLocalEnv();

const databaseUrl = process.env.SUPABASE_DB_URL;

if (!databaseUrl) {
  console.error("SUPABASE_DB_URL is required to audit the product database.");
  process.exit(1);
}

const sql = postgres(databaseUrl, {
  max: 1,
  ssl: "require",
  prepare: false,
});

try {
  const counts = await sql`
    select 'companies' as table_name, count(*)::int as total from companies
    union all select 'people', count(*)::int from people
    union all select 'network_profiles', count(*)::int from network_profiles
    union all select 'person_company_links', count(*)::int from person_company_links
    union all select 'projects', count(*)::int from projects
    union all select 'project_members', count(*)::int from project_members
    union all select 'events', count(*)::int from events
    union all select 'event_invitees', count(*)::int from event_invitees
    union all select 'tasks', count(*)::int from tasks
    union all select 'document_requirements', count(*)::int from document_requirements
    union all select 'documents', count(*)::int from documents
  `;

  const [linkage] = await sql`
    select
      (select count(*)::int from projects where company_id is not null) as project_company_linked,
      (select count(*)::int from projects where primary_pl_person_id is not null) as project_pl_linked,
      (select count(*)::int from projects where candidate_pm_person_id is not null) as project_pm_linked,
      (select count(*)::int from tasks where company_id is not null or project_id is not null or person_id is not null or event_id is not null or document_requirement_id is not null) as tasks_linked,
      (select count(*)::int from document_requirements where person_id is not null or company_id is not null or project_id is not null or event_id is not null or task_id is not null) as docs_linked,
      (select count(*)::int from companies where industry is not null or representative_name is not null or business_summary is not null or next_action is not null) as enriched_companies
  `;

  const samples = await sql`
    select
      c.name_ko as customer,
      count(distinct p.id)::int as projects,
      count(distinct t.id)::int as linked_tasks,
      count(distinct dr.id)::int as linked_document_requirements
    from companies c
    left join projects p on p.company_id = c.id
    left join tasks t on t.company_id = c.id or t.project_id = p.id
    left join document_requirements dr on dr.company_id = c.id or dr.project_id = p.id
    group by c.id, c.name_ko
    having count(distinct p.id) > 0
    order by count(distinct p.id) desc, c.name_ko asc
    limit 12
  `;

  console.log(JSON.stringify({ counts, linkage, sampleCustomers: samples }, null, 2));
} finally {
  await sql.end();
}
