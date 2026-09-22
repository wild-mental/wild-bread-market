-- MAKJI 브레드마켓 · MVP 코어 4테이블 (DB 연동 최소 단위)
-- Supabase 대시보드 > SQL Editor 에 붙여 넣거나, `npm run db:setup` 으로 적용한다.
--
-- 범위: 사용자가 예측을 제출하고 결과를 보는 최소 흐름만 담는다.
--   profiles(참여자) · index_snapshots(지수 확정값) · rounds(회차) · predictions(예측)
-- 판정 결과·주간 랭킹·리워드 테이블은 이 파일에 없다(docs/DB_DESIGN_REVIEW.md §3 D5~D8).
-- 판정은 저장하지 않고 challenge.ts 순수 함수로 조회 시점에 계산한다.
--
-- 0001과 결정적으로 다른 점: 여기서 처음으로 **RLS 정책**을 쓴다.
-- 0001의 카페24 테이블은 서버(service_role)만 접근하지만, 아래 4개는 로그인한 사용자가 직접 읽는다.

-- ─────────────────────────────────────────────────────────────
-- 1) 참여자 프로필 — auth.users 와 1:1
-- ─────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 20),
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- 2) 지수 확정값 — 하루·지수당 한 행. mock-data.ts 의 CLOSES 를 대신한다.
--    status='void' 는 휴장·미공시 회차(값 없음). 판정 분모에서 빠진다.
--    source_value 는 원지표 원본값 — 환산식이 바뀌어도 다시 계산할 수 있게 같이 보관한다.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.index_snapshots (
  index_key text not null check (index_key in ('wheat', 'croissant', 'golden')),
  trade_date date not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'void')),
  value numeric(10, 2),
  source_name text,
  source_value numeric(18, 6),
  collected_at timestamptz not null default now(),
  -- 정정 이력 (GRIP-07). value 는 판정에 쓴 값 그대로 두고, 나중에 정정이 오면 여기에만 남긴다.
  -- 이미 판정한 회차는 다시 판정하지 않는다.
  corrected_value numeric(10, 2),
  corrected_at timestamptz,
  primary key (index_key, trade_date),
  -- 확정이면 값이 있어야 하고, 무효면 값이 없어야 한다.
  constraint index_snapshots_value_matches_status check (
    (status = 'confirmed' and value is not null) or (status = 'void' and value is null)
  ),
  constraint index_snapshots_correction_paired check (
    (corrected_value is null and corrected_at is null)
    or (corrected_value is not null and corrected_at is not null)
  )
);

create index if not exists index_snapshots_trade_date_idx
  on public.index_snapshots (trade_date desc);

-- ─────────────────────────────────────────────────────────────
-- 3) 회차 — 하루 한 행. 마감 시각을 **데이터로** 둔다.
--    마감 시각(09:00 KST)·영업일 정의가 아직 미확정이라(HUMAN_TODO TODO-25),
--    스키마를 바꾸지 않고 행 값만 바꿔 대응할 수 있게 컬럼으로 뺐다.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.rounds (
  trade_date date primary key,
  opens_at timestamptz not null,
  deadline_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'closed', 'judged', 'void')),
  created_at timestamptz not null default now(),
  constraint rounds_window check (opens_at < deadline_at)
);

-- ─────────────────────────────────────────────────────────────
-- 4) 예측 — (참여자 × 회차 × 지수) 당 한 행.
--    유니크 제약이 중복 제출을 막고, 수정은 update + revision 증가로 처리한다.
-- ─────────────────────────────────────────────────────────────
create table if not exists public.predictions (
  id bigint generated always as identity primary key,
  -- 탈퇴(계정 삭제) 시 행은 남기고 user_id만 비운다 = 익명화 (GRIP-03).
  -- nullable이라 RLS의 user_id = auth.uid() 비교가 익명 행에서 NULL(거짓)이 되어 아무에게도 보이지 않고,
  -- unique 제약은 NULL을 중복으로 보지 않으므로 익명 행끼리 충돌하지 않는다. 집계는 service_role로 한다.
  user_id uuid references auth.users (id) on delete set null,
  trade_date date not null references public.rounds (trade_date) on delete cascade,
  index_key text not null check (index_key in ('wheat', 'croissant', 'golden')),
  pick text not null check (pick in ('UP', 'DOWN')),
  revision integer not null default 1 check (revision > 0),
  submitted_at timestamptz not null default now(),
  unique (user_id, trade_date, index_key)
);

-- 판정 배치가 회차 단위로 전체를 읽는다.
create index if not exists predictions_trade_date_idx
  on public.predictions (trade_date);

