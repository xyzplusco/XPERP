# XP ERP — Agent Handoff

> Product source of truth: [`README.md`](./README.md)

## 0. Fast Context

| Item | Current State |
|---|---|
| Product | XP internal ERP for network, projects, events, documents, tasks, and search |
| Current phase | Phase 1R — Spec Correction & Source Audit |
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
Phase 1R Spec Correction & Source Audit          🔄 진행 중
Phase 2  Database Schema & Import Contracts      ⬜ 대기
Phase 3  Seed Extraction & Reconciliation        ⬜ 대기
Phase 4  App Scaffold & Design System            ⬜ 대기
Phase 5  Auth, Permissions, Document Storage     ⬜ 대기
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

