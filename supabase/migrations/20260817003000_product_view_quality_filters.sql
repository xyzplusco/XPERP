create or replace view erp_project_rows as
select
  pr.id,
  coalesce(c.name_ko, pr.name) as company,
  pr.project_type as type,
  coalesce(pl.name_ko, '') as pl,
  coalesce(pm.name_ko, '') as pm,
  coalesce(pr.next_action, pr.latest_update, pr.xp_request, pr.client_need, '') as next
from projects pr
left join companies c on c.id = pr.company_id
left join people pl on pl.id = pr.primary_pl_person_id
left join people pm on pm.id = pr.candidate_pm_person_id
where coalesce(c.name_ko, pr.name, '') <> '회사명'
order by pr.created_at asc;

create or replace view erp_customer_project_rows as
select
  p.id::text as project_id,
  p.company_id::text as customer_row_id,
  coalesce(c.name_ko, '') as customer,
  p.name as project,
  p.project_type as type,
  p.status,
  coalesce(pl.name_ko, '') as pl,
  coalesce(pm.name_ko, '') as pm,
  coalesce(p.contract_status, '') as contract_status,
  coalesce(p.next_action, p.latest_update, p.xp_request, p.client_need, '') as next_action,
  p.updated_at
from projects p
left join companies c on c.id = p.company_id
left join people pl on pl.id = p.primary_pl_person_id
left join people pm on pm.id = p.candidate_pm_person_id
where p.company_id is not null
  and coalesce(c.name_ko, '') <> '회사명'
order by
  case p.status
    when 'confirmed' then 1
    when 'likely' then 2
    when 'discussing' then 3
    when 'managed' then 4
    when 'on_hold' then 5
    else 9
  end,
  p.updated_at desc nulls last,
  p.created_at desc;
