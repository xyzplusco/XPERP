-- 알림함 · 주간 업데이트 확인/보완요청 · 티켓 댓글
-- 2026-08-20

-- ---------------------------------------------------------------- 1. 알림
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references users(id) on delete cascade,
  actor_user_id uuid references users(id) on delete set null,
  kind text not null,
  title text not null,
  body text,
  link text,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_inbox_idx
  on notifications (recipient_user_id, read_at nulls first, created_at desc);

alter table notifications enable row level security;
revoke all on notifications from anon;

drop policy if exists notifications_read_own on notifications;
create policy notifications_read_own on notifications
  for select to authenticated
  using (recipient_user_id = (select id from users where auth_user_id = auth.uid()));

drop policy if exists notifications_update_own on notifications;
create policy notifications_update_own on notifications
  for update to authenticated
  using (recipient_user_id = (select id from users where auth_user_id = auth.uid()))
  with check (recipient_user_id = (select id from users where auth_user_id = auth.uid()));

-- 남에게 보내는 알림이라 수신자 제한을 걸 수 없다. 쓰기 권한이 있는 계정만 만들 수 있게 한다.
drop policy if exists notifications_insert_member on notifications;
create policy notifications_insert_member on notifications
  for insert to authenticated
  with check (xp_can_write());

drop policy if exists notifications_delete_own on notifications;
create policy notifications_delete_own on notifications
  for delete to authenticated
  using (recipient_user_id = (select id from users where auth_user_id = auth.uid()));

-- ---------------------------------------------------------------- 2. 주간 업데이트 확인 / 보완 요청
alter table project_weekly_updates
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmed_by_user_id uuid references users(id) on delete set null,
  add column if not exists review_note text,
  add column if not exists review_requested_at timestamptz,
  add column if not exists review_requested_by_user_id uuid references users(id) on delete set null;

create index if not exists pwu_unconfirmed_idx
  on project_weekly_updates (update_label, confirmed_at) where confirmed_at is null;

-- 확인/보완요청은 전사 열람 권한이 있는 계정만 (owner·staff)
drop policy if exists pwu_admin_review on project_weekly_updates;
create policy pwu_admin_review on project_weekly_updates
  for update to authenticated
  using (xp_is_admin())
  with check (xp_is_admin());

-- ---------------------------------------------------------------- 3. 티켓 댓글
create table if not exists task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  author_user_id uuid references users(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists task_comments_task_idx on task_comments (task_id, created_at);

alter table task_comments enable row level security;
revoke all on task_comments from anon;

drop policy if exists task_comments_read on task_comments;
create policy task_comments_read on task_comments
  for select to authenticated
  using (
    xp_can_see_all()
    or exists (
      select 1 from tasks t
      where t.id = task_id
        and (
          t.project_id is null
          or t.project_id in (select xp_my_project_ids())
          or t.assignee_person_id = xp_current_person_id()
        )
    )
  );

drop policy if exists task_comments_write on task_comments;
create policy task_comments_write on task_comments
  for insert to authenticated
  with check (xp_can_write());

drop policy if exists task_comments_delete on task_comments;
create policy task_comments_delete on task_comments
  for delete to authenticated
  using (
    author_user_id = (select id from users where auth_user_id = auth.uid())
    or xp_is_admin()
  );

-- ---------------------------------------------------------------- 4. 티켓 번호
-- 화면에서 T-XXXXXXXX 로 쓰기 위한 조회 편의 인덱스
create index if not exists tasks_created_idx on tasks (created_at desc) where deleted_at is null;
