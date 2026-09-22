<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:project-rules -->

# 프로젝트 규범 — DB 접근 (GRIP 세션 2026-09-22 확정)

근거: `docs/DECISION_LOG.md` GRIP-01·02 · 스키마 단일 출처: `docs/DB_SCHEMA.md`

1. **참여자 계정은 Supabase Auth 이메일 가입**이다. 사용자 테이블의 키는 `auth.users(id)`를 참조한다. 별도 회원 테이블을 만들지 않는다.
2. **사용자 데이터는 RLS 정책으로 막는다.** 참여자 소유 데이터(`profiles`·`predictions` 등)를 읽고 쓸 때 `service_role`(RLS 우회)을 쓰지 않는다. 브라우저에서 publishable key + 로그인 세션으로 직접 조회하고, 권한 판정은 RLS 정책에 맡긴다.
3. `service_role`은 **다음 경우에만** 쓴다 — ① 카페24 연동 테이블 3개 ② 지수·회차 적재 같은 운영 배치 ③ 관리자 전용 작업. 어느 경우든 관리자 검사 뒤에만 호출한다.
4. **RLS 정책을 추가·수정하면 PGlite 테스트를 같이 쓴다.** 정책은 눈으로 맞추기 어려우므로 실제 역할을 전환해 검증한다 (`tests/migration-mvp-core.test.ts` 방식).
5. 남의 데이터를 일부 보여줘야 하는 화면(주간 랭킹 등)은 "본인만" 정책을 느슨하게 만들지 말고, **공개용 별도 테이블 또는 뷰**를 두어 노출 항목을 제한한다.
6. **개인정보는 이메일·닉네임만 수집한다.** 보유기간은 3년이다. 새 개인정보 칸을 추가하려면 먼저 `docs/DECISION_LOG.md`에 근거를 남긴다.
7. **탈퇴해도 예측 기록은 익명화해 남긴다.** 참여자 데이터에서 `auth.users`를 참조할 때 예측·판정 같은 기록성 테이블은 `on delete set null`을 쓰고, 프로필처럼 개인정보 자체인 테이블만 `on delete cascade`를 쓴다.
8. **회차 마감은 영업일 09:00 KST**이며, 영업일은 한국거래소(KRX) 휴장일을 제외한 날이다. 마감 정각은 포함하지 않는다. 마감 판정은 **서버 시각(`now()`)만** 기준으로 하고 브라우저 시각을 쓰지 않는다.
9. **`0002`는 실제 Supabase에 적용된 뒤에는 수정하지 않는다.** 적용 이후의 스키마 변경은 `0003` 이후 새 번호 파일로만 추가한다.
10. **판정 규칙** — 확정값 없음(휴장·미공시)은 `VOID`, **보합은 `HIT`**(사용자 통제 밖이므로 정답), 3종 중 일부만 수집되면 **그 회차 전체를 `VOID`**. 분모는 항상 3 또는 0이다. 판정은 `src/lib/mvp/challenge.ts`의 순수 함수를 서버에서 그대로 재사용한다.
11. **판정은 마감 후 배치가 한 번 하고 `judgments`에 저장한다.** 조회 시점에 다시 계산하지 않는다. 배치는 `unique (user_id, trade_date, index_key)`로 멱등하게 만들어 재실행이 안전해야 한다.
12. **확정값이 정정되어도 이미 판정한 회차는 재판정하지 않는다.** 정정 사실만 `index_snapshots`에 기록한다.
13. **환산식과 원지표 원본은 공개하지 않는다.** `index_snapshots`의 `source_name`·`source_value`는 `service_role`만 읽는다. 브라우저·공개 API 응답에 이 두 칸을 넣지 않는다. 공개 컬럼은 `index_key`·`trade_date`·`status`·`value`·`corrected_value`·`corrected_at` 여섯뿐이며(GRIP-08a), 컬럼을 늘리려면 이 규칙을 먼저 고친다.
14. **주간 랭킹은 계단식이다.** 주 경계는 월~금. 고정 최소 참여 기준을 두지 않고, 그 주 **유효 회차 수 N**에서 결석 수(N − 참여 수)로 티어를 나눈다 — 결석 0회가 1차 랭크, 1회가 2차 랭크. 참가자 전원이 랭크에 든다. 정렬은 ① 참여 회차 수 ② 정확도 ③ 먼저 제출한 순.
15. **무효(VOID) 회차는 N에서 빼고 결석으로 세지 않는다.** 채점될 수 없던 회차를 결석으로 계산하지 않는다.
16. **랭크는 티어로 분절하지 않고 1위부터 연속으로 매긴다.** 티어는 정렬 기준일 뿐이다. 결석 0회 그룹이 1·2·3위, 결석 1회 그룹이 그 다음 4·5·6위를 잇는 하나의 순위표다.
17. **랭킹은 확정 시점 값을 박아 저장한다.** `weekly_rankings`에 `valid_rounds`·`participated`·`tier`·`accuracy`·`rank`를 남겨, 이후 재계산해도 과거 순위가 바뀌지 않게 한다.
18. **리워드는 주간 상위 5명에게 쿠폰코드로 수동 지급한다.** 티어를 가로질러 연속 순위 1~5위가 대상이다. `rewards`에 `unique (week_start, user_id)`를 걸어 한 주 중복 수령을 막는다. 카페24 쿠폰 API 자동 발급은 이번 범위 밖이며, 도입하려면 앱 scope 추가와 재심사를 먼저 확인한다.

<!-- END:project-rules -->
