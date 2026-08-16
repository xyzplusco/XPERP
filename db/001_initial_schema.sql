-- XP Internal ERP initial schema
-- Target: PostgreSQL / Supabase
-- Principle: operational network ERP, not decorative CRM.

create extension if not exists pgcrypto;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table users (
  id uuid primary key default gen_random_uuid(),
  person_id uuid,
  email text unique,
  login_id text unique,
  password_hash text,
  global_role text not null default 'member'
    check (global_role in ('admin', 'partner', 'member', 'external_contributor')),
  status text not null default 'active'
    check (status in ('active', 'invited', 'disabled')),
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table companies (
  id uuid primary key default gen_random_uuid(),
  name_ko text not null,
  name_en text,
  normalized_name text,
  business_registration_number text,
  representative_name text,
  website_url text,
  industry text,
  sub_industry text,
  location text,
  founded_year int,
  employee_count int,
  business_summary text,
  core_product text,
  customer_segment text,
  business_model text,
  revenue_status text,
  profit_status text,
  needs text,
  owner_user_id uuid references users(id) on delete set null,
  last_contacted_at date,
  next_action text,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table people (
  id uuid primary key default gen_random_uuid(),
  name_ko text not null,
  name_en text,
  normalized_name text,
  email text,
  phone text,
  linkedin_url text,
  homepage_url text,
  sns_url text,
  region text,
  primary_company_id uuid references companies(id) on delete set null,
  title text,
  relationship_grade text,
  source text,
  introduced_by_person_id uuid references people(id) on delete set null,
  owner_user_id uuid references users(id) on delete set null,
  last_contacted_at date,
  next_action text,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table users
  add constraint users_person_id_fkey
  foreign key (person_id) references people(id) on delete set null;

create table person_company_links (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  relationship_type text not null default 'affiliation',
  department text,
  title text,
  is_primary boolean not null default false,
  started_at date,
  ended_at date,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table network_profiles (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null unique references people(id) on delete cascade,
  network_segment text not null default 'unknown'
    check (network_segment in (
      'xp_internal',
      'consulting_partner',
      'investment_finance_partner',
      'lp_investor',
      'external_expert',
      'vendor_advisor',
      'customer_contact',
      'event_invitee',
      'unknown'
    )),
  partner_status text,
  authority_level text,
  xp_role text,
  core_field text,
  expertise_detail text,
  expertise_industries text,
  expertise_functions text,
  market_expertise text,
  recommender text,
  internal_manager_user_id uuid references users(id) on delete set null,
  nda_status text,
  profile_status text,
  appointment_status text,
  xp_account_status text,
  agreement_status text,
  agreement_end_date date,
  compensation_model text,
  can_join_internal_project boolean,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table tags (
  id uuid primary key default gen_random_uuid(),
  tag_key text not null unique,
  label text not null,
  tag_group text not null default 'general',
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

create table entity_tags (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null
    check (entity_type in ('person', 'company', 'project', 'event', 'document', 'task')),
  entity_id uuid not null,
  tag_id uuid not null references tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (entity_type, entity_id, tag_id)
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  project_code text unique,
  project_type text not null default 'consulting'
    check (project_type in (
      'consulting',
      'reengineering',
      'investment',
      'business_building',
      'go_global',
      'event',
      'internal_ops',
      'unknown'
    )),
  status text not null default 'discussing'
    check (status in ('confirmed', 'likely', 'discussing', 'managed', 'on_hold', 'done', 'dropped')),
  company_id uuid references companies(id) on delete set null,
  summary text,
  client_need text,
  xp_request text,
  contract_status text,
  start_date date,
  end_date date,
  expected_revenue numeric(18, 2),
  revenue_month date,
  coordinator_user_id uuid references users(id) on delete set null,
  primary_pl_person_id uuid references people(id) on delete set null,
  secondary_pl_person_id uuid references people(id) on delete set null,
  candidate_pm_person_id uuid references people(id) on delete set null,
  latest_update text,
  next_action text,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  project_role text not null
    check (project_role in ('pl', 'pm', 'external_contributor', 'coordinator', 'viewer', 'owner')),
  can_edit boolean not null default false,
  joined_at date,
  left_at date,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, person_id, project_role)
);

create table project_weekly_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  update_label text not null,
  update_date date,
  body text not null,
  source_import_record_id uuid,
  created_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_type text,
  status text not null default 'planning'
    check (status in ('planning', 'inviting', 'confirmed', 'completed', 'cancelled')),
  starts_at timestamptz,
  ends_at timestamptz,
  location text,
  owner_user_id uuid references users(id) on delete set null,
  description text,
  next_action text,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table event_invitees (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  person_id uuid references people(id) on delete set null,
  company_id uuid references companies(id) on delete set null,
  name text,
  company_name text,
  title text,
  email text,
  phone text,
  memo text,
  email_sent boolean not null default false,
  sms_sent boolean not null default false,
  response_received boolean not null default false,
  will_attend boolean,
  attendance_confirmed boolean not null default false,
  owner_user_id uuid references users(id) on delete set null,
  next_action text,
  source_import_record_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  document_type text not null,
  title text not null,
  sensitivity text not null default 'internal'
    check (sensitivity in ('internal', 'confidential', 'restricted')),
  storage_bucket text,
  storage_path text,
  external_url text,
  file_name text,
  mime_type text,
  file_size bigint,
  checksum_sha256 text,
  uploaded_by_user_id uuid references users(id) on delete set null,
  uploaded_at timestamptz,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (storage_path is not null or external_url is not null or file_name is not null)
);

create table document_requirements (
  id uuid primary key default gen_random_uuid(),
  requirement_type text not null,
  title text not null,
  subject_text text,
  status text not null default 'needed'
    check (status in ('not_required', 'needed', 'requested', 'received', 'signed', 'expired', 'waived')),
  person_id uuid references people(id) on delete cascade,
  company_id uuid references companies(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  event_id uuid references events(id) on delete cascade,
  task_id uuid,
  required_by date,
  requested_at date,
  received_at date,
  signed_at date,
  expires_at date,
  owner_user_id uuid references users(id) on delete set null,
  current_document_id uuid references documents(id) on delete set null,
  source_import_record_id uuid,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    person_id is not null
    or company_id is not null
    or project_id is not null
    or event_id is not null
    or task_id is not null
    or subject_text is not null
  )
);

create table entity_documents (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  entity_type text not null
    check (entity_type in ('person', 'company', 'project', 'event', 'task', 'document_requirement')),
  entity_id uuid not null,
  relationship_type text not null default 'related',
  created_at timestamptz not null default now(),
  unique (document_id, entity_type, entity_id, relationship_type)
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text not null default 'backlog'
    check (status in ('backlog', 'in_progress', 'waiting', 'blocked', 'done', 'dropped')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  owner_user_id uuid references users(id) on delete set null,
  assignee_user_id uuid references users(id) on delete set null,
  due_date date,
  person_id uuid references people(id) on delete set null,
  company_id uuid references companies(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  event_id uuid references events(id) on delete set null,
  document_requirement_id uuid references document_requirements(id) on delete set null,
  source_import_record_id uuid,
  completed_at timestamptz,
  created_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table document_requirements
  add constraint document_requirements_task_id_fkey
  foreign key (task_id) references tasks(id) on delete set null;

create table import_sources (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  file_name text not null,
  file_path text,
  file_sha256 text,
  workbook_sheet text,
  imported_at timestamptz,
  imported_by_user_id uuid references users(id) on delete set null,
  row_count int,
  memo text,
  created_at timestamptz not null default now()
);

create table import_records (
  id uuid primary key default gen_random_uuid(),
  import_source_id uuid not null references import_sources(id) on delete cascade,
  source_row_number int,
  source_key text,
  raw_text text,
  raw_json jsonb,
  mapped_entity_type text,
  mapped_entity_id uuid,
  reconciliation_status text not null default 'pending'
    check (reconciliation_status in ('pending', 'matched', 'created', 'skipped', 'needs_review', 'error')),
  error_message text,
  created_at timestamptz not null default now()
);

alter table project_weekly_updates
  add constraint project_weekly_updates_source_import_record_id_fkey
  foreign key (source_import_record_id) references import_records(id) on delete set null;

alter table event_invitees
  add constraint event_invitees_source_import_record_id_fkey
  foreign key (source_import_record_id) references import_records(id) on delete set null;

alter table document_requirements
  add constraint document_requirements_source_import_record_id_fkey
  foreign key (source_import_record_id) references import_records(id) on delete set null;

alter table tasks
  add constraint tasks_source_import_record_id_fkey
  foreign key (source_import_record_id) references import_records(id) on delete set null;

create table activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references users(id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz not null default now()
);

create index people_normalized_name_idx on people (normalized_name);
create index people_email_idx on people (email);
create index people_phone_idx on people (phone);
create index companies_normalized_name_idx on companies (normalized_name);
create index network_profiles_segment_idx on network_profiles (network_segment);
create index projects_type_status_idx on projects (project_type, status);
create index project_weekly_updates_project_idx on project_weekly_updates (project_id, update_label);
create index events_status_starts_idx on events (status, starts_at);
create index document_requirements_status_idx on document_requirements (status, expires_at, required_by);
create index tasks_status_due_idx on tasks (status, due_date);
create index import_records_status_idx on import_records (reconciliation_status);

create unique index person_company_links_unique_idx
  on person_company_links (
    person_id,
    company_id,
    relationship_type,
    coalesce(department, ''),
    coalesce(title, '')
  );

create unique index import_records_source_row_unique_idx
  on import_records (
    import_source_id,
    source_row_number,
    coalesce(source_key, '')
  );

create index people_search_idx on people using gin (
  to_tsvector('simple', coalesce(name_ko, '') || ' ' || coalesce(name_en, '') || ' ' || coalesce(email, '') || ' ' || coalesce(phone, '') || ' ' || coalesce(memo, ''))
);

create index companies_search_idx on companies using gin (
  to_tsvector('simple', coalesce(name_ko, '') || ' ' || coalesce(name_en, '') || ' ' || coalesce(industry, '') || ' ' || coalesce(business_summary, '') || ' ' || coalesce(memo, ''))
);

create index projects_search_idx on projects using gin (
  to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(client_need, '') || ' ' || coalesce(xp_request, '') || ' ' || coalesce(latest_update, '') || ' ' || coalesce(next_action, '') || ' ' || coalesce(memo, ''))
);

create index documents_search_idx on documents using gin (
  to_tsvector('simple', coalesce(document_type, '') || ' ' || coalesce(title, '') || ' ' || coalesce(file_name, '') || ' ' || coalesce(memo, ''))
);

create index tasks_search_idx on tasks using gin (
  to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, ''))
);

create trigger users_set_updated_at before update on users for each row execute function set_updated_at();
create trigger companies_set_updated_at before update on companies for each row execute function set_updated_at();
create trigger people_set_updated_at before update on people for each row execute function set_updated_at();
create trigger person_company_links_set_updated_at before update on person_company_links for each row execute function set_updated_at();
create trigger network_profiles_set_updated_at before update on network_profiles for each row execute function set_updated_at();
create trigger projects_set_updated_at before update on projects for each row execute function set_updated_at();
create trigger project_members_set_updated_at before update on project_members for each row execute function set_updated_at();
create trigger project_weekly_updates_set_updated_at before update on project_weekly_updates for each row execute function set_updated_at();
create trigger events_set_updated_at before update on events for each row execute function set_updated_at();
create trigger event_invitees_set_updated_at before update on event_invitees for each row execute function set_updated_at();
create trigger documents_set_updated_at before update on documents for each row execute function set_updated_at();
create trigger document_requirements_set_updated_at before update on document_requirements for each row execute function set_updated_at();
create trigger tasks_set_updated_at before update on tasks for each row execute function set_updated_at();

insert into tags (tag_key, label, tag_group, is_system) values
  ('bod', '임원', 'partner_role', true),
  ('employee', '직원', 'partner_role', true),
  ('partner', '파트너', 'partner_role', true),
  ('partner_candidate', '파트너 후보', 'partner_role', true),
  ('advisor', '협력사', 'partner_role', true)
on conflict (tag_key) do nothing;

create or replace view erp_network_rows as
select
  p.id,
  p.name_ko as name,
  coalesce(np.network_segment, 'unknown') as segment,
  coalesce(c.name_ko, '') as company,
  coalesce(p.title, np.xp_role, '') as role,
  concat_ws(' / ',
    case when coalesce(np.nda_status, '') in ('', 'Unknown', 'X') then 'NDA 확인' end,
    case when coalesce(np.profile_status, '') in ('', 'Unknown', 'X') then '프로필 확인' end,
    case when coalesce(np.appointment_status, '') in ('', 'Unknown', 'X') then '위촉 확인' end
  ) as docs
from people p
left join network_profiles np on np.person_id = p.id
left join companies c on c.id = p.primary_company_id
order by p.created_at asc;

create or replace view erp_project_rows as
select
  pr.id,
  coalesce(c.name_ko, pr.name) as company,
  pr.project_type as type,
  coalesce(pl.name_ko, '') as pl,
  coalesce(pm.name_ko, '') as pm,
  coalesce(pr.next_action, pr.latest_update, pr.xp_request, pr.client_need, '') as next
from projects pr
left join companies c on c.id = pr.company_id
left join people pl on pl.id = pr.primary_pl_person_id
left join people pm on pm.id = pr.candidate_pm_person_id
order by pr.created_at asc;

create or replace view erp_event_rows as
select
  e.id,
  e.name as event,
  coalesce(u.email, '') as owner,
  coalesce(e.description, '') as invitees,
  e.status as state,
  coalesce(e.next_action, e.memo, '') as next
from events e
left join users u on u.id = e.owner_user_id
order by e.created_at asc;

create or replace view erp_document_requirement_rows as
select
  dr.id,
  coalesce(p.name_ko, c.name_ko, pr.name, e.name, dr.subject_text, dr.title) as subject,
  dr.requirement_type as type,
  coalesce(u.email, '') as owner,
  dr.status,
  coalesce(dr.required_by::text, dr.expires_at::text, '검토') as due
from document_requirements dr
left join people p on p.id = dr.person_id
left join companies c on c.id = dr.company_id
left join projects pr on pr.id = dr.project_id
left join events e on e.id = dr.event_id
left join users u on u.id = dr.owner_user_id
order by dr.created_at asc;

create or replace view erp_task_rows as
select
  t.id,
  t.title,
  coalesce(u.email, '') as owner,
  case
    when t.document_requirement_id is not null then '문서'
    when t.event_id is not null then '이벤트'
    when t.project_id is not null then '프로젝트'
    when t.person_id is not null then '네트워크'
    when t.company_id is not null then '회사'
    else '검토'
  end as link,
  t.status
from tasks t
left join users u on u.id = t.assignee_user_id
order by t.created_at asc;
