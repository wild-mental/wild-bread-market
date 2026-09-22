# GRIP REGISTER — DB 연동 풀버전 의사결정

시작 2026-09-22 · 참조 `docs/DB_DESIGN_REVIEW.md` (Q1~Q16) + `docs/DB_SCHEMA.md` + `docs/DECISION_LOG.md` + `docs/HUMAN_TODO.md` + `../../docs/business-logic/*.md`
관심 방향: DB 연동 풀버전 — 마이그레이션 전략 포함한 스키마 확정
이번 세션 budget: 10문답 (T1~T10). T11~T13은 잔여로 남긴다.

STATUS: BUDGET_REACHED (10문답 완료 · 스키마 작성 완료 · 잔여 T11~T14)
RESOLVED: 10 / DROPPED: 0 / TOTAL: 14

- [x] T1  | CORE  | 참여자 계정 모델 (Q1)                          | status:RESOLVED | decision:Supabase Auth 이메일 가입 | applied:DECISION_LOG.md GRIP-01 · HUMAN_TODO.md TODO-07 · DB_SCHEMA.md
- [x] T2  | CORE  | 사용자 데이터 접근 방식 (Q16)                   | status:RESOLVED | decision:A안 RLS 정책 + 브라우저 직접 조회 | applied:AGENTS.md 규범 2~5 · DECISION_LOG GRIP-02 · DB_SCHEMA §8
- [x] T3  | CORE  | 개인정보 수집 범위·보존·탈퇴 처리 (Q2)          | status:RESOLVED | decision:최소 수집(이메일·닉네임)·보유 3년·탈퇴 시 익명화 | applied:AGENTS.md 규범 6~7 · DECISION_LOG GRIP-03 · DB_SCHEMA §8 · HUMAN_TODO §5
- [x] T4  | CORE  | 마이그레이션 전략                               | status:RESOLVED | decision:0002를 직접 수정(미적용 상태라 가능) | applied:0002 수정 · 테스트 2건 · DECISION_LOG GRIP-04 · DB_SCHEMA §8
- [x] T5  | CORE  | 회차 마감 시각과 영업일 정의 (Q4/TODO-25)        | status:RESOLVED | decision:영업일 09:00 KST · 영업일=KRX 휴장일 제외 | applied:AGENTS.md 규범 8~9 · DECISION_LOG GRIP-05 · DB_SCHEMA §8 · HUMAN_TODO TODO-25 종료
- [x] T6  | CORE  | 판정 분모 규칙 (Q5+Q6)                          | status:RESOLVED | decision:보합=정답(HIT) · 부분 미수집은 회차 전체 VOID | applied:challenge.ts · 테스트 · AGENTS.md 규범 10 · DECISION_LOG GRIP-06 · HUMAN_TODO TODO-26 종료
- [x] T7  | CORE  | 판정 저장 방식과 정정 대응 (Q7+D5/D9)            | status:RESOLVED | decision:judgments에 저장 · 정정 시 재판정 안 함 | applied:AGENTS.md 규범 11~12 · DECISION_LOG GRIP-07 · DB_SCHEMA §8
- [x] T8  | CORE  | 지수 출처·환산식·원본 보관·공개 수준 (Q12+Q13)   | status:RESOLVED | decision:원본 보관 · 환산식 미공개 · 공개 컬럼 4개로 제한 | applied:0002 컬럼 권한 · 테스트 1건 · AGENTS.md 규범 13 · DECISION_LOG GRIP-08 · HUMAN_TODO TODO-32~34
- [x] T9  | CORE  | 주간 랭킹 경계·자격·동점 규칙 (Q9+Q10)           | status:RESOLVED | decision:계단식 정렬 + 1위부터 연속 순위(GRIP-09a 정정) · 전원 랭크 포함 | applied:AGENTS.md 규범 14~17 · DECISION_LOG GRIP-09/09a · DB_SCHEMA §8
- [x] T10 | CORE  | 리워드 지급 범위·수단·법적 고지 (Q11+Q3)         | status:RESOLVED | decision:주간 연속 순위 상위 5명 · 쿠폰코드 수동 지급 | applied:AGENTS.md 규범 18 · DECISION_LOG GRIP-10 · DB_SCHEMA §8 · HUMAN_TODO TODO-35
- [ ] T11 | MINOR | 마감 전 예측 수정 허용 횟수 (Q8)                | depends:T5          | status:UNRESOLVED
- [ ] T12 | MINOR | 예상 참여 규모와 배치 분할 기준 (Q14)           | depends:T7          | status:UNRESOLVED
- [ ] T13 | MINOR | 크루아상·골든 브레드 카페24 상품번호 (Q15)       | depends:-           | status:UNRESOLVED
- [ ] T14 | MINOR | 익명화 행의 집계용 식별자 필요 여부 (T4 파생)    | depends:T3,T4       | status:UNRESOLVED

