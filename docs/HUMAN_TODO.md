# HUMAN_TODO — 사람이 직접 해야 하는 웹 작업

이 프로토타입은 로컬 검증(`npm test` · `npm run build` · `npm run lint` · `node scripts/smoke.mjs`)까지만 끝낸 상태다.
아래 작업은 계정·대시보드·비밀값이 필요해서 AI 에이전트가 하지 않았다. **위에서부터 순서대로** 진행한다.
괄호 안 번호는 `docs/guides/MAKJI_Cafe24_MVP_교육가이드.html`의 해당 쪽이다.

표기: `[웹]` 브라우저에서 설정 · `[비밀값]` 사람만 보고 사람만 입력 · `[확인]` 결과를 눈으로 확인

> 비밀값(Supabase Secret key, 카페24 Client Secret, 토큰 암호화 키, 발급 토큰)은 AI 에이전트·채팅·커밋·이 문서에 적지 않는다.
> 에이전트에게 도움을 받을 때는 값 자리를 `(비밀값)`으로 지우고 붙여 넣는다.

## 0. 시작 전

- [ ] TODO-01 `[확인]` 카페24 쇼핑몰 `wildmental`의 **대표운영자** 계정으로 로그인할 수 있다 (부운영자는 앱 동의에서 `access_denied`) (10-1)
- [ ] TODO-02 `[확인]` 상품 16(향기로운 허브 쌀치아바타 · P000000Q · 분류 81 · display_group 1)의 원래 판매가·요약설명을 팀 노트에 기록한다 (1-5)

## 1. Supabase

- [ ] TODO-03 `[웹]` Supabase 프로젝트를 만든다 (3-1)
- [ ] TODO-04 `[비밀값]` Project Settings > API Keys에서 Project URL · Publishable key · Secret key를 비밀번호 관리자에 옮긴다 (3-1)
- [ ] TODO-05 `[웹]` SQL Editor에서 `supabase/migrations/0001_cafe24_lab.sql` 전체를 실행한다 (3-2)
- [ ] TODO-06 `[확인]` 확인 쿼리 결과가 `cafe24_change_log · cafe24_connections · cafe24_products` 3개와 `anon_can_read = false`이다 (3-2)
- [ ] TODO-07 `[웹]` Authentication > Users > Add user에서 관리자 계정(이메일·비밀번호)을 **Auto Confirm User** 체크로 만든다 (3-3)
- [ ] TODO-08 `[비밀값]` 본인 터미널에서 토큰 암호화 키를 만들어 비밀번호 관리자에 저장한다 (3-4)

## 2. GitHub · Vercel

- [ ] TODO-09 `[웹]` GitHub에 비공개 저장소를 만들고 이 폴더를 push한다. push 전에 `git status --short | grep -E "\.env"` 결과에 `.env.example`만 있는지 본다 (4-1)
- [ ] TODO-10 `[웹]` Vercel에서 저장소를 가져온다 (4-2)
- [ ] TODO-11 `[비밀값]` Vercel Environment Variables에 1차 배포용 5개(`NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` · `SUPABASE_SECRET_KEY` · `CAFE24_TOKEN_ENCRYPTION_KEY` · `ADMIN_USER_IDS=pending`)를 넣고 배포한다 (4-2)
- [ ] TODO-12 `[웹]` 프로젝트 Domains의 Production 주소(해시 없는 `https://…vercel.app`)를 확인한다 (4-2)
- [ ] TODO-13 `[확인]` 배포 주소의 `/`·`/predict`·`/result`가 열리고 지수 값이 102.4 · 98.7 · 105.1이다
- [ ] TODO-14 `[웹]` 배포 주소 `/login`으로 로그인 → `/admin/cafe24`에 표시된 UUID를 `ADMIN_USER_IDS`에, Production 주소를 `APP_BASE_URL`(끝에 `/` 없이)에 넣고 재배포한다 (4-3)

## 3. 카페24 개발자센터

- [ ] TODO-15 `[웹]` 카페24 개발자센터에 가입하고 개발사(자)를 등록한다 (5-1)
- [ ] TODO-16 `[웹]` [Apps > App 관리 > ADD PRODUCT]로 앱을 만들고 App URL `https://(내 앱 주소)/admin/cafe24`, Redirect URI `https://(내 앱 주소)/api/cafe24/oauth/callback`을 입력한다 (5-2)
- [ ] TODO-17 `[웹]` 권한 4종(`mall.read_application` · `mall.write_application` · `mall.read_product` · `mall.write_product`)과 API 버전 `2026-09-01`을 맞춘다 (5-3)
- [ ] TODO-18 `[비밀값]` [STEP 1. 개발정보관리]의 Client ID·Client Secret을 Vercel에 넣고 2차 배포한다 (5-4)

## 4. 실제 연동 확인 (결과는 `docs/live-test-report.md`에 기록)

- [ ] TODO-19 `[웹]` 앱 테스트 실행으로 wildmental에 설치 → 관리 화면 [카페24 연결하기] → 결과 `connected` (6-1)
- [ ] TODO-20 `[확인]` 상품 16 조회 → 기준값 저장 → up 적용 → down+할인(4,940원) → 복원(5,200원) (6-2 ~ 6-6)
- [ ] TODO-21 `[확인]` 공개 위젯 API 200·CORS, 상품 17은 404 (7-2)
- [ ] TODO-22 `[웹]` [위젯 설치] 후 상품 16 페이지 PC·모바일에서 카드가 뜨고 링크에 `utm_source=cafe24`가 붙는다 (7-3, 7-4)
- [ ] TODO-23 `[확인]` 앱 랜딩의 "오늘의 브레드 보러 가기 (자사몰 상품 16)" 링크가 상품 16 상세를 연다 (8-1)
- [ ] TODO-24 `[웹]` 실습이 끝나면 위젯 삭제·상품 복원·토큰 삭제로 정리한다 (7-5, 9-3)

## 5. 기획 확인이 필요한 목업 규칙

프로토타입에서 임시로 정한 규칙이다. 근거는 `docs/DECISION_LOG.md`의 해당 항목.

- [ ] TODO-25 `[확인]` 회차 마감 시각(목업: 영업일 09:00 KST)을 발주사와 확정한다 — MINOR-02
- [ ] TODO-26 `[확인]` 직전 확정값과 같은 보합일 때 무효 처리할지 확정한다 — MINOR-07
