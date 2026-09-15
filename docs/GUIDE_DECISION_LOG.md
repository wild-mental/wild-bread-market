# GUIDE_DECISION_LOG — AI-Native 교육가이드 교체 결정 기록

대상: 발표 저장소 `docs/guides/MAKJI_Cafe24_MVP_교육가이드.html` (v2 코드 붙여넣기형 → v3 AI-Native형)
기준: Goal 2 프롬프트(`docs/goal02-guide-doc-renewal.md`)와 이 프로토타입의 계약(`docs/DECISION_LOG.md`, 앱 코드)

분류
- **CORE**: 가이드 구조 · 역할 배정 · 계약 변경
- **MINOR**: 문구 · 페이지 분할

카운터 (grep용, 항목을 추가하면 같이 올린다)

CORE: 2
MINOR: 7

---

## CORE-01 · 장 구성과 역할 배정
- 결정: v2의 10장을 11장 + 참고로 다시 짰다. 1 예제 몰 · 2 프로젝트와 재료(프로젝트 생성, 재료 문서 2개, AGENTS.md 규칙) · 3 코드 만들기(3-0 지도 + 13단계, 단계마다 [파일·재료 → 🤖 프롬프트 → 수락 기준 → 막히면]) · 4 Supabase · 5 첫 배포 · 6 카페24 개발자 앱 · 7 연결과 상품 수정 · 8 위젯 · 9 앱 화면 확인(B안 체험 화면) · 10 마무리 · 11 막히면(에이전트 작업이 막힐 때 포함) · 참고.
- 역할 배정 세부: 공개 상품 페이지 번호 확인·도구 버전 확인·기록표 파일 생성·배포 주소 curl 점검·git push는 🤖. GitHub 저장소 만들기·SQL Editor 실행·Supabase/Vercel/카페24 화면 작업은 🧑. 토큰 암호화 키 생성과 `.env.local`·Vercel 비밀값 입력은 🔑(에이전트 대화에 출력이 남지 않게 내 터미널·편집기에서). 관리 화면 버튼·상품 페이지·체험 화면 확인은 👀.
- 근거: Goal 2 1)의 역할 원칙과 작업 계획의 역할 배정표. git push는 원격 변경이라 사람이 저장소를 만든 뒤 요청할 때만 하도록 AGENTS.md 규칙 8번에 넣었다.

## CORE-02 · 계약을 재료 문서로 전달
- 결정: 코드 전문 대신 `docs/lab-context.md`를 에이전트가 프로젝트 안에 원문 그대로 저장하게 하고(P04 1~7절 사실·규칙, P05 8절 계약), 이후 코드 프롬프트는 "lab-context ○절"을 가리키며 파일별 동작 명세만 준다. 계약(8-3 입구 검사 순서, 8-5 OAuth 쿠키·콜백 순서, 8-7 공개 API 응답 키 8개·ctaUrl 파라미터 순서, 8-8 위젯 DOM 구조, 8-11 체험 화면 서버 HTML 필수 내용)은 프로토타입 코드와 `scripts/smoke.mjs` 점검 항목에서 역산했다.
- 근거: 에이전트마다 코드는 달라도 경로·JSON·오류 코드·화면 문구가 같으면 가이드의 수락 기준과 smoke 점검이 그대로 적용된다.

## MINOR-01 · 페이지 분할·병합
- v2 1-2(주소 해부)와 1-3(식별자 6개)을 하나로 합치고, v2 1-4(콘솔 확인)는 1-3 에이전트 확인 페이지의 선택 절로 옮겼다.
- 재료 문서를 한 프롬프트에 넣으면 붙여넣기 길이가 너무 길어 2-3(사실·규칙)과 2-4(계약) 두 페이지로 나눴다.
- 3-0 코드 단계 지도, 9-2 체험 화면 확인, 11-1 에이전트 작업이 막힐 때 페이지를 추가했다. 결과 61쪽.

