-- 권한 체계 재설계
--
-- 기존 문제: 21개 테이블의 SELECT 정책이 전부 xp_is_member() 하나였다.
-- 즉 계정만 활성이면 역할과 무관하게 전사 데이터가 다 보였다.
--
-- 역할 4단계
--   owner  마스터 어드민  — 전부 + 영구삭제 + 계정 관리 (1명만)
--   staff  임직원(경영지원) — 전부 열람·편집, 계정 관리 불가
--   member PL/PM          — 자기 프로젝트 범위만
--   viewer 열람전용        — 전부 열람, 쓰기 없음

-- ---------------------------------------------------------------- 1. 역할값 교체
alter table users drop constraint if exists users_global_role_check;

update users set global_role = 'owner'  where global_role = 'admin';
update users set global_role = 'member' where global_role in ('partner', 'external_contributor');

alter table users
  add constraint users_global_role_check
  check (global_role in ('owner', 'staff', 'member', 'viewer'));

-- owner 는 1명만
create unique index if not exists users_single_owner_idx
  on users ((global_role)) where global_role = 'owner';

-- ---------------------------------------------------------------- 2. 역할 헬퍼
create or replace function xp_role()
returns text language sql stable security definer set search_path = public as $$
  select global_role from users where auth_user_id = auth.uid() and status = 'active' limit 1;
$$;

create or replace function xp_is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select xp_role() = 'owner';
$$;

-- 기존 정책들이 xp_is_admin() 을 쓰고 있으므로 의미를 owner+staff 로 재정의한다.
create or replace function xp_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select xp_role() in ('owner', 'staff');
$$;

-- 전사 열람 가능 (viewer 포함)
create or replace function xp_can_see_all()
returns boolean language sql stable security definer set search_path = public as $$
  select xp_role() in ('owner', 'staff', 'viewer');
$$;

-- 쓰기 가능 (viewer 제외)
create or replace function xp_can_write()
returns boolean language sql stable security definer set search_path = public as $$
  select xp_role() in ('owner', 'staff', 'member');
$$;

-- 내가 PL·PM·구성원으로 붙어 있는 프로젝트
create or replace function xp_my_project_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select p.id from projects p
   where xp_current_person_id() is not null
     and (p.primary_pl_person_id   = xp_current_person_id()
       or p.secondary_pl_person_id = xp_current_person_id()
       or p.candidate_pm_person_id = xp_current_person_id())
  union
  select pm.project_id from project_members pm
   where pm.person_id = xp_current_person_id();
$$;

-- 내 프로젝트의 고객사
create or replace function xp_my_company_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select distinct p.company_id from projects p
   where p.company_id is not null and p.id in (select xp_my_project_ids());
$$;

grant execute on function xp_role(), xp_is_owner(), xp_can_see_all(), xp_can_write(),
                          xp_my_project_ids(), xp_my_company_ids() to authenticated;

-- ---------------------------------------------------------------- 3. 읽기 범위
-- (a) 전사 공개 유지 — 파트너 명부·이벤트·공용 마스터
do $$
declare t text;
begin
  foreach t in array array[
    'people', 'network_profiles', 'person_company_links',
    'events', 'event_invitees',
    'project_folders', 'tags', 'entity_tags'
  ]
  loop
    execute format('drop policy if exists %I on %I', t || '_read_authenticated', t);
    execute format('create policy %I on %I for select to authenticated using (xp_is_member())',
                   t || '_read_authenticated', t);
  end loop;
end;
$$;

-- (b) 프로젝트 범위로 좁힘
drop policy if exists projects_read_authenticated on projects;
create policy projects_read_authenticated on projects
  for select to authenticated
  using (xp_can_see_all() or id in (select xp_my_project_ids()));

do $$
declare t text;
begin
  foreach t in array array['project_weekly_updates', 'project_members', 'meeting_notes']
  loop
    execute format('drop policy if exists %I on %I', t || '_read_authenticated', t);
    execute format(
      'create policy %I on %I for select to authenticated
         using (xp_can_see_all() or project_id in (select xp_my_project_ids()))',
      t || '_read_authenticated', t
    );
  end loop;
end;
$$;

