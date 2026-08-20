# XP ERP — Agent Handoff

> 최종 갱신: 2026-08-20 (성능 개선 · 엑셀형 그리드 · 계정 관리)
> 상세 이력: [`AGENT_LOG.md`](./AGENT_LOG.md) — **작업 전에 최근 3개 항목은 읽을 것**

## 0. 시작하는 사람에게

이 저장소는 XYZPlus(XP) 내부 ERP다. 컨설팅 프로젝트·고객사·파트너 네트워크·이벤트·문서를
한 곳에서 관리하고, PL/PM이 주간 업무보고를 직접 작성하면 경영진 대시보드로 자동 집계되는 구조다.

**5분 안에 상황 파악하려면 이 순서로 읽어라.**

1. 이 문서 §0 ~ §1 (현재 상태 / 지금 막혀 있는 것)
2. §2 권한 모델 — 여기 잘못 손대면 데이터가 새거나 PL이 일을 못 한다
3. §7 작업 규칙 — 특히 검증 방법과 하지 말 것
4. `AGENT_LOG.md` 최근 3개 항목 — 왜 그렇게 됐는지가 전부 여기 있다

```bash
npm install
cp .env.example .env.local   # 이미 있으면 생략. 값은 James 에게 받는다
npm run db:status            # 마이그레이션·버킷 상태 확인
npm run dev                  # http://localhost:3000
```

`proxy.ts` 나 환경변수를 고쳤으면 `rm -rf .next` 후 다시 띄워야 반영된다. (핫리로드 안 됨)

### 현재 상태

| 항목 | 상태 |
|---|---|
| 아키텍처 | Next.js 16.3 (App Router, RSC + Server Actions) + Supabase (Auth/DB/Storage) |
| 배포 | Vercel, 함수 리전 도쿄(`hnd1`) 고정. GitHub `xyzplusco/XPERP` push 시 자동 배포 |
| DB 스키마 | 마이그레이션 9건 전부 라이브 적용 완료 (2026-08-20 확인) |
| 인증 | Supabase Auth 이메일/비밀번호. `proxy.ts` 세션 가드 |
| 권한 | owner / staff / member / viewer 4단계, RLS로 DB 레벨 강제 (§2) |
| 문서 저장 | Storage `xp-documents`, `xp-meeting-notes` (private, signed URL) |
| 계정 | yks@xyzplus.co(owner), hjy@xyzplus.co(member), pjh@xyzplus.co(member) |
| 빌드 | `npm run build` 통과 (2026-08-20) |

### 데이터 실측 (2026-08-20)

| 테이블 | 건수 | 비고 |
|---|---:|---|
| projects | 88 | 휴지통 별도 109건 |
| companies | 463 | 산업 미입력 399 · 사업개요 미입력 401 |
| people | 427 | 이메일 없음 57 · 전화 없음 131 · 소속 없음 88 |
| tasks(티켓) | 151 | **전부 backlog · 담당자 0명 · 미분류 140** |
| project_weekly_updates | 125개 프로젝트 | 대부분 임포트분(`source_latest` 64) |
| documents | **0** | 계약 138건 미임포트 |
| document_requirements | 197 | 전부 `needed` |
| meeting_notes | 0 | |
| events | 2 | |
| activity_logs | 536 | 볼 화면 없음 |

프로젝트 88건 중 **PL 미배정 45 · PM 미배정 72 · 매출 미입력 82 · 종료일 미입력 85**,
**30일 내 업데이트 없는 진행 프로젝트 75건**.

> 기능이 부족한 게 아니라 **데이터가 안 들어오고 있다.**
> 화면을 더 만들기 전에 §6 A 항목(입력이 돌게 만드는 것)부터 처리하는 게 맞다.

## 1. 지금 막혀 있는 것

- **주간보고가 안 돌고 있다.** 8월3차 작성 0건. PL 계정 2개(hjy·pjh)는 발급됐다.
  리마인더가 없어서 아무도 안 쓴다. §6 A-1.