-- ─────────────────────────────────────────────────────────────
-- 5) 마감 판정 함수 — 정책에서 쓰기 때문에 서버 시각 now() 하나만 본다.
--    브라우저 시계를 조작해도 마감 뒤에는 쓸 수 없다.
-- ─────────────────────────────────────────────────────────────
create or replace function public.is_round_open(p_trade_date date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.rounds r
     where r.trade_date = p_trade_date
       and r.status = 'open'
       and now() < r.deadline_at
  );
$$;

revoke all on function public.is_round_open(date) from public;
grant execute on function public.is_round_open(date) to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- 6) RLS
-- ─────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.index_snapshots enable row level security;
alter table public.rounds enable row level security;
alter table public.predictions enable row level security;

grant usage on schema public to anon, authenticated;

-- 프로필: 본인 것만 읽고 쓴다.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- 지수·회차: 누구나 읽는다(로그인 전 랜딩에서도 보여 준다). 쓰기는 서버만.
drop policy if exists index_snapshots_read_all on public.index_snapshots;
create policy index_snapshots_read_all on public.index_snapshots
  for select to anon, authenticated
  using (true);

drop policy if exists rounds_read_all on public.rounds;
create policy rounds_read_all on public.rounds
  for select to anon, authenticated
  using (true);

-- 예측: 본인 것만 읽고, 마감 전에만 본인 것으로 쓴다.
drop policy if exists predictions_select_own on public.predictions;
create policy predictions_select_own on public.predictions
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists predictions_insert_own_open on public.predictions;
create policy predictions_insert_own_open on public.predictions
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_round_open(trade_date));

drop policy if exists predictions_update_own_open on public.predictions;
create policy predictions_update_own_open on public.predictions
  for update to authenticated
  using (user_id = (select auth.uid()) and public.is_round_open(trade_date))
  with check (user_id = (select auth.uid()) and public.is_round_open(trade_date));

-- 삭제 정책은 두지 않는다(예측 철회 허용 여부 미정 — docs/DB_DESIGN_REVIEW.md Q8).

-- ─────────────────────────────────────────────────────────────
-- 7) 권한 — RLS 정책이 있어도 테이블 권한이 없으면 접근하지 못한다.
-- ─────────────────────────────────────────────────────────────
grant select, insert, update on table public.profiles to authenticated;
-- 환산식 미공개 결정(GRIP-08)에 따라 원지표 원본(source_name·source_value)은 공개하지 않는다.
-- RLS 정책은 행 단위만 판정하므로 컬럼 노출은 컬럼 권한으로 좁힌다. select *는 실패하고,
-- 아래 공개 컬럼을 명시한 조회만 통과한다. 원본은 service_role로만 읽는다.
-- 정정값은 value 와 같은 종류의 지수값이라 공개에 포함한다 (GRIP-08a).
grant select (index_key, trade_date, status, value, corrected_value, corrected_at) on table public.index_snapshots to anon, authenticated;
grant select on table public.rounds to anon, authenticated;
grant select, insert, update on table public.predictions to authenticated;
grant usage, select on sequence public.predictions_id_seq to authenticated;

grant select, insert, update, delete
  on table public.profiles, public.index_snapshots, public.rounds, public.predictions
  to service_role;
grant usage, select on sequence public.predictions_id_seq to service_role;

-- ═════════════════════════════════════════════════════════════
-- 8) 판정 결과 — 마감 후 배치가 한 번 판정해 저장한다 (GRIP-07)
--    조회 시점에 다시 계산하지 않는다. 확정값이 정정되어도 재판정하지 않으므로
--    판정 근거(그때 쓴 직전값·확정값·선택)를 함께 남겨 감사할 수 있게 한다.
-- ═════════════════════════════════════════════════════════════
create table if not exists public.judgments (
  id bigint generated always as identity primary key,
  -- 탈퇴 시 익명화 (GRIP-03). predictions 와 같은 방식.
  user_id uuid references auth.users (id) on delete set null,
  trade_date date not null references public.rounds (trade_date) on delete cascade,
  index_key text not null check (index_key in ('wheat', 'croissant', 'golden')),
  pick text not null check (pick in ('UP', 'DOWN')),
  outcome text not null check (outcome in ('HIT', 'MISS', 'VOID', 'NONE')),
  -- 판정에 실제로 쓴 값. 나중에 index_snapshots 가 정정되어도 이 값은 바뀌지 않는다.
  previous_value numeric(10, 2),
  confirmed_value numeric(10, 2),
  judged_at timestamptz not null default now(),
  -- 배치 멱등성의 핵심: 같은 배치를 두 번 돌려도 결과가 한 번과 같아야 한다.
  unique (user_id, trade_date, index_key)
);

create index if not exists judgments_trade_date_idx on public.judgments (trade_date);