## MINOR-02 · 프롬프트 번호와 실행 구분 표시
- 🤖 프롬프트는 문서 순서대로 P01~P23 + 오류 질문 틀 1개(총 24개). 상자 머리에 "순서대로 / 배포 후 / 필요할 때" 표시를 달았다. 배포 후 프롬프트는 P20(GitHub push) · P21(API 버전이 다를 때) · P22(배포 주소 점검).

## MINOR-03 · 학습자 프로젝트의 테스트 파일 이름
- 프로토타입의 `tests/oauth-and-crypto.test.ts` 대신 학습자 프로젝트는 `tests/token-crypto.test.ts`(3-3)와 `tests/oauth.test.ts`(3-4)로 나눴다. 단계별로 만든 파일만 테스트하게 하려는 것이며 라우트·응답 계약과는 무관하다.

## MINOR-04 · 체험 화면 상단 로고
- 학습자 프로젝트에는 로고 이미지 파일이 없으므로 8-11절에서 상단을 텍스트 "MAKJI" 표시로 정했다(프로토타입은 로고 PNG 사용).

## MINOR-05 · 저장 키와 완료 기록
- 가이드 페이지 위치·완료 체크를 저장하는 localStorage 키를 `makji-cafe24-v3-*`로 바꿔 v2 기록과 섞이지 않게 했다. 내 앱 주소 키(`makji-cafe24-app-origin`)는 v2와 같게 유지해 이미 입력한 주소가 이어진다.

## MINOR-06 · 학습자 GitHub 저장소 공개 범위
- 가이드 5-1은 학습자 저장소를 Private로 안내한다(프로토타입 wild-bread-market은 공개 저장소지만, 학습자 저장소는 실수로 비밀값을 올릴 위험을 줄이기 위해 비공개 권장).

## MINOR-07 · 시험 실행 1라운드 결과로 프롬프트 보완
- 1라운드(서브에이전트가 🤖 프롬프트만으로 새 프로젝트 생성): 20개 순서 프롬프트 완료, npm test 52 passed · build · lint 통과, 결과 프로젝트 smoke 24/24 PASS. 다만 첫 시도 실패 3곳과 모호한 문구 11곳이 보고됐다.
- 반영:
  - P03: page.module.css만 지우면 기본 page.tsx가 깨져 P13 빌드에서야 드러났다 → 최소 페이지로 바꾸고 build까지 확인하게 했다.
  - PageProps<'/경로'> 타입: 새 페이지 뒤 tsc가 실패했다 → lab-context 7절과 P08·P13·P14·P15·P16·P18 확인 명령에 `npx next typegen` 추가.
  - P19: 환경변수 없이 띄우면 proxy가 먼저 500을 내 입구 검사 순서를 볼 수 없었다 → 가짜 공개값 3개(비밀값 아님)를 명령 앞에 붙여 403 BAD_ORIGIN · 415 JSON_REQUIRED를 확인하게 했고, 개수 세기는 grep -o | wc -l로 명시.
  - lab-context 8-9절 change_log의 not null 위치를 컬럼마다 명시(action·result 포함).
  - 8-6절에 오류 메시지 문구·내부 오류 문자열 목록 추가, 8-7절에 503도 CORS 헤더 포함·환경변수 누락 처리 명시.
  - 8-11절: rate는 0~1 비율, formatRate는 % 없는 "66.7"; /result 제목·부제, 저장 화면·결과 대기 문구, TodayStatus 문장, "n회 참여 완료"의 n 계산을 명시.
  - P05: 이어 붙이기 전에 빈 줄 한 줄.
- 1라운드 프로젝트는 비교용으로 `.guide-build/agent-run-r1/`에 두고, 보완한 프롬프트로 2라운드를 새 폴더에서 다시 실행한다.

