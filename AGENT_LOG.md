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

## [2026-08-17] Claude Fable — 앱 레이어 전면 재구축

### 판단
Codex가 만든 것 중 DB 스키마·마이그레이션 러너·임포트 파이프라인은 유지. 앱 레이어(전부 읽기 전용 리스트, 인증 없음, 상세화면 없음)는 요구사항 대비 부족해 전면 재작성.

### 완료
- **인증**: Supabase Auth 이메일/비밀번호 + `@supabase/ssr` + `proxy.ts` 세션 가드. 미로그인 시 전 경로 /login 리다이렉트.
- **권한 (RLS)**: `20260817010000_auth_roles_rls_storage.sql`
  - `users.auth_user_id` 추가, `xp_is_member/xp_is_admin/xp_can_edit_project` 헬퍼
  - 전 테이블 RLS: 읽기는 등록된 활성 계정만, 쓰기는 admin 전체 / PL·PM 자기 프로젝트만
  - anon 권한 전면 회수 (기존엔 anon key로 DB 전체 노출 상태였음)
  - `xp-documents` private 버킷 + storage 정책
- **계정 생성 스크립트**: `scripts/create_user.mjs` (auth.users 직접 insert, bcrypt, identities 포함, users 행 연결)
- **화면**: 대시보드(통계+Deal List+상태필터), 고객사 목록/상세, 파트너 목록/상세(구분 필터), 프로젝트 목록/상세(편집/업데이트 타임라인/액션), 이벤트 목록/상세, 문서 레지스트리, 설정(계정 관리)
- **상호참조**: 고객사↔프로젝트↔파트너(PL/PM/구성원) 전부 하이퍼링크
- **문서 업로드**: 각 상세화면에서 Storage 업로드 → documents/entity_documents 기록 → 필요 문서 충족 처리(선택) → signed URL 다운로드
- **디자인**: globals.css 재작성 — 흰 표면/헤어라인 보더/2px 룰, 그린 최소 사용, 아이콘·뱃지·마케팅 문구 없음
- 구 파일 제거: app/network, app/search, CustomerTable/DataTable/SectionHeader, operational-data.ts (`_to_delete/`로 이동)

### 검증
- `npm run build` 통과 (Next 16.3.1)
- 모든 PostgREST embed 쿼리를 라이브 DB에 직접 실행해 FK 힌트/컬럼명 검증 완료
- `next start` 스모크: 미로그인 307 → /login, 로그인 페이지 렌더 확인
- 인증된 전체 플로우는 마이그레이션 적용 전이라 미검증 (샌드박스에서 5432/6543 차단)

### 다음 에이전트 필수 확인
1. `npm install && npm run db:migrate` 로컬 실행 (적용 전엔 RLS 없음 = 배포 금지)
2. `npm run user:create -- --email yoonks9306@gmail.com --password '...' --role admin`
3. Supabase 대시보드에서 공개 signup 비활성화 + `erp-smoke-test@xyzplus.co` 삭제
4. 이후 우선순위는 AGENT_HANDOFF.md §5

## [2026-08-17] Claude Fable — 엑셀 왕복 데이터 정리 파이프라인

### 배경
raw data 오염(파트너 구분 칸에 이름/전화번호, `회사명` 헤더 행, A사/B사 익명 딜, PL/PM 미연결 다수)을 앱에서 한 건씩 고치는 건 비현실적. 엑셀 내보내기 → 대량 수정 → 가져오기 왕복 구조를 추가.

### 추가된 것
- `scripts/lib/workbook_schema.mjs` — 시트/열/드롭다운 정의. export·import가 이 파일 하나를 공유하므로 열 추가 시 한 곳만 고치면 됨.
- `scripts/lib/db.mjs` — 접속 헬퍼. `sslmode=disable` 이면 SSL 끔(로컬 테스트용).
- `scripts/export_workbook.mjs` (`npm run db:export`) — 고객사/파트너/프로젝트/참고 4시트. ID 열 회색 잠금, 드롭다운 데이터 유효성 검사, PL/PM·고객사는 이름으로 표시, 오염된 partner_status는 '기존 구분값(참고)' 열로 분리.
- `scripts/import_workbook.mjs` (`npm run db:import`) — 기본 dry-run, `--apply` 로 반영. 단일 트랜잭션.
- 의존성 `exceljs` 추가.