## 재료 점검 (2026-09-22)

| 역할 | 상태 | 근거 |
|---|---|---|
| R1 목적·성공기준 | 충족 | `business-logic/market-index-prediction-sequence.md` §4 실서비스 목표 구조 · `DB_DESIGN_REVIEW.md` §0 |
| R2 범위·산출물 | 충족 | `DB_DESIGN_REVIEW.md` §3 (D1~D14) · §5 5단계 계획 · 화면 U01~U10·A01~A05 |
| R3 대상·이해관계자 | 부분 | 화면 참조가 사용자 여정을 보여주나 계정 모델 미정 → T1로 흡수 |
| R4 제약조건 | 부분 | Supabase 무료 플랜·카페24 심사·마이그레이션 체크섬은 문서화됨. 규모·데이터 라이선스 미정 → T8·T12로 흡수 |
| R5 현재 진척 | 충족 | `DECISION_LOG.md` POST-01~08 · `DB_SCHEMA.md` · 마이그레이션 0001·0002 |

추출 기준선(R1·R2) 충족 → 게이트 미발동.

**핵심 사실:** `0002_mvp_core.sql`은 **아직 실제 Supabase에 적용되지 않았다**(HUMAN_TODO TODO-05·06 미체크, `DB_SCHEMA.md` §5). 체크섬 잠금은 적용 시점에 걸리므로 현재 0002는 자유롭게 수정할 수 있다 → T4의 전제.

## 해소 기록

### T1 · 참여자 계정 모델 — RESOLVED
- decision: Supabase Auth 이메일 가입. `profiles.id` → `auth.users(id)` 참조 유지.
- applied: `DECISION_LOG.md` GRIP-01(근거) · `HUMAN_TODO.md` TODO-07 정정(규범) · `DB_SCHEMA.md` §1 주석
- 파생: TODO-07의 "가입 끄기" 권장이 무효화됨 → "켜 둔다"로 정정

### T2 · 사용자 데이터 접근 방식 — RESOLVED
- decision: A안. RLS 정책으로 막고 브라우저에서 직접 조회. 0002 정책 9개 유지.
- applied: `AGENTS.md` 프로젝트 규범 2~5항 신설(규범) · `DECISION_LOG.md` GRIP-02(근거) · `DB_SCHEMA.md` §8
- 파생: 랭킹 등 타인 노출 화면은 공개용 별도 테이블·뷰로 분리 → T9에서 구체화

### T3 · 개인정보 수집·보존·탈퇴 — RESOLVED
- decision: 이메일·닉네임만 수집, 보유 3년, 탈퇴 시 계정 삭제 + 예측 기록 익명화 보존.
- applied: `AGENTS.md` 규범 6~7항(규범) · `DECISION_LOG.md` GRIP-03(근거) · `DB_SCHEMA.md` §8 · `HUMAN_TODO.md` §5 법무 항목
- **확인된 충돌**: 0002의 `predictions.user_id`가 `not null` + `on delete cascade`라 익명화 보존이 불가능하다 → T4에서 0002 직접 수정으로 해소됨

### T4 · 마이그레이션 전략 — RESOLVED
- decision: 0002를 직접 수정한다. 아직 실제 Supabase에 적용되지 않아 체크섬 잠금이 걸리지 않는다.
- applied: `supabase/migrations/0002_mvp_core.sql` `predictions.user_id` → nullable + `on delete set null` · `tests/migration-mvp-core.test.ts` 익명화 2건 추가(11건 통과, 전체 106건) · `DECISION_LOG.md` GRIP-04 · `DB_SCHEMA.md` §8·§5
- **유효 기간**: TODO-05로 실제 적용하는 순간 끝난다. 이후에는 0003 이후 새 번호만 허용.

### T5 · 회차 마감 시각과 영업일 정의 — RESOLVED
- decision: 영업일 09:00 KST 마감(정각 불포함). 영업일 = 한국거래소(KRX) 휴장일 제외.
- applied: `AGENTS.md` 규범 8~9항 · `DECISION_LOG.md` GRIP-05 · `DB_SCHEMA.md` §8 · `HUMAN_TODO.md` TODO-25 **확정 종료**
- 파생: 회차 자동 생성에 KRX 휴장일 목록이 필요 → 출처는 T8에서 정한다

### T6 · 판정 분모 규칙 — RESOLVED
- decision: 보합은 예측과 무관하게 정답(HIT). 부분 미수집은 회차 전체 무효(VOID). 확정값 없음도 VOID.
- applied: `src/lib/mvp/challenge.ts` `judgePrediction()` 수정 · `tests/mvp-challenge.test.ts` 갱신(107건 통과) · `AGENTS.md` 규범 10항 · `DECISION_LOG.md` GRIP-06 · `DB_SCHEMA.md` §8 · `HUMAN_TODO.md` TODO-26 **확정 종료**
- 기존 MINOR-07(보합=VOID) 대체. 목업에 보합 0건이라 발표 수치 불변(확인됨).
- 파생: 보합 시 전원 정답 → 동점자 증가 → T9 동점 규칙 중요도 상승

