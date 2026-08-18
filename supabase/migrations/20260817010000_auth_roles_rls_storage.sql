-- Auth linkage, role helpers, RLS, storage bucket
-- Access model:
--   * Login required for everything (anon has no access).
--   * All authenticated users can read all rows (internal ERP).
--   * admin can write everything.
--   * PL/PM can update their own projects, add weekly updates/tasks,
--     and manage document requirements on their projects.

-- 1. Link app users to Supabase Auth
alter table users
  add column if not exists auth_user_id uuid unique references auth.users (id) on delete set null;

-- 2. Role helper functions (security definer so they bypass RLS internally)
create or replace function xp_current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from users where auth_user_id = auth.uid() limit 1;
$$;

create or replace function xp_current_person_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select person_id from users where auth_user_id = auth.uid() limit 1;
$$;

-- Registered, active ERP member (a matching users row is required;
-- a self-signed-up Supabase Auth account alone grants nothing)
create or replace function xp_is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from users
    where auth_user_id = auth.uid()
      and status = 'active'
  );
$$;

create or replace function xp_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from users
    where auth_user_id = auth.uid()
      and global_role = 'admin'
      and status = 'active'
  );
$$;

create or replace function xp_can_edit_project(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select xp_is_admin()
    or exists (
      select 1 from projects p
      where p.id = pid
        and xp_current_person_id() is not null
        and (
          p.primary_pl_person_id = xp_current_person_id()
          or p.secondary_pl_person_id = xp_current_person_id()
          or p.candidate_pm_person_id = xp_current_person_id()
        )
    )
    or exists (
      select 1 from project_members pm
      where pm.project_id = pid
        and pm.person_id = xp_current_person_id()
        and pm.project_role in ('pl', 'pm', 'owner', 'coordinator')
    );
$$;

-- 3. Lock out anon completely
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

grant execute on function xp_is_member() to authenticated;
grant execute on function xp_current_app_user_id() to authenticated;
grant execute on function xp_current_person_id() to authenticated;
grant execute on function xp_is_admin() to authenticated;
grant execute on function xp_can_edit_project(uuid) to authenticated;

-- 4. Enable RLS with read-for-authenticated, write-by-role
do $$
declare
  t text;
begin
  foreach t in array array[
    'users', 'companies', 'people', 'person_company_links', 'network_profiles',
    'tags', 'entity_tags', 'projects', 'project_members', 'project_weekly_updates',
    'events', 'event_invitees', 'documents', 'document_requirements',
    'entity_documents', 'tasks', 'import_sources', 'import_records', 'activity_logs'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_read_authenticated', t);
    execute format(
      'create policy %I on %I for select to authenticated using (xp_is_member())',
      t || '_read_authenticated', t
    );
    execute format('drop policy if exists %I on %I', t || '_admin_all', t);
    execute format(
      'create policy %I on %I for all to authenticated using (xp_is_admin()) with check (xp_is_admin())',
      t || '_admin_all', t
    );
  end loop;
end;
$$;

-- Project editors: update own projects
drop policy if exists projects_editor_update on projects;
create policy projects_editor_update on projects
  for update to authenticated
  using (xp_can_edit_project(id))
  with check (xp_can_edit_project(id));

-- Project editors: weekly updates on own projects
drop policy if exists project_weekly_updates_editor_insert on project_weekly_updates;
create policy project_weekly_updates_editor_insert on project_weekly_updates
  for insert to authenticated
  with check (xp_can_edit_project(project_id));

drop policy if exists project_weekly_updates_editor_update on project_weekly_updates;
create policy project_weekly_updates_editor_update on project_weekly_updates
  for update to authenticated
  using (xp_can_edit_project(project_id))
  with check (xp_can_edit_project(project_id));

-- Project editors: tasks on own projects
drop policy if exists tasks_editor_insert on tasks;
create policy tasks_editor_insert on tasks
  for insert to authenticated
  with check (project_id is not null and xp_can_edit_project(project_id));

drop policy if exists tasks_editor_update on tasks;
create policy tasks_editor_update on tasks
  for update to authenticated
  using (project_id is not null and xp_can_edit_project(project_id))
  with check (project_id is not null and xp_can_edit_project(project_id));

-- Project editors: document requirements on own projects
drop policy if exists document_requirements_editor_update on document_requirements;
create policy document_requirements_editor_update on document_requirements
  for update to authenticated
  using (project_id is not null and xp_can_edit_project(project_id))
  with check (project_id is not null and xp_can_edit_project(project_id));

-- Any authenticated member can register documents and link them
drop policy if exists documents_member_insert on documents;
create policy documents_member_insert on documents
  for insert to authenticated
  with check (xp_is_member());

drop policy if exists documents_uploader_update on documents;
create policy documents_uploader_update on documents
  for update to authenticated
  using (xp_is_admin() or uploaded_by_user_id = xp_current_app_user_id())
  with check (xp_is_admin() or uploaded_by_user_id = xp_current_app_user_id());

drop policy if exists entity_documents_member_insert on entity_documents;
create policy entity_documents_member_insert on entity_documents
  for insert to authenticated
  with check (xp_is_member());

-- 5. Storage bucket for uploaded files (NDA, contracts, profiles, ...)
insert into storage.buckets (id, name, public)
values ('xp-documents', 'xp-documents', false)
on conflict (id) do nothing;

drop policy if exists "xp documents read" on storage.objects;
create policy "xp documents read" on storage.objects
  for select to authenticated
  using (bucket_id = 'xp-documents' and xp_is_member());

drop policy if exists "xp documents insert" on storage.objects;
create policy "xp documents insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'xp-documents' and xp_is_member());

drop policy if exists "xp documents delete" on storage.objects;
create policy "xp documents delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'xp-documents' and (xp_is_admin() or owner = auth.uid()));