### 설계 결정
- ID 있으면 UPDATE(바뀐 열만), 비어 있으면 INSERT. 삭제는 엑셀 행 삭제가 아니라 '삭제'=Y 열로만 (실수 방지).
- 시트 처리 순서 고객사 → 파트너 → 프로젝트. 같은 파일에서 만든 신규 고객사/파트너를 신규 프로젝트가 참조 가능 (PENDING 마커로 해소).
- 삭제 참조 검사는 '같은 파일에서 함께 삭제되는 프로젝트'를 제외하고 판정 → 쓰레기 회사 + 딸린 쓰레기 프로젝트 동시 삭제 가능.
- 동명이인은 자동 매칭하지 않고 오류로 보고 (잘못된 사람에게 프로젝트가 붙는 게 최악).
- 변경 전/후를 `activity_logs` 에 `excel_insert/update/delete` 로 기록.

### 검증 (컨테이너에 Postgres 16 띄워 실 스키마 재현 후 end-to-end)
- 오류 5종 정확히 검출: 참조 있는 회사 삭제 시도, 드롭다운 외 값, 동명이인 PL/PM, 없는 고객사 참조, ID 훼손
- 정상 반영 10건: 수정/신규/삭제 + 신규 프로젝트가 신규 고객사·신규 파트너를 정확히 참조
- 멱등성 확인: 내보내기 → 무수정 가져오기 = 변경 0건
- numeric(18,2) 이 `"300000000.00"` 로 돌아와 매출이 매번 변경으로 잡히던 버그 수정

### 다음
- 주차별 업데이트 임포트, 매출 실적 테이블, 앱 내 신규 생성 폼은 아직 미착수 (AGENT_HANDOFF.md §5)

## [2026-08-17] Claude Fable — 회의록 모듈 + 전자계약 데이터 반영

### 1) 회의록 (업체별 전용 버킷)
- 마이그레이션 `20260817020000_meeting_notes.sql`
  - `meeting_notes` 테이블 (company_id / project_id, meeting_date, attendees, summary, 스토리지 메타)
  - 전용 버킷 `xp-meeting-notes` (private). 계약/NDA의 `xp-documents` 와 분리.
  - 정렬 인덱스: (company_id, meeting_date desc, created_at desc), 프로젝트도 동일
  - RLS: 등록 구성원 열람·업로드, 본인 업로드분 수정/삭제, admin 전체
- `components/MeetingNotesPanel.tsx` — 업로드 폼(회의일자·제목·참석자·파일) + 회의 일자 최신순 타임라인 + 삭제
- 고객사 상세(업체 단위, 프로젝트 회의록 포함 표시)와 프로젝트 상세에 배치
- 정렬 로직: meeting_date DESC → 동일 날짜면 created_at DESC. 등록순이 아니라 **회의가 열린 날짜** 기준.

### 2) 전자계약 내보내기 반영
입력: `data/contracts/contracts_customers.xlsx` (79건), `contracts_partners.xlsx` (59건)

- `scripts/lib/contracts.mjs` — 제목→문서종류 판정, 서명참여자 파싱, 인명 추정
- `scripts/prepare_contracts.mjs` (`npm run contracts:prepare`) — DB 명단과 대조해 매칭 추천 → 검토용 엑셀
- `scripts/import_contracts.mjs` (`npm run contracts:import`) — 검토표 → DB. dry-run 기본, `--apply` 로 반영

매칭 전략 (우선순위):
1. 서명 이메일 ↔ people.email 정확 일치
2. 계약 제목 안에 등록된 회사명/사람 이름이 포함되는지 (가장 긴 일치 우선)
3. 서명자 표시 이름 또는 제목 토큰에서 인명 추정 → '확인 필요' 로 표시

반영 내용: documents 등록(memo에 `contract_id=` 보관하여 중복 방지) → entity_documents 연결 →
NDA 계약이면 network_profiles.nda_status='O' → 해당 대상의 미충족 document_requirements를 'signed' 처리 → activity_logs 기록.

