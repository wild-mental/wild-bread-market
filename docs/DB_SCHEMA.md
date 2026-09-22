# DB 스키마 — MVP 코어 7테이블

작성일 2026-09-21 · 마이그레이션 `supabase/migrations/0002_mvp_core.sql` · 검증 `tests/migration-mvp-core.test.ts`

DB 연동 **풀버전** 스키마다. `docs/DB_DESIGN_REVIEW.md`가 제안한 8개 중 7개를 구현했다.
2026-09-22 `/grip-it` 세션에서 확정한 10개 결정(GRIP-01~10)이 모두 반영되어 있다 → §8.

---

## 1. 왜 이 4개인가

| 테이블 | 대체하는 것 | 이걸 넣어야만 확인되는 것 |
|---|---|---|
| `profiles` | (없음 — 참여자 개념 자체가 없었다) | 로그인 사용자와 DB 행의 연결, RLS 본인 확인 |
| `index_snapshots` | `mock-data.ts`의 `CLOSES` 하드코딩 | 지수 값을 DB에서 읽어 화면에 그리기 |
| `rounds` | `DEMO.deadline` 하드코딩 | **서버 시각 기준 마감** — 브라우저 시계로 못 뚫는지 |
| `predictions` | `localStorage` | 제출·수정이 사용자 단위로 남는지, 남의 것이 안 보이는지 |

**뺀 것과 이유**

GRIP 세션에서 결정이 확정되며 3개가 추가되었다.

| 추가 테이블 | 근거 | 역할 |
|---|---|---|
| `judgments` | GRIP-07 | 마감 후 배치가 한 번 판정한 결과. 조회 시점에 다시 계산하지 않는다 |
| `weekly_rankings` | GRIP-09·09a | 주간 순위 확정 스냅샷. 티어 정렬 + 1위부터 연속 순위 |
| `rewards` | GRIP-10 | 주간 상위 5명 쿠폰코드 수동 지급 기록 |

| 아직 뺀 테이블 | 이유 |
|---|---|
| `batch_runs` | 배치 실행 이력·잠금. 판정 배치를 실제로 구현할 때 도입 |

---

## 2. 테이블

### `profiles` — 참여자
| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | uuid PK | `auth.users(id)` 참조, 계정 삭제 시 함께 삭제 |
| `nickname` | text | 1~20자. **중복 허용**(랭킹 표시 규칙 미정) |
| `created_at` | timestamptz | |

### `index_snapshots` — 지수 확정값
| 컬럼 | 타입 | 비고 |
|---|---|---|
| `index_key` | text | `wheat` / `croissant` / `golden` |
| `trade_date` | date | |
| `status` | text | `confirmed` / `void`(휴장·미공시) |
| `value` | numeric(10,2) | 확정이면 필수, 무효면 반드시 null (CHECK로 강제) |
| `source_name` · `source_value` | text · numeric(18,6) | **원지표 원본**. 환산식이 바뀌어도 재계산할 수 있게 보관 |
| `collected_at` | timestamptz | |

PK `(index_key, trade_date)` — 같은 날 중복 적재를 DB가 막는다.

### `rounds` — 회차
| 컬럼 | 타입 | 비고 |
|---|---|---|
| `trade_date` | date PK | |
| `opens_at` · `deadline_at` | timestamptz | `opens_at < deadline_at` CHECK |
| `status` | text | `open` / `closed` / `judged` / `void` |

> **마감 시각을 컬럼으로 둔 이유**: 09:00 KST와 "영업일" 정의가 아직 미확정이다(`HUMAN_TODO` TODO-25). 값으로 두면 결정이 바뀌어도 **마이그레이션 없이** 대응된다.

### `predictions` — 예측
| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | bigint identity PK | |
| `user_id` | uuid | `auth.users(id)` 참조 |
| `trade_date` | date | `rounds(trade_date)` 참조 |
| `index_key` | text | 3종 중 하나 |
| `pick` | text | `UP` / `DOWN` |
| `revision` | integer | 수정 횟수. 기본 1 |
| `submitted_at` | timestamptz | |

UNIQUE `(user_id, trade_date, index_key)` — 중복 제출 차단. 수정은 UPDATE + `revision` 증가.
`user_id`는 **nullable + `on delete set null`** — 탈퇴 시 익명화해 남긴다 (GRIP-03).

