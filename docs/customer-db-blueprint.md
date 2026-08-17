# Customer-Centered DB Blueprint

작성일: 2026-08-17

## 결론

XP ERP의 기준점은 `고객사(companies)`가 되어야 한다.

파트너/네트워크는 사람 중심으로 관리하지만, Deal list의 운영 화면은 고객사 중심이다. 따라서 데모와 v1 DB는 아래 흐름으로 잡는다.

```text
고객사 companies
  ├─ 계약/딜/프로젝트 projects
  │   ├─ PL/PM/코디 project_members
  │   ├─ 주차별 업데이트 project_weekly_updates
  │   ├─ 할 일 tasks
  │   └─ 필요 문서 document_requirements
  ├─ 담당자 people / person_company_links
  ├─ 이벤트 events / event_invitees
  └─ 원본 추적 import_records
```

## 현재 이미 있는 연결

| 연결 | 현재 상태 |
|---|---|
| 고객사 ID | `companies.id`가 UUID로 존재 |
| 고객사 코드 | 화면에서는 `C-` + UUID 앞 8자리로 표시 |
| 고객사 → 프로젝트 | `projects.company_id`로 연결됨 |
| 고객사 → 문서 필요 | `document_requirements.company_id` 또는 `project_id`로 연결 가능 |
| 고객사 → 액션 | `tasks.company_id` 또는 `project_id`로 연결 가능 |
| 고객사 → 원본 행 | `import_records`에 원본 행을 남기는 구조가 있음 |

## 지금 부족한 것

현재 1차 seed는 고객사와 프로젝트 연결은 어느 정도 되어 있지만, To Go List에서 나온 액션이 아직 고객사/프로젝트에 충분히 연결되어 있지 않다.

그래서 화면에서는 다음 순서로 고도화해야 한다.

1. 고객사 목록: 고객사 ID, 회사명, 산업, 프로젝트 수, 계약성 딜 수, 문서 미비 수, 액션 수
2. 고객사 상세: 연결된 딜/프로젝트 목록
3. 고객사 상세: 문서 필요 항목
4. 고객사 상세: To Go List 액션 연결
5. 고객사 상세: 이벤트/미팅 연결
6. 원본행 보기: Deals_0731의 해당 row와 주차별 업데이트 열까지 추적

## 계약/딜을 어떻게 볼 것인가

초기에는 별도 `contracts` 테이블을 바로 만들지 않는다.

이유:

- Deal list의 "계약고객/계약임박/가망고객/관리고객"은 실제 계약서 테이블이라기보다 파이프라인 상태다.
- 계약서 파일은 `documents` / `document_requirements`에서 관리해야 한다.
- 운영상 딜/계약/프로젝트가 한 화면에서 같이 움직인다.

따라서 v1에서는:

| 개념 | 저장 위치 |
|---|---|
| 딜/프로젝트 | `projects` |
| 계약 상태 | `projects.status`, `projects.contract_status` |
| 계약서 파일 | `documents` |
| 계약서 필요/미수령 | `document_requirements` |
| 계약 후속 액션 | `tasks` |

나중에 실제 계약 금액, 계약서 버전, 청구/매출 인식까지 들어가면 그때 `contracts` 테이블을 분리한다.

## 이번 구현에서 추가한 DB 뷰

| View | 목적 |
|---|---|
| `erp_customer_rows` | 고객사 목록 화면용 |
| `erp_customer_project_rows` | 고객사 상세의 연결 프로젝트 목록 |

이 뷰들은 현재 스키마를 바꾸지 않고, 이미 있는 `companies`, `projects`, `tasks`, `document_requirements`를 고객사 기준으로 묶는다.

## 사용자가 살을 붙일 때 기준

엑셀을 볼 때 row 하나를 바로 "고객사"로 넣지 말고 아래로 나눈다.

| 엑셀 값 | DB 반영 |
|---|---|
| 회사명 | `companies.name_ko` |
| 사업/산업 | `companies.industry` 또는 `projects.industry` |
| 서비스 섹터 | `projects.project_type` |
| 계약 시작/프로젝트 관리 | `projects.status`, `projects.contract_status` |
| 대표자 | `people` + `person_company_links` |
| PL/PM | `project_members` |
| 대표 니즈 | `projects.client_need` |
| XP 요청 | `projects.xp_request` |
| 주차별 업데이트 | `project_weekly_updates` |
| 해야 할 일 | `tasks` |
| NDA/계약서/제안서/IR자료 | `document_requirements` 또는 `documents` |

## 라이브에서 "연결 없음"으로 보일 때 확인할 것

배포 환경에 아래 값이 있어야 Supabase 데이터가 화면에 보인다.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

로컬 `.env.local`에는 값이 있어서 로컬 데모는 데이터가 보인다. 배포/라이브에 값이 없으면 앱은 미연결 상태로 보인다.