- **계약서 138건이 미임포트다.** 스크립트는 완성돼 있는데 한 번도 실행 안 했다.
  ```bash
  npm run contracts:prepare      # 파싱 미리보기
  npm run contracts:import       # 실제 반영 (파트너 43명 NDA=완료로 바뀜)
  ```
- **티켓 151건이 전부 미할당 backlog다.** 파이프라인 임포트 부산물로 보인다. 살릴 것/버릴 것 판정 필요.
- **`SUPABASE_ACCESS_TOKEN`(Supabase personal access token)은 폐기 권장.**
  Management API 경유 마이그레이션에만 쓰였다. 로컬에서 Postgres 직결이 되면 필요 없다.
- **`_to_delete/` 폴더는 지워도 된다.** 구버전 파일과 임시파일이 들어 있다. `.gitignore` 처리돼 있다.

### 마이그레이션 적용 방법 2가지

```bash
npm run db:migrate       # Postgres 직접 연결 (SUPABASE_DB_URL 필요)
npm run db:migrate:api   # Management API 경유 (SUPABASE_ACCESS_TOKEN 필요, 5432 막힌 환경용)
npm run db:status        # 적용 상태 + 앱이 필요로 하는 테이블/컬럼/버킷 점검
```

둘 다 같은 `schema_migrations` 테이블을 쓰므로 섞어 써도 안전하다.

## 2. 권한 모델 (2026-08-19 재설계)

기획: `docs/permissions-plan.md` · 마이그레이션: `20260819000000_role_model.sql`

### 역할 4단계

| 역할 | 열람 | 쓰기 | 계정 관리 |
|---|---|---|---|
| `owner` 마스터 어드민 | 전부 | 전부 + 영구삭제 | 가능 (1명만, DB에서 강제) |
| `staff` 임직원 | 전부 | 전부 | 불가 |
| `member` PL/PM | **자기 프로젝트 범위만** | 자기 프로젝트만 | 불가 |
| `viewer` 열람전용 | 전부 | **없음** | 불가 |

### member 가 보는 범위 (RLS 로 강제)

- 프로젝트: `xp_my_project_ids()` — PL·PM·구성원인 것만
- 주차 업데이트 / 구성원 / 회의록: 그 프로젝트 것만
- 고객사: `xp_my_company_ids()` — 내 프로젝트의 고객사만
- 문서·필요문서: 내 프로젝트/고객사 것만
- **파트너 명부·이벤트: 전사 공개** (의도된 결정 — 네트워크가 XP 핵심 자산)
- 티켓: 내 프로젝트 것 + **미분류 전체** + 내가 담당/생성한 것
- 계정 목록: 본인 것만 / 활동로그·임포트 이력: owner·staff 만
- **매출 금액: 앱에서 숨김** (RLS는 행 단위라 열 숨김은 앱 레이어. 완전 차단하려면 뷰 분리 필요)

### 실측 검증 (2026-08-19, 임시 계정으로 확인 후 삭제)

| 역할 | 프로젝트 | 고객사 | 파트너 | 주차업데이트 | 계정 | 활동로그 | 쓰기 |
|---|---:|---:|---:|---:|---:|---:|---|
| member (정홍재) | 15 | 12 | 427 | 37 | 1 | 0 | 가능 |
| staff | 197 | 463 | 427 | 413 | 4 | 536 | 가능 |
| viewer | 197 | 463 | 427 | 413 | 1 | 0 | **403 차단** |

### 헬퍼 함수

`xp_role()` `xp_is_owner()` `xp_is_admin()`(=owner+staff) `xp_can_see_all()`(=+viewer)
`xp_can_write()`(=viewer 제외) `xp_my_project_ids()` `xp_my_company_ids()`

### 계정 생성 — 화면에서

