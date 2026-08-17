# XP ERP Agent Log

Last updated: 2026-08-17

This log records what was done, why it was done, what changed, and what the next agent must not assume.

## Current Truth

XP ERP is not yet a finished product. It is now a Next.js ERP scaffold connected to a Supabase database with first-pass source imports and one live reconciliation pass applied.

The database exists and has real rows from the user-provided Excel files, but it is still not clean enough to be called a complete production data model.

Current DB state after reconciliation:

| Area | Current |
| --- | ---: |
| companies | 463 |
| people | 435 |
| network_profiles | 435 |
| person_company_links | 415 |
| projects | 195 |
| project_members | 97 |
| events | 23 |
| event_invitees | 0 |
| tasks | 151 |
| document_requirements | 245 |
| documents | 0 |

Current linkage:

| Linkage | Current |
| --- | ---: |
| projects linked to companies | 195 / 195 |
| projects linked to PL | 63 / 195 |
| projects linked to PM | 34 / 195 |
| tasks linked to any entity | 98 / 151 |
| document requirements linked to any entity | 239 / 245 |
| enriched companies | 105 |

Important data-quality findings:

| Issue | State |
| --- | --- |
| `회사명` header row exists in raw DB | Preserved in source tables, filtered from product views where possible |
| `A사`, `B사`, etc. anonymous M&A rows | Preserved; needs deal codename/anonymized deal policy |
| actual uploaded document files | none yet |
| event invitees/attendees | none yet |
| auth/login | intentionally removed for direct access during demo; must be rebuilt |
| seed fallback | no longer automatic; only via `XP_FORCE_SEED_FALLBACK=1` |

## Repository / Git State

Remote: `https://github.com/xyzplusco/XPERP`

Main branch latest commits:

```text
06c942d chore: apply product DB reconciliation results
0df2105 chore: audit actual product database readiness
bf7e3f5 fix: show seed data when Supabase is unconfigured
8b89b3c feat: add customer-centered deal views
aad5419 chore: enable demo access mode
9abbf74 fix: harden login config handling
2b781d8 feat: add Supabase auth gate
73ec135 feat: apply Supabase seed import pipeline
2f6f5d9 chore: prepare Supabase runtime env handling
36c7109 feat: localize UI and wire Supabase pipeline
3454bfa feat: wire app to operational seed data
3585708 feat: initialize XP ERP workspace
```

There are no intended uncommitted changes at the time this log was written.

## Source Files Used

The product work used four source workbooks:

| Source | Repo path | Why it matters |
| --- | --- | --- |
| Cleaned partner list | `data/XP_partner_list_cleaned_DB_ready.xlsx` | cleaned partner/person list |
| Deal list | `data/XP Deal list_대외비_20260805.xlsx` | customer/deal/project source |
| Original network list | `data/raw/00.XP_파트너 및 네트워크 리스트_260813.xlsx` | richer partner/network/onboarding/document state |
| To Go List | `data/raw/To Go List XYZ Plus (7).xlsx` | operational actions, events, document follow-ups |

Root-level `.xlsx` files are ignored via `.gitignore` so confidential workbook copies do not get accidentally committed.

## Environment / Secrets

Supabase environment variables were configured locally in `.env.local`. Do not print or commit the DB password.

