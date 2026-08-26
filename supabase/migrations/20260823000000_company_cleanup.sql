-- 껍데기 고객사 제거 + 다시 생기지 않게 막기
-- 2026-08-23
--
-- 고객사 459건 중 프로젝트가 있는 건 78건뿐이고, 73건은 이름이 이메일 주소였다.
-- 파트너 명부를 엑셀에서 임포트할 때 '소속 회사' 칸의 텍스트를 그대로 새 회사로 만들었기 때문이다.
-- 소속 칸에 이메일이 적혀 있으면 그 이메일이 회사가 됐다.
--
-- 지금까지는 화면(erp_customer_rows 뷰)이 이걸 '숨겨서' 63건만 보여주고 있었다.
-- 숨기면 편집도 삭제도 못 한다. 숨기는 대신 데이터를 고치고, 다시 안 생기게 막는다.

-- ---------------------------------------------------------------- 1. 이메일이 회사명인 것
-- 그 이메일은 대개 해당 파트너의 이메일이다. 파트너 쪽이 비어 있으면 옮겨 담는다.
update people p
set email = c.name_ko
from companies c
where p.primary_company_id = c.id
  and c.name_ko like '%@%'
  and coalesce(p.email, '') = '';

-- ---------------------------------------------------------------- 2. 회사가 아닌 이름 정리
create temporary table xp_junk_companies as
select c.id, c.name_ko
from companies c
where c.deleted_at is null
  and not exists (select 1 from projects p where p.company_id = c.id and p.deleted_at is null)
  and (
        c.name_ko like '%@%'                       -- 이메일
     or c.name_ko ~ '^[0-9][0-9\-+() ]{7,}$'       -- 전화번호
     or c.name_ko ~ '^[A-Z]사$'                     -- A사·B사 익명 코드
     or length(btrim(c.name_ko)) < 2                -- 본, X, F, -
     or c.name_ko ~ '회신|미팅|담당자?$|미정$|확인$|대기$'  -- 메모 조각
  );

-- 참조 끊기
update people set primary_company_id = null
where primary_company_id in (select id from xp_junk_companies);
delete from person_company_links where company_id in (select id from xp_junk_companies);
update tasks set company_id = null where company_id in (select id from xp_junk_companies);
update document_requirements set company_id = null where company_id in (select id from xp_junk_companies);
delete from meeting_notes where company_id in (select id from xp_junk_companies);
delete from entity_documents
 where entity_type = 'company' and entity_id in (select id from xp_junk_companies);

delete from companies where id in (select id from xp_junk_companies);

-- ---------------------------------------------------------------- 3. 완전 고아 회사
-- 프로젝트도 파트너도 티켓도 문서도 붙어 있지 않은 회사. 아무 데도 안 쓰인다.
delete from companies c
where c.deleted_at is null
  and not exists (select 1 from projects p where p.company_id = c.id)
  and not exists (select 1 from people pe where pe.primary_company_id = c.id)
  and not exists (select 1 from person_company_links l where l.company_id = c.id)
  and not exists (select 1 from tasks t where t.company_id = c.id)
  and not exists (select 1 from document_requirements d where d.company_id = c.id)
  and not exists (select 1 from meeting_notes m where m.company_id = c.id);

-- ---------------------------------------------------------------- 4. 다시 생기지 않게
-- 회사명은 최소한의 형태를 갖춰야 한다. 앱·스크립트 어느 쪽에서 들어와도 여기서 걸린다.
create or replace function xp_check_company_name()
returns trigger language plpgsql as $$
begin
  new.name_ko := btrim(new.name_ko);

  if new.name_ko is null or length(new.name_ko) < 2 then
    raise exception '회사명이 너무 짧습니다: %', new.name_ko;
  end if;
  if new.name_ko like '%@%' then
    raise exception '회사명에 이메일 주소를 넣을 수 없습니다: %', new.name_ko;
  end if;
  if new.name_ko ~ '^[0-9][0-9\-+() ]{7,}$' then
    raise exception '회사명에 전화번호를 넣을 수 없습니다: %', new.name_ko;
  end if;

  return new;
end;
$$;

drop trigger if exists companies_check_name on companies;
create trigger companies_check_name
  before insert or update of name_ko on companies
  for each row execute function xp_check_company_name();

-- ---------------------------------------------------------------- 5. 숨김 뷰 폐기
-- 품질 필터로 행을 감추던 뷰. 데이터를 고쳤으니 더 이상 필요 없고,
-- 숨어 있는 행 때문에 편집·삭제가 막히는 문제의 원인이었다.
drop view if exists erp_customer_rows;