### 검증 (로컬 Postgres에 실 스키마 + 실제 계약 138건)
- 자동 매칭 128/138 (이메일 2, 이름·회사명 126), 확인 필요 10건은 모두 실제로 모호한 건
- 오탐 2종 수정: `경력증명서(한글)` 의 "한글"을 인명으로 잡던 문제, 파트너 시트의 회사 상대 계약을 사람으로 잡던 문제
- 반영 결과: documents 128, entity_documents 128, NDA 완료 43명, 요구사항 충족 3건
- 재실행 시 128건 전부 '이미 반영됨' 으로 건너뜀 (멱등)
- 마이그레이션 6개 전부 auth/storage 스텁 환경에서 무오류 적용 확인

### 남은 것
- 확인 필요 10건은 James가 검토표에서 직접 지정 (미등록 인물은 db:export/db:import 로 먼저 등록)
- 계약 실물 파일은 전자계약 시스템에 있음. ERP에는 메타데이터만 등록됨.

## [2026-08-17] 엑셀 왕복 실사용 피드백 반영

James가 실제로 편집한 워크북(파트너 31행 삭제 표시, 신규 23행)을 그의 DB 구조로 재현해 검증한 결과 발견한 문제들:

1. **드롭다운 목록이 실무 표현과 불일치** → 오류 31건 중 대부분이 이것
   - 프로젝트 상태에 '진행 중'이 없어 17행 거부됨. `managed` 의 표시값을 '관리 중' → **'진행 중'** 으로 변경 (lib/labels.ts 포함)
   - NDA/프로필/위촉 칸의 'Y', 날짜(2025.12.10) 거부됨
   - 구분 칸의 '후보' 거부됨
   → `toDb()` 에 별칭(aliases) 3번째 요소 추가. 문서 상태 칸은 `dateMeansDone` 옵션으로 날짜를 '완료'로 해석.
   → 오류 31건 → 11건으로 감소, 프로젝트 반영 101 → 115건

2. **readOnly 열 추가 시 기존 편집 파일이 깨지는 문제**
   → 헤더 검사에서 readOnly 열은 제외. 이전 버전 내보내기 파일도 그대로 가져올 수 있음.

3. **오류 출력이 눈에 안 띔** → 구분선 추가, 표시 건수 40 → 60,
   '먼저 등록해야 할 이름'을 참조 횟수와 함께 한 번에 모아 출력.

4. **품질 경고 열 추가** (`scripts/lib/quality.mjs`)
   - 파트너: 이름 칸이 직함/이메일/전화번호, 소속 칸이 이메일, 이름·이메일 중복, 정보 없음
   - 고객사: 헤더 행, 익명 딜(A사), 사람 이름과 동일, 연결 프로젝트 없음
   - 엑셀에서 이 열로 필터하면 정리 대상만 모아 볼 수 있음

검증: 그의 실제 편집 파일로 --apply 실행 → people 435 → 427 (삭제 31, 신규 23),
'CEO/CFO/CMO/CSO/대표/이사' 등 직함이 이름인 행 0건 잔존, activity_logs 681건 기록.

**중요**: 삭제가 반영되지 않았던 원인은 코드 문제가 아니라 `--apply` 미실행이었음.
dry-run 은 절대 DB를 건드리지 않는다는 점을 다음 에이전트도 유의.

## [2026-08-17] User Flow 고도화 — 폴더 / 티켓 / 이벤트 개편

### 설계 결정 (IT PM 관점)
- **티켓은 새 테이블을 만들지 않고 기존 `tasks` 를 그대로 사용.** `project_id` 가 null 이면 Unsorted 티켓,
  값이 있으면 해당 프로젝트 소속. "티켓"과 "액션"이 분리되면 기록 위치가 이원화되어 반드시 유실이 생긴다.
- **폴더는 고정 상수가 아니라 `project_folders` 테이블.** 사용자가 "ERP 관련 프로젝트가 따로 있을 수도"라고
  언급했으므로 폴더 추가에 마이그레이션이 필요 없어야 한다.
- **담당자(Responsible)는 `tasks.assignee_person_id` → people.** 계정(users)이 아니라 people 을 가리키는 이유는
  계정 없는 파트너에게도 책임을 지정할 수 있어야 하기 때문. 지정 후보는 XP 내부 · 계정 보유자 · 프로젝트 PL 로 자동 구성.