Expected local env keys:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_DB_URL
```

The app should use real Supabase by default. Seed fallback is now explicit only:

```text
XP_FORCE_SEED_FALLBACK=1
```

Do not deploy with `XP_FORCE_SEED_FALLBACK=1` for actual product use.

## Detailed Timeline

### 1. Critical Product Reframe

Action:
- Reviewed `README.md`, existing handoff direction, and the four user-supplied Excel sources.

Why:
- The initial plan treated documents/tasks/search as late optional work. User clarified the core product is ERP for network, projects, events, search, document storage/management, and partner/customer records.

Outcome:
- Reframed v1 around operational control, not a decorative CRM.
- Made documents and next actions core v1 entities.
- Set design direction: dense, restrained B2C SaaS/ERP; one main green, sparse accent; no AI traffic-light aesthetic.

### 2. Initial Workspace and Source Audit

Action:
- Added raw source files under `data/` and `data/raw/`.
- Created source audit/import planning docs.
- Built `scripts/build_operational_seed.py`.
- Generated `data/processed/operational_seed_preview.json`.

Why:
- Needed a structured intermediate representation from messy Excel files before building database tables or UI.

Outcome:
- Operational preview generated:
  - people: 435
  - projects: 195
  - tasks: 157 in preview, 151 after DB import dedupe/filter
  - document requirements: 245

Important warning:
- This was a seed preview, not production truth. It preserved messy source rows instead of silently normalizing everything away.

### 3. UI Scaffold and Korean ERP Interface

Action:
- Built a Next.js app with dashboard, network, projects, events, documents, search, settings.
- Localized the UI into Korean.
- Replaced previous/dark-looking logo usage with the supplied XP white-background logo.
- Set sidebar branding to XP logo plus `XP Dashboard`.
- Made XP logo/brand link back to `/`.

Why:
- User requested Korean UI and a serious operational ERP feel, not a pretty CRM/demo page.

Outcome:
- App had a working, table-oriented ERP shell.
- Main color: `#1a3c2c`; accent: `#c8a45d`.

### 4. Supabase Schema and Import Pipeline

Action:
- Added initial Supabase migration:
  - `supabase/migrations/20260817000000_initial_schema.sql`
- Added migration runner:
  - `scripts/apply_migrations.mjs`
- Added seed importer:
  - `scripts/import_supabase_seed.mjs`
- Added runtime env loading:
  - `scripts/load_env.mjs`

Why:
- User wanted the app connected to Supabase with migrations and seed import, and wanted mock data removed.

Outcome:
- Applied schema and seed to Supabase after user provided DB URL/password.
- Tables created include:
  - users
  - people
  - companies
  - person_company_links
  - network_profiles
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

Important limitation:
- Import created many rows but did not fully normalize customer profiles, task links, event invitees, or document files.

### 5. Supabase Auth Attempt and Removal

Action:
- Added Supabase auth gate with `/login`, session guard, and logout control.
- Later removed the login gate for demo/direct access.

Why:
- Auth is needed for a real product, but user needed immediate access and did not have/know demo login credentials.

Outcome:
- Current app opens directly without login.
- This is not final product security.

Next product requirement:
- Reintroduce auth with a proper first admin user, role model, and Supabase RLS/server-side session strategy.

### 6. Claude Seed Review

Action:
- Reviewed user-provided Claude-generated project/event migration and seed files:
  - `/Users/jamesy/Downloads/files/20260817000000_xp_erp_projects_events.sql`
  - `/Users/jamesy/Downloads/files/etl_xp_seed.py`
  - `/Users/jamesy/Downloads/files/SEED_IMPORT_DESIGN.md`
  - `/Users/jamesy/Downloads/files/seed.sql`
- Wrote `docs/claude-seed-review.md`.

Why:
- User asked if the Claude-generated files were okay.

Outcome:
- Determined they were directionally useful but not safe to run as-is.
- Main issue: Claude SQL used different column conventions than the schema already applied here.

Decision:
- Do not paste-run Claude seed SQL. Adapt ideas into XP-native migrations/scripts.

### 7. Customer-Centered Deal Views

Action:
- Added customer menu and pages:
  - `/customers`
  - `/customers/[id]`
- Added `components/CustomerTable.tsx`.
- Added migration:
  - `supabase/migrations/20260817002000_customer_views.sql`
- Added docs:
  - `docs/customer-db-blueprint.md`

Why:
- User clarified customers need their own IDs and linked deals/contracts/projects.

Outcome:
- `companies.id` became the customer identity basis.
- `projects.company_id` became first customer-deal/project link.
- Did not create a standalone `contracts` table yet.

Decision:
- For now, deal/contract workflow lives in `projects`.
- Actual contract files and missing contract requirements belong in `documents` and `document_requirements`.

### 8. Seed Fallback Mistake and Correction

