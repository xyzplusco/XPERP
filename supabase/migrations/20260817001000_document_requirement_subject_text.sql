alter table document_requirements
  add column if not exists subject_text text;

alter table document_requirements
  drop constraint if exists document_requirements_check;

alter table document_requirements
  drop constraint if exists document_requirements_entity_or_subject_check;

alter table document_requirements
  add constraint document_requirements_entity_or_subject_check
  check (
    person_id is not null
    or company_id is not null
    or project_id is not null
    or event_id is not null
    or task_id is not null
    or subject_text is not null
  );

create or replace view erp_document_requirement_rows as
select
  dr.id,
  coalesce(p.name_ko, c.name_ko, pr.name, e.name, dr.subject_text, dr.title) as subject,
  dr.requirement_type as type,
  coalesce(u.email, '') as owner,
  dr.status,
  coalesce(dr.required_by::text, dr.expires_at::text, '검토') as due
from document_requirements dr
left join people p on p.id = dr.person_id
left join companies c on c.id = dr.company_id
left join projects pr on pr.id = dr.project_id
left join events e on e.id = dr.event_id
left join users u on u.id = dr.owner_user_id
order by dr.created_at asc;