**설정 → 계정 추가** (마스터 어드민만). 이메일·연결 파트너·역할을 고르면 임시 비밀번호가
생성 직후 한 번만 표시된다. 비밀번호 재설정·비활성화·삭제도 같은 화면.

**전제: `SUPABASE_SERVICE_ROLE_KEY` 서버 환경변수 필요** (Auth 사용자 생성에 admin API 필요).
`NEXT_PUBLIC_` 접두어를 붙이면 안 되고, `lib/supabase/admin.ts` 를 통해 server action 안에서만 쓴다.
키가 없으면 설정 화면이 안내 문구를 띄우고 생성 기능만 비활성화된다.

비상용으로 터미널 스크립트도 유지 (owner 계정을 잃었을 때의 복구 경로이므로 지우지 말 것):

```bash
npm run user:create -- --email pl@xyzplus.co --role member --person "김수민"
```

`SUPABASE_SERVICE_ROLE_KEY` 만 있으면 되고 Postgres 직결이 필요 없다(HTTPS Admin API).
`--password` 생략 시 임시 비밀번호를 만들어 출력한다. 역할은 owner/staff/member/viewer.
이미 있는 이메일이면 비밀번호만 재설정한다.

## 3. 앱 구조

```
vercel.json                  # 함수 리전 도쿄(hnd1) 고정 — 지우지 말 것
proxy.ts                     # 세션 가드 (Next 16 미들웨어). 쿠키 만료를 로컬 판독해 인증 왕복 최소화
lib/supabase/server.ts       # @supabase/ssr 서버 클라이언트 (쿠키 세션 → RLS 적용됨)
lib/supabase/admin.ts        # service_role 클라이언트. 계정 생성/삭제 전용, 서버에서만
lib/auth.ts                  # getSessionUser / 역할 판정 (isOwner·isAdmin·canWrite·canSeeRevenue)
lib/queries.ts               # 전 페이지 데이터 조회 (PostgREST embed)
lib/actions.ts               # 모든 server actions (로그인·수정·업로드·계정관리·그리드 붙여넣기)
lib/bulk.ts                  # 수정 가능한 필드 화이트리스트 (EDITABLE / PROFILE_EDITABLE)
lib/labels.ts                # 상태값 한국어 라벨, 파트너 구분 로직
lib/week.ts                  # XP 주차 규칙 (1~7일=1차, 8~14=2차, 15~21=3차, 22~말일=4차)
lib/navigation.ts            # 역할별 사이드바 항목

app/page.tsx                 # 홈 = 내 업무 (내 티켓·내 프로젝트, 오래된 순 / 관리자는 전사 현황도)
app/weekly                   # 주간 업무보고 작성 (프로젝트별 세로 입력, 주차 탭 8개)
app/projects[/[id]]          # 프로젝트 목록(그리드)/상세. 활성·정체·아카이브·전체 뷰
app/customers[/[id]]         # 고객사 목록/상세
app/partners[/[id]]          # 파트너 명부/상세
app/partners/board           # 파트너 관리 보드 (라벨이 아니라 근거로 활동 파트너 판정 + 일괄 분류)
app/events[/[id]]            # 이벤트 목록/상세 (참석자 검색 추가·붙여넣기·연락처 일괄복사)
app/tickets                  # 티켓
app/documents                # 문서 레지스트리 (보관 + 미비)
app/trash                    # 휴지통 (복구·영구삭제, owner)
app/settings                 # 내 계정·비밀번호 변경 / 계정 관리(owner)

components/BulkTable.tsx     # 엑셀형 그리드 — 열 너비·셀 이동·붙여넣기·낙관적 저장 (§3.5)
components/AppShell.tsx      # 사이드바 + 본문. 여기서 목록 조회 금지 (§7)
components/TicketDialog.tsx  # 티켓 생성 (열 때만 목록 조회)
components/InviteeLookup.tsx # 이벤트 참석자 파트너 검색 추가 + 인라인 신규 등록
components/InviteeManager.tsx / MeetingNotesPanel / DocumentsPanel / DealTable / SaveNotice

scripts/                     # 엑셀 왕복·마이그레이션·계약 임포트·계정 생성 (§5)
supabase/migrations/         # 9건, 전부 라이브 적용됨
docs/permissions-plan.md     # 권한 재설계 기획
docs/ux-roadmap.md           # UX 로드맵 1~3단계
```