Action:
- Initially added automatic seed fallback so UI would not look empty when Supabase env vars were missing.
- User then clarified: enough demo, build actual product.
- Changed default behavior so automatic fallback is removed.

Why:
- The fallback solved demo optics but masked actual DB readiness problems.

Outcome:
- Current behavior:
  - if Supabase env exists: read real DB.
  - if no Supabase env: show DB-unconnected state.
  - if `XP_FORCE_SEED_FALLBACK=1`: use seed fallback explicitly for development/demo only.

Important:
- Do not use seed fallback as product behavior.

### 9. Actual Product DB Audit

Action:
- Added:
  - `scripts/audit_product_db.mjs`
  - npm script `db:audit`
  - `docs/product-db-status.md`

Why:
- User asked whether the actual DB was prepared.
- Needed objective numbers instead of UI impressions.

Initial audit result before reconciliation:
- companies: 463
- people: 435
- projects: 195
- tasks: 151
- documents: 0
- events: 23
- event_invitees: 0

Initial linkage before reconciliation:
- project-company: 195 / 195
- project PL: 61 / 195
- project PM: 34 / 195
- linked tasks: 22 / 151
- linked document requirements: 237 / 245
- enriched companies: 0

Conclusion:
- DB existed, but it was first-pass import/staging, not a real product DB.

### 10. Reconciliation Plan

Action:
- Added:
  - `scripts/plan_product_reconciliation.mjs`
  - `scripts/reconcile_product_db.mjs`
  - npm scripts `db:reconcile:plan` and `db:reconcile`

Why:
- Needed to move from text-only imported rows toward actual product links:
  - enrich customer/company records from Deal list fields.
  - connect To Go List tasks to companies/projects/people when confidently matched.
  - strengthen document requirement links.

Safety issue:
- An attempted direct live DB reconciliation command was initially blocked by safety review because it would heuristically mutate live data.
- A dry-run planner was added instead.

Dry-run issue found:
- Naive matching treated `김수민`, `대표`, and similar person/general terms as companies.

Fix:
- Restricted company candidates to valid Deal list companies.
- Excluded names that overlap known people/PL/PM names.

### 11. Live Reconciliation Applied

Action:
- After user explicitly said "적용해 그럼", ran:

```text
npm run db:reconcile
```

Why:
- User approved applying the reconciliation to live Supabase.

Result:

```json
{
  "staffPeopleInserted": 0,
  "companyProfilesUpdated": 105,
  "projectsUpdated": 195,
  "tasksLinked": 86,
  "documentRequirementsLinked": 2
}
```

Post-apply audit:
- project_members: 95 -> 97
- project PL linked: 61 -> 63
- tasks linked: 22 -> 98
- document requirements linked: 237 -> 239
- enriched companies: 0 -> 105

Important:
- Reconciliation did not create uploaded documents.
- It did not create event invitees.
- It did not solve anonymous `A사/B사` M&A rows.

### 12. Product View Quality Filters

Action:
- Added migration:
  - `supabase/migrations/20260817003000_product_view_quality_filters.sql`
- Applied it with:

```text
npm run db:migrate
```

Why:
- Audit showed source contamination such as `회사명` header rows.
- Deleting source-imported rows could harm traceability, so product views should filter obvious source artifacts.

Outcome:
- `erp_project_rows` filters `회사명`.
- `erp_customer_project_rows` filters `회사명`.
- `erp_customer_rows` already had a `회사명` filter.
- `scripts/audit_product_db.mjs` now reports data-quality counters:
  - header companies
  - header projects
  - anonymized companies
  - anonymized projects

Current data-quality counters:
- `header_companies`: 1
- `header_projects`: 7
- `anonymized_companies`: 12
- `anonymized_projects`: 33

Decision:
- Preserve source rows in raw DB for lineage.
- Filter obvious header artifacts from product views.
- Treat anonymous `A사/B사` rows as a separate product policy problem, not a deletion task.

## Validation Performed

Builds:

```text
npm run build
```

Result:
- Passed after major app/data changes.

DB:

