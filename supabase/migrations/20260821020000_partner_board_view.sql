-- 파트너 관리 보드 집계를 뷰로 옮긴다
-- 2026-08-21
--
-- 기존에는 요청마다 people 2000 · projects 1000 · project_members 2000 · entity_documents 2000 건을
-- 앱으로 끌어와 서버 메모리에서 조합했다. 조회 화면이 사실상 집계 엔진이었다.
-- security_invoker 로 만들어 각 사용자의 RLS 가 그대로 적용된다
-- (member 는 자기 프로젝트만 집계되는 현재 동작이 유지된다).

drop view if exists erp_partner_board;

create view erp_partner_board
with (security_invoker = on) as
with assignment as (
  select x.person_id, p.id as project_id, x.role, p.status, p.contract_status
  from projects p
  cross join lateral (
    values
      (p.primary_pl_person_id,   'PL'),
      (p.secondary_pl_person_id, 'PL'),
      (p.candidate_pm_person_id, 'PM')
  ) as x(person_id, role)
  where p.deleted_at is null and x.person_id is not null

  union

  select m.person_id,
         p.id,
         case m.project_role when 'pm' then 'PM' when 'pl' then 'PL' else '참여' end,
         p.status,
         p.contract_status
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
         count(distinct a.project_id)                                            as project_count,
         array_agg(distinct a.role)                                              as roles,
         count(distinct a.project_id) filter (
           where a.contract_status = '계약' or a.status = 'confirmed'
         )                                                                       as contract_count,
         count(distinct a.project_id) filter (
           where a.contract_status = '협상' or a.status in ('discussing', 'likely')
         )                                                                       as negotiation_count,
         max(lu.update_date)                                                     as last_date
  from assignment a
  left join last_update lu on lu.project_id = a.project_id and lu.rn = 1
  group by a.person_id
),
doc_count as (
  select entity_id as person_id, count(*) as doc_count
  from entity_documents
  where entity_type = 'person'
  group by entity_id
)
select
  p.id,
  p.name_ko                                                as name,
  c.name_ko                                                as company,
  p.title,
  p.email,
  p.phone,
  np.partner_status,
  np.network_segment,
  np.nda_status,
  np.profile_status,
  np.appointment_status,
  coalesce(pp.project_count, 0)::int                       as project_count,
  coalesce(pp.roles, array[]::text[])                      as roles,
  coalesce(pp.contract_count, 0)::int                      as contract_count,
  coalesce(pp.negotiation_count, 0)::int                   as negotiation_count,
  coalesce(dc.doc_count, 0)::int                           as doc_count,
  pp.last_date,
  (
    select w.update_label
    from project_weekly_updates w
    join assignment a2 on a2.project_id = w.project_id and a2.person_id = p.id
    where w.update_date = pp.last_date
    limit 1
  )                                                        as last_label
from people p
left join network_profiles np on np.person_id = p.id
left join companies c on c.id = p.primary_company_id
left join per_person pp on pp.person_id = p.id
left join doc_count dc on dc.person_id = p.id
where p.deleted_at is null;

grant select on erp_partner_board to authenticated;
