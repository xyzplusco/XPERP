-- 주간 업데이트에 작성자·수정 이력을 남긴다
-- 2026-08-23
--
-- 문제: PL 이 내용을 고쳐도 누가 언제 고쳤는지 남지 않아서, 어드민이 같은 화면을 봐도
-- 지금 보고 있는 게 최신인지, 누가 손댄 건지 알 수 없었다. '비우면 삭제' 라는 숨은 규칙도
-- 화면에 드러나 있지 않았다.
--
-- Salesforce/Monday 처럼 항목마다 작성자·시각이 보이고, 고치면 이전 본문이 이력으로 남게 한다.

alter table project_weekly_updates
  add column if not exists updated_by_user_id uuid references users(id) on delete set null,
  add column if not exists last_edited_at timestamptz,
  add column if not exists edit_count int not null default 0;

create table if not exists project_update_revisions (
  id uuid primary key default gen_random_uuid(),
  update_id uuid not null references project_weekly_updates(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  update_label text not null,
  body text not null,
  edited_by_user_id uuid references users(id) on delete set null,
  edited_at timestamptz not null default now()
);

create index if not exists pur_update_idx on project_update_revisions (update_id, edited_at desc);
create index if not exists pur_project_idx on project_update_revisions (project_id, edited_at desc);

alter table project_update_revisions enable row level security;
revoke all on project_update_revisions from anon;

drop policy if exists pur_read on project_update_revisions;
create policy pur_read on project_update_revisions
  for select to authenticated
  using (xp_can_see_all() or project_id in (select xp_my_project_ids()));

-- 이력은 트리거가 쓴다. 사람이 직접 넣거나 지우지 않는다.
drop policy if exists pur_insert on project_update_revisions;
create policy pur_insert on project_update_revisions
  for insert to authenticated with check (xp_can_write());

-- ---------------------------------------------------------------- 트리거
create or replace function xp_track_weekly_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by_user_id := coalesce(new.created_by_user_id, xp_current_app_user_id());
    new.updated_by_user_id := new.created_by_user_id;
    new.last_edited_at := now();
    return new;
  end if;

  -- 본문이 바뀐 경우에만 이력을 남긴다 (확인·보완요청은 이력 대상이 아니다)
  if new.body is distinct from old.body then
    insert into project_update_revisions (update_id, project_id, update_label, body, edited_by_user_id)
    values (old.id, old.project_id, old.update_label, old.body, xp_current_app_user_id());

    new.updated_by_user_id := xp_current_app_user_id();
    new.last_edited_at := now();
    new.edit_count := coalesce(old.edit_count, 0) + 1;
  end if;

  return new;
end;
$$;

drop trigger if exists pwu_track on project_weekly_updates;
create trigger pwu_track
  before insert or update on project_weekly_updates
  for each row execute function xp_track_weekly_update();

-- 삭제도 이력으로 남긴다 (오기입 정정인지 사고인지 구분하려면 필요하다)
create table if not exists project_update_deletions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  update_label text not null,
  body text,
  deleted_by_user_id uuid references users(id) on delete set null,
  deleted_at timestamptz not null default now()
);

alter table project_update_deletions enable row level security;
revoke all on project_update_deletions from anon;

drop policy if exists pud_read on project_update_deletions;
create policy pud_read on project_update_deletions
  for select to authenticated
  using (xp_can_see_all() or project_id in (select xp_my_project_ids()));

create or replace function xp_log_weekly_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into project_update_deletions (project_id, update_label, body, deleted_by_user_id)
  values (old.project_id, old.update_label, old.body, xp_current_app_user_id());
  return old;
end;
$$;

drop trigger if exists pwu_log_delete on project_weekly_updates;
create trigger pwu_log_delete
  before delete on project_weekly_updates
  for each row execute function xp_log_weekly_delete();

-- 기존 행에도 작성 시각을 채워 둔다
update project_weekly_updates
set last_edited_at = coalesce(last_edited_at, created_at)
where last_edited_at is null;
