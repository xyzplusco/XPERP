# XP ERP Product DB Status

## 결론

현재 Supabase DB는 생성되어 있고 1차 seed도 들어가 있지만, actual product DB로는 아직 부족하다.

현재 상태는 `원천 엑셀 → 임시 구조화 → DB 적재`까지 끝난 단계다. 고객사, 프로젝트, 파트너, 액션, 문서가 완전히 정규화되고 서로 안정적으로 연결된 상태는 아니다.

## 2026-08-17 DB 점검 결과

`npm run db:audit` 기준:

| 영역 | 현재 상태 |
| --- | --- |
| companies | 463 rows |
| people | 435 rows |
| network_profiles | 435 rows |
| person_company_links | 415 rows |
| projects | 195 rows |
| project_members | 95 rows |
| events | 23 rows |
| event_invitees | 0 rows |
| tasks | 151 rows |
| document_requirements | 245 rows |
| documents | 0 rows |

연결률:

| 연결 | 현재 |
| --- | ---: |
| 프로젝트 → 고객사 | 195 / 195 |
| 프로젝트 → PL | 61 / 195 |
| 프로젝트 → PM | 34 / 195 |
| 액션 → 고객사/프로젝트/사람/이벤트/문서 | 22 / 151 |
| 문서 필요 → 사람/회사/프로젝트/이벤트/태스크 | 237 / 245 |
| 고객사 enrich 필드 | 0 |

## 문제

1. 고객사는 `companies`에 들어가 있지만, 산업/대표자/니즈/next action 같은 고객사 프로필 필드가 거의 비어 있다.
2. Deal list의 회사명은 프로젝트와 연결되어 있으나, 고객사 상세 화면에서 보여줄 계약/문서/액션 연결이 약하다.
3. To Go List 액션은 대부분 텍스트로만 들어갔고, 고객사/프로젝트/파트너와 자동 연결되지 않았다.
4. 파트너는 `people`과 `network_profiles`에 들어갔지만, cleaned partner list의 모든 관리 필드가 제품 필드로 승격된 상태는 아니다.
5. 문서 파일 테이블은 비어 있다. 현재 있는 것은 “필요 문서 상태”이고, 실제 NDA/계약서/프로필 파일 보관은 아직 구현 전이다.
6. 이벤트는 23개 생성됐지만, 초대자/참석자 연결 테이블은 비어 있다.

## Reconciliation Dry-run

`npm run db:reconcile:plan`은 DB에 쓰지 않고 자동 연결 후보만 계산한다.

현재 dry-run 기준:

| 후보 작업 | 건수 |
| --- | ---: |
| 고객사 프로필 enrich | 103 |
| 프로젝트 PL/PM 연결 보강 | 6 |
| 액션 연결 보강 | 86 |
| 문서 필요 연결 보강 | 2 |

초기 dry-run에서 `김수민`, `대표` 같은 사람명/일반 단어가 회사로 잡히는 문제가 확인됐다. 따라서 live DB에 바로 쓰지 않고, Deal list에서 정상 고객사로 확인되는 회사명만 고객사 후보로 쓰도록 매칭 범위를 줄였다.

## Actual Product 기준 다음 작업

1. Import를 seed가 아니라 staging/reconciliation pipeline으로 바꾼다.
2. `companies`를 고객사/파트너사/협력사로 구분할 수 있게 `company_type` 또는 relation view를 추가한다.
3. Deal list에서 고객사 프로필 필드를 채운다: 대표자, 산업, client need, XP request, 계약 상태, latest update, next action.
4. To Go List를 회사명/프로젝트명/사람명 기준으로 자동 매칭하고, 매칭 실패 row는 review queue로 보낸다.
5. 파트너 cleaned list 컬럼을 `people`, `network_profiles`, `person_company_links`, `document_requirements`에 더 충실히 매핑한다.
6. 실제 문서 보관을 위해 Supabase Storage bucket, `documents`, `entity_documents` 업로드 플로우를 만든다.
7. 앱 화면은 fallback seed가 아니라 Supabase DB만 읽게 두고, DB 미연결은 오류 상태로 표시한다.
