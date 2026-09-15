# makji-cafe24-lab — MAKJI 브레드마켓 프로토타입

MAKJI 브레드마켓 제안(발표 덱 `index.html`)의 **B안 프로토타입**이다. 두 부분으로 되어 있다.

| 부분 | 경로 | 내용 |
|---|---|---|
| MVP 체험 목업 | `/` · `/predict` · `/result` | 3종 지수 카드와 이번 주 챌린지, 일일 UP/DOWN 예측(마감 카운트다운·제출·수정), 결과 확인(지수별 적중·주간 정확도·월~금 진행). 데이터는 목업이며 DB·외부 시세 API를 쓰지 않는다. |
| 카페24 연동 레퍼런스 | `/admin/cafe24` · `/api/cafe24/oauth/*` · `/api/admin/cafe24/*` · `/api/public/bread-widget` · `/widgets/makji-bread.js` | `docs/guides/MAKJI_Cafe24_MVP_교육가이드.html`의 실습 코드 40개 파일. 예제 몰 `wildmental` · shop_no 1 · 상품 16(P000000Q) · 분류 81 · display_group 1. |

수치와 화면은 기획 예시다. 실제 시장 데이터가 아니다.

## 검증 명령

Node.js 24 · npm · Google Chrome이 필요하다.

```bash
npm install
npm test              # Vitest — 판정 규칙·목업 데이터·연동 로직 단위 테스트
npm run build         # Next.js 16 프로덕션 빌드
npm run lint          # ESLint
node scripts/smoke.mjs  # 프로덕션 서버 + 가짜 Supabase + 헤드리스 Chrome 점검, 마지막 줄 `SMOKE: n/n PASS`
```

`node scripts/smoke.mjs --project <경로>`로 같은 라우트 계약을 따르는 다른 프로젝트 폴더도 점검할 수 있다(빌드가 없으면 먼저 빌드, `--build`는 항상 새로 빌드).
smoke는 테스트 전용 가짜 환경변수만 쓰고 실제 Supabase·카페24에는 요청하지 않는다. 브라우저 점검은 `scripts/fixtures/product-16.html`(상품 16 공개 페이지 사본)을 `https://wildmental.cafe24.com` 주소로 흉내 내어 위젯을 띄운다.

## 구성

```
src/
├─ app/
│  ├─ page.tsx  predict/  result/        MVP 체험 목업 화면
│  ├─ admin/cafe24/  login/              연동 관리 화면 (가이드)
│  └─ api/                               OAuth · 관리 API · 공개 위젯 API (가이드)
├─ components/mvp/                       목업 화면 컴포넌트 · 체험 시계 · CSS
├─ lib/mvp/challenge.ts                  마감·정답 판정·주간 정확도 순수 함수
├─ lib/mvp/mock-data.ts                  발표자료 값 기반 목업 데이터
├─ lib/mvp/prediction-store.ts           오늘 예측 localStorage 보관
└─ lib/cafe24/ · lib/supabase/ · …       연동 레퍼런스 (가이드)
public/widgets/makji-bread.js            카페24 상품 상세 위젯 (가이드)
supabase/migrations/0001_cafe24_lab.sql  테이블·RLS (가이드)
scripts/smoke.mjs  scripts/lib/chrome.mjs  scripts/fixtures/
tests/                                   Vitest
docs/DECISION_LOG.md                     가이드·발표자료에 없는 결정 (CORE/MINOR)
docs/HUMAN_TODO.md                       사람이 해야 할 웹 작업 순서
docs/live-test-report.md                 실제 연동 검증 기록표 (가이드)
```

## 로컬 실행

```bash
npm run dev   # http://localhost:3000 — 목업 화면은 환경변수 없이 열린다
```

관리 화면·연동 API는 `.env.example`의 값이 있어야 동작한다. 값 입력과 카페24·Supabase·Vercel 설정은 사람이 `docs/HUMAN_TODO.md` 순서대로 한다. 비밀값은 커밋하거나 AI 에이전트에게 주지 않는다.
