# XP Internal ERP

> Agent handoff: [`AGENT_HANDOFF.md`](./AGENT_HANDOFF.md)

XP Internal ERP is an internal operating system for XP's people network, companies, projects, events, documents, and next actions.

This is not a decorative CRM. The product exists to replace scattered Excel files, KakaoTalk messages, email threads, and local documents with one reliable operational database. The most important question is not "does this contact look clean?" It is "what is the current state, what document is missing, who owns the next action, and where is the related history?"

## 1. Product Position

### One Sentence

XP's network, projects, events, required documents, and follow-up actions in one consistent ERP workspace.

### v1 Must Solve

1. Know who a person is, which network segment they belong to, and why XP cares.
2. Know which company/project/event a person is related to.
3. Track each project's owner, PL/PM, status, weekly updates, documents, and next actions.
4. Run event invitation lists with fast spreadsheet-like attendee tracking.
5. Track document requirements such as NDA, profile, partner appointment, MOU, contract, and renewal status.
6. Search across people, companies, projects, events, documents, weekly updates, and tasks.
7. Preserve source-file lineage so imported data can be audited and cleaned without losing context.

### v1 Deliberately Does Not Solve

- AI auto-structuring of messy messages. Data must be structured first.
- Real email/SMS sending. v1 tracks sent/replied/attending state only.
- Full finance, revenue forecasting, settlement, or partner compensation automation.
- Public partner portal or mobile app.
- Heavy Jira-style issue management. Tasks are operational follow-ups, not a separate engineering tracker.

## 2. Product Shape

### Navigation

```text
Dashboard
Network
Projects
Events
Documents
Search
Settings
```

The earlier 6-menu model hid documents too deeply. Documents are a first-class menu because NDA/profile/contract state is part of daily operations, not archive storage.

### Dashboard

- This week: due tasks, upcoming events, document renewals, unassigned follow-ups.
- Active projects: project status, PL/PM, latest update, next action.
- Document gaps: missing NDA, missing profile, agreement expiring soon, unsigned MOU/contract.
- Event operations: pending invitations, no response, confirmed attendees.

### Network

Network is the working name for Directory + Partner Management. It includes people and companies, but the screen should feel like a dense operating table, not a marketing CRM.

Core person views:

- All people
- XP internal
- Partners
- Partner candidates
- Advisors / vendors / professional firms
- LP / investor network
- External experts
- Event invitees

Core person detail tabs:

- Profile
- Relationship and segment
- Expertise
- Projects
- Events
- Documents and requirements
- Tasks and next actions
- Import/source history

### Projects

Projects include consulting, re-engineering/AX/BPO, investment/M&A/sale, business building, Go Global, event-like projects, and internal operations.

Project detail must show:

- Company and representative
- Project type and status
- PL, PM, coordinator, external contributors
- Client need and XP request
- Weekly updates imported from Deal list
- Related documents
- Tasks and next actions
- Source rows from Deal list / To Go List

### Events

Events are operational invitation lists. They need spreadsheet density and fast state updates.

Event invitee fields:

| Group | Fields |
|---|---|
| Basic | name, company, title, email, phone, memo |
| Tracking | email sent, SMS sent, response received, will attend, attendance confirmed |
| Linkage | person link, company link, source, owner, next action |

Directory search should add existing people. Unknown invitees can be typed directly and later reconciled into Network.

### Documents

Documents are not just uploads. They are operational evidence and compliance state.

v1 document scope:

- Upload file metadata and storage path.
- Link documents to people, companies, projects, events, and tasks.
- Track document requirements even when no file has been uploaded yet.
- Track requirement status: not required, needed, requested, received, signed, expired, waived.
- Support free-form document type while still providing recommended quick choices.
- Show missing and expiring documents on Dashboard, Network detail, Project detail, and Search.

Recommended document types:

- NDA
- Profile
- Partner appointment
- MOU
- Contract
- Proposal
- Meeting note
- IR / investment material
- Company profile
- Event material

### Tasks / Next Actions

Tasks are first-class operational rows, but they appear inside the relevant Network, Project, Event, and Dashboard contexts.

Tasks can link to:

- person
- company
- project
- event
- document requirement

Task statuses:

- backlog
- in_progress
- waiting
- blocked
- done
- dropped

Task priorities:

- low
- normal
- high
- urgent

## 3. Design System

### Tone

The UI should feel like a disciplined B2C SaaS ERP: dense, calm, consistent, and operational. It should not feel like an AI dashboard, a colorful sales CRM, or a slide deck.

### Colors

| Token | Value | Use |
|---|---|---|
| Primary | `#1a3c2c` | main action, selected navigation, focus |
| Primary Hover | `#244f3b` | hover and active surface |
| Accent | `#c8a45d` | sparse highlights, document attention, brand warmth |
| Ink | `#111111` | primary text |
| Muted | `#6b7280` | secondary text |
| Border | `#d8ded9` | lines and table dividers |
| Surface | `#ffffff` | page and panel background |
| Soft Surface | `#f6f8f6` | table headers, secondary bands |

