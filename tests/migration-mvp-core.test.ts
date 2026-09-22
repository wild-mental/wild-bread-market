import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';

// 0002 는 0001 과 달리 RLS 정책을 쓴다. 정책은 눈으로 맞추기 어려워서
// 실제 역할(authenticated)로 전환해 "남의 것은 못 읽고, 마감 뒤에는 못 쓴다"를 직접 확인한다.

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

// Supabase 가 제공하는 것들(auth 스키마·역할)을 PGlite 에 최소한으로 흉내 낸다.
async function freshDb() {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key);
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('test.user_id', true), '')::uuid
    $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
  `);
  await db.exec(readFileSync('supabase/migrations/0002_mvp_core.sql', 'utf8'));
  await db.exec(`insert into auth.users (id) values ('${USER_A}'), ('${USER_B}')`);
  return db;
}

// 로그인한 사용자로 실행한다(역할 전환 + auth.uid() 값 주입).
async function asUser<T>(db: PGlite, userId: string, run: () => Promise<T>): Promise<T> {
  await db.exec(`set role authenticated; select set_config('test.user_id', '${userId}', false);`);
  try {
    return await run();
  } finally {
    await db.exec(`reset role; select set_config('test.user_id', '', false);`);
  }
}

describe('supabase/migrations/0002_mvp_core.sql', () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await freshDb();
  });

  it('테이블 4개와 마감 판정 함수가 만들어진다', async () => {
    const { rows } = await db.query<{ table_name: string }>(`
      select table_name from information_schema.tables
       where table_schema = 'public'
         and table_name in ('profiles', 'index_snapshots', 'rounds', 'predictions',
                            'judgments', 'weekly_rankings', 'rewards')
       order by table_name
    `);
    expect(rows.map((r) => r.table_name)).toEqual([
      'index_snapshots', 'judgments', 'predictions', 'profiles', 'rewards', 'rounds', 'weekly_rankings',
    ]);

    const fn = await db.query<{ ok: boolean }>(
      `select to_regprocedure('public.is_round_open(date)') is not null as ok`,
    );
    expect(fn.rows[0].ok).toBe(true);
  });

  it('일곱 테이블 모두 RLS가 켜져 있다', async () => {
    const { rows } = await db.query<{ relname: string; relrowsecurity: boolean }>(`
      select relname, relrowsecurity from pg_class
       where relnamespace = 'public'::regnamespace
         and relname in ('profiles', 'index_snapshots', 'rounds', 'predictions',
                         'judgments', 'weekly_rankings', 'rewards')
    `);
    expect(rows).toHaveLength(7);
    expect(rows.every((r) => r.relrowsecurity)).toBe(true);
  });

  it('무효 회차는 값이 없어야 하고, 확정 회차는 값이 있어야 한다', async () => {
    await expect(
      db.exec(`insert into public.index_snapshots (index_key, trade_date, status, value)
               values ('wheat', '2026-09-16', 'confirmed', null)`),
    ).rejects.toThrow();
    await expect(
      db.exec(`insert into public.index_snapshots (index_key, trade_date, status, value)
               values ('wheat', '2026-09-16', 'void', 102.4)`),
    ).rejects.toThrow();
    await db.exec(`insert into public.index_snapshots (index_key, trade_date, status, value)
                   values ('wheat', '2026-09-16', 'confirmed', 102.4)`);
  });

  it('같은 참여자가 같은 회차·지수에 두 번 제출할 수 없다', async () => {
    await db.exec(`
      insert into public.rounds (trade_date, opens_at, deadline_at)
        values ('2026-09-17', now() - interval '1 hour', now() + interval '2 hours');
      insert into public.predictions (user_id, trade_date, index_key, pick)
        values ('${USER_A}', '2026-09-17', 'wheat', 'UP');
    `);
    await expect(
      db.exec(`insert into public.predictions (user_id, trade_date, index_key, pick)
               values ('${USER_A}', '2026-09-17', 'wheat', 'DOWN')`),
    ).rejects.toThrow();
  });

  it('마감 전에는 본인 예측을 쓸 수 있고, 남의 이름으로는 쓸 수 없다', async () => {
    await db.exec(`insert into public.rounds (trade_date, opens_at, deadline_at)
                   values ('2026-09-17', now() - interval '1 hour', now() + interval '2 hours')`);

    await asUser(db, USER_A, async () => {
      await db.exec(`insert into public.predictions (user_id, trade_date, index_key, pick)
                     values ('${USER_A}', '2026-09-17', 'wheat', 'UP')`);
      // 남의 user_id 로는 정책의 with check 에 걸린다.
      await expect(
        db.exec(`insert into public.predictions (user_id, trade_date, index_key, pick)
                 values ('${USER_B}', '2026-09-17', 'croissant', 'UP')`),
      ).rejects.toThrow();
    });
  });

  it('마감 뒤에는 제출도 수정도 막힌다', async () => {
    await db.exec(`
      insert into public.rounds (trade_date, opens_at, deadline_at)
        values ('2026-09-16', now() - interval '3 hours', now() - interval '1 hour');
      insert into public.predictions (user_id, trade_date, index_key, pick)
        values ('${USER_A}', '2026-09-16', 'wheat', 'UP');
    `);

    await asUser(db, USER_A, async () => {
      await expect(
        db.exec(`insert into public.predictions (user_id, trade_date, index_key, pick)
                 values ('${USER_A}', '2026-09-16', 'golden', 'DOWN')`),
      ).rejects.toThrow();

      // 마감된 회차의 기존 행은 update 가 0건 처리된다(정책의 using 에 걸려 대상에서 빠진다).
      const updated = await db.query(
        `update public.predictions set pick = 'DOWN' where trade_date = '2026-09-16' returning id`,
      );
      expect(updated.rows).toHaveLength(0);
    });
  });

  it('회차 상태가 open 이 아니면 마감 시각이 남아 있어도 쓸 수 없다', async () => {
    await db.exec(`insert into public.rounds (trade_date, opens_at, deadline_at, status)
                   values ('2026-09-18', now() - interval '1 hour', now() + interval '2 hours', 'closed')`);
    await asUser(db, USER_A, async () => {
      await expect(
        db.exec(`insert into public.predictions (user_id, trade_date, index_key, pick)
                 values ('${USER_A}', '2026-09-18', 'wheat', 'UP')`),
      ).rejects.toThrow();
    });
  });

  it('남의 예측과 남의 프로필은 읽히지 않는다', async () => {
    await db.exec(`
      insert into public.rounds (trade_date, opens_at, deadline_at)
        values ('2026-09-17', now() - interval '1 hour', now() + interval '2 hours');
      insert into public.profiles (id, nickname) values ('${USER_A}', '가'), ('${USER_B}', '나');
      insert into public.predictions (user_id, trade_date, index_key, pick) values
        ('${USER_A}', '2026-09-17', 'wheat', 'UP'),
        ('${USER_B}', '2026-09-17', 'wheat', 'DOWN');
    `);

    await asUser(db, USER_A, async () => {
      const preds = await db.query<{ user_id: string }>('select user_id from public.predictions');
      expect(preds.rows).toHaveLength(1);
      expect(preds.rows[0].user_id).toBe(USER_A);

      const profs = await db.query<{ nickname: string }>('select nickname from public.profiles');
      expect(profs.rows.map((r) => r.nickname)).toEqual(['가']);
    });
  });

  it('탈퇴(계정 삭제) 시 예측 기록은 남고 user_id만 비워진다 — 익명화 (GRIP-03)', async () => {
    await db.exec(`
      insert into public.rounds (trade_date, opens_at, deadline_at)
        values ('2026-09-17', now() - interval '1 hour', now() + interval '2 hours');
      insert into public.profiles (id, nickname) values ('${USER_A}', '가');
      insert into public.predictions (user_id, trade_date, index_key, pick)
        values ('${USER_A}', '2026-09-17', 'wheat', 'UP');
    `);

    await db.exec(`delete from auth.users where id = '${USER_A}'`);

    // 프로필은 개인정보이므로 함께 지워진다.
    const profs = await db.query('select 1 from public.profiles');
    expect(profs.rows).toHaveLength(0);

    // 예측 기록은 남고 user_id만 null이 된다.
    const preds = await db.query<{ user_id: string | null; pick: string }>(
      'select user_id, pick from public.predictions',
    );
    expect(preds.rows).toHaveLength(1);
    expect(preds.rows[0].user_id).toBeNull();
    expect(preds.rows[0].pick).toBe('UP');
  });

  it('익명화된 예측은 로그인한 사용자에게 보이지 않는다', async () => {
    await db.exec(`
      insert into public.rounds (trade_date, opens_at, deadline_at)
        values ('2026-09-17', now() - interval '1 hour', now() + interval '2 hours');
      insert into public.predictions (user_id, trade_date, index_key, pick)
        values ('${USER_A}', '2026-09-17', 'wheat', 'UP');
      delete from auth.users where id = '${USER_A}';
    `);
    await asUser(db, USER_B, async () => {
      const rows = await db.query('select 1 from public.predictions');
      expect(rows.rows).toHaveLength(0);
    });
    // service_role(RLS 우회)로는 집계할 수 있다.
    const all = await db.query('select 1 from public.predictions');
    expect(all.rows).toHaveLength(1);
  });

  it('지수와 회차는 로그인 전(anon)에도 읽힌다', async () => {
    await db.exec(`
      insert into public.rounds (trade_date, opens_at, deadline_at)
        values ('2026-09-17', now() - interval '1 hour', now() + interval '2 hours');
      insert into public.index_snapshots (index_key, trade_date, status, value)
        values ('wheat', '2026-09-16', 'confirmed', 102.4);
    `);
    await db.exec('set role anon');
    const idx = await db.query('select 1 from public.index_snapshots');
    const rnd = await db.query('select 1 from public.rounds');
    expect(idx.rows).toHaveLength(1);
    expect(rnd.rows).toHaveLength(1);
    // 예측은 anon 에게 권한 자체가 없다.
    await expect(db.query('select 1 from public.predictions')).rejects.toThrow();
    await db.exec('reset role');
  });

  it('원지표 원본(source_value)은 anon·authenticated에게 보이지 않는다 — GRIP-08', async () => {
    await db.exec(`insert into public.index_snapshots
      (index_key, trade_date, status, value, source_name, source_value)
      values ('wheat', '2026-09-16', 'confirmed', 102.4, 'KOSPI', 2650.123456)`);

    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      // 공개 컬럼만 명시한 조회는 통과한다.
      const ok = await db.query('select index_key, trade_date, status, value from public.index_snapshots');
      expect(ok.rows).toHaveLength(1);
      // 원본 컬럼과 select * 는 권한 오류가 난다.
      await expect(db.query('select source_value from public.index_snapshots')).rejects.toThrow();
      await expect(db.query('select * from public.index_snapshots')).rejects.toThrow();
      await db.exec('reset role');
    }

    // service_role(운영 배치)은 원본을 읽을 수 있다.
    const admin = await db.query<{ source_value: string }>('select source_value from public.index_snapshots');
    expect(Number(admin.rows[0].source_value)).toBeCloseTo(2650.123456, 6);
  });

  it('같은 판정을 두 번 저장할 수 없다 — 배치 멱등성 키 (GRIP-07)', async () => {
    await db.exec(`
      insert into public.rounds (trade_date, opens_at, deadline_at, status)
        values ('2026-09-16', now() - interval '3 hours', now() - interval '1 hour', 'judged');
      insert into public.judgments (user_id, trade_date, index_key, pick, outcome, previous_value, confirmed_value)
        values ('${USER_A}', '2026-09-16', 'wheat', 'UP', 'HIT', 101.2, 102.4);
    `);
    await expect(
      db.exec(`insert into public.judgments (user_id, trade_date, index_key, pick, outcome)
               values ('${USER_A}', '2026-09-16', 'wheat', 'UP', 'MISS')`),
    ).rejects.toThrow();
  });

  it('정정 이력은 판정에 쓴 값을 바꾸지 않고 따로 남는다 (GRIP-07)', async () => {
    await db.exec(`insert into public.index_snapshots
      (index_key, trade_date, status, value) values ('wheat', '2026-09-16', 'confirmed', 102.4)`);
    // 정정값만 있고 시각이 없으면 거부된다.
    await expect(
      db.exec(`update public.index_snapshots set corrected_value = 102.9 where trade_date = '2026-09-16'`),
    ).rejects.toThrow();
    await db.exec(`update public.index_snapshots
                      set corrected_value = 102.9, corrected_at = now()
                    where trade_date = '2026-09-16'`);
    const { rows } = await db.query<{ value: string; corrected_value: string }>(
      `select value, corrected_value from public.index_snapshots`,
    );
    expect(Number(rows[0].value)).toBe(102.4); // 판정에 쓴 값은 그대로
    expect(Number(rows[0].corrected_value)).toBe(102.9);
  });

  it('랭킹의 tier와 accuracy는 계산 컬럼이라 어긋날 수 없다 (GRIP-09)', async () => {
    await db.exec(`insert into public.weekly_rankings
      (week_start, user_id, nickname, valid_rounds, participated, hits, judged, rank)
      values ('2026-09-14', '${USER_A}', '가', 5, 4, 9, 12, 7)`);
    const { rows } = await db.query<{ tier: number; accuracy: string }>(
      'select tier, accuracy from public.weekly_rankings',
    );
    expect(rows[0].tier).toBe(1); // 5 - 4 = 결석 1회 → 2차 랭크
    expect(Number(rows[0].accuracy)).toBeCloseTo(0.75, 4);

    // 참여 수가 유효 회차보다 클 수 없고, 한 주에 같은 순위가 둘일 수 없다.
    await expect(
      db.exec(`insert into public.weekly_rankings
        (week_start, user_id, nickname, valid_rounds, participated, hits, judged, rank)
        values ('2026-09-14', '${USER_B}', '나', 5, 6, 1, 1, 8)`),
    ).rejects.toThrow();
    await expect(
      db.exec(`insert into public.weekly_rankings
        (week_start, user_id, nickname, valid_rounds, participated, hits, judged, rank)
        values ('2026-09-14', '${USER_B}', '나', 5, 5, 1, 1, 7)`),
    ).rejects.toThrow();
  });

  it('랭킹판은 전원이 읽고, 판정·리워드는 본인 것만 읽는다', async () => {
    await db.exec(`
      insert into public.rounds (trade_date, opens_at, deadline_at, status)
        values ('2026-09-16', now() - interval '3 hours', now() - interval '1 hour', 'judged');
      insert into public.judgments (user_id, trade_date, index_key, pick, outcome)
        values ('${USER_A}', '2026-09-16', 'wheat', 'UP', 'HIT'),
               ('${USER_B}', '2026-09-16', 'wheat', 'DOWN', 'MISS');
      insert into public.weekly_rankings
        (week_start, user_id, nickname, valid_rounds, participated, hits, judged, rank) values
        ('2026-09-14', '${USER_A}', '가', 5, 5, 4, 5, 1),
        ('2026-09-14', '${USER_B}', '나', 5, 4, 3, 4, 2);
      insert into public.rewards (week_start, user_id, rank, code, status)
        values ('2026-09-14', '${USER_A}', 1, 'BREAD-AAA', 'issued');
    `);

    await asUser(db, USER_B, async () => {
      // 랭킹은 남의 것도 보인다 (공개판).
      const ranks = await db.query('select nickname, rank from public.weekly_rankings');
      expect(ranks.rows).toHaveLength(2);
      // 판정은 본인 것만.
      const judged = await db.query<{ outcome: string }>('select outcome from public.judgments');
      expect(judged.rows).toHaveLength(1);
      expect(judged.rows[0].outcome).toBe('MISS');
      // 남의 리워드는 보이지 않는다.
      const rewards = await db.query('select 1 from public.rewards');
      expect(rewards.rows).toHaveLength(0);
    });

    // 로그인 전에도 랭킹판은 보이지만 판정·리워드는 권한이 없다.
    await db.exec('set role anon');
    expect((await db.query('select 1 from public.weekly_rankings')).rows).toHaveLength(2);
    await expect(db.query('select 1 from public.judgments')).rejects.toThrow();
    await expect(db.query('select 1 from public.rewards')).rejects.toThrow();
    await db.exec('reset role');
  });

  it('한 주에 같은 사람에게 리워드를 두 번 줄 수 없다 (GRIP-10)', async () => {
    await db.exec(`insert into public.rewards (week_start, user_id, rank, code, status)
                   values ('2026-09-14', '${USER_A}', 1, 'BREAD-AAA', 'issued')`);
    await expect(
      db.exec(`insert into public.rewards (week_start, user_id, rank, code, status)
               values ('2026-09-14', '${USER_A}', 2, 'BREAD-BBB', 'issued')`),
    ).rejects.toThrow();
    // 발급 상태인데 코드가 없으면 거부된다.
    await expect(
      db.exec(`insert into public.rewards (week_start, user_id, rank, status)
               values ('2026-09-14', '${USER_B}', 2, 'issued')`),
    ).rejects.toThrow();
  });
});