### `judgments` — 판정 결과 (GRIP-07)
| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | bigint identity PK | |
| `user_id` | uuid | nullable, `on delete set null` (익명화) |
| `trade_date` · `index_key` | date · text | |
| `pick` | text | `UP` / `DOWN` |
| `outcome` | text | `HIT` / `MISS` / `VOID` / `NONE` |
| `previous_value` · `confirmed_value` | numeric(10,2) | **판정에 실제로 쓴 값.** 나중에 정정되어도 바뀌지 않는다 |
| `judged_at` | timestamptz | |

UNIQUE `(user_id, trade_date, index_key)` — **배치 멱등성의 핵심.** 같은 배치를 두 번 돌려도 결과가 한 번과 같다.

### `weekly_rankings` — 주간 순위 스냅샷 (GRIP-09 · 09a)
| 컬럼 | 타입 | 비고 |
|---|---|---|
| `week_start` | date | 월요일 |
| `user_id` | uuid | nullable, `on delete set null` |
| `nickname` | text | **표시 이름 스냅샷.** `profiles`는 본인만 읽으므로 랭킹판용으로 복사해 둔다 |
| `valid_rounds` | smallint | 그 주 유효 회차 수 N (VOID 제외) |
| `participated` | smallint | 참여한 유효 회차 수 |
| `tier` | smallint | **계산 컬럼** `valid_rounds - participated`. 0이 1차 랭크 |
| `hits` · `judged` | smallint | |
| `accuracy` | numeric(5,4) | **계산 컬럼** `hits / judged`, `judged = 0`이면 null |
| `rank` | integer | **1위부터 연속.** 티어로 나누지 않는다 (GRIP-09a) |
| `confirmed_at` | timestamptz | |

UNIQUE `(week_start, user_id)` · UNIQUE `(week_start, rank)` — 동점 처리가 결정적이라 순위가 겹치지 않는다.
CHECK `participated <= valid_rounds` · `hits <= judged`.

### `rewards` — 리워드 지급 (GRIP-10)
| 컬럼 | 타입 | 비고 |
|---|---|---|
| `week_start` · `user_id` · `rank` | date · uuid · integer | |
| `reward_type` | text | 기본 `subscription_7d` |
| `code` | text | 발급한 쿠폰코드 |
| `status` | text | `pending` / `issued` / `claimed` / `expired` |
| `issued_at` · `claimed_at` · `expires_at` | timestamptz | |

UNIQUE `(week_start, user_id)` — 한 주 중복 수령 차단.
CHECK `status = 'pending' or code is not null` — 발급된 뒤에는 코드가 있어야 한다.
**"상위 5명"은 배치가 판단한다.** 인원이 바뀌어도 마이그레이션이 필요 없도록 스키마에 상한을 박지 않았다.

---

## 3. RLS — 이 마이그레이션의 핵심

`0001`(카페24)은 **정책이 0건**이고 서버만 접근했다. `0002`는 사용자가 직접 읽으므로 **처음으로 정책을 쓴다.**

| 테이블 | anon | authenticated | service_role |
|---|---|---|---|
| `profiles` | ✗ | 본인 행만 read/insert/update | 전체 |
| `index_snapshots` | **read** | read | 전체 |
| `rounds` | **read** | read | 전체 |
| `predictions` | ✗ | 본인 행만 read / **마감 전에만** insert·update | 전체 |
| `judgments` | ✗ | 본인 행만 read (쓰기는 배치만) | 전체 |
| `weekly_rankings` | **read** | read (공개 랭킹판) | 전체 |
| `rewards` | ✗ | 본인 행만 read | 전체 |

마감 차단은 정책 안에서 `public.is_round_open(trade_date)`를 호출해 판정한다:

```sql
create policy predictions_insert_own_open on public.predictions
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_round_open(trade_date));
```

`is_round_open()`은 `now()`(**서버 시각**)만 보므로 브라우저 시계를 바꿔도 마감 뒤에는 쓰지 못한다. `security definer` + `set search_path = ''`로 `0001`의 잠금 함수와 같은 방식을 따랐다.

삭제 정책은 두지 않았다 — 예측 철회 허용 여부가 미결(`DB_DESIGN_REVIEW` Q8)이라 **막아 두는 쪽**을 기본값으로 했다.

**랭킹판만 남의 데이터를 보여준다.** `profiles`를 느슨하게 열지 않고, `weekly_rankings`에 `nickname` 스냅샷을 복사해 두는 방식으로 풀었다 (`AGENTS.md` 규범 5항).