### UI Rules

- Use one main color and at most one accent in normal screens.
- No traffic-light status badge system. Do not use green/yellow/red pill clusters.
- Status should be text, checkboxes, table columns, icons, or restrained monochrome indicators.
- Tables are the primary interface for Network, Projects, Events, Documents, and Search.
- Cards are allowed for dashboard summaries and repeated records, but do not nest cards inside cards.
- Prefer tight, predictable controls: filters, segmented controls, checkboxes, searchable selects, and inline table editing.
- No oversized hero sections, gradient blobs, decorative AI visuals, or marketing-style empty states.
- Logo source: [`assets/logo.png`](./assets/logo.png).

## 4. Source Data

All source data should be preserved, imported idempotently, and tied to source rows.

### 4.1 Cleaned Partner List

File: [`data/XP_partner_list_cleaned_DB_ready.xlsx`](./data/XP_partner_list_cleaned_DB_ready.xlsx)

Sheets:

- `Cleaned_Partners`: 399 people, 41 columns
- `Data_Dictionary`: field notes

Observed data:

- 399 rows
- 341 rows have blank category
- category counts include 협력사, 후보, 파트너, 임원, 직원, 파트너 후보
- only 3 rows show `nda_status = Y`
- 364 rows have personal email
- 298 rows have personal phone
- 319 rows have company

Use this as the normalized starter table, not the only truth.

### 4.2 Original Network List

File: [`data/raw/00.XP_파트너 및 네트워크 리스트_260813.xlsx`](./data/raw/00.XP_파트너%20및%20네트워크%20리스트_260813.xlsx)

Sheets:

- `조직도`
- `XP`
- `컨설팅파트너`
- `투자_재무 파트너`
- `LP`
- `외부전문가_2603`
- `협력사 리스트`

This file contains important fields missing or flattened in the cleaned file:

- network segment
- authority / status
- role
- core field
- detailed expertise
- NDA
- profile received
- partner appointment
- XP account creation
- LP/investor network
- professional firm/vendor categories

Use this as the source for network segmentation, document requirement state, and partner onboarding status.

### 4.3 Deal List

File: [`data/XP Deal list_대외비_20260805.xlsx`](./data/XP%20Deal%20list_대외비_20260805.xlsx)

Priority sheets:

- `Deals_0731`
- `M&A Deal_0809`
- `Deals_투자매각`
- `Deals_PWC`
- `Deals_신규사업,BB`

Observed from `Deals_0731`:

- 94 rows with company
- 90 unique company names
- 24 weekly update columns
- 46 rows with PL
- 25 rows with PM 1

Core mapping:

| Excel field | ERP field |
|---|---|
| 회사명 | companies.name_ko |
| 대표자 | companies.representative_name |
| 서비스 섹터 | projects.project_type |
| 사업 | projects.summary or companies.sub_industry |
| PL / PM 1 / PM2 / 코디 | project_members |
| 대표 니즈 | projects.client_need |
| XP 요청 | projects.xp_request |
| 계약 현황 / 매각여부 | projects.contract_status |
| weekly update columns | project_weekly_updates |

Project type mapping:

| Source | Project Type |
|---|---|
| BPR / 리엔지니어링 | `reengineering` |
| BB / 비즈니스빌딩 | `business_building` |
| FIM / F.I.M / 투자 / 투자매각 / M&A | `investment` |
| GX / 해외진출 | `go_global` |
| 영업 / 사업컨설팅 | `consulting` |

### 4.4 To Go List

File: [`data/raw/To Go List XYZ Plus (7).xlsx`](./data/raw/To%20Go%20List%20XYZ%20Plus%20(7).xlsx)

Observed:

- 157 non-empty operational rows
- Rows include travel planning, IR Day, capital increase, investment association, project next actions, contracts, proposals, NDA/profile follow-up, partner meetings

Use this file to seed `tasks`, `events`, and unresolved project/person/company follow-ups. It is messy but operationally valuable.

## 5. Data Model

### Core Tables

| Table | Purpose |
|---|---|
| `users` | login accounts |
| `people` | all individuals |
| `companies` | all companies, institutions, vendors, funds |
| `person_company_links` | employment, affiliation, relationship history |
| `network_profiles` | XP-specific person status, segment, onboarding, expertise |
| `tags` | controlled and free-form tags |
| `entity_tags` | tags linked to any entity |
| `projects` | deals, consulting, investment, Go Global, internal projects |
| `project_members` | PL/PM/coordinator/contributor roles |
| `project_weekly_updates` | imported and manually entered updates |
| `events` | meetings, invitation events, partner days, IR days, travel |
| `event_invitees` | event attendee rows |
| `documents` | uploaded file metadata |
| `document_requirements` | expected/missing/signed/expired document state |
| `entity_documents` | links between documents and entities |
| `tasks` | next actions and operational follow-ups |
| `import_sources` | source workbook/sheet metadata |
| `import_records` | source row lineage and reconciliation status |
| `activity_logs` | audit trail |

