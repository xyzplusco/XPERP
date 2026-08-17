# XP ERP — Agent Handoff

> Product source of truth: [`README.md`](./README.md)

## 0. Fast Context

| Item | Current State |
|---|---|
| Product | XP internal ERP for network, projects, events, documents, tasks, and search |
| Current phase | Demo access + DB shaping |
| Previous issue | Old plan treated Documents & Tasks as Phase 10 / optional. That is wrong. |
| UI direction | Dense B2C SaaS/ERP, one primary green, restrained accent, no traffic-light AI badge styling |
| Primary color | `#1a3c2c` |
| Accent | `#c8a45d`, use sparingly |
| Logo | `assets/logo.png` |
| Source files | 4 Excel files, not 2 |
| Backend recommendation | Supabase unless user says otherwise |

## 1. Critical Product Correction

The ERP must not become a pretty CRM. It must solve daily operating control:

- Who is this person/company?
- Which segment do they belong to?
- Which project/event/document/task are they tied to?
- What document is missing or expiring?
- Who owns the next action?
- What came from which source file?

Documents and tasks are v1 core. Do not postpone them.

## 2. Revised Phase Roadmap

```text
Phase 1R Spec Correction & Source Audit          ✅ 완료
Phase 2  Database Schema & Import Contracts      ✅ 완료
Phase 3  Seed Extraction & Reconciliation        🔄 진행 중
Phase 4  App Scaffold & Design System            ✅ 완료
Phase 5  Auth, Permissions, Document Storage     🔄 진행 중
Phase 6  Network Module                          ⬜ 대기
Phase 7  Project Module                          ⬜ 대기
Phase 8  Event Module                            ⬜ 대기
Phase 9  Documents, Tasks, Search, Dashboard     ⬜ 대기
Phase 10 QA & Deploy                             ⬜ 대기
```

## 3. Source Data

### Files in repo

```text
data/
├── XP_partner_list_cleaned_DB_ready.xlsx
├── XP Deal list_대외비_20260805.xlsx
└── raw/
    ├── 00.XP_파트너 및 네트워크 리스트_260813.xlsx
    └── To Go List XYZ Plus (7).xlsx
```

### Source observations

| Source | Important Findings |
|---|---|
| Cleaned partner list | 399 people, 341 blank category, only 3 NDA=Y in cleaned fields |
| Original network list | XP, consulting partners, LP, external experts, vendors; includes NDA/profile/appointment/account status |
| Deal list | Deals_0731 has 94 company rows, 90 unique companies, 24 weekly update columns, PL/PM fields |
| To Go List | 157 operational rows; includes travel, IR, contracts, proposals, NDA/profile follow-ups, partner meetings |

## 4. Fixed Decisions

| ID | Decision |
|---|---|
| D1 | v1 includes Network, Projects, Events, Documents, Tasks, Search, Dashboard. |
| D2 | Documents and document requirements are core schema. |
| D3 | Tasks/next actions are core schema. |
| D4 | Keep partner tags simple, but add `network_segment` and onboarding/document fields. |
| D5 | Preserve import lineage with `import_sources` and `import_records`. |
| D6 | No Communication Log module in v1. Use tasks, updates, and activity logs instead. |
| D7 | Email/SMS real sending is v2. Tracking flags are v1. |
| D8 | No traffic-light badge UI. Use text, checkboxes, table columns, restrained indicators. |

## 5. Open Decisions

| ID | Decision Needed | Default Recommendation |
|---|---|---|
| O1 | Backend/storage | Supabase |
| O2 | Document sensitivity levels | internal / confidential / restricted |
| O3 | Google Drive links | allow URL metadata beside uploaded files |
| O4 | To Go List parsing | semi-automatic extraction with review queue |

## 6. Phase 2 Requirements

Create database schema/migration for:

- users
- people
- companies
- person_company_links
- network_profiles
- tags
- entity_tags
- projects
- project_members
- project_weekly_updates
- events
- event_invitees
- documents
- document_requirements
- entity_documents
- tasks
- import_sources
- import_records
- activity_logs

Acceptance criteria:

- Documents and tasks are present in initial schema.
- Document type remains free-form text.
- Document requirements exist even without uploaded file.
- Tasks can link to person/company/project/event/document requirement.
- Import records can preserve source workbook/sheet/row/raw text.
- No `communications` table.

## 7. Phase 3 Requirements

Build import/audit scripts for all 4 workbooks.

Acceptance criteria:

- Cleaned partner list import/audit.
- Original network list import/audit.
- Deal list import/audit.
- To Go List task/event extraction audit.
- Duplicate people/company report.
- PL/PM unmatched report.
- Missing NDA/profile/appointment requirement report.
- Idempotent seed strategy.

## 8. Design Guardrails

Use a hard, consistent ERP interface:

- white and soft-gray work surfaces
- `#1a3c2c` for primary action and selected nav
- `#c8a45d` for sparse accent only
- dense tables
- compact filters
- no hero landing page
- no gradient/blob backgrounds
- no colorful status pills
- no AI dashboard aesthetic

## 9. Handoff Log

### [2026-08-17] Phase 5 — Supabase Auth Gate Added

**Status**: Supabase DB is connected and seeded; app-level login gate is now added.

**Completed**
- XP logo and `XP Dashboard` brand area link back to `/`.
- Added `/login` with Supabase email/password sign-in.
- Added `proxy.ts` session guard. All ERP routes redirect to `/login` unless a Supabase Auth session exists.
- Added topbar login/logout control.
- Added `@supabase/ssr` for browser and server session cookie handling.

