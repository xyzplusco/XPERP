create or replace view erp_customer_rows as
select
  c.id::text as id,
  'C-' || upper(substr(replace(c.id::text, '-', ''), 1, 8)) as customer_id,
  c.name_ko as customer,
  coalesce(c.industry, c.sub_industry, '미지정') as industry,
  coalesce(project_counts.total_projects, 0) as project_count,
  coalesce(project_counts.active_projects, 0) as active_project_count,
  coalesce(project_counts.contract_like_projects, 0) as contract_count,
  coalesce(document_counts.open_documents, 0) as document_gap_count,
  coalesce(task_counts.open_tasks, 0) as task_count,
  coalesce(latest_project.name, '') as latest_project,
  coalesce(latest_project.project_type, '') as latest_project_type,
  coalesce(latest_project.status, '') as latest_status,
  coalesce(
    latest_project.next_action,
    latest_project.latest_update,
    latest_project.xp_request,
    latest_project.client_need,
    c.next_action,
    ''
  ) as next_action
from companies c
left join lateral (
  select
    count(*)::int as total_projects,
    count(*) filter (
      where p.status in ('confirmed', 'likely', 'discussing', 'managed')
    )::int as active_projects,
    count(*) filter (
      where p.status in ('confirmed', 'likely')
         or coalesce(p.contract_status, '') <> ''
    )::int as contract_like_projects
  from projects p
  where p.company_id = c.id
) project_counts on true
left join lateral (
  select p.*
  from projects p
  where p.company_id = c.id
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
    p.created_at desc
  limit 1
) latest_project on true
left join lateral (
  select count(distinct dr.id)::int as open_documents
  from document_requirements dr
  left join projects p on p.id = dr.project_id
  where dr.status in ('needed', 'requested', 'expired')
    and (dr.company_id = c.id or p.company_id = c.id)
) document_counts on true
left join lateral (
  select count(distinct t.id)::int as open_tasks
  from tasks t
  left join projects p on p.id = t.project_id
  where t.status in ('backlog', 'in_progress', 'waiting', 'blocked')
    and (t.company_id = c.id or p.company_id = c.id)
) task_counts on true
where c.name_ko is not null
  and btrim(c.name_ko) <> ''
  and c.name_ko <> '회사명'
  and coalesce(project_counts.total_projects, 0) > 0
order by
  project_count desc,
  active_project_count desc,
  c.name_ko asc;

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