```text
npm run db:migrate
npm run db:seed
npm run db:audit
npm run db:reconcile:plan
npm run db:reconcile
```

Important DB operations actually applied to live Supabase:
- migrations through `20260817003000_product_view_quality_filters.sql`
- initial seed import
- reconciliation pass after user approval

## Known Problems The Next Agent Must Handle

1. Auth is currently off.
   - Do not call this production-ready.
   - Need admin bootstrap, login, roles, RLS/server session strategy.

2. Documents are only requirements, not files.
   - `documents` table has 0 rows.
   - Need Supabase Storage bucket and upload/link UI.

3. Event management is skeletal.
   - `events` has 23 rows from To Go task extraction.
   - `event_invitees` is 0.
   - Need actual event schema enrichment and attendee parsing/import.

4. Customer data is improved but still incomplete.
   - 105 companies enriched.
   - Many companies still have sparse profile fields.
   - Need customer detail edit forms and review queue.

5. PL/PM matching is incomplete.
   - PL linked: 63 / 195.
   - PM linked: 34 / 195.
   - Need better person normalization and XP internal roster handling.

6. Anonymous M&A rows need a policy.
   - `A사`, `B사`, `S사`, etc. should probably become `deal_codename` or confidential deal records, not ordinary customer names.

7. Import pipeline needs staging/review, not direct trust.
   - Current scripts are better than pure seed, but still heuristic.
   - Add `import_records` per source row and a reconciliation UI.

8. App still has mostly list pages.
   - Product needs create/edit/detail workflows.
   - Especially customers, partners, projects, tasks, documents.

## Immediate Next Recommended Work

Do not start with UI polish.

Recommended order:

1. Add `company_type` or relationship classification:
   - customer
   - partner_company
   - vendor
   - investor
   - xp_internal
   - anonymous_deal_counterparty

2. Add a review queue:
   - unmatched tasks
   - ambiguous company/person matches
   - anonymous deal counterparties
   - missing PL/PM
   - document requirements without entity links

3. Build real customer detail workflow:
   - customer profile edit
   - linked projects
   - linked tasks
   - linked document requirements
   - source lineage

4. Build document storage:
   - Supabase Storage bucket
   - upload metadata in `documents`
   - link via `entity_documents`
   - satisfy `document_requirements.current_document_id`

5. Rebuild auth properly:
   - first admin setup
   - login
   - roles
   - server-side Supabase session
   - RLS or app-level access guard

## Files Added or Most Relevant

Core app:
- `app/page.tsx`
- `app/customers/page.tsx`
- `app/customers/[id]/page.tsx`
- `components/CustomerTable.tsx`
- `lib/operational-data.ts`
- `lib/navigation.ts`

DB/migrations:
- `supabase/migrations/20260817000000_initial_schema.sql`
- `supabase/migrations/20260817001000_document_requirement_subject_text.sql`
- `supabase/migrations/20260817002000_customer_views.sql`
- `supabase/migrations/20260817003000_product_view_quality_filters.sql`

Scripts:
- `scripts/build_operational_seed.py`
- `scripts/apply_migrations.mjs`
- `scripts/import_supabase_seed.mjs`
- `scripts/audit_product_db.mjs`
- `scripts/plan_product_reconciliation.mjs`
- `scripts/reconcile_product_db.mjs`
- `scripts/load_env.mjs`

Docs:
- `README.md`
- `AGENT_HANDOFF.md`
- `AGENT_LOG.md`
- `docs/product-db-status.md`
- `docs/customer-db-blueprint.md`
- `docs/claude-seed-review.md`
- `docs/demo-database-plan.md`
- `docs/import-contract.md`
- `docs/operational-seed.md`

## Explicit Warnings

- Do not represent current state as production-ready.
- Do not remove source-imported rows without a lineage/review strategy.
- Do not rely on seed fallback for real product.
- Do not paste-run external Claude SQL without adapting to current schema.
- Do not commit `.env.local` or Supabase DB password.
- Do not commit confidential root-level Excel files.
- Do not prioritize visual polish before DB review/edit/storage workflows.