**Validation to run after edits**
- `npm run build`.

**Next**
1. Create at least one Supabase Auth user in the Supabase dashboard.
2. Add role/permission model in DB and UI: admin, manager, member, viewer.
3. Add Supabase Storage buckets for partner profiles, NDA, contracts, event materials.
4. Add row-level security after server-side data reads use the authenticated session.

### [2026-08-17] Claude Project/Event Seed Review

**Status**: External Claude seed files reviewed; do not run as-is.

**Completed**
- Reviewed `/Users/jamesy/Downloads/files/20260817000000_xp_erp_projects_events.sql`.
- Reviewed `/Users/jamesy/Downloads/files/etl_xp_seed.py`.
- Reviewed `/Users/jamesy/Downloads/files/SEED_IMPORT_DESIGN.md`.
- Reviewed `/Users/jamesy/Downloads/files/seed.sql`.
- Added `docs/claude-seed-review.md`.

**Decision**
- The design ideas are useful, but the SQL targets a different column convention from the schema already applied here.
- Current schema uses `name_ko`, `project_role`, `events.name`, `document_type`, `requirement_type`, `description`.
- Claude SQL expects `name`, `role`, `events.title`, `doc_type`, `detail`, and enum casts.

**Next**
- Build an XP-native compatibility migration and adapter script. Do not paste-run Claude's generated `seed.sql`.

### [2026-08-17] Demo Access Mode

**Status**: Login gate temporarily removed for demo.

**Completed**
- Removed Supabase Auth route guard from `proxy.ts`.
- Removed `/login` page and client auth components.
- Removed `@supabase/ssr`.
- Added `docs/demo-database-plan.md`.

**Decision**
- Demo should open directly to the XP Dashboard without requiring a Supabase Auth user.
- Re-enable login after at least one Supabase Auth user and role policy are ready.

### [2026-08-17] Customer-Centered Deal Structure

**Status**: Customer menu and customer DB views added.

**Completed**
- Added `고객사` navigation.
- Added `/customers` list page.
- Added `/customers/[id]` detail page.
- Added `erp_customer_rows` and `erp_customer_project_rows` views.
- Added `docs/customer-db-blueprint.md`.

**Decision**
- `companies.id` is the customer ID.
- `projects.company_id` is the first contract/deal/project link.
- Do not create a standalone `contracts` table yet. Use `projects` for deal/contract workflow and `documents` / `document_requirements` for actual contract files.

### [2026-08-17] Phase 5 — Supabase Wiring Started

**Status**: Supabase code wiring complete; remote DB migration and seed later completed with user-provided credentials.

**Completed**
- Replaced the dark-looking transparent logo with the provided white-background logo.
- Converted visible ERP UI copy to Korean.
- Sidebar now shows only the XP logo and `XP Dashboard`.
- Added Supabase packages: `@supabase/supabase-js`, `postgres`.
- Added `.env.example` with the provided project URL.
- Added `supabase/migrations/20260817000000_initial_schema.sql`.
- Added `scripts/apply_migrations.mjs` and `scripts/import_supabase_seed.mjs`.
- App data layer now reads Supabase views instead of importing the local seed JSON directly.
- If Supabase env vars are missing, the UI does not show mock data.

**Validation**
- `npm run build` passed.
- `npm run seed:operational` passed.
- `npm run db:migrate` and `npm run db:seed` correctly stop with `SUPABASE_DB_URL is required`.

**Blocked**
- Need `SUPABASE_DB_URL` to apply migrations and import seed data.
- Need `NEXT_PUBLIC_SUPABASE_ANON_KEY` for the app to read Supabase views.

**Next**
1. Add `SUPABASE_DB_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
2. Run `npm run db:migrate`.
3. Run `npm run seed:operational`.
4. Run `npm run db:seed`.
5. Run `npm run build`.

### [2026-08-17] Phase 3 — Operational Seed Preview Wired

**Status**: Phase 3 in progress.

**Completed**
- Added `scripts/build_operational_seed.py`.
- Generated `data/processed/operational_seed_preview.json`.
- Wired the Next.js pages to real source-derived operational seed data instead of mock constants.
- Dashboard, Network, Projects, Events, Documents, and Search now render from the generated seed preview.

**Validation**
- `npm run build` passed.
- Operational seed generated 435 people, 195 projects, 157 tasks, 245 document requirements.

**Next**
1. Add Supabase project configuration/migrations under `supabase/`.
2. Convert seed preview into idempotent DB import scripts.
3. Add real list/detail routes backed by database queries.

**Warning**
- Current seed parsing is conservative and review-oriented. Do not treat every extracted row as clean production truth without reconciliation.

### [2026-08-17] Phase 1R — Critical Spec Review Started

**Status**: Phase 1R in progress.

**Completed**
- Reviewed README and old handoff critically.
- Reviewed all 4 supplied Excel sources.
- Reframed product around operational ERP needs.
- Promoted Documents and Tasks from optional late phase to v1 core.
- Added raw network and To Go source files under `data/raw/`.

**Next**
1. Add schema/migration with document requirements, tasks, import lineage.
2. Add audit/import scripts.
3. Start app scaffold/design system if dependency setup allows.

**Warnings**
- Do not build from the old 11-phase plan.
- Do not skip Documents & Tasks.
- Do not use the cleaned partner file as the only partner truth.
- Do not make a colorful CRM UI.