### People

Important fields:

- name_ko
- name_en
- email
- phone
- linkedin_url
- homepage_url
- region
- primary_company_id
- title
- relationship_grade
- source
- introduced_by_person_id
- owner_user_id
- last_contacted_at
- next_action
- memo

### Network Profiles

One person can have one XP network profile.

Important fields:

- person_id
- network_segment
- partner_status
- authority_level
- xp_role
- core_field
- expertise_detail
- expertise_industries
- expertise_functions
- market_expertise
- recommender
- internal_manager_user_id
- nda_status
- profile_status
- appointment_status
- xp_account_status
- agreement_status
- agreement_end_date
- can_join_internal_project
- memo

Recommended `network_segment` values:

- xp_internal
- consulting_partner
- investment_finance_partner
- lp_investor
- external_expert
- vendor_advisor
- customer_contact
- event_invitee
- unknown

Partner tags remain simple:

| Tag | Meaning |
|---|---|
| `bod` | 임원 |
| `employee` | 직원 |
| `partner` | 파트너 |
| `partner_candidate` | 파트너 후보 |
| `advisor` | 협력사 |

These tags are not enough for operations; they sit beside `network_segment` and document/onboarding status.

### Documents and Requirements

`documents` stores uploaded file metadata. `document_requirements` stores what is needed, whether or not the file exists.

Requirement status:

- not_required
- needed
- requested
- received
- signed
- expired
- waived

Document requirements can link to:

- person
- company
- project
- event
- task

This supports rows such as:

- "장용혁 NDA/profile needed"
- "partner appointment pending"
- "project contract signed but file missing"
- "MOU required for vendor"
- "NDA expires soon"

### Tasks

Tasks are not optional in v1. To Go List proves that XP runs on follow-up rows. A project or partner page without next actions will not solve the real operating problem.

Task fields:

- title
- description
- status
- priority
- owner_user_id
- assignee_user_id
- due_date
- person_id
- company_id
- project_id
- event_id
- document_requirement_id
- source_import_record_id

### Search

Search must cover:

- person name
- company name
- email
- phone
- project name
- event name
- document title/type/file name
- document requirement status
- task title/body
- weekly update text
- source row text

## 6. Permission Model

Effective permission:

```text
Global Role + Project Role + Entity Access + Document Sensitivity
```

Global roles:

- admin
- partner
- member
- external_contributor

Initial rules:

- Admin can access all records and settings.
- Partner can view/edit broad partner and project data, subject to sensitive document limits.
- Member can work on assigned records and operational tables.
- External contributor can access assigned projects and related tasks/documents only.
- Sensitive documents can require explicit access even when the parent entity is visible.

## 7. Development Phases

The next agent should not build from the old phase plan. Use this revised plan.

| Phase | Name | Status |
|---|---|---|
| 1R | Spec Correction & Source Audit | In progress |
| 2 | Database Schema & Import Contracts | Pending |
| 3 | Seed Extraction & Reconciliation Reports | Pending |
| 4 | App Scaffold & Design System | Pending |
| 5 | Auth, Permissions, Document Storage | Pending |
| 6 | Network Module | Pending |
| 7 | Project Module | Pending |
| 8 | Event Module | Pending |
| 9 | Documents, Tasks, Search, Dashboard | Pending |
| 10 | QA & Deploy | Pending |

### Phase 2 Must Include

- documents
- document_requirements
- tasks
- import_sources
- import_records
- network_profiles

Do not postpone these tables.

### Phase 3 Must Include

- cleaned partner list import
- original network list import/audit
- deal list import/audit
- To Go List task/event extraction/audit
- duplicate people/company reconciliation report
- unmatched PL/PM/person names report
- missing document requirements report

## 8. Current Decisions

| ID | Decision |
|---|---|
| D1 | Build ERP around network, projects, events, documents, tasks, and search. |
| D2 | Documents and tasks are v1 core, not v1.1. |
| D3 | Keep UI dense and consistent with one main color, one accent, no traffic-light badge language. |
| D4 | Use 5 simple partner tags, but add `network_segment` and onboarding/document status fields. |
| D5 | Use the 4 provided Excel files as source data, not only the 2 cleaned files. |
| D6 | Email/SMS sending is v2; sent/replied/attending tracking is v1. |
| D7 | AI is v2; v1 must create structured operational data that AI can later use. |

## 9. Open Decisions

1. Backend/storage: Supabase is still the recommended default because it covers Postgres, Auth, Storage, RLS, and full-text search in one stack.
2. Document sensitivity levels: simple internal/confidential/restricted is recommended for v1.
3. Whether Google Drive links should be stored beside uploaded files in v1.
4. Whether To Go List extraction should remain semi-manual with review queue or attempt aggressive automatic parsing.

