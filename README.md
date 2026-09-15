# wild-bread-market — MAKJI 브레드마켓 프로토타입

MAKJI 브레드마켓 제안(발표 덱 `index.html`)의 **B안 프로토타입**이다. 두 부분으로 되어 있다.

| 부분 | 경로 | 내용 |
|---|---|---|
| MVP 체험 목업 | `/` · `/predict` · `/result` | 3종 지수 카드와 이번 주 챌린지, 일일 UP/DOWN 예측(마감 카운트다운·제출·수정), 결과 확인(지수별 적중·주간 정확도·월~금 진행). 데이터는 목업이며 DB·외부 시세 API를 쓰지 않는다. |
| 배포 준비 자동화 | `npm run db:setup` · `npm run setup:check` · `/admin/setup` | Supabase 테이블·권한 마이그레이션, 관리자 계정이 없으면 생성, 환경변수·DB·관리자·카페24 준비 상태 점검 |
| 카페24 연동 레퍼런스 | `/admin/cafe24` · `/api/cafe24/oauth/*` · `/api/admin/cafe24/*` · `/api/public/bread-widget` · `/widgets/makji-bread.js` | `docs/guides/MAKJI_Cafe24_MVP_교육가이드.html`의 실습 코드 40개 파일. 예제 몰 `wildmental` · shop_no 1 · 상품 16(P000000Q) · 분류 81 · display_group 1. |

수치와 화면은 기획 예시다. 실제 시장 데이터가 아니다.

저장소: https://github.com/wild-mental/wild-bread-market — 공개 저장소이므로 `.env.local`·비밀값을 커밋하지 않는다. 배포·연동은 `docs/DEPLOY_SETUP_GUIDE.md`.

## 검증 명령

Node.js 24 · npm · Google Chrome이 필요하다.

```bash
npm install
npm test              # Vitest — 판정 규칙·목업 데이터·연동 로직 단위 테스트
npm run build         # Next.js 16 프로덕션 빌드
npm run lint          # ESLint
node scripts/smoke.mjs  # 프로덕션 서버 + 가짜 Supabase + 헤드리스 Chrome 점검, 마지막 줄 `SMOKE: 28/28 PASS`
```

`node scripts/smoke.mjs --project <경로>`로 같은 라우트 계약을 따르는 다른 프로젝트 폴더도 점검할 수 있다(빌드가 없으면 먼저 빌드, `--build`는 항상 새로 빌드). 준비 상태 점검 화면·설치 스크립트가 없는 프로젝트(교육가이드로 만든 학습자 프로젝트)는 해당 4개 점검을 `SKIP`으로 표시하고 점수에서 빼므로 `SMOKE: 24/24 PASS`가 기준이다.
smoke는 테스트 전용 가짜 환경변수만 쓰고 실제 Supabase·카페24에는 요청하지 않는다. 브라우저 점검은 `scripts/fixtures/product-16.html`(상품 16 공개 페이지 사본)을 `https://wildmental.cafe24.com` 주소로 흉내 내어 위젯을 띄운다.
픽스처는 2026-09-15에 공개 페이지를 GET으로 저장한 원본이며, 페이지에 들어 있던 카페24 오류 수집용 공개 토큰 한 곳만 `REDACTED_PUBLIC_ERROR_TRACER_TOKEN`으로 바꿨다(점검 중 외부 요청은 모두 차단되므로 동작에 영향 없음).

## 구성

