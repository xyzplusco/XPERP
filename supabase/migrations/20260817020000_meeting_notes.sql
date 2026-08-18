-- 회의록: 전용 스토리지 버킷 + 업체/프로젝트별 회의록 이력
-- 계약/NDA 같은 일반 문서(documents)와 분리한다.
--   * 버킷이 다르다 (xp-meeting-notes)
--   * 정렬 기준이 회의 일자다 (등록일이 아니라)

create table if not exists meeting_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  title text not null,
  meeting_date date not null,
  attendees text,
  summary text,
  storage_bucket text not null default 'xp-meeting-notes',
  storage_path text,
  file_name text,
  mime_type text,
  file_size bigint,
  uploaded_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meeting_notes_owner_check check (company_id is not null or project_id is not null)
);

-- 회의 일자 내림차순 조회가 기본 동선
create index if not exists meeting_notes_company_date_idx
  on meeting_notes (company_id, meeting_date desc, created_at desc);
create index if not exists meeting_notes_project_date_idx
  on meeting_notes (project_id, meeting_date desc, created_at desc);

drop trigger if exists meeting_notes_set_updated_at on meeting_notes;
create trigger meeting_notes_set_updated_at
  before update on meeting_notes
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------- RLS
alter table meeting_notes enable row level security;

drop policy if exists meeting_notes_read_authenticated on meeting_notes;
create policy meeting_notes_read_authenticated on meeting_notes
  for select to authenticated
  using (xp_is_member());

drop policy if exists meeting_notes_admin_all on meeting_notes;
create policy meeting_notes_admin_all on meeting_notes
  for all to authenticated
  using (xp_is_admin())
  with check (xp_is_admin());

-- 등록된 구성원은 회의록을 올릴 수 있다.
drop policy if exists meeting_notes_member_insert on meeting_notes;
create policy meeting_notes_member_insert on meeting_notes
  for insert to authenticated
  with check (xp_is_member());

-- 본인이 올린 회의록은 본인이 수정/삭제할 수 있다.
drop policy if exists meeting_notes_uploader_update on meeting_notes;
create policy meeting_notes_uploader_update on meeting_notes
  for update to authenticated
  using (uploaded_by_user_id = xp_current_app_user_id())
  with check (uploaded_by_user_id = xp_current_app_user_id());

drop policy if exists meeting_notes_uploader_delete on meeting_notes;
create policy meeting_notes_uploader_delete on meeting_notes
  for delete to authenticated
  using (uploaded_by_user_id = xp_current_app_user_id());

-- ---------------------------------------------------------------- 스토리지
insert into storage.buckets (id, name, public)
values ('xp-meeting-notes', 'xp-meeting-notes', false)
on conflict (id) do nothing;

drop policy if exists "xp meeting notes read" on storage.objects;
create policy "xp meeting notes read" on storage.objects
  for select to authenticated
  using (bucket_id = 'xp-meeting-notes' and xp_is_member());

drop policy if exists "xp meeting notes insert" on storage.objects;
create policy "xp meeting notes insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'xp-meeting-notes' and xp_is_member());

drop policy if exists "xp meeting notes delete" on storage.objects;
create policy "xp meeting notes delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'xp-meeting-notes' and (xp_is_admin() or owner = auth.uid()));