**`index_snapshots`는 컬럼 단위 권한이다.** 공개 컬럼은 `index_key`·`trade_date`·`status`·`value`·`corrected_value`·`corrected_at` 여섯이며, 원지표 원본(`source_name`·`source_value`)은 `service_role`만 읽는다 (GRIP-08 · 08a). `select *`는 권한 오류가 난다.

---

## 4. 적용 방법

```bash
# .env.local 에 SUPABASE_DB_URL(Session pooler 문자열)을 잠시 넣고
npm run db:setup      # 0001 → 0002 순서로 적용, 이미 적용된 건 건너뜀
npm run setup:check   # 상태만 확인
# 끝나면 .env.local 의 SUPABASE_DB_URL 줄을 지운다
```

수작업이면 Supabase SQL Editor에 `supabase/migrations/0002_mvp_core.sql` 전문을 붙여 넣고 Run. SQL이 `if not exists` · `or replace` · `drop policy if exists`라 **여러 번 실행해도 안전**하다(테스트로 확인).

> `0001_cafe24_lab.sql`은 **절대 수정하지 않는다.** 러너가 sha256으로 변경을 감지해 중단한다(`DECISION_LOG` POST-01). 스키마를 바꾸려면 `0003_…sql`을 추가한다.

---

## 5. 검증된 것

`tests/migration-mvp-core.test.ts` 17건 — PGlite에 Supabase 기본 구조(역할 3개 + `auth.users` + `auth.uid()`)를 만들고 실제로 역할을 전환해 확인한다.

| 확인 항목 |
|---|
| 테이블 4개 · `is_round_open()` 생성 |
| 네 테이블 모두 RLS 켜짐 |
| `confirmed`는 값 필수 / `void`는 값 없어야 함 |
| 같은 참여자·회차·지수 중복 제출 차단 |
| 마감 전 본인 것 쓰기 OK / **남의 `user_id`로 쓰기 차단** |
| **마감 뒤 제출·수정 차단** |
| `status != 'open'`이면 마감 시각이 남아도 차단 |
| 남의 예측·프로필 조회 안 됨 |
| 지수·회차는 anon도 읽힘 / 예측은 anon 접근 불가 |
| **탈퇴 시 프로필은 삭제되고 예측은 `user_id`만 null로 남음** |
| **익명화된 예측은 로그인 사용자에게 안 보이고 `service_role`로만 집계됨** |
| **원지표 원본(`source_value`)은 anon·authenticated 모두 조회 거부, `service_role`만 읽음** |
| **같은 판정을 두 번 저장할 수 없음 (배치 멱등성 키)** |
| **정정 이력은 판정에 쓴 값을 바꾸지 않고 따로 남음 · 정정값·시각은 짝으로만 기록** |
| **랭킹의 `tier`·`accuracy`가 계산 컬럼이라 어긋날 수 없음 · 한 주 같은 순위 둘 불가** |
| **랭킹판은 전원이 읽고, 판정·리워드는 본인 것만 · anon은 판정·리워드 접근 불가** |
| **한 주에 같은 사람에게 리워드 두 번 지급 불가 · 발급 상태면 코드 필수** |

`npm test` 전체 113건 통과 · `smoke 28/28`. `tests/db-setup.test.ts`의 재실행 시험이 `0002`의 멱등성도 함께 검증한다.

**아직 확인하지 않은 것**: 실제 Supabase(Session pooler·실제 `auth.users`)에는 적용하지 않았다. PGlite는 Postgres지만 Supabase의 `auth` 스키마를 흉내 낸 것이다.

---

## 6. 환경변수

**새로 추가한 변수는 없다.** 기존 `.env.example`의 값으로 그대로 동작한다.

| 변수 | 이 스키마에서의 역할 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 접속 주소 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 로그인 사용자 세션 — **RLS 정책이 적용되는 경로** |
| `SUPABASE_SECRET_KEY` | 서버 전용. 지수·회차 적재 등 RLS 우회가 필요한 작업 |
| `SUPABASE_DB_URL` | `npm run db:setup`으로 마이그레이션 적용할 때만 |

---

## 7. 연동 시험 전에 확인할 것