삭제된 것 (구 버전): `app/network`, `app/search`, `components/CustomerTable|DataTable|SectionHeader`,
`lib/operational-data.ts` → `_to_delete/` 로 이동. 폴더째 지워도 된다.

## 3.5 표(그리드) 사용법

`components/BulkTable.tsx` 는 프로젝트·고객사·파트너·보드·이벤트 목록에서 공통으로 쓴다.

- 헤더 경계를 끌면 열 너비가 바뀌고 브라우저에 기억된다. '열 너비 초기화' 로 되돌린다.
- 셀 클릭 → 방향키/Tab 이동, Enter 또는 타이핑으로 편집, Esc 취소, Space 로 행 선택.
- **엑셀에서 복사 → 셀 하나 고르고 ⌘V** 하면 그 지점부터 채워진다. 마스터 어드민 전용.
  드롭다운 열은 표시 라벨(`진행 중`)도 저장값(`managed`)으로 알아서 바꿔 넣는다.
- 저장은 낙관적이다. 화면이 먼저 바뀌고 실패하면 되돌아오며 셀 왼쪽에 빨간 줄이 생긴다.

수정 가능한 필드는 `lib/bulk.ts` 의 `EDITABLE` / `PROFILE_EDITABLE` 화이트리스트가 전부다.
열을 추가하려면 여기에 먼저 넣어야 한다.

## 4. Vercel 배포