### 마이그레이션 20260817030000_folders_tickets_events.sql
- `project_folders` + 시드 4개 (Re-Engineering / Go Global / AX / XP 경영), `projects.folder_id`
- `tasks.assignee_person_id`, 미분류 티켓용 부분 인덱스
- **tasks RLS 수정**: 기존 정책이 `project_id is not null` 을 요구해서 미분류 티켓 생성이 원천 차단되어 있었음.
  구성원은 미분류 티켓 생성 가능, 본인 생성/담당 티켓 또는 담당 프로젝트 티켓 수정 가능하도록 재작성.
- `events.is_date_tbd`
- **`event_type='source_task'` 이벤트 23건 삭제.** 연결된 event_invitees/document_requirements 정리,
  `tasks.event_id` 는 null 로 해제하여 **액션 자체는 tasks 에 그대로 보존**(사용자 요청: 그런 건 프로젝트 안 티켓이 맞다).
- events / event_invitees 를 구성원 누구나 운영할 수 있도록 정책 완화 (행사 운영은 협업 작업)

### 화면
- 사이드바: 로고 28px → 44px, "XP ERP" 텍스트 제거, 하단에 큰 **티켓 생성** 버튼
- `components/TicketDialog.tsx` — 어느 화면에서든 뜨는 팝업. 담당자는 **칩 버튼**으로 원클릭 지정,
  프로젝트는 검색 후 선택(비우면 미분류), 기한·우선순위. Esc/배경클릭으로 닫힘.
- `/tickets` — 미분류 / 진행 중 / 전체 탭. 표에서 담당자·프로젝트·상태·기한을 인라인 변경.
  '프로젝트에 넣기' 버튼으로 미분류 티켓을 프로젝트로 이동.
- `/projects` — 폴더 탭 필터(전체 / 4개 폴더 / Unsorted, 각 건수 표시). 상세에서 admin 이 폴더 지정.
- 이벤트 전면 개편:
  - 목록에 초대/참가확정 인원 수, 일시 미정 표시
  - 상세: 현황 요약(초대·이메일·문자·회신·참가확정·불참)
  - `components/InviteeManager.tsx` — **명단 붙여넣기 일괄 추가**(탭/콤마 인식, 이메일·전화 위치 자동 판별,
    이름이 파트너와 유일 일치하면 자동 연결), 행별 4개 플래그 체크박스, 참석 여부 선택, 삭제
  - 복사 버튼: 전체/선택 이메일, 전체/선택 전화번호, **미회신자 이메일**(팔로업용), **참가확정 명단**(현장 체크인용)

### 검증
- 마이그레이션 7개 전부 무오류 적용, 재실행 안전
- source_task 이벤트 삭제 확인: 임시 이벤트 제거·실제 이벤트 보존·고아 초대자 0·태스크는 event_id 만 해제되고 보존
- `npm run build` 통과

## [2026-08-18] 라이브 동기화 + 대량 편집 / 휴지통

### 라이브 DB 동기화
- 사용자가 제공한 Supabase Personal Access Token 으로 Management API 경유 적용 경로를 추가
  (`scripts/apply_migrations_api.mjs`, `scripts/migration_status_api.mjs`).
  이 컨테이너에서 Postgres 포트(5432/6543)는 막혀 있으나 api.supabase.com(443)은 열려 있다.
- 확인 결과 020000·030000 은 사용자가 이미 적용한 상태였고, 신규 20260818000000 만 적용됨.
- 라이브 상태: companies 463 / people 427 / projects 195 / tasks 151 / events 0 / folders 4 / users 1
- 관리자 계정 `yks@xyzplus.co` 의 person_id 가 비어 있어 윤권상(people)과 연결함.
  이걸 연결해야 사이드바에 이름이 뜨고 담당자 후보 목록에 포함된다.

### 배포 견고성
- 환경변수가 없으면 모든 페이지가 500 이 되던 문제 → `app/layout.tsx` 에서 사전 확인 후
  원인과 해결법을 보여주는 화면을 렌더한다. 빌드는 환경변수 없이도 통과함을 재확인.

