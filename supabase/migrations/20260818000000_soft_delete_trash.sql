-- 휴지통(소프트 삭제) + 대량 편집 기반
--
-- 삭제는 즉시 지우지 않고 deleted_at 을 채운다. 목록에서는 사라지고 휴지통에 모인다.
-- 복구가 가능하며, 영구삭제는 휴지통에서 별도로 수행한다.

do $$
declare
  t text;
begin
  foreach t in array array['companies', 'people', 'projects', 'events', 'tasks']
  loop
    execute format('alter table %I add column if not exists deleted_at timestamptz', t);
    execute format('alter table %I add column if not exists deleted_by_user_id uuid references users(id) on delete set null', t);
    execute format('create index if not exists %I on %I (deleted_at) where deleted_at is not null', t || '_deleted_idx', t);
  end loop;
end;
$$;

-- 제품 뷰에서 삭제된 행 제외
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
  where p.company_id = c.id and p.deleted_at is null
) project_counts on true
left join lateral (
  select p.*
  from projects p
  where p.company_id = c.id and p.deleted_at is null
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
    and t.deleted_at is null
    and (t.company_id = c.id or p.company_id = c.id)
) task_counts on true
where c.name_ko is not null
  and btrim(c.name_ko) <> ''
  and c.name_ko <> '회사명'
  and c.deleted_at is null
  and coalesce(project_counts.total_projects, 0) > 0
order by
  project_count desc,
  active_project_count desc,
  c.name_ko asc;