```
src/
├─ app/
│  ├─ page.tsx  predict/  result/        MVP 체험 목업 화면
│  ├─ admin/cafe24/  login/              연동 관리 화면 (가이드)
│  ├─ admin/setup/                       배포 준비 상태 점검 화면
│  └─ api/                               OAuth · 관리 API · 공개 위젯 API (가이드)
├─ components/mvp/                       목업 화면 컴포넌트 · 체험 시계 · CSS
├─ lib/mvp/challenge.ts                  마감·정답 판정·주간 정확도 순수 함수
├─ lib/mvp/mock-data.ts                  발표자료 값 기반 목업 데이터
├─ lib/mvp/prediction-store.ts           오늘 예측 localStorage 보관
├─ lib/setup/env-rules.ts                준비 상태 점검 규칙 (화면·스크립트 공용, 순수 함수)
├─ lib/setup/readiness.ts                DB·관리자·카페24 연결 상태 조회 (읽기 전용)
└─ lib/cafe24/ · lib/supabase/ · …       연동 레퍼런스 (가이드)
public/widgets/makji-bread.js            카페24 상품 상세 위젯 (가이드)
supabase/migrations/0001_cafe24_lab.sql  테이블·RLS (가이드)
scripts/db-setup.mjs  scripts/lib/db-setup-core.mjs   설치 스크립트 (npm run db:setup · setup:check)
scripts/smoke.mjs  scripts/lib/chrome.mjs  scripts/fixtures/
tests/                                   Vitest
docs/DECISION_LOG.md                     가이드·발표자료에 없는 결정 (CORE/MINOR)
docs/HUMAN_TODO.md                       사람이 해야 할 웹 작업 순서 (체크리스트)
docs/DEPLOY_SETUP_GUIDE.md               Supabase · Vercel · 카페24 배포·연동 완료 가이드
docs/live-test-report.md                 실제 연동 검증 기록표 (가이드)
```

## 로컬 실행

```bash
npm run dev   # http://localhost:3000 — 목업 화면은 환경변수 없이 열린다
```

관리 화면·연동 API는 `.env.example`의 값이 있어야 동작한다. 값이 비어 있으면 `/admin/cafe24`는 `/admin/setup`으로 이동해 무엇이 빠졌는지 보여 준다. 값 입력과 카페24·Supabase·Vercel 설정은 사람이 `docs/DEPLOY_SETUP_GUIDE.md`(체크리스트는 `docs/HUMAN_TODO.md`) 순서대로 한다. 비밀값은 커밋하거나 AI 에이전트에게 주지 않는다.

## Supabase 준비 자동화

사람이 **자기 컴퓨터 터미널**에서 실행한다(비밀값을 다루므로 AI 에이전트에게 맡기지 않는다).

1. `.env.local`에 넣는다: `SUPABASE_DB_URL`(Supabase 대시보드 Connect → Session pooler 문자열, DB 비밀번호 포함) · `NEXT_PUBLIC_SUPABASE_URL` · `SUPABASE_SECRET_KEY` · `SETUP_ADMIN_EMAIL`
2. `npm run db:setup`
   - `supabase/migrations/*.sql`을 번호 순서로 적용하고 적용 기록을 `lab_private.schema_migrations`에 남긴다(다시 실행하면 건너뜀, 적용한 파일을 고치면 멈춤)
   - 테이블 3개 · RLS · 잠금 함수 · anon 차단 · service_role 권한을 확인한다
   - `SETUP_ADMIN_EMAIL` 계정이 없으면 이메일 확인된 상태로 만든다(비밀번호는 두 번 입력, 또는 `--generate-password`로 한 번만 화면에 표시). 이미 있으면 바꾸지 않는다
   - `.env.local`의 `ADMIN_USER_IDS`가 비었거나 `pending`이면 관리자 UUID를 적는다
3. 알려 준 UUID를 Vercel `ADMIN_USER_IDS`에 넣고 Redeploy → 배포 주소 `/admin/setup`에서 필요(fail) 0 확인
4. `SUPABASE_DB_URL`은 Vercel에 넣지 않는다. 설치가 끝나면 `.env.local`에서 지워도 된다

`npm run setup:check`는 같은 점검을 아무것도 바꾸지 않고 실행한다. `/admin/setup`은 관리자 UUID 설정 전에는 로그인 없이, 설정 뒤에는 관리자만 볼 수 있고 값은 표시하지 않는다.
