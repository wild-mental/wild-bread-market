# HUMAN_TODO — 사람이 직접 해야 하는 웹 작업

이 프로토타입은 로컬 검증(`npm test` · `npm run build` · `npm run lint` · `node scripts/smoke.mjs`)까지만 끝낸 상태다.
아래 작업은 계정·대시보드·비밀값이 필요해서 AI 에이전트가 하지 않았다. **위에서부터 순서대로** 진행한다.

- 괄호 안 번호는 [교육가이드](https://wild-mental.github.io/sesac-4th-corp-rfp/docs/guides/MAKJI_Cafe24_MVP_%EA%B5%90%EC%9C%A1%EA%B0%80%EC%9D%B4%EB%93%9C.html)(v3 · 발표 저장소 `sesac-4th-corp-rfp`의 `docs/guides/MAKJI_Cafe24_MVP_교육가이드.html`)의 해당 쪽이다.
- 단계별 방법·확인 기준·막힐 때 대처는 `docs/DEPLOY_SETUP_GUIDE.md`에 있다.

표기: `[웹]` 브라우저에서 설정 · `[비밀값]` 사람만 보고 사람만 입력 · `[확인]` 결과를 눈으로 확인

> 비밀값(Supabase Secret key, DB 접속 문자열 `SUPABASE_DB_URL`, 카페24 Client Secret, 토큰 암호화 키, 발급 토큰)은 AI 에이전트·채팅·커밋·이 문서에 적지 않는다.
> 에이전트에게 도움을 받을 때는 값 자리를 `(비밀값)`으로 지우고 붙여 넣는다.
> 비밀값 전체 목록·보관 위치·교체 방법은 `docs/DEPLOY_SETUP_GUIDE.md` "2-1. 비밀값 관리"와 교육가이드 [비밀값 관리 한눈에](https://wild-mental.github.io/sesac-4th-corp-rfp/docs/guides/MAKJI_Cafe24_MVP_%EA%B5%90%EC%9C%A1%EA%B0%80%EC%9D%B4%EB%93%9C.html#page-6)에 있다.

## 이 문서만 보고 진행해도 되는 사람

교육가이드 [진행 방법 고르기](https://wild-mental.github.io/sesac-4th-corp-rfp/docs/guides/MAKJI_Cafe24_MVP_%EA%B5%90%EC%9C%A1%EA%B0%80%EC%9D%B4%EB%93%9C.html#page-5)의 조건 10개에 **모두** "예"라고 답할 수 있어야 한다. 요약하면:

1. Node.js 프로젝트를 로컬에서 `npm ci` · `npm test` · `npm run build`로 돌리고 오류 출력의 첫 줄을 찾을 수 있다.
2. `NEXT_PUBLIC_` 환경변수와 서버 전용 환경변수의 차이, 값을 바꾸면 Redeploy가 필요한 이유를 설명할 수 있다.
3. fork·clone·push와 `.gitignore`로 `.env.local`이 올라가지 않는지 확인할 수 있다.
4. Vercel에서 저장소 가져오기·환경변수 입력·Redeploy를 해 봤고, Production 주소와 배포별 주소를 구분한다.
5. Supabase SQL Editor 실행·사용자 만들기를 해 봤고, Publishable key와 Secret key·RLS의 역할을 설명할 수 있다.
6. OAuth 인가 코드 흐름에서 Redirect URI 정확 일치·state·scope·refresh token의 역할을 설명할 수 있다.
7. 카페24 대표운영자·부운영자 차이와 mall_id·product_no·product_code를 구분한다.
8. curl로 HTTP 상태 코드·응답 헤더(CORS)를 확인할 수 있다.
9. 비밀값을 채팅·커밋·캡처에 남기지 않고, 노출되면 재발급하는 절차를 안다.
10. 막히면 교육가이드 11장 표에서 결과 코드로 원인을 스스로 찾는다.

하나라도 자신이 없으면 교육가이드를 처음부터(최소한 해당 장) 따라 한다.

## 0. 시작 전

- [ ] TODO-00 `[확인]` 이 저장소를 내 계정으로 가져와 로컬 검증을 통과시킨다: GitHub에서 `wild-mental/wild-bread-market`을 fork(또는 clone 후 내 비공개 저장소로 push) → `npm ci` → `npm test && npm run build && npm run lint && node scripts/smoke.mjs` → 마지막 줄 `SMOKE: 28/28 PASS` (Google Chrome 필요)
- [ ] TODO-01 `[확인]` 카페24 쇼핑몰 `wildmental`의 **대표운영자** 계정으로 로그인할 수 있다 (부운영자는 앱 동의에서 `access_denied`) (11-2)
- [ ] TODO-02 `[확인]` 상품 16(향기로운 허브 쌀치아바타 · P000000Q · 분류 81 · display_group 1)의 원래 판매가·요약설명을 팀 노트에 기록한다 (1-4)

## 1. Supabase

- [ ] TODO-03 `[웹]` Supabase 프로젝트를 만든다. 생성 화면의 Database Password는 자동 생성해 **비밀번호 관리자**에 저장한다 (4-1)
- [ ] TODO-04 `[비밀값]` Project Settings > API Keys에서 Project URL · Publishable key · Secret key를 확인하고 **Secret key는 비밀번호 관리자**에 옮긴다 (4-1)
- [ ] TODO-05 `[비밀값]` 내 컴퓨터 `.env.local`에 `SUPABASE_DB_URL`(Supabase Connect → **Session pooler** 문자열, `[YOUR-PASSWORD]` 자리를 DB 비밀번호로) · `NEXT_PUBLIC_SUPABASE_URL` · `SUPABASE_SECRET_KEY` · `SETUP_ADMIN_EMAIL`을 넣고, **내 터미널에서** `npm run db:setup`을 실행한다. 테이블·권한·잠금 함수를 적용하고, 관리자 계정이 없으면 만들고(비밀번호 두 번 입력 → 비밀번호 관리자에 저장), `.env.local`의 `ADMIN_USER_IDS`에 UUID를 적는다. 수작업으로 하려면 SQL Editor에서 `supabase/migrations/0001_cafe24_lab.sql` 실행 (4-2)
- [ ] TODO-06 `[확인]` 출력 마지막 줄이 `SETUP: … fail=0`이고 `테이블 3개` · `RLS 켜짐` · `잠금 함수` · `anon 접근 차단` · `관리자 계정`이 OK이다. 수작업이면 확인 쿼리 결과가 테이블 3개와 `anon_can_read = false` (4-2)
- [ ] TODO-07 `[웹]` 관리자 계정을 확인한다: 스크립트가 만들었으면 Supabase Users에 그 이메일이 Confirmed로 보인다. 수작업이면 Authentication > Users > Add user에서 **Auto Confirm User** 체크로 만들고 비밀번호는 비밀번호 관리자에 저장한다. **주의(GRIP-01로 변경됨)**: 참여자 계정을 Supabase Auth 이메일 가입으로 정했으므로 새 사용자 가입(Allow new users to sign up)은 **켜 둔다**. 예전 권장(끄기)은 관리자 전용 시절 기준이었다 (4-3)
- [ ] TODO-08 `[비밀값]` 본인 터미널에서 토큰 암호화 키를 만들어 비밀번호 관리자에 저장한다. 이 키는 바꾸면 저장된 토큰을 풀 수 없다 (4-4)

## 2. GitHub · Vercel

- [x] TODO-09 `[웹]` GitHub 공개 저장소 `wild-mental/wild-bread-market`에 push했다. 내 계정으로 가져온 경우(TODO-00)에도 push 전마다 `git ls-files | grep -E '(^|/)\.env'` 결과가 `.env.example` 한 줄뿐인지 본다 (5-1)
- [ ] TODO-10 `[웹]` Vercel에서 저장소를 가져온다 (5-2)
- [ ] TODO-11 `[비밀값]` Vercel Environment Variables에 1차 배포용 5개(`NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` · `SUPABASE_SECRET_KEY` · `CAFE24_TOKEN_ENCRYPTION_KEY` · `ADMIN_USER_IDS=pending`)를 넣고 배포한다. 비밀값은 **Production 환경에만** 넣고, 입력 화면에 Sensitive 옵션이 있으면 켠다 (5-2)
- [ ] TODO-12 `[웹]` 프로젝트 Domains의 Production 주소(해시 없는 `https://…vercel.app`)를 확인하고, 시크릿 창에서 로그인 없이 열리는지(배포 보호가 막지 않는지) 본다 (5-2)
- [ ] TODO-13 `[확인]` 배포 주소의 `/`·`/predict`·`/result`가 열리고 지수 값이 102.4 · 98.7 · 105.1이다 (9-2)
- [ ] TODO-14 `[웹]` `ADMIN_USER_IDS`(TODO-05가 알려 준 UUID, 또는 `/login` 후 `/admin/cafe24` 권한 없음 화면의 UUID)와 `APP_BASE_URL`(Production 주소, 끝에 `/` 없이)을 Vercel에 넣고 재배포한다. 배포 주소 `/admin/setup`에 로그인해 **필요(fail) 0**인지 본다(카페24 값은 아직 "확인"이어도 정상) (5-3)

## 3. 카페24 개발자센터

- [ ] TODO-15 `[웹]` 카페24 개발자센터에 가입하고 개발사(자)를 등록한다 (6-1)
- [ ] TODO-16 `[웹]` [Apps > App 관리 > ADD PRODUCT]로 앱을 만들고 App URL `https://(내 앱 주소)/admin/cafe24`, Redirect URI `https://(내 앱 주소)/api/cafe24/oauth/callback`을 입력한다 (6-2)
- [ ] TODO-17 `[웹]` 권한 4종(`mall.read_application` · `mall.write_application` · `mall.read_product` · `mall.write_product`)과 API 버전 `2026-09-01`을 맞춘다 (6-3)
- [ ] TODO-18 `[비밀값]` [STEP 1. 개발정보관리]의 Client ID·Client Secret을 확인해 **Client Secret은 비밀번호 관리자**에 저장하고, 두 값을 Vercel(Production)에 넣고 2차 배포한다. `/admin/setup`에서 `CAFE24_CLIENT_ID`·`CAFE24_CLIENT_SECRET`이 OK인지 본다 (6-4)

## 4. 실제 연동 확인 (결과는 `docs/live-test-report.md`에 기록)

- [ ] TODO-19 `[웹]` 앱 테스트 실행으로 wildmental에 설치 → 관리 화면 [카페24 연결하기] → 결과 `connected` (7-1)
- [ ] TODO-20 `[확인]` 상품 16 조회 → 기준값 저장 → up 적용 → down+할인(4,940원) → 복원(5,200원) (7-2 ~ 7-6)
- [ ] TODO-21 `[확인]` 공개 위젯 API 200·CORS, 상품 17은 404 (8-2)
- [ ] TODO-22 `[웹]` [위젯 설치] 후 상품 16 페이지 PC·모바일에서 카드가 뜨고 링크에 `utm_source=cafe24`가 붙는다 (8-3, 8-4)
- [ ] TODO-23 `[확인]` 앱 랜딩의 "오늘의 브레드 보러 가기 (자사몰 상품 16)" 링크가 상품 16 상세를 연다 (9-1)
- [ ] TODO-24 `[웹]` 실습이 끝나면 위젯 삭제·상품 복원·테스트 앱 삭제·토큰 삭제로 정리하고, 내 컴퓨터의 `.env.local`을 지운다(연동을 계속 운영하면 위젯·앱·토큰은 남기되, `SUPABASE_DB_URL` 줄은 설치가 끝난 뒤 바로 지운다) (8-5, 10-3)

## 5. 기획 확인이 필요한 목업 규칙

프로토타입에서 임시로 정한 규칙이다. 근거는 `docs/DECISION_LOG.md`의 해당 항목.

- [x] TODO-25 `[확인]` 회차 마감 시각 — **확정됨(GRIP-05)**: 영업일 09:00 KST, 영업일은 한국거래소(KRX) 휴장일 제외. 마감 정각 불포함 — MINOR-02 → GRIP-05
- [x] TODO-26 `[확인]` 보합 처리 — **확정됨(GRIP-06)**: 보합은 UP·DOWN 어느 쪽이든 **정답(HIT)**. 부분 미수집이면 회차 전체 무효 — MINOR-07 → GRIP-06
- [ ] TODO-31 `[확인]` 약관·개인정보처리방침 작성 주체를 정하고 법무 검토를 받는다. 수집 항목은 이메일·닉네임, 보유기간 3년, 탈퇴 시 예측 기록 익명화로 확정됐다 — GRIP-03
- [ ] TODO-32 `[확인]` 외부 시세 데이터 출처(KOSPI·원/달러·금)를 선정하고 **상업적 이용 허용 여부·호출 한도·유료 여부**를 약관에서 확인한다. 원지표 원본을 DB에 보관하는 것이 약관에 저촉되지 않는지도 함께 본다 — GRIP-08
- [ ] TODO-33 `[확인]` 한국거래소(KRX) 휴장일 목록을 어디서 받을지 정한다(공식 공표 자료 또는 API). 회차 자동 생성이 이 목록에 의존한다 — GRIP-05
- [ ] TODO-34 `[확인]` 브레드 지수 환산식(원지표 → 3종 지수)과 기준일·기준값을 확정한다. 공식은 비공개로 운영하되 내부 문서에는 남긴다 — GRIP-08
- [ ] TODO-35 `[확인]` 주간 상위 5명 리워드가 **경품 고지 의무·제세공과금** 대상인지 법무 확인을 받는다. 리워드 가액과 당첨자 수 공지 방식도 함께 정한다 — GRIP-10

## 6. 운영 중 비밀값 관리

- [ ] TODO-27 `[웹]` GitHub · Vercel · Supabase · 카페24 계정에 2단계 인증을 켠다(각 서비스 계정 보안 설정). 팀원에게는 비밀값을 보내지 말고 각 대시보드의 멤버 초대로 권한을 준다
- [ ] TODO-28 `[비밀값]` 비밀값을 교체할 때: 새 값 발급 → 비밀번호 관리자 갱신 → Vercel 값 교체 → Redeploy → `/admin/setup`과 관리 화면 [연결 상태]로 동작 확인 → 이전 값 폐기. DB 비밀번호를 바꾸면 `SUPABASE_DB_URL`도 새로 만든다. 토큰 암호화 키를 바꾼 경우에만 `cafe24_connections` 행 삭제 후 [카페24 연결하기]를 다시 한다 (비밀값 관리 한눈에)
- [ ] TODO-29 `[비밀값]` 비밀값이 GitHub·채팅·캡처·AI 대화에 노출되면 삭제만으로 끝내지 않고 즉시 TODO-28 순서로 교체한다 (10-3)
- [ ] TODO-30 `[확인]` 팀원이 빠지거나 실습이 끝나면 대시보드 멤버 권한을 회수하고, 필요하면 TODO-28로 비밀값을 교체한다