### 2라운드 결과 (보완한 프롬프트, 새 폴더)
- 서브에이전트가 prototype·가이드 원본·1라운드 폴더를 읽지 않고 prompts만으로 P01~P19·P23 실행. 첫 시도 실패 0곳.
- 결과 프로젝트: npm test 9 files 48 passed · npm run build 성공(/, /predict, /result 정적) · npm run lint 0 · `node scripts/smoke.mjs --project .guide-build/agent-run/makji-cafe24-lab` 24/24 PASS.
- 가이드 HTML에 들어간 프롬프트 텍스트가 2라운드 입력(prompts.md)과 같음을 추출 비교로 확인한 뒤, "검증 범위" 페이지에 결과를 적었다.
- 2라운드에서 보고된 모호한 문구(예: 음수 .5 반올림 방향, FLAT 문구의 -0.0%, planTarget 반환 모양, X-Cafe24-Call-Remain을 초 단위로 쓰는 명세, 빈 error= 처리, "016" 허용, AppShell 컴포넌트 종류)는 실행 실패나 계약·smoke 차이를 만들지 않아 이번 교체에서는 고치지 않았다. 고치면 프롬프트가 바뀌어 다시 시험 실행이 필요하므로 다음 개정 후보로 남긴다.

---

## 종료 기록 (2026-09-15)

- 시험 실행 2라운드 프로젝트: npm test 9 files 48 passed · npm run build · npm run lint exit 0 · smoke --project 24/24 PASS
- 가이드: GUIDE_CHECK: slides=61 errors=0 overflow=0 prompts=24 fullcode=0 appOrigin=OK · @font-face 124
- aztks-agent 최종 판정에서 위 명령을 직접 재실행해 일치 확인. 시험 실행 폴더(.guide-build/)는 증거를 남긴 뒤 삭제

STOP REASON: GUIDE_VERIFIED
AZTKS VERDICT: GO

---

## 사후 보완 (2026-09-15, 사용자 요청 — Goal 2 종료 뒤, 카운터 미포함)

- POST-01 · 교육가이드 5쪽 "진행 방법 고르기 — HUMAN_TODO만으로 되는 조건" 추가: A(가이드 전체)·B(프로토타입 저장소 + HUMAN_TODO) 비교, 이해도 조건 10개(로컬 실행 · 환경변수 · Git · Vercel · Supabase · OAuth · 카페24 · HTTP/CORS · 비밀값 · 원인 찾기)와 각 조건의 참고 쪽, 자가 점검 퀴즈 4개.
- POST-02 · 교육가이드 6쪽 "비밀값(credential) 관리 한눈에" 추가: 원칙 4개(비밀번호 관리자 보관·입력만 / AI 대화·커밋 금지 / 멤버 초대로 공유 / 2단계 인증), 비밀값 7종의 생성·보관·입력·교체 표, Vercel 적용 환경 Production만·Sensitive, 노출 시 교체, 끝낼 때 .env.local 삭제·권한 회수.
- POST-03 · 기존 쪽 보강: 4-1 Secret key 보관, 4-3 관리자 비밀번호 보관·가입 차단 권장, 5-2 Production만·Sensitive, 6-4 Client Secret 보관, 10-3 .env.local 삭제·권한 회수와 완료 체크 1개, "검증 범위"에 미확인 2건(비밀값 관리 화면 절차, 조건 10개의 학습자 검증) 추가. 결과 63쪽.
- POST-04 · 프로토타입 문서의 가이드 쪽 번호를 v3로 맞춤: HUMAN_TODO.md(TODO-00 로컬 검증·조건 요약, TODO-27~30 운영 중 비밀값 관리 추가, 기존 TODO 번호 유지), DEPLOY_SETUP_GUIDE.md(21곳 번호, "2-1. 비밀값 관리" 절 추가), live-test-report.md(단계 번호 v3, 9-2 행 추가).
- 검증: 가이드의 🤖 프롬프트 24개 텍스트가 보완 전과 바이트 단위로 같음(시험 실행 2라운드 결과 유지). GUIDE_CHECK: slides=63 errors=0 overflow=0 prompts=24 fullcode=0 appOrigin=OK · @font-face 124.
