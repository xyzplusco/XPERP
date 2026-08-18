# XP ERP — Agent Handoff

> 최종 갱신: 2026-08-18 (대량편집·휴지통 / 라이브 DB 동기화 완료)
> 상세 이력: [`AGENT_LOG.md`](./AGENT_LOG.md)

## 0. 현재 상태 요약

| 항목 | 상태 |
|---|---|
| 아키텍처 | Next.js 16 (App Router, RSC + Server Actions) + Supabase (Auth/DB/Storage) |
| DB 스키마 | 마이그레이션 8건 전부 라이브 적용 완료 (2026-08-18 확인) |
| DB 데이터 | companies 463, people 427, projects 195, tasks 151, events 0, folders 4 |
| 인증 | Supabase Auth 이메일/비밀번호. proxy.ts 세션 가드. 미로그인 → /login 리다이렉트 |
| 권한 | admin 전체 편집 / PL·PM은 자기 프로젝트만 편집 (RLS로 DB 레벨 강제) |
| 문서 저장 | Supabase Storage `xp-documents` 버킷 (private, signed URL 다운로드) |
| 빌드 | `npm run build` 통과 확인 (2026-08-17) |
| 배포 | GitHub 푸시 완료. Vercel 환경변수 확인 필요 (§1) |

## 1. 현재 상태 / 남은 것

라이브 Supabase에는 마이그레이션 8건이 **모두 적용되어 있다** (2026-08-18 Management API로 확인).
`npm run db:status` 또는 `npm run db:status:api` 로 언제든 확인할 수 있다.

남은 것:
- **Vercel 환경변수 확인.** 빌드는 환경변수 없이도 통과하는 것을 확인했고 lockfile도 정상이다.
  배포 후 화면이 안 뜨면 Vercel → Settings → Environment Variables 에 아래 2개가 있는지 확인할 것.
  없으면 이제 500 대신 안내 화면이 뜬다.
  ```
  NEXT_PUBLIC_SUPABASE_URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY
  ```
  `SUPABASE_DB_URL`, `SUPABASE_ACCESS_TOKEN` 은 로컬 전용이므로 Vercel에 넣지 말 것.
- PM/PL 계정 발급 (`npm run user:create`). 현재 계정은 관리자 1개(yks@xyzplus.co → 윤권상)뿐.
- 계약 138건 미반영 (`npm run contracts:prepare` 부터). documents 0건, 파트너 NDA 대부분 미확인 상태.
- 프로젝트 195건이 전부 Unsorted. 프로젝트 화면에서 체크박스로 선택 → 폴더 일괄 이동 가능.

### 마이그레이션 적용 방법 2가지

```bash
npm run db:migrate       # Postgres 직접 연결 (로컬에서)
npm run db:migrate:api   # Management API 경유 (SUPABASE_ACCESS_TOKEN 필요, 방화벽 환경에서 사용)
```

둘 다 같은 `schema_migrations` 테이블을 쓰므로 섞어 써도 안전하다.

## 2. 권한 모델

- `users` 테이블이 Supabase Auth와 ERP를 연결: `auth_user_id` (auth.users FK), `global_role`, `person_id`.
- 읽기: **users 행이 있는 활성 계정만** 전체 열람 가능 (`xp_is_member()`).
- 쓰기: admin은 전부. PL/PM은 `xp_can_edit_project()` 판정 — projects의 primary/secondary PL, candidate PM이거나 project_members에 pl/pm/owner/coordinator로 등록된 사람.
- PL/PM이 편집 가능한 것: 프로젝트 필드, 진행 업데이트 추가, 액션(tasks) 추가/수정, 프로젝트 연결 문서 요구사항.
- 계정 생성: `npm run user:create -- --email .. --password .. --role member --person "이름"` (auth.users에 직접 insert, 이메일 확인 불필요). `--person`으로 people 행과 연결해야 PL/PM 권한이 산다.

## 3. 앱 구조

```
proxy.ts                     # 세션 가드 (Next 16 middleware)
lib/supabase/server.ts       # @supabase/ssr 서버 클라이언트 (쿠키 세션 → RLS 적용됨)
lib/auth.ts                  # getSessionUser / canEditProject
lib/queries.ts               # 전 페이지 데이터 조회 (PostgREST embed 사용, 라이브 DB 검증 완료)
lib/actions.ts               # 모든 server actions (로그인, 프로젝트/고객사/파트너 수정, 업로드, 계정관리)
lib/labels.ts                # 상태값 한국어 라벨, 파트너 구분 로직
app/page.tsx                 # 대시보드 (통계 + Deal List)
app/customers[/[id]]         # 고객사 목록/상세 (기업정보, 프로젝트, 담당자, 문서, 편집)
app/partners[/[id]]          # 파트너 목록/상세 (구분 필터, 참여 프로젝트, NDA/프로필/위촉, 문서, 편집)
app/projects[/[id]]          # 프로젝트 목록/상세 (개요, 업데이트 타임라인, 액션, 구성원, 문서, 편집)
app/events[/[id]]            # 이벤트 목록/상세
app/documents                # 문서 레지스트리 (보관 + 미비)
app/settings                 # 계정 관리 (admin)
components/                  # AppShell, NavLinks, DealTable, DocumentsPanel, SaveNotice
```

삭제된 것 (구 버전): `app/network`, `app/search`, `components/CustomerTable|DataTable|SectionHeader`, `lib/operational-data.ts` → `_to_delete/`로 이동됨. 확인 후 폴더째 삭제하면 됨.

디자인 규칙 (변경 금지):
- 흰 표면 + 헤어라인 보더 compartment, 페이지 제목 아래 2px 검정 룰
- 주 색상 `#1a3c2c` (링크/활성 네비/버튼만), 액센트 `#c8a45d` 최소 사용
- 아이콘 없음, 상태 뱃지/알록달록 필 없음, 마케팅성 문구·불필요한 설명 문구 없음

## 4. Vercel 배포

1. GitHub `xyzplusco/XPERP`에 push (`.env.local`, 루트 xlsx는 gitignore 확인).
2. Vercel에서 리포 임포트, 환경변수 2개: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
   (`SUPABASE_DB_URL`은 로컬 마이그레이션 전용 — Vercel에 넣지 말 것)
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

## 5. 다음 작업 우선순위 (미완)

1. **데이터 정리 UI**: `A사/B사` 익명 M&A 딜 코드네임 정책, partner_status 오염값(이름/전화번호가 들어간 행) 일괄 정리 화면.
2. **PL/PM 매칭 개선**: PL 63/195, PM 34/195만 연결됨. 프로젝트 상세에서 admin이 수동 지정 가능하니 운영하면서 채우거나, XP 내부 인력 명부 기준 재매칭 스크립트.
3. **이벤트 초대자 임포트**: event_invitees 0건. 원본 시트에서 파싱 필요.
4. **project_weekly_updates 이력 임포트**: Deal list의 주차별 업데이트 24개 컬럼 → 타임라인으로 변환하는 스크립트 (현재는 신규 기록만 쌓임).
5. 검색은 의도적으로 제외 (v2). tsvector 인덱스는 스키마에 이미 있음.

## 6. 하지 말 것

- 시드 폴백을 제품 동작으로 되돌리지 말 것 (`XP_FORCE_SEED_FALLBACK` 관련 코드는 제거됨).
- 소스 임포트 행 무단 삭제 금지 (lineage 유지). 제품 뷰에서 필터하는 방식 유지.
- `.env.local`, DB 비밀번호, 루트 xlsx 커밋 금지.
- UI에 아이콘/컬러 뱃지/마케팅 문구 추가 금지.
