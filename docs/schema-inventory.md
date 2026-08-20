# 스키마 인벤토리 — 운영 / 이력 전용 / 폐기 후보

> 기준일 2026-08-21. 건수는 라이브 실측.

테이블을 지우기 전에 성격부터 확정한다. 임포트로 쌓인 데이터가 있어서
"안 쓰니까 삭제"가 곧바로 정답이 아닌 것들이 섞여 있다.

## 운영 — 앱이 읽고 쓴다

| 대상 | 건수 | 비고 |
|---|---:|---|
| `companies` | 463 | |
| `people` | 427 | |
| `network_profiles` | 427 | 파트너 구분·문서 상태 |
| `projects` | 88 | 담당자 컬럼이 **정본** |
| `project_weekly_updates` | 404 | (프로젝트, 주차) 유니크 |
| `tasks` | 151 | 티켓 |
| `task_comments` | 0 | 2026-08-20 신설 |
| `notifications` | 0 | 2026-08-20 신설 |
| `events` / `event_invitees` | 2 / 5 | |
| `meeting_notes` | 0 | 버킷 연결 완료 |
| `documents` / `entity_documents` | 0 / 0 | 계약 138건 임포트 대기 |
| `document_requirements` | 197 | 전부 `needed` |
| `users` | 3 | |
| `project_folders` | 7 | **CRUD 화면 없음** — 아래 참조 |

## 파생 — 트리거가 정본을 따라간다. 직접 쓰지 말 것

| 대상 | 정본 | 동기화 |
|---|---|---|
| `project_members` (`project_role in ('pl','pm')`) | `projects.primary_pl / secondary_pl / candidate_pm` | `projects_sync_members` 트리거 |
| `person_company_links` (`is_primary = true`) | `people.primary_company_id` | `people_sync_company_link` 트리거 |

`project_members` 의 다른 역할(`external_contributor`·`coordinator`·`viewer`)은 파생이 아니라
독립적인 사실이다. 트리거가 건드리지 않으므로 외부 기여자 관리에 그대로 쓸 수 있다.
`person_company_links` 의 비-primary 행도 다중 소속 이력으로 유지된다.

## 이력 전용 — 앱에서 지우거나 고치지 말 것

| 대상 | 건수 | 성격 |
|---|---:|---|
| `activity_logs` | 536 | **2026-08-21 이전 536건은 전부 엑셀 임포트 이력**(`excel_update` 482 · `excel_delete` 31 · `excel_insert` 23). 그 이후 앱 변경은 `inline_update` / `bulk_update` / `grid_paste` / `trash` / `update` 로 쌓인다. 화면을 만들 때 이 둘을 구분해서 보여줄 것 |
| `import_sources` / `import_records` | 스크립트 전용 | 임포트 lineage. 원본 추적용 |

## 폐기 후보 — 실측으로 미사용 확인

| 대상 | 실측 | 판단 |
|---|---|---|
| `entity_tags` | 0건 (`tags` 는 5건) | 태그 기능을 만들 계획이 없으면 둘 다 제거 |
| `tasks.assignee_user_id` / `owner_user_id` | 0 / 0 | 구형 컬럼. 현재는 `assignee_person_id` / `created_by_user_id` 를 쓴다 |
| `users.login_id` / `password_hash` / `last_login_at` | 0 / 0 / 0 | Supabase Auth 도입 전 잔재 |
| `document_requirements.current_document_id` | 0 | 문서 연결의 정본은 `entity_documents`. 이 컬럼은 정리 대상 |
| 전문검색 GIN 인덱스 5개 | 검색 화면 없음 | **검색을 만들 거면 자산, 안 만들 거면 제거.** 현재 규모에서 쓰기 비용은 무시할 수준이라 급하지 않다 |

## 성격을 정해야 하는 것

**`project_folders`** — 화면에서는 필터로만 쓰이고 만들기·이름변경·삭제 동선이 없다.
7개 고정 분류로 갈 거면 테이블을 없애고 상수로, 운영하면서 늘릴 거면 관리 UI가 필요하다.
지금은 테이블인데 관리 수단이 없어서 어느 쪽도 아니다.

**`document_requirements`** — 목록·상세 표시는 되지만 생성/수정 동선이 사실상 없다.
파일 업로드 시 상태가 일부 바뀌는 게 전부다. 197건이 전부 `needed` 로 굳어 있는 이유다.

## 상한(limit)에 대한 주의

조회들이 `limit(500~2000)` 을 쓴다. 이건 페이지네이션이 아니라 **상한**이라
넘어가면 느려지는 대신 조용히 일부가 빠진다. `warnIfCapped()` 가 서버 로그에 경고를 남기므로
로그에 `[상한 도달]` 이 보이기 시작하면 페이지네이션을 붙일 때다.
현재 최댓값은 people 427 / 상한 2000 으로 여유가 있다.
