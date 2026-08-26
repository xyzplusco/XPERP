-- 프로젝트를 3축으로 분리한다
-- 2026-08-22
--
-- 통합 파이프라인 엑셀에는 원래 세 가지가 따로 있었는데 DB 에서는 영문 enum 하나(status)와
-- 자유 텍스트(contract_status)에 뭉개져 있었다.
--
--   구간(pipeline_stage) : 고객 · 협상 · 관리기업 · 파트너협업건 · 미정리후보
--   상태(deal_status)    : 계약 · 계약임박 · 제안 · 가망 · 관리 · 보류 · 미분류
--   서비스섹터(service_sector) : Re-Engineering · Business Building · 투자·매각 · 영업 · Go Global · AX · 기타·미정
--
-- 기존 status 는 화면·RLS·뷰가 이미 쓰고 있으므로 없애지 않고 deal_status 에서 파생시킨다.
-- 앞으로 정본은 deal_status 다. status 를 직접 쓰지 말 것.

alter table projects
  add column if not exists pipeline_stage text,
  add column if not exists deal_status    text,
  add column if not exists service_sector text;

-- ---------------------------------------------------------------- 1. 기존 값 이전
-- contract_status 에 구간이 들어가 있었다.
update projects
set pipeline_stage = contract_status
where pipeline_stage is null
  and contract_status in ('고객', '협상', '관리기업', '파트너협업건', '미정리후보');

-- status(영문 enum) → 상태
update projects
set deal_status = case status
    when 'confirmed'  then '계약'
    when 'likely'     then '계약임박'
    when 'discussing' then '가망'
    when 'managed'    then '관리'
    when 'on_hold'    then '보류'
    when 'done'       then '관리'
    when 'dropped'    then '보류'
    else '미분류'
  end
where deal_status is null;

-- project_type(영문 enum) → 서비스섹터
update projects
set service_sector = case project_type
    when 'reengineering'      then 'Re-Engineering'
    when 'business_building'  then 'Business Building'
    when 'investment'         then '투자·매각'
    when 'go_global'          then 'Go Global'
    when 'consulting'         then '영업'
    else '기타·미정'
  end
where service_sector is null;

update projects set pipeline_stage = '미정리후보' where pipeline_stage is null;
update projects set deal_status    = '미분류'     where deal_status is null;
update projects set service_sector = '기타·미정'  where service_sector is null;

alter table projects
  alter column pipeline_stage set default '미정리후보',
  alter column deal_status    set default '미분류',
  alter column service_sector set default '기타·미정';

alter table projects alter column pipeline_stage set not null;
alter table projects alter column deal_status    set not null;
alter table projects alter column service_sector set not null;

alter table projects drop constraint if exists projects_pipeline_stage_check;
alter table projects add constraint projects_pipeline_stage_check
  check (pipeline_stage in ('고객', '협상', '관리기업', '파트너협업건', '미정리후보'));

alter table projects drop constraint if exists projects_deal_status_check;
alter table projects add constraint projects_deal_status_check
  check (deal_status in ('계약', '계약임박', '제안', '가망', '관리', '보류', '미분류'));

alter table projects drop constraint if exists projects_service_sector_check;
alter table projects add constraint projects_service_sector_check
  check (service_sector in (
    'Re-Engineering', 'Business Building', '투자·매각', '영업', 'Go Global', 'AX', '기타·미정'
  ));

create index if not exists projects_stage_status_idx
  on projects (pipeline_stage, deal_status) where deleted_at is null;

-- ---------------------------------------------------------------- 2. status 를 파생으로
-- 화면·뷰·RLS 가 status 를 쓰고 있어 당장 없앨 수 없다. deal_status 에서 자동으로 채운다.
create or replace function xp_sync_project_status()
returns trigger language plpgsql as $$
begin
  new.status := case new.deal_status
    when '계약'     then 'confirmed'
    when '계약임박' then 'likely'
    when '제안'     then 'discussing'
    when '가망'     then 'discussing'
    when '관리'     then 'managed'
    when '보류'     then 'on_hold'
    else 'discussing'
  end;
  -- 구간은 예전 필드에도 계속 반영해 둔다 (엑셀 왕복 스크립트 호환)
  new.contract_status := new.pipeline_stage;
  return new;
end;
$$;

drop trigger if exists projects_sync_status on projects;
create trigger projects_sync_status
  before insert or update of deal_status, pipeline_stage
  on projects
  for each row execute function xp_sync_project_status();

-- 현재 데이터에 한 번 적용
update projects set deal_status = deal_status, pipeline_stage = pipeline_stage;

-- ---------------------------------------------------------------- 3. 보드 뷰 갱신
-- 기존 뷰는 contract_status = '계약' 을 보고 있었는데 그 칸에는 구간(고객/협상/…)이 들어 있어
-- 계약 건수가 항상 status 로만 잡혔다. 새 필드로 고친다.
create or replace view erp_partner_board
with (security_invoker = on) as
with assignment as (
  select x.person_id, p.id as project_id, x.role, p.deal_status
  from projects p
  cross join lateral (
    values
      (p.primary_pl_person_id,   'PL'),
      (p.secondary_pl_person_id, 'PL'),
      (p.candidate_pm_person_id, 'PM')
  ) as x(person_id, role)
  where p.deleted_at is null and x.person_id is not null
  union
  select m.person_id, p.id,
         case m.project_role when 'pm' then 'PM' when 'pl' then 'PL' else '참여' end,
         p.deal_status
  from project_members m
  join projects p on p.id = m.project_id and p.deleted_at is null
),
last_update as (
  select w.project_id, w.update_label, w.update_date,
         row_number() over (partition by w.project_id order by w.update_date desc nulls last) as rn
  from project_weekly_updates w
),
per_person as (
  select a.person_id,
         count(distinct a.project_id) as project_count,
         array_agg(distinct a.role) as roles,
         count(distinct a.project_id) filter (where a.deal_status in ('계약', '계약임박')) as contract_count,
         count(distinct a.project_id) filter (where a.deal_status in ('제안', '가망'))     as negotiation_count,
         max(lu.update_date) as last_date
  from assignment a
  left join last_update lu on lu.project_id = a.project_id and lu.rn = 1
  group by a.person_id
),
doc_count as (
  select entity_id as person_id, count(*) as doc_count
  from entity_documents where entity_type = 'person' group by entity_id
)
select
  p.id, p.name_ko as name, c.name_ko as company, p.title, p.email, p.phone,
  np.partner_status, np.network_segment, np.nda_status, np.profile_status, np.appointment_status,
  coalesce(pp.project_count, 0)::int as project_count,
  coalesce(pp.roles, array[]::text[]) as roles,
  coalesce(pp.contract_count, 0)::int as contract_count,
  coalesce(pp.negotiation_count, 0)::int as negotiation_count,
  coalesce(dc.doc_count, 0)::int as doc_count,
  pp.last_date,
  (select w.update_label from project_weekly_updates w
    join assignment a2 on a2.project_id = w.project_id and a2.person_id = p.id
   where w.update_date = pp.last_date limit 1) as last_label
from people p
left join network_profiles np on np.person_id = p.id
left join companies c on c.id = p.primary_company_id
left join per_person pp on pp.person_id = p.id
left join doc_count dc on dc.person_id = p.id
where p.deleted_at is null;

grant select on erp_partner_board to authenticated;