-- ═════════════════════════════════════════════════════════════
-- 9) 주간 랭킹 — 확정 시점 값을 박아 저장한다 (GRIP-09 · 09a)
--    티어는 정렬 기준일 뿐이고 rank 는 1위부터 연속으로 이어진다.
--    나중에 재계산해도 과거 순위가 흔들리지 않게 nickname 까지 스냅샷으로 남긴다.
-- ═════════════════════════════════════════════════════════════
create table if not exists public.weekly_rankings (
  id bigint generated always as identity primary key,
  week_start date not null,
  user_id uuid references auth.users (id) on delete set null,
  -- profiles 는 본인만 읽을 수 있으므로 랭킹판에 쓸 표시 이름을 여기에 복사해 둔다.
  nickname text not null,
  -- 그 주 유효 회차 수 N. VOID 회차는 빼고 센다 (GRIP-09).
  valid_rounds smallint not null check (valid_rounds >= 0),
  participated smallint not null check (participated >= 0),
  -- 결석 수. 0 이 1차 랭크, 1 이 2차 랭크. 값이 어긋날 수 없도록 계산 컬럼으로 둔다.
  tier smallint generated always as (valid_rounds - participated) stored,
  hits smallint not null default 0,
  judged smallint not null default 0,
  accuracy numeric(5, 4) generated always as (
    case when judged = 0 then null else round(hits::numeric / judged, 4) end
  ) stored,
  -- 주 단위 연속 순위 (GRIP-09a). 티어로 나누지 않는다.
  rank integer not null check (rank > 0),
  confirmed_at timestamptz not null default now(),
  constraint weekly_rankings_participated_fits check (participated <= valid_rounds),
  constraint weekly_rankings_hits_fit check (hits <= judged),
  unique (week_start, user_id),
  -- 동점 처리(참여 수 → 정확도 → 제출시간)가 결정적이므로 순위는 겹치지 않는다.
  unique (week_start, rank)
);

-- ═════════════════════════════════════════════════════════════
-- 10) 리워드 — 주간 연속 순위 상위 5명에게 쿠폰코드 수동 지급 (GRIP-10)
--     "상위 5명"은 배치가 판단한다. 인원이 바뀌어도 마이그레이션이 필요 없도록
--     스키마에는 순위 상한을 박지 않는다.
-- ═════════════════════════════════════════════════════════════
create table if not exists public.rewards (
  id bigint generated always as identity primary key,
  week_start date not null,
  user_id uuid references auth.users (id) on delete set null,
  rank integer not null check (rank > 0),
  reward_type text not null default 'subscription_7d',
  code text,
  status text not null check (status in ('pending', 'issued', 'claimed', 'expired')) default 'pending',
  issued_at timestamptz,
  claimed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  -- 한 주에 한 사람이 두 번 받지 못한다.
  unique (week_start, user_id),
  -- 발급된 뒤에는 코드가 있어야 한다.
  constraint rewards_issued_has_code check (status = 'pending' or code is not null)
);

create index if not exists rewards_week_start_idx on public.rewards (week_start);

-- ═════════════════════════════════════════════════════════════
-- 11) 새 테이블의 RLS와 권한
--     판정·리워드는 본인 것만. 랭킹은 공개판이라 전원이 읽는다.
-- ═════════════════════════════════════════════════════════════
alter table public.judgments enable row level security;
alter table public.weekly_rankings enable row level security;
alter table public.rewards enable row level security;

-- 판정: 본인 것만 읽는다. 쓰기는 배치(service_role)만 하므로 정책을 두지 않는다.
drop policy if exists judgments_select_own on public.judgments;
create policy judgments_select_own on public.judgments
  for select to authenticated
  using (user_id = (select auth.uid()));

-- 랭킹: 공개판이다. profiles 를 느슨하게 열지 않고 이 테이블의 nickname 스냅샷만 노출한다.
drop policy if exists weekly_rankings_read_all on public.weekly_rankings;
create policy weekly_rankings_read_all on public.weekly_rankings
  for select to anon, authenticated
  using (true);

-- 리워드: 개인 지급 정보이므로 본인 것만 읽는다.
drop policy if exists rewards_select_own on public.rewards;
create policy rewards_select_own on public.rewards
  for select to authenticated
  using (user_id = (select auth.uid()));

grant select on table public.judgments to authenticated;
grant select on table public.weekly_rankings to anon, authenticated;
grant select on table public.rewards to authenticated;

grant select, insert, update, delete
  on table public.judgments, public.weekly_rankings, public.rewards
  to service_role;
grant usage, select on sequence public.judgments_id_seq to service_role;
grant usage, select on sequence public.weekly_rankings_id_seq to service_role;
grant usage, select on sequence public.rewards_id_seq to service_role;
