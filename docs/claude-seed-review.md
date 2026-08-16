# Claude Project/Event Seed Review

Review date: 2026-08-17

## Verdict

Do not run the supplied Claude SQL files as-is against the current XP ERP Supabase database.

The design direction is useful, especially:

- deterministic UUID v5 IDs
- idempotent upserts
- import lineage for source workbook / sheet / row
- weekly project updates as rows instead of spreadsheet columns
- event invitee operational flags
- project revenue plan and commercial terms as separate tables
- To Go List hierarchy as parent/child tasks

However, the generated migration and seed use a different naming model from the schema already applied in this repo. It will fail or create parallel conventions unless it is adapted first.

## Blocking Mismatches

| Area | Current XP ERP schema | Claude SQL expects | Result |
|---|---|---|---|
| Companies | `companies.name_ko` | `companies.name` | indexes and seed inserts fail |
| People | `people.name_ko`, `primary_company_id` | `people.full_name`, `company_id` | indexes and seed inserts fail |
| Import sources | `source_name`, `file_sha256`, `imported_by_user_id` | `source_kind`, `source_label`, `as_of_date` | seed insert fails |
| Import records | `source_row_number`, `raw_text`, `raw_json`, `mapped_entity_type` | `sheet_name`, `row_number`, `raw`, `target_table`, `target_id` | lineage insert and unique index fail |
| Projects | `project_type` is text check | generated SQL casts to `project_type` enum | seed insert can fail unless casts are removed |
| Project members | `project_role` values are lowercase | `role` values are `PL`, `PM`, `PM2` | member insert and views fail |
| Weekly updates | `update_label`, `update_date`, `source_import_record_id` | `period_label`, `period_start`, `import_record_id` | weekly seed insert partially fails |
| Events | `events.name`, status `planning/inviting/confirmed/completed/cancelled` | `events.title`, status `planned/done/postponed` | event insert fails |
| Documents | `document_type`, `sensitivity`, `memo` | `doc_type`, `is_confidential`, `note` | document inserts/views fail |
| Document requirements | `requirement_type`, `required_by`, `expires_at`, `memo` | `doc_type`, `due_date`, `expires_on`, `note` | document requirement seed fails |
| Tasks | `description`, `assignee_user_id`, text priority | `detail`, `assignee_person_id`, numeric priority | task seed fails |

## Recommended Integration Path

1. Keep the current applied schema as the source of truth.
2. Add a compatibility migration only for useful missing concepts:
   - `project_revenue_plan`
   - `project_commercials`
   - project raw labels: `service_sector_raw`, `pipeline_stage_raw`, `board_group_raw`
   - project member `is_tentative`
   - weekly update source metadata: `source_sheet`, `source_col_index`
   - event fields: `project_id`, `company_id`, `all_day`, `time_note`, `recurrence_note`, `agenda`, `outcome`
   - task hierarchy: `parent_task_id`, `theme`, `sort_order`, `support_person_id`
3. Rewrite Claude's seed output to our column names instead of changing the existing DB to match Claude.
4. Do not introduce `project_type`, `project_status`, or `doc_req_status` enums now. The existing text + check model is easier to operate during early import reconciliation.
5. Apply the adapted seed in a staging transaction first, then verify counts and duplicate rates before touching production data.

## Practical Decision

Claude's design document is worth keeping as reference. The generated migration and `seed.sql` are not production-ready for this repo.

The next implementation step should be an XP-native project/event extension migration, followed by an adapter script that emits seed rows using the current XP ERP schema.
