-- 회의록 탭 — 녹음 업로드 → 자동 요약 → 액션 아이템 → 과제 생성
-- 2026-08-26
--
-- 지금은 틀만 만든다. 전사·요약을 붙일 API 는 나중에 연결하고,
-- 그때 필요한 자리(오디오 경로·전사문·요약·액션 아이템·처리 상태)를 미리 비워 둔다.
-- 상태는 pending → processing → done | failed 로 흐른다.

alter table meeting_notes
  add column if not exists audio_bucket text,
  add column if not exists audio_path text,
  add column if not exists audio_duration_sec int,
  add column if not exists transcript text,
  add column if not exists ai_summary text,
  add column if not exists ai_status text not null default 'none',
  add column if not exists ai_error text,
  add column if not exists processed_at timestamptz;

alter table meeting_notes drop constraint if exists meeting_notes_ai_status_check;
alter table meeting_notes add constraint meeting_notes_ai_status_check
  check (ai_status in ('none', 'pending', 'processing', 'done', 'failed'));

create index if not exists meeting_notes_ai_idx on meeting_notes (ai_status) where ai_status <> 'none';

-- 회의에서 나온 할 일. 확인 후 tasks 로 승격한다.
create table if not exists meeting_action_items (
  id uuid primary key default gen_random_uuid(),
  meeting_note_id uuid not null references meeting_notes(id) on delete cascade,
  body text not null,
  assignee_person_id uuid references people(id) on delete set null,
  due_date date,
  -- AI 가 뽑았는지 사람이 적었는지
  origin text not null default 'ai' check (origin in ('ai', 'manual')),
  -- 과제로 만들었으면 그 과제
  task_id uuid references tasks(id) on delete set null,
  dismissed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists mai_note_idx on meeting_action_items (meeting_note_id, created_at);

alter table meeting_action_items enable row level security;
revoke all on meeting_action_items from anon;

drop policy if exists mai_read on meeting_action_items;
create policy mai_read on meeting_action_items
  for select to authenticated
  using (
    xp_can_see_all()
    or exists (
      select 1 from meeting_notes m
      where m.id = meeting_note_id
        and (m.project_id in (select xp_my_project_ids()) or m.company_id in (select xp_my_company_ids()))
    )
  );

drop policy if exists mai_write on meeting_action_items;
create policy mai_write on meeting_action_items
  for all to authenticated
  using (xp_can_write()) with check (xp_can_write());

-- 녹음 파일 버킷. 경로 규칙과 접근 통제는 문서·회의록 버킷과 같다.
insert into storage.buckets (id, name, public)
values ('xp-meeting-audio', 'xp-meeting-audio', false)
on conflict (id) do nothing;

drop policy if exists "xp meeting audio read" on storage.objects;
create policy "xp meeting audio read" on storage.objects
  for select to authenticated
  using (bucket_id = 'xp-meeting-audio' and xp_storage_scope_allowed(name, false));

drop policy if exists "xp meeting audio insert" on storage.objects;
create policy "xp meeting audio insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'xp-meeting-audio' and xp_storage_scope_allowed(name, true));

drop policy if exists "xp meeting audio delete" on storage.objects;
create policy "xp meeting audio delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'xp-meeting-audio'
    and (xp_is_admin() or (owner = auth.uid() and xp_storage_scope_allowed(name, true)))
  );