### 휴지통 (소프트 삭제)
- `20260818000000_soft_delete_trash.sql`: companies·people·projects·events·tasks 에
  `deleted_at`, `deleted_by_user_id` 추가 + 부분 인덱스. `erp_customer_rows` 뷰도 삭제행 제외하도록 재생성.
- 모든 목록 쿼리에 `.is("deleted_at", null)` 적용.
- `/trash`: 유형별로 모아 보기, 복구, 영구삭제(관리자), 유형별 비우기(관리자).
- 삭제는 되돌릴 수 있어야 하므로 하드 삭제는 휴지통에서만 가능하게 했다.

### 대량 편집 / 인라인 수정
- `lib/bulk.ts` — **수정 가능한 테이블·필드·허용값 화이트리스트.** 서버 액션은 이걸 통과한 값만 DB에 쓴다.
  임의 테이블/컬럼 주입을 막기 위한 것이므로 새 필드를 열 때 반드시 여기에 등록할 것.
- `components/BulkTable.tsx` — 재사용 표. 체크박스 선택 → 상단 바에서 일괄 적용/휴지통,
  셀 더블클릭 → 인라인 수정(Enter 저장, Esc 취소, 저장됨 표시).
- 적용 화면: 프로젝트(폴더·유형·상태 일괄), 고객사, 파트너(구분·분류·NDA 일괄), 이벤트(상태 일괄).
- people 의 구분/NDA 등은 network_profiles 에 있으므로 upsert 로 분기 처리.

### 검증 (라이브 DB 대상)
- 임시 QA 관리자 계정을 만들어 실제 세션 쿠키로 9개 페이지 전부 200 렌더 확인 (쿼리 오류 0건).
- 쓰기 경로 검증: 프로젝트 status 인라인 변경 → 휴지통 이동 → 휴지통 조회 → 복구까지 RLS 통과 확인,
  데이터는 원상복구. 이후 QA 계정 삭제.
- `npm run build` 통과.

### 주의
- 토큰은 대화로 전달받아 사용했다. 사용자에게 폐기 안내함. 코드/커밋에 남기지 않았다.

## [2026-08-18] XP 통합 파이프라인 반영 (라이브)

입력: `data/XP_통합파이프라인_2026.xlsx` — Pipeline 90행 / 매출현황 6행 / 원본백업.

### 사전 확인
- 파이프라인 90개 회사가 **전부 기존 companies 에 존재**, PL/PM 15명도 **전부 people 에 존재**.
  즉 신규 고객사·파트너 생성이 불필요했다. (사용자 요청대로 파트너 DB는 건드리지 않음)

### 매핑 규칙 (scripts/sync_pipeline.mjs)
- 서비스섹터 → 폴더: BPR/리엔지니어링→Re-Engineering, BB/비즈니스빌딩→Business Building,
  GX/해외→Go Global, AX→AX, 투자·매각·F.I.M·IR→투자·M&A, 영업·영업컨설팅·사업컨설팅→영업·컨설팅.
  신규 폴더 3개 생성(Business Building / 투자·M&A / 영업·컨설팅).
- 상태 → projects.status: 계약→confirmed, 계약임박→likely, 제안·가망→discussing, 관리→managed, 보류→on_hold
- **구간(고객/협상/관리기업/미정리후보/파트너협업건)은 contract_status 에 그대로 보관.** 딜 목록의 '계약' 열에 노출된다.
- 주차 라벨 '8월2차' → 날짜 환산 (1차=1일, 2차=8일, 3차=15일, 4차=22일), 연도 2026.
- 매출현황 합계 → expected_revenue.

### 결과
| 항목 | 값 |
|---|---:|
| 살아있는 프로젝트 | 90 (이전 195) |
| 휴지통 | 109 (중복 45 + 파이프라인 외 64) |
| 주차별 업데이트 | 349 (이전 123, 대부분 무관한 것) |
| 고객사 목록 | 89 |
| PL 연결 | 43 / 90 |
| 예상매출 입력 | 6건 (합계 3.17억) |
| 익명 M&A(A사/S사 등) 잔존 | 0 |