1. GitHub `xyzplusco/XPERP`에 push (`.env.local`, 루트 xlsx는 gitignore 확인).
2. Vercel 환경변수 3개: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`(서버 전용 — 계정 생성용, `NEXT_PUBLIC_` 붙이지 말 것).
   (`SUPABASE_DB_URL`, `SUPABASE_ACCESS_TOKEN` 은 로컬 전용 — Vercel에 넣지 말 것)
   값에 개행·따옴표가 섞이면 Supabase 가 `Invalid API key` 를 돌려준다. 삭제 후 재등록이 안전하다.
2-1. **함수 리전은 도쿄(`hnd1`)** — `vercel.json` 에 고정되어 있다. Supabase 가 ap-northeast-1 이라
   기본값 iad1(워싱턴 DC)로 두면 요청마다 태평양을 왕복해 페이지가 1초 이상 느려진다.
3. 배포 전 §1 마이그레이션 + admin 계정 생성 필수.
4. 도메인은 나중에 Vercel 대시보드에서 연결.

## 4.5 데이터 정리 (엑셀 왕복)

```bash
npm run db:export                                    # XP_ERP_편집용_YYYYMMDD.xlsx 생성
npm run db:import -- --file <파일>                   # 미리보기 (DB 변경 없음)
npm run db:import -- --file <파일> --apply           # 실제 반영
```

시트/열 정의는 `scripts/lib/workbook_schema.mjs` 한 곳에서 관리한다. 열을 추가하려면 여기만 고치면 export/import가 함께 따라간다.
ID 열이 매칭 키이며 비어 있으면 신규 등록. 삭제는 '삭제'=Y 열로만 처리한다.
변경 전후는 `activity_logs` 에 기록되므로 추적/복구가 가능하다.

## 4.6 UX 로드맵 진행 상황

계획서: `docs/ux-roadmap.md`

- 1단계 완료 — 홈=내 업무, 주간 업데이트 작성 플로우(`/weekly`), 마지막 업데이트 열 + 정체 필터
- 2단계 완료 (2026-08-20) — 프로젝트 아카이브, 이벤트 참석자 검색 추가, 파트너 관리 보드
- 3단계 미착수 — 저장된 목록 뷰, 칸반, PL 미배정 큐(45건), 활동 타임라인 통합 (§6 참조)

파트너 관리 보드는 `projects` 를 읽으므로 member 계정에서는 '참여 프로젝트'가 본인 것만 집계된다.
staff·owner 용 화면으로 볼 것.

## 5. npm 스크립트

| 명령 | 하는 일 |
|---|---|
| `npm run dev` / `build` / `start` | 개발 / 빌드 / 프로덕션 실행 |
| `npm run db:status` · `db:status:api` | 마이그레이션·버킷 상태 점검 |
| `npm run db:migrate` · `db:migrate:api` | 마이그레이션 적용 |
| `npm run db:export` | 편집용 엑셀 생성 |
| `npm run db:import -- --file <파일> [--apply]` | 엑셀 → DB 반영 (`--apply` 없으면 미리보기) |
| `npm run contracts:prepare` · `contracts:import` | 전자계약 138건 파싱 → 반영 (**미실행**) |
| `npm run pipeline:sync` | 통합 파이프라인 엑셀 기준 프로젝트·고객사 재구성 |
| `npm run user:create -- --email .. --role member --person "이름"` | 계정 발급 (비상용, §2) |

## 6. 다음 작업 우선순위

근거는 §0 데이터 실측. 위에서부터 하는 것을 권한다.

### A. 실사용을 막고 있는 것

1. **주간보고 리마인더** — 매주 정해진 요일에 미작성 PL에게 알림(이메일/슬랙).
   이게 없으면 `/weekly` 는 영영 빈칸이고, 그 위에 얹은 대시보드도 전부 무의미하다.
2. **PL 미배정 큐** — 45건. 그리드 붙여넣기로 고치는 건 되지만 "누가 안 정해졌나"를 모으는 화면이 없다.
3. **계약서 138건 임포트** — 스크립트 완성. 30분이면 끝난다. documents 0 → 138, 파트너 43명 NDA 확정.
4. **티켓 151건 정리** — 살릴 것만 남기고 나머지 휴지통. 담당자·프로젝트 배정.

### B. 운영 효율

5. **검색** — 현재 없음. tsvector 인덱스는 스키마에 이미 있어 붙이기만 하면 된다.
   파트너 427·고객사 463에서 이름으로 못 찾는 게 실무에서 제일 답답한 지점.
6. **활동 타임라인** — `activity_logs` 536건이 쌓여 있는데 보는 화면이 없다.
7. **저장된 목록 뷰** — 자주 쓰는 필터 조합 북마크.
8. **칸반** — 구간(논의→협상→계약)별 컬럼 이동.
9. **휴지통 정리** — 프로젝트 109건 영구삭제 판정.

### C. 경영 관점 (데이터가 채워진 뒤에)

10. 매출 파이프라인 대시보드 (현재 6건 3.17억만 입력돼 집계 무의미)
11. 계약 만료 알림 (종료일 3건만 입력돼 현재 불가)
12. 고객사 프로필 보강 (산업·사업개요 399개 공란)
13. 주간 경영 리포트 자동 생성

### D. 품질·기반

14. 모바일 대응 — 표 중심이라 폰에서 거의 못 쓴다. PL 이동 중 입력에 필요.
15. 데이터 품질 화면 — 중복·빈 필수값·이상값 모아 처리
16. 매출 열 완전 차단 — 지금은 앱 레이어 숨김. DB 뷰 분리하면 완전 차단.
17. 주기적 백업 스냅샷 자동화

## 7. 작업 규칙

### 검증은 반드시 라이브에서, 실제 세션으로

이 프로젝트는 RLS가 핵심이라 **로컬 목데이터로는 권한 버그가 안 잡힌다.**
지금까지 쓴 방법을 그대로 쓰면 된다.

1. service_role 키로 임시 계정을 만든다 (`auth.admin.createUser` + `users` 행 insert)
2. anon 키로 `signInWithPassword` → 세션을 받아
   `sb-<ref>-auth-token` 쿠키 값(`"base64-" + base64url(JSON.stringify(session))`)을 만든다
3. 그 쿠키로 `curl` 해서 페이지가 실제로 무엇을 보여주는지 확인한다
4. Server Action 은 `Next-Action: <id>` 헤더로 직접 POST 할 수 있다.
   id 는 `.next/static/chunks/*.js` 에서 `createServerReference)("<id>",...,"<함수명>")` 로 찾는다
5. **끝나면 임시 계정과 테스트 행을 전량 삭제하고, 건수가 원래대로인지 확인한다**

권한 변경 작업이라면 역할별로 계정을 만들어 REST count 로 실제 노출 범위를 측정할 것. (§2 표가 그 결과다)

### 마이그레이션은 로컬 Postgres 로 먼저 돌려본다

컨테이너/로컬에 Postgres 16 을 띄워 전체 마이그레이션을 순서대로 적용해 문법·순서 오류를 먼저 잡고,
그 다음에 라이브에 적용한다. 라이브에서 깨지면 되돌릴 방법이 마땅치 않다.

### 성능 원칙 (2026-08-20에 잡은 것들 — 되돌리지 말 것)

- `inlineUpdateAction` 에 `revalidatePath` 를 다시 넣지 말 것. 셀 하나 고칠 때마다 페이지 전체가 재렌더된다.
  화면은 `BulkTable` 이 낙관적으로 갱신하고 실패 시 되돌린다.
- `AppShell` 에서 목록 조회를 하지 말 것. 사이드바에 있다는 이유로 전 페이지가 그만큼 느려진다.
- `getSessionUser` 는 쿠키에서 토큰 클레임만 로컬 디코드한다. `auth.getUser()` 로 되돌리면
  페이지마다 인증 왕복이 한 번씩 더 붙는다. (위조 토큰은 어차피 RLS에서 막힌다)
- `vercel.json` 의 `regions: ["hnd1"]` 을 지우지 말 것. Supabase 가 도쿄라 기본값 iad1 로 돌아가면
  요청마다 태평양을 왕복한다.

### 디자인 규칙 (변경 금지)

- 흰 표면 + 헤어라인 보더 compartment, 페이지 제목 아래 2px 검정 룰
- 주 색상 `#1a3c2c` (링크/활성 네비/버튼만), 액센트 `#c8a45d` 최소 사용
- 아이콘 없음, 상태 뱃지·컬러 필 없음
- **설명형 문구 금지.** "이 화면에서는 …할 수 있습니다", "○○하면 △△됩니다" 류의 안내 문장을 넣지 말 것.
  라벨과 숫자만 남긴다. 강조는 색이 아니라 굵기로 한다.
  (사용자가 가장 싫어하는 것 = "AI가 만든 티". 작위적인 제목·부제·설명이 그 신호다.)

## 8. 하지 말 것

- 시드 폴백을 제품 동작으로 되돌리지 말 것 (`XP_FORCE_SEED_FALLBACK` 관련 코드는 제거됨).
- 소스 임포트 행 무단 삭제 금지 (lineage 유지). 제품 뷰에서 필터하는 방식 유지.
- `.env.local`, DB 비밀번호, service_role 키, 루트 xlsx 커밋 금지.
- UI에 아이콘·컬러 뱃지·설명 문구 추가 금지 (§7).
- 파트너 DB(`people` / `network_profiles`)를 일괄 스크립트로 건드리지 말 것.
  사용자가 명시적으로 "파트너 db는 건들지 말라"고 했다. 화면에서 고치거나 엑셀 왕복으로 처리한다.
- 사용자 확인 없이 라이브 데이터를 대량 변경하지 말 것. 변경 전 건수와 변경 후 건수를 항상 보고할 것.