| # | 항목 | 내용 |
|---|---|---|
| 1 | **가입 허용 설정 충돌** | `HUMAN_TODO` TODO-07은 "새 사용자 가입 끄기"를 권장한다. 그 상태면 **시험용 참여자 계정을 만들 수 없다.** 시험 동안만 켜거나, Supabase Users에서 수동 생성 |
| 2 | 프로필 자동 생성 | 가입 시 `profiles` 행을 만드는 트리거를 두지 않았다. 앱에서 만들거나 `0003`에서 트리거 추가 |
| 3 | 씨드 데이터 | `rounds`·`index_snapshots`에 값이 없으면 화면이 비어 보인다. `mock-data.ts`의 값을 넣어 시작하면 현재 화면과 같은 숫자를 볼 수 있다 |
| 4 | 앱 코드 연결 | 이번 작업은 **스키마까지**다. `prediction-store.ts`(localStorage)를 DB로 바꾸는 작업은 아직 하지 않았다 |

---

## 8. 확정된 결정 (GRIP 세션 2026-09-22)

`/grip-it` 문답으로 확정한 항목이다. 근거는 `docs/DECISION_LOG.md` GRIP-nn, 진행 상황은 `docs/grip/GRIP_REGISTER.md`.

| # | 결정 | 스키마에 미치는 영향 |
|---|---|---|
| GRIP-01 | 참여자 계정 = **Supabase Auth 이메일 가입** | `profiles.id` → `auth.users(id)` 참조 유지(0002 그대로). Supabase에서 **새 사용자 가입을 켜 둔다** |
| GRIP-02 | 사용자 데이터는 **RLS 정책 + 브라우저 직접 조회** | 0002의 정책 9개 유지. `service_role`은 카페24·운영 배치·관리자 작업 한정. 타인 노출 화면은 공개용 별도 테이블·뷰로 분리 |
| GRIP-03 | 개인정보 **최소 수집**(이메일·닉네임), 보유 3년, 탈퇴 시 예측 기록 **익명화** | `predictions.user_id`를 **nullable + `on delete set null`** 로 변경 — **0002에 반영 완료**. `profiles.id`의 cascade는 유지 |
| GRIP-04 | 마이그레이션은 **0002를 직접 수정** | 0002가 아직 미적용이라 가능. **실제 적용(TODO-05) 이후에는 0003 이후 새 번호만 허용** |
| GRIP-05 | 회차 마감 **영업일 09:00 KST** · 영업일 = **KRX 휴장일 제외** | `rounds.deadline_at` 컬럼 그대로, 스키마 변경 없음. 회차 자동 생성에 KRX 휴장일 목록 필요 → 출처는 T8 |
| GRIP-06 | **보합=정답(HIT)** · 부분 미수집이면 **회차 전체 VOID** | `index_snapshots.status`(confirmed/void)와 `rounds.status`(void) 조합으로 표현 가능 — 스키마 변경 없음. `challenge.ts` 판정 함수 수정됨 |
| GRIP-07 | 판정은 **배치 1회 후 `judgments`에 저장** · **정정 시 재판정 안 함** | **`judgments` 테이블 신설**(`unique (user_id, trade_date, index_key)` = 멱등성 키). `index_snapshots`에 **정정 이력 칸** 추가. → 최소 4테이블이 5테이블로 늘어난다 |
| GRIP-08 | **원지표 원본 보관** · **환산식 미공개** | `index_snapshots`의 공개 권한을 **컬럼 단위**로 좁힘 — `grant select (index_key, trade_date, status, value)`. `source_*`는 `service_role` 전용. **0002에 반영 완료** |
| GRIP-09 | 주간 랭킹 **계단식**(결석 0회=1차, 1회=2차 …) · 고정 최소 참여 없음 · 월~금 | **`weekly_rankings` 신설** — `valid_rounds`·`participated`·`tier`·`hits`·`judged`·`accuracy`·`confirmed_at`, `unique (week_start, user_id)`. VOID 회차는 N에서 제외 |
| GRIP-09a | 랭크는 **1위부터 연속** — 티어는 정렬 기준일 뿐 순위표를 나누지 않음 | `rank_in_tier` 폐기 → **`rank`**(연속 순위). 동점 처리가 결정적이므로 `unique (week_start, rank)` 가능 |
| GRIP-10 | 리워드는 **주간 상위 5명에게 쿠폰코드 수동 지급** | **`rewards` 신설** — `week_start`·`user_id`·`rank`·`reward_type`·`code`·`status`·`issued_at`·`claimed_at`·`expires_at`, `unique (week_start, user_id)`. 카페24 쿠폰 API 자동 발급은 범위 밖 |