### T7 · 판정 저장 방식과 정정 대응 — RESOLVED
- decision: 마감 후 배치가 1회 판정해 `judgments`에 저장. 확정값 정정 시 재판정하지 않고 정정 사실만 기록.
- applied: `AGENTS.md` 규범 11~12항 · `DECISION_LOG.md` GRIP-07 · `DB_SCHEMA.md` §8
- 스키마 과제(SQL은 T10 이후 일괄 작성): `judgments` 신설(멱등성 키 = unique(user_id, trade_date, index_key)) · `index_snapshots`에 정정 이력 칸

### T8 · 지수 출처·환산식·원본 보관 — RESOLVED
- decision: 원지표 원본 보관, 환산식 미공개, 사용자에게는 환산 지수값만 노출.
- applied: `0002`의 `index_snapshots` 공개 권한을 **컬럼 단위**로 축소 · 테스트 1건 추가(12건, 전체 108건) · `AGENTS.md` 규범 13항 · `DECISION_LOG.md` GRIP-08 · `DB_SCHEMA.md` §8·§5 · `HUMAN_TODO.md` TODO-32~34
- **확인된 노출 문제**: 전체 컬럼 공개로 원지표 원본이 노출되어 공식 역산이 가능했다 → 컬럼 권한으로 해소
- 미결(사람 작업): 데이터 출처·약관(TODO-32) · KRX 휴장일 출처(TODO-33) · 환산식 확정(TODO-34)

### T9 · 주간 랭킹 — RESOLVED
- decision(사용자 표현): "참여 회차 수를 고정된 숫자로 두지 말고, 주간 실제 진행된 회차 수를 기준으로 하며, 모든 회차에 참여한 사람들을 대상으로 1차 랭크, 1회 미참자 대상 2차 랭크를 매기는 방식으로 참여유도를 최대화하면서도 예측에 참가한 전원이 랭크에 들어갈 수 있도록 함. A 안에서 참여 회차 수를 동점처리 기준이 아니라 절대적인 상위 기준으로 뽑아 올린 규칙에 해당함."
- applied: `AGENTS.md` 규범 14~16항 · `DECISION_LOG.md` GRIP-09 · `DB_SCHEMA.md` §8
- 파생 확정: N = **유효 회차 수**(VOID 제외). 채점 불가였던 회차를 결석으로 세지 않는다.
- 스키마 과제: `weekly_rankings` 신설(티어·확정 시점 값 박아 저장)
- **정정(GRIP-09a)**: 티어는 정렬 기준일 뿐, 랭크는 1위부터 연속으로 이어진다. `rank_in_tier` 폐기 → `rank`.

### T10 · 리워드 지급 범위·수단·법적 고지 — RESOLVED
- decision: 주간 연속 순위 **상위 5명**에게 쿠폰코드 **수동 지급**. 카페24 쿠폰 API 자동 발급은 범위 밖.
- applied: `AGENTS.md` 규범 18항 · `DECISION_LOG.md` GRIP-10 · `DB_SCHEMA.md` §8 · `HUMAN_TODO.md` TODO-35
- 지급 대상이 티어를 가로지른다 — 결석이 있어도 상위 5위 안이면 받는다
- 스키마 과제: `rewards` 신설(`unique (week_start, user_id)`로 중복 수령 차단)
- 신규 토픽: T14(MINOR) 익명화 행의 집계용 식별자 필요 여부 — TOTAL 13 → 14


## 스키마 작성 완료 (2026-09-22)

GRIP-01~10을 `supabase/migrations/0002_mvp_core.sql`에 전부 반영했다(GRIP-04: 0002 직접 수정).

- 테이블 **7개** — `profiles` · `index_snapshots` · `rounds` · `predictions` · `judgments` · `weekly_rankings` · `rewards`
- RLS 정책 11개 · 컬럼 단위 권한 1건 · 계산 컬럼 2개(`tier`·`accuracy`)
- 작성 중 추가 결정: **GRIP-08a**(정정값을 공개 컬럼에 포함 — 규범 13 개정)
- 검증: `migration-mvp-core.test.ts` 17건 · 전체 113건 · tsc · lint · smoke 28/28
- 미적용: 실제 Supabase 적용은 `HUMAN_TODO` TODO-05. 적용 순간 GRIP-04 유효 기간 종료.

### 잔여 토픽 (후속 세션)
T11 예측 수정 허용 횟수 · T12 참여 규모와 배치 분할 · T13 카페24 상품번호 · T14 익명화 행의 집계 식별자
