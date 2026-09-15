-- MAKJI 브레드마켓 · 카페24 연동 실습 테이블
-- Supabase 대시보드 > SQL Editor > New query 에 전체를 붙여 넣고 Run.

-- 1) 카페24 연결: 토큰은 서버에서 암호화한 문자열로만 저장한다.
create table if not exists public.cafe24_connections (
  mall_id text primary key,
  token_cipher text not null,
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz not null,
  scopes text[] not null default '{}',
  refresh_lock_until timestamptz,
  updated_at timestamptz not null default now()
);

-- 2) 연동 상품: 처음 저장한 기준값과 마지막으로 적용한 값
create table if not exists public.cafe24_products (
  mall_id text not null,
  shop_no integer not null,
  product_no bigint not null,
  product_code text not null,
  category_no integer not null,
  display_group smallint not null,
  index_key text not null,
  baseline jsonb not null,
  applied jsonb,
  scenario text check (scenario in ('up', 'down')),
  updated_at timestamptz not null default now(),
  primary key (mall_id, shop_no, product_no)
);

-- 3) 변경 이력: 누가 언제 무엇을 바꿨고 결과가 어땠는지
create table if not exists public.cafe24_change_log (
  id bigint generated always as identity primary key,
  actor_id uuid not null,
  mall_id text not null,
  shop_no integer not null,
  product_no bigint not null,
  action text not null check (action in ('baseline', 'apply', 'restore')),
  scenario text,
  before_value jsonb,
  target_value jsonb,
  result text not null check (result in ('applied', 'already', 'failed', 'unknown', 'conflict')),
  error_code text,
  created_at timestamptz not null default now()
);

-- 4) 브라우저용 키(anon·authenticated)로는 세 테이블에 전혀 접근하지 못하게 한다.
alter table public.cafe24_connections enable row level security;
alter table public.cafe24_products enable row level security;
alter table public.cafe24_change_log enable row level security;

revoke all on table public.cafe24_connections, public.cafe24_products, public.cafe24_change_log
  from anon, authenticated;
grant select, insert, update, delete
  on table public.cafe24_connections, public.cafe24_products, public.cafe24_change_log
  to service_role;
grant usage, select on sequence public.cafe24_change_log_id_seq to service_role;

-- 5) 토큰 갱신 잠금: 30초 동안 한 요청만 refresh token을 사용하게 한다.
create or replace function public.cafe24_try_refresh_lock(p_mall_id text, p_seconds integer)
returns boolean
language sql
set search_path = ''
as $$
  with locked as (
    update public.cafe24_connections
       set refresh_lock_until = now() + make_interval(secs => p_seconds)
     where mall_id = p_mall_id
       and (refresh_lock_until is null or refresh_lock_until < now())
    returning 1
  )
  select exists (select 1 from locked);
$$;

revoke all on function public.cafe24_try_refresh_lock(text, integer) from public, anon, authenticated;
grant execute on function public.cafe24_try_refresh_lock(text, integer) to service_role;