### 주의사항 / 배운 점
- **Management API 는 요청 수 제한이 있다.** 프로젝트당 5회씩 450회를 보냈다가 Cloudflare 502.
  10건씩 묶어 `begin; ... commit;` 한 번으로 보내도록 수정(총 9회). 대량 작업 시 반드시 배치할 것.
- **같은 회사가 파이프라인에 여러 번 나올 수 있다** (유앤어스: BPR 협상/김수민 + 투자·매각 관리/이봉진).
  처음엔 회사당 1건으로 접어버려 한 건이 사라졌다. `keepProjectIds` 로 이미 배정된 프로젝트를 제외하도록 수정.
- 반영 전 `backup_before_pipeline_20260818.json` 으로 projects/members/weekly/companies 전량 백업.
  휴지통은 `deleted_at` 이므로 UI에서 복구 가능하고, 필드 덮어쓰기는 이 백업으로 되돌릴 수 있다.
- 스크립트는 멱등하다. 같은 파일을 다시 돌리면 같은 결과로 수렴한다.

### 재실행 방법
```bash
npm run pipeline:sync -- --file data/XP_통합파이프라인_2026.xlsx           # 미리보기
npm run pipeline:sync -- --file data/XP_통합파이프라인_2026.xlsx --apply   # 반영
```
로컬은 SUPABASE_DB_URL 로 붙고, 포트가 막힌 환경에서는 `XP_DB_MODE=api SUPABASE_ACCESS_TOKEN=... ` 로 HTTPS 경유.

## [2026-08-19] UX 1단계 — 기록이 쌓이는 구조

계획서: `docs/ux-roadmap.md` (요청 3건 설계 + 실무자 관점 제안 + 우선순위)

### 왜 이것부터인가
실측: 최근 30일 내 업데이트가 **3건**뿐. 김수민 PL이 89건 중 20건 부담. PL 미배정 46건.
원본 안내 시트가 원인을 명시 — *"PL은 주간업무보고만 작성하고, 경영지원팀이 이를 확인해 Pipeline에 반영"*.
**이중 입력 구조**다. 기록이 안 쌓이면 파트너 보드·아카이브·대시보드가 전부 빈 껍데기가 되므로 이걸 먼저 없앴다.

### 만든 것
- `lib/week.ts` — XP 주차 규칙(1~7일=1차, 8~14=2차, 15~21=3차, 22~말일=4차). 원본 안내와 동일 기준.
- **홈을 '내 업무'로 재구성** (`app/page.tsx`)
  - 기한 지난 티켓 / 오늘 기한 / 내 티켓 / 내 프로젝트 / 이번 주차 미작성 / 30일 정체
  - 내 티켓은 기한 지남 → 오늘 → 나머지 → 기한없음 순
  - 내 프로젝트는 **마지막 업데이트가 오래된 순** (정체 건이 위로)
  - 관리자에게만 아래에 '전사 현황' + Deal List 유지 (경영진 뷰 보존)
- **주간 업데이트 화면** (`/weekly`)
  - 내 담당 프로젝트를 세로로 나열, 각 칸에 바로 타이핑 → 한 번에 저장
  - 지난 주차 내용을 왼쪽에 흐리게 표시 (참고용)
  - 최근 8개 주차 탭으로 소급 작성 가능
  - 비우면 해당 주차 기록 삭제 (오기입 정정)
  - 저장 시 `project_weekly_updates` + `projects.latest_update` 동시 갱신 → 딜 목록에 즉시 반영
- **프로젝트 아카이브 + 정체 뷰** (`/projects`)
  - 활성 / 정체 30일+ / 아카이브 / 전체 토글 (폴더 탭과 별개 축)
  - 아카이브 판정: status가 완료·중단·보류이거나 구간이 '관리기업'
  - '마지막 업데이트' 열 추가 (주차 라벨 + 경과일)
  - 실제 분포: 활성 54 / 정체 50 / 아카이브 35 / 전체 89

### 검증 (라이브 DB, 실제 세션)
- 김수민(20건 담당)에 연결한 임시 PL 계정으로 로그인해 확인
  - 홈: 내 프로젝트 21, 8월3차 미작성 21, 정체 20 — 오래된 순 정렬 확인
  - `/weekly`: textarea 21개 생성, 주차 탭 8개, 한글 라벨 URL 인코딩 정상(200)
