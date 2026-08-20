-- 관계 정본화
-- 2026-08-21
--
-- 같은 사실이 두 곳에 저장돼 있었다. 지금은 우연히 일치하지만 편집 경로가 한쪽뿐이라
-- 시간이 지나면 반드시 어긋난다. 어느 쪽이 정본인지 정하고, 파생 쪽은 트리거로 따라가게 한다.
--
--  프로젝트 담당 : 정본 = projects.primary_pl / secondary_pl / candidate_pm 컬럼
--                 파생 = project_members (project_role in ('pl','pm'))
--  파트너 소속   : 정본 = people.primary_company_id
--                 파생 = person_company_links (is_primary = true)
--
-- project_members 의 다른 역할(external_contributor·coordinator·viewer)은 파생이 아니라
-- 독립적인 사실이므로 트리거가 건드리지 않는다.

-- ---------------------------------------------------------------- 1. 소속 백필
-- 링크에는 소속이 있는데 people.primary_company_id 가 비어 화면에 안 나오던 건들을 채운다.
update people p
set primary_company_id = l.company_id
from (
  select person_id, min(company_id::text)::uuid as company_id
  from person_company_links
  where is_primary
  group by person_id
  having count(distinct company_id) = 1
) l
where l.person_id = p.id
  and p.primary_company_id is null;

-- ---------------------------------------------------------------- 2. 프로젝트 담당 동기화
create or replace function xp_sync_project_members()
returns trigger language plpgsql as $$
begin
  -- 파생 행만 지우고 다시 만든다. 다른 역할은 그대로 둔다.
  delete from project_members
  where project_id = new.id and project_role in ('pl', 'pm');

  if new.primary_pl_person_id is not null then
    insert into project_members (project_id, person_id, project_role, can_edit)
    values (new.id, new.primary_pl_person_id, 'pl', true)
    on conflict (project_id, person_id, project_role) do nothing;
  end if;

  if new.secondary_pl_person_id is not null then
    insert into project_members (project_id, person_id, project_role, can_edit)
    values (new.id, new.secondary_pl_person_id, 'pl', true)
    on conflict (project_id, person_id, project_role) do nothing;
  end if;

  if new.candidate_pm_person_id is not null then
    insert into project_members (project_id, person_id, project_role, can_edit)
    values (new.id, new.candidate_pm_person_id, 'pm', true)
    on conflict (project_id, person_id, project_role) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists projects_sync_members on projects;
create trigger projects_sync_members
  after insert or update of primary_pl_person_id, secondary_pl_person_id, candidate_pm_person_id
  on projects
  for each row execute function xp_sync_project_members();

-- ---------------------------------------------------------------- 3. 소속 동기화
create or replace function xp_sync_person_company_link()
returns trigger language plpgsql as $$
begin
  update person_company_links
  set is_primary = false
  where person_id = new.id and is_primary;

  if new.primary_company_id is not null then
    -- person_company_links 에는 (person, company) 유니크 제약이 없으므로 직접 확인한다.
    if exists (
      select 1 from person_company_links
      where person_id = new.id and company_id = new.primary_company_id
    ) then
      update person_company_links
      set is_primary = true
      where person_id = new.id and company_id = new.primary_company_id;
    else
      insert into person_company_links (person_id, company_id, relationship_type, is_primary)
      values (new.id, new.primary_company_id, 'affiliation', true);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists people_sync_company_link on people;
create trigger people_sync_company_link
  after insert or update of primary_company_id
  on people
  for each row execute function xp_sync_person_company_link();

-- ---------------------------------------------------------------- 4. 현재 데이터 정합화
-- 트리거는 앞으로의 변경만 잡는다. 지금 어긋난 것은 한 번 맞춰 둔다.

-- 4-1. 컬럼에 없는데 members 에 pl/pm 으로 남아 있는 행 제거 (담당자 교체 뒤 남은 접근권한)
delete from project_members m
using projects p
where p.id = m.project_id
  and m.project_role in ('pl', 'pm')
  and m.person_id is distinct from p.primary_pl_person_id
  and m.person_id is distinct from p.secondary_pl_person_id
  and m.person_id is distinct from p.candidate_pm_person_id;

-- 4-2. 컬럼에는 있는데 members 에 없는 행 보충
insert into project_members (project_id, person_id, project_role, can_edit)
select p.id, x.person_id, x.role, true
from projects p
cross join lateral (
  values (p.primary_pl_person_id, 'pl'), (p.secondary_pl_person_id, 'pl'), (p.candidate_pm_person_id, 'pm')
) as x(person_id, role)
where x.person_id is not null
  and not exists (
    select 1 from project_members m
    where m.project_id = p.id and m.person_id = x.person_id and m.project_role = x.role
  );

-- 4-3. 소속 링크의 is_primary 를 people.primary_company_id 기준으로 맞춘다
update person_company_links l
set is_primary = (p.primary_company_id is not distinct from l.company_id)
from people p
where p.id = l.person_id
  and l.is_primary is distinct from (p.primary_company_id is not distinct from l.company_id);