-- 회의록은 고객사 단위로도 붙을 수 있다
drop policy if exists meeting_notes_read_authenticated on meeting_notes;
create policy meeting_notes_read_authenticated on meeting_notes
  for select to authenticated
  using (
    xp_can_see_all()
    or project_id in (select xp_my_project_ids())
    or company_id in (select xp_my_company_ids())
  );

-- 액션(티켓): 내 프로젝트 것 + 미분류 + 내가 담당/생성한 것
drop policy if exists tasks_read_authenticated on tasks;
create policy tasks_read_authenticated on tasks
  for select to authenticated
  using (
    xp_can_see_all()
    or project_id in (select xp_my_project_ids())
    or project_id is null
    or assignee_person_id = xp_current_person_id()
    or created_by_user_id = xp_current_app_user_id()
  );

-- 고객사: 내 프로젝트의 고객사만
drop policy if exists companies_read_authenticated on companies;
create policy companies_read_authenticated on companies
  for select to authenticated
  using (xp_can_see_all() or id in (select xp_my_company_ids()));

-- 문서·계약서: 내 프로젝트/고객사 것만
drop policy if exists document_requirements_read_authenticated on document_requirements;
create policy document_requirements_read_authenticated on document_requirements
  for select to authenticated
  using (
    xp_can_see_all()
    or project_id in (select xp_my_project_ids())
    or company_id in (select xp_my_company_ids())
  );

drop policy if exists entity_documents_read_authenticated on entity_documents;
create policy entity_documents_read_authenticated on entity_documents
  for select to authenticated
  using (
    xp_can_see_all()
    or (entity_type = 'project' and entity_id in (select xp_my_project_ids()))
    or (entity_type = 'company' and entity_id in (select xp_my_company_ids()))
    or entity_type in ('person', 'event')
  );

drop policy if exists documents_read_authenticated on documents;
create policy documents_read_authenticated on documents
  for select to authenticated
  using (
    xp_can_see_all()
    or id in (select document_id from entity_documents)
  );

-- 계정 목록: owner/staff 는 전부, 나머지는 본인 것만
drop policy if exists users_read_authenticated on users;
create policy users_read_authenticated on users
  for select to authenticated
  using (xp_is_admin() or auth_user_id = auth.uid());

-- 운영 로그·임포트 이력은 owner/staff 전용
do $$
declare t text;
begin
  foreach t in array array['activity_logs', 'import_sources', 'import_records']
  loop
    execute format('drop policy if exists %I on %I', t || '_read_authenticated', t);
    execute format('create policy %I on %I for select to authenticated using (xp_is_admin())',
                   t || '_read_authenticated', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------- 4. 쓰기에서 viewer 제외
drop policy if exists tasks_member_insert on tasks;
create policy tasks_member_insert on tasks
  for insert to authenticated
  with check (xp_can_write() and (project_id is null or xp_can_edit_project(project_id)));

drop policy if exists tasks_member_update on tasks;
create policy tasks_member_update on tasks
  for update to authenticated
  using (
    xp_can_write() and (
      project_id is null
      or xp_can_edit_project(project_id)
      or created_by_user_id = xp_current_app_user_id()
      or assignee_person_id = xp_current_person_id()
    )
  )
  with check (xp_can_write() and (project_id is null or xp_can_edit_project(project_id)));

drop policy if exists documents_member_insert on documents;
create policy documents_member_insert on documents
  for insert to authenticated with check (xp_can_write());

drop policy if exists entity_documents_member_insert on entity_documents;
create policy entity_documents_member_insert on entity_documents
  for insert to authenticated with check (xp_can_write());

drop policy if exists meeting_notes_member_insert on meeting_notes;
create policy meeting_notes_member_insert on meeting_notes
  for insert to authenticated with check (xp_can_write());

drop policy if exists event_invitees_member_write on event_invitees;
create policy event_invitees_member_write on event_invitees
  for all to authenticated using (xp_can_write()) with check (xp_can_write());

drop policy if exists events_member_write on events;
create policy events_member_write on events
  for all to authenticated using (xp_can_write()) with check (xp_can_write());

-- 계정 관리는 owner 만
drop policy if exists users_admin_all on users;
create policy users_owner_all on users
  for all to authenticated using (xp_is_owner()) with check (xp_is_owner());