- **RLS 권한 검증**
  - PL이 자기 프로젝트 주차 업데이트 insert → 201 성공
  - PL이 `projects.latest_update` 갱신 → 200 성공
  - **PL이 남의 프로젝트에 insert → 403 차단** ✓
- 검증 후 임시 계정·임시 기록 전량 삭제

### 다음 (계획서 2·3단계)
- 이벤트 참석자 파트너 검색 추가 + 인라인 생성
- 파트너 관리 보드 (라벨이 아니라 근거로 판정 — 구분 382명 미분류라 라벨 필터는 11명만 나옴)
- 저장된 목록 뷰 / 칸반 / PL 미배정 큐(46건)

### 선행 필요
PL이 직접 쓰는 구조이므로 **PL 계정 발급이 선행**돼야 한다. 현재 계정은 관리자 1개뿐.
`npm run user:create -- --email .. --password .. --role member --person "김수민"`

## [2026-08-19] 권한 체계 재설계

기획: `docs/permissions-plan.md`

### 발견한 문제
21개 테이블의 SELECT 정책이 **전부 `xp_is_member()` 하나**였다. 즉 계정이 활성이기만 하면
역할과 무관하게 전사 데이터(매출·계약서·모든 프로젝트)가 다 보였다. 쓰기만 막혀 있었다.
계정이 1개뿐이라 드러나지 않았을 뿐, PL 계정을 발급하는 순간 터졌을 구멍이다.

### 결정 (사용자 확인)
- 역할 4단계: owner / staff / member / viewer (열람전용 추가)
- 파트너 명부는 member 에게도 **전사 공개** — 네트워크가 XP 핵심 자산이라 PL이 못 찾으면 일이 안 됨
- 매출 금액은 member 에게 **숨김**
- 이벤트는 전사 공개

### 마이그레이션 20260819000000_role_model.sql
- `global_role` 값 교체, owner 단일성을 부분 유니크 인덱스로 강제, yks@xyzplus.co → owner 승격
- 헬퍼 6종 추가, `xp_is_admin()` 을 owner+staff 로 재정의(기존 쓰기 정책 호환 유지)
- SELECT 정책 전면 재작성, 쓰기 정책에서 viewer 제외(`xp_can_write()`)

### 계정 관리 화면
- `lib/supabase/admin.ts` — service_role 클라이언트. **계정 생성/삭제 전용**, 서버에서만.
- 설정 화면에 계정 추가 / 역할·상태 변경 / 파트너 연결 / 비밀번호 재설정 / 삭제
- 임시 비밀번호는 생성 직후 1회만 표시 (DB엔 해시만)
- users 행 생성이 실패하면 Auth 사용자를 되돌려 고아 계정을 막는다
- 키가 없으면 안내 문구만 띄우고 나머지 화면은 정상 동작

### 검증 (라이브, 세 역할 임시 계정)
member/staff/viewer 계정을 만들어 REST count 로 실제 노출 범위를 측정.
member는 프로젝트 15·고객사 12·주차 37·계정 1·활동로그 0 으로 좁혀졌고,
viewer는 전사 열람은 되지만 쓰기가 403 으로 차단됨을 확인. 이후 임시 계정 전량 삭제.

### 남은 판단거리
- **미분류 티켓은 member 에게도 전부 보인다**(142건). 공용 인박스 개념이라 의도한 동작이지만,
  내용이 민감해지면 "내가 만든 것 + 담당인 것"으로 좁힐 수 있다.
- 매출 숨김은 앱 레이어라 완전 차단이 아니다. 필요하면 member 전용 뷰 분리.

## [2026-08-20] UX 계획서 2단계 — 참석자 검색 · 파트너 관리 보드

계획서 2단계 3건 중 프로젝트 아카이브는 8/19에 먼저 끝나 있었고, 이번에 나머지 2건을 붙였다.

### 이벤트 참석자 — 파트너 DB 검색 추가 (Lookup + New)

