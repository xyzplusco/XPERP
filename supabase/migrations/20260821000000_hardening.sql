-- 보안 경계 정리 + 주간보고 정합성
-- 2026-08-21
--
-- 배경: 2026-08-19 역할 재설계에서 테이블 RLS 는 전부 다시 썼지만
-- Storage 버킷 정책 2개가 xp_is_member() 로 남아 있었다. 즉 계정만 활성이면
-- 권한 없는 프로젝트의 계약서 파일도 직접 접근할 수 있었다.
-- 앱은 서버에서만 signed URL 을 발급하므로 화면상 노출은 없었지만,
-- RLS 는 앱을 우회한 직접 접근을 막는 마지막 선이라 반드시 좁혀야 한다.

-- ---------------------------------------------------------------- 0. 헬퍼
-- 경로에서 잘라낸 문자열이 uuid 가 아닐 수 있으므로 안전하게 변환한다.
create or replace function xp_uuid_or_null(value text)
returns uuid language plpgsql immutable as $$
begin
  return value::uuid;
exception when others then
  return null;
end;
$$;

-- 업로드 경로는 `<entity_type>/<entity_id>/<파일명>` 규칙이다.
-- 이 규칙이 깨지면 접근이 막히는 쪽으로 동작한다 (fail closed).
create or replace function xp_storage_scope_allowed(object_name text, need_write boolean)
returns boolean language sql stable as $$
  with parts as (
    select (storage.foldername(object_name))[1] as kind,
           xp_uuid_or_null((storage.foldername(object_name))[2]) as ref
  )
  select case
    when need_write and not xp_can_write() then false
    when xp_can_see_all() then true
    when not xp_is_member() then false
    else (
      select case p.kind
        when 'project' then p.ref is not null and p.ref in (select xp_my_project_ids())
        when 'company' then p.ref is not null and p.ref in (select xp_my_company_ids())
        -- 파트너 명부와 이벤트는 전사 공개가 의도된 결정이다 (docs/permissions-plan.md)
        when 'person'  then p.ref is not null
        when 'event'   then p.ref is not null
        else false
      end
      from parts p
    )
  end;
$$;

-- ---------------------------------------------------------------- 1. 문서 버킷
drop policy if exists "xp documents read" on storage.objects;
create policy "xp documents read" on storage.objects
  for select to authenticated
  using (bucket_id = 'xp-documents' and xp_storage_scope_allowed(name, false));

drop policy if exists "xp documents insert" on storage.objects;
create policy "xp documents insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'xp-documents' and xp_storage_scope_allowed(name, true));

drop policy if exists "xp documents update" on storage.objects;
create policy "xp documents update" on storage.objects
  for update to authenticated
  using (bucket_id = 'xp-documents' and xp_storage_scope_allowed(name, true))
  with check (bucket_id = 'xp-documents' and xp_storage_scope_allowed(name, true));

drop policy if exists "xp documents delete" on storage.objects;
create policy "xp documents delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'xp-documents'
    and (xp_is_admin() or (owner = auth.uid() and xp_storage_scope_allowed(name, true)))
  );

-- ---------------------------------------------------------------- 2. 회의록 버킷
drop policy if exists "xp meeting notes read" on storage.objects;
create policy "xp meeting notes read" on storage.objects
  for select to authenticated
  using (bucket_id = 'xp-meeting-notes' and xp_storage_scope_allowed(name, false));

drop policy if exists "xp meeting notes insert" on storage.objects;
create policy "xp meeting notes insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'xp-meeting-notes' and xp_storage_scope_allowed(name, true));

drop policy if exists "xp meeting notes delete" on storage.objects;
create policy "xp meeting notes delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'xp-meeting-notes'
    and (xp_is_admin() or (owner = auth.uid() and xp_storage_scope_allowed(name, true)))
  );

-- ---------------------------------------------------------------- 3. 주간보고 정합성
-- 화면은 '프로젝트 × 주차 = 기록 1건' 을 전제로 maybeSingle() 을 쓰는데 제약이 없었다.
-- 중복이 생기면 maybeSingle() 이 오류를 내고 코드는 '기록 없음' 으로 판단해
-- 저장할 때마다 중복이 하나씩 더 늘어나는 상태였다.

-- 중복은 update_date 가 가장 최근인 것(같으면 created_at, 그다음 id)만 남긴다.
with ranked as (
  select id,
         row_number() over (
           partition by project_id, update_label
           order by update_date desc nulls last, created_at desc nulls last, id desc
         ) as rn
  from project_weekly_updates
)
delete from project_weekly_updates
where id in (select id from ranked where rn > 1);

create unique index if not exists project_weekly_updates_unique_idx
  on project_weekly_updates (project_id, update_label);

-- PL 이 '비우고 저장' 으로 오기입을 정정할 수 있어야 한다. 지금까지 delete 정책이 없어
-- 화면에는 '삭제됨' 이라고 뜨지만 실제로는 지워지지 않았다.
drop policy if exists project_weekly_updates_editor_delete on project_weekly_updates;
create policy project_weekly_updates_editor_delete on project_weekly_updates
  for delete to authenticated
  using (xp_can_write() and (xp_is_admin() or xp_can_edit_project(project_id)));

-- ---------------------------------------------------------------- 4. 알림 발신 제한
-- notifications insert 는 수신자를 특정할 수 없어 xp_can_write() 로 열려 있다.
-- 최소한 존재하는 계정에게만 보낼 수 있도록 제한한다.
drop policy if exists notifications_insert_member on notifications;
create policy notifications_insert_member on notifications
  for insert to authenticated
  with check (
    xp_can_write()
    and exists (select 1 from users u where u.id = recipient_user_id and u.status = 'active')
  );
