-- 프로젝트 폴더 / 티켓(담당자) / 이벤트 개편

-- ---------------------------------------------------------------- 1. 프로젝트 폴더
create table if not exists project_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  sort_order int not null default 100,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists project_folders_set_updated_at on project_folders;
create trigger project_folders_set_updated_at
  before update on project_folders
  for each row execute function set_updated_at();

insert into project_folders (name, sort_order, is_system) values
  ('Re-Engineering', 10, true),
  ('Go Global', 20, true),
  ('AX', 30, true),
  ('XP 경영', 40, true)
on conflict (name) do nothing;

alter table projects
  add column if not exists folder_id uuid references project_folders (id) on delete set null;

create index if not exists projects_folder_idx on projects (folder_id, updated_at desc);

-- ---------------------------------------------------------------- 2. 티켓 담당자
-- tasks 를 티켓으로 그대로 쓴다. project_id 가 비면 Unsorted 티켓.
-- 담당자는 계정 유무와 무관하게 지정할 수 있어야 하므로 people 을 가리킨다.
alter table tasks
  add column if not exists assignee_person_id uuid references people (id) on delete set null;

create index if not exists tasks_assignee_idx on tasks (assignee_person_id, status);
create index if not exists tasks_unsorted_idx on tasks (status, created_at desc) where project_id is null;

-- ---------------------------------------------------------------- 3. tasks 권한 재설정
-- 기존 정책은 project_id 가 있는 경우만 허용해서 미분류 티켓을 만들 수 없었다.
drop policy if exists tasks_editor_insert on tasks;
drop policy if exists tasks_editor_update on tasks;

-- 등록된 구성원은 티켓을 만들 수 있다 (미분류 포함).
create policy tasks_member_insert on tasks
  for insert to authenticated
  with check (
    xp_is_member()
    and (project_id is null or xp_can_edit_project(project_id))
  );

-- 미분류 티켓, 본인이 만든/맡은 티켓, 담당 프로젝트의 티켓은 수정 가능.
create policy tasks_member_update on tasks
  for update to authenticated
  using (
    xp_is_member()
    and (
      project_id is null
      or xp_can_edit_project(project_id)
      or created_by_user_id = xp_current_app_user_id()
      or assignee_person_id = xp_current_person_id()
    )
  )
  with check (
    xp_is_member()
    and (project_id is null or xp_can_edit_project(project_id))
  );

-- ---------------------------------------------------------------- 4. 폴더 권한
alter table project_folders enable row level security;

drop policy if exists project_folders_read on project_folders;
create policy project_folders_read on project_folders
  for select to authenticated
  using (xp_is_member());

drop policy if exists project_folders_admin on project_folders;
create policy project_folders_admin on project_folders
  for all to authenticated
  using (xp_is_admin())
  with check (xp_is_admin());

-- ---------------------------------------------------------------- 5. 이벤트
alter table events
  add column if not exists is_date_tbd boolean not null default false;

-- To Go List 에서 자동 추출된 임시 이벤트는 제거한다.
-- 원본 액션은 tasks 에 그대로 남아 있으므로 정보 손실이 없다.
delete from event_invitees
  where event_id in (select id from events where event_type = 'source_task');
delete from document_requirements
  where event_id in (select id from events where event_type = 'source_task');
update tasks set event_id = null
  where event_id in (select id from events where event_type = 'source_task');
delete from events where event_type = 'source_task';

-- 참석자 관리는 구성원 누구나 할 수 있어야 한다 (행사 운영은 협업 작업).
drop policy if exists event_invitees_member_write on event_invitees;
create policy event_invitees_member_write on event_invitees
  for all to authenticated
  using (xp_is_member())
  with check (xp_is_member());

drop policy if exists events_member_write on events;
create policy events_member_write on events
  for all to authenticated
  using (xp_is_member())
  with check (xp_is_member());

create index if not exists event_invitees_event_idx
  on event_invitees (event_id, created_at);