- `components/InviteeLookup.tsx` — 이름·회사·이메일 두 글자부터 검색, 최대 8건 표시
- 선택하면 회사·직함·이메일·전화가 파트너 DB에서 그대로 채워진다 (손입력 없음)
- 같은 이벤트에 이미 있는 사람은 목록에서 비활성 + '명단에 있음' 표기 → 중복 초대 차단
- 없으면 `'<검색어>' 새 파트너로 등록하고 추가` → 인라인 폼(이름만 필수)
  - `people` + `network_profiles`(segment=event_invitee) 를 함께 만든다.
    프로필을 안 만들면 파트너 목록·보드에서 구분이 안 잡히기 때문.
  - 소속이 기존 고객사명과 **정확히 하나** 일치할 때만 회사를 연결한다. 회사 행을 새로 만들지는 않는다.
- 기존 '명단 붙여넣기'는 그대로 유지 (대량 등록은 여전히 그쪽이 빠름)
- 명부는 서버에서 경량 배열(`getPeopleDirectory`, 427명)로 한 번 내려주고 클라이언트에서 필터 — 타이핑마다 왕복 없음

### 파트너 관리 보드 `/partners/board`

라벨(`partner_status`)은 427명 중 382명이 비어 있어 필터로 못 쓴다. **근거로 판정한다.**

근거 = 프로젝트 배정(PL·PM·구성원) / 문서 보유(NDA·프로필·위촉 완료 또는 첨부문서) /
네트워크 분류 지정 / 구분 라벨 — 넷 중 하나라도 있으면 '활동 파트너'.

실측 결과 **101명** (라벨만 보면 11명이었다).

| 구분 | 인원 |
|---|---:|
| 활동 파트너 | 101 |
| 프로젝트 참여 | 15 |
| 문서 보유 | 50 |
| 구분 미지정 (근거는 있는데 라벨 없음) | 56 |
| NDA 미확보 | 52 |

- 열: 이름 · 구분 · 소속 · 참여 프로젝트(계약/협상 내역) · 역할 · NDA/프로필/위촉 · 최근 활동
- 정렬은 담당 건수 내림차순. 평균의 2배를 넘으면 건수를 **굵게** (색·아이콘 없이 굵기로만)
- 탭으로 위 5개 뷰 전환, `BulkTable` 재사용이라 체크박스 선택 후 구분·분류·문서상태 일괄 변경 가능
  → '구분 미지정 56' 탭이 곧 일괄 분류 화면이다
- `/partners` 와 `/partners/board` 는 상단 링크로 오간다 (사이드바는 그대로)

`NDA 미확보`는 임원·직원·XP 내부를 제외한다. 직원한테 파트너 NDA를 받을 이유가 없어서다.

### 손댄 데이터 품질 이슈

`network_profiles.nda_status` 에 `'임원'` 이 들어간 행이 2건 있다(김수민·이봉진). 임포트 때 칸이 밀린 것으로 보인다.
**데이터는 건드리지 않고** 화면에서만 미확인으로 처리했다. 원본을 고치려면 엑셀 왕복(`db:export`/`db:import`)으로.

### 검증 (라이브 Supabase, 실제 세션 쿠키)

- 임시 staff 계정으로 `/partners`, `/partners/board`(4개 뷰), `/events/*` 전부 200
- `addInviteeFromPersonAction` — 김수민 추가 시 회사·직함·이메일·전화 자동 반영, 재호출 시 중복 차단 확인
- `createPersonAndInviteAction` — 신규 인물 생성 + 명단 추가 확인
- `inlineUpdateAction` — 구분 저장 성공 / 허용값 아닌 값은 `허용되지 않은 값` 으로 거부 / 원복까지 확인
- 검증 후 임시 계정·테스트 인물·테스트 초대행 전량 삭제.
  최종 people 427 · event_invitees 5 · users 1 · partner_status 분포 검증 전과 동일

### 알아둘 것

보드는 `projects` 를 읽으므로 **member 계정으로 보면 '참여 프로젝트' 숫자가 자기 것만 잡힌다.**
경영지원(staff)·owner 용 화면으로 쓰는 것이 맞다. 필요하면 member 에게는 보드 링크를 숨기면 된다.

### 다음 (계획서 3단계)

저장된 목록 뷰 / 칸반(구간 이동) / PL 미배정 큐 46건 / 활동 타임라인 통합
