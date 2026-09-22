import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';
import {
  applyMigrations,
  ensureAdminUser,
  generatePassword,
  listMigrationFiles,
  maskDbUrl,
  parseEnvFile,
  planAdminIds,
  upsertEnvValue,
  verifySchema,
} from '../scripts/lib/db-setup-core.mjs';

const ADMIN = '11111111-1111-4111-8111-111111111111';

// Supabase가 기본으로 주는 것(역할 3개 + auth 스키마)을 빈 PGlite에 최소한으로 만들어 둔다.
// 0002부터 auth.users를 참조하므로 역할만으로는 마이그레이션이 적용되지 않는다.
async function supabaseLikeDb() {
  const pg = new PGlite();
  await pg.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key);
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('test.user_id', true), '')::uuid
    $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
  `);
  return { pg, db: { query: (sql: string, params?: unknown[]) => pg.query(sql, params), exec: (sql: string) => pg.exec(sql) } };
}

describe('db:setup · 마이그레이션', () => {
  it('처음에는 적용하고, 다시 실행하면 건너뛴다', async () => {
    const { pg, db } = await supabaseLikeDb();
    const files = listMigrationFiles('supabase/migrations');
    expect(files.map((f) => f.name)).toContain('0001_cafe24_lab.sql');
    expect(files.map((f) => f.name)).toContain('0002_mvp_core.sql');

    // 파일을 추가해도 깨지지 않게, 기대값은 실제 목록에서 만든다.
    const all = (action: string) => files.map((f) => ({ name: f.name, action }));
    expect(await applyMigrations(db, files, { dryRun: true })).toEqual(all('pending'));
    expect(await applyMigrations(db, files)).toEqual(all('applied'));
    expect(await applyMigrations(db, files)).toEqual(all('skipped'));
    await pg.close();
  });

  it('SQL Editor로 이미 만든 DB에도 다시 적용할 수 있다(SQL이 if not exists · or replace)', async () => {
    const { pg, db } = await supabaseLikeDb();
    const files = listMigrationFiles('supabase/migrations');
    // SQL Editor로 전부 직접 실행한 상태를 만든 뒤, 러너가 같은 SQL을 다시 적용해도 오류가 없어야 한다.
    for (const file of files) await pg.exec(file.sql);
    expect(await applyMigrations(db, files)).toEqual(files.map((f) => ({ name: f.name, action: 'applied' })));
    await pg.close();
  });

  it('적용한 뒤 파일 내용이 바뀌면 멈춘다', async () => {
    const { pg, db } = await supabaseLikeDb();
    const files = listMigrationFiles('supabase/migrations');
    await applyMigrations(db, files);
    const changed = [{ ...files[0], checksum: 'different' }];
    await expect(applyMigrations(db, changed)).rejects.toMatchObject({ code: 'MIGRATION_CHANGED' });
    expect(await applyMigrations(db, changed, { dryRun: true })).toEqual([{ name: '0001_cafe24_lab.sql', action: 'changed' }]);
    await pg.close();
  });

  it('SQL 중간에 실패하면 되돌리고 적용 기록을 남기지 않는다', async () => {
    const { pg, db } = await supabaseLikeDb();
    const dir = mkdtempSync(join(tmpdir(), 'dbsetup-'));
    writeFileSync(join(dir, '0001_bad.sql'), 'create table public.half_done (id int); select * from no_such_table;');
    await expect(applyMigrations(db, listMigrationFiles(dir))).rejects.toThrow();
    const left = await pg.query<{ ok: boolean }>(`select to_regclass('public.half_done') is null as ok`);
    expect(left.rows[0].ok).toBe(true);
    const recorded = await pg.query<{ n: number }>('select count(*)::int as n from lab_private.schema_migrations');
    expect(recorded.rows[0].n).toBe(0);
    await pg.close();
  });
});

describe('db:setup · 스키마 확인', () => {
  it('적용 전에는 fail, 적용 후에는 테이블·RLS·잠금 함수·anon 차단·service_role 권한 모두 ok', async () => {
    const { pg, db } = await supabaseLikeDb();
    const before = await verifySchema(db);
    expect(before.find((i) => i.id === 'db.tables')?.status).toBe('fail');

    await applyMigrations(db, listMigrationFiles('supabase/migrations'));
    const after = await verifySchema(db);
    expect(after.map((i) => [i.id, i.status])).toEqual([
      ['db.tables', 'ok'],
      ['db.rls', 'ok'],
      ['db.lock_function', 'ok'],
      ['db.anon_blocked', 'ok'],
      ['db.service_role', 'ok'],
    ]);
    await pg.close();
  });

  it('anon 읽기 권한이 남아 있으면 fail', async () => {
    const { pg, db } = await supabaseLikeDb();
    await applyMigrations(db, listMigrationFiles('supabase/migrations'));
    await pg.exec('grant select on public.cafe24_connections to anon;');
    expect((await verifySchema(db)).find((i) => i.id === 'db.anon_blocked')?.status).toBe('fail');
    await pg.close();
  });
});

describe('db:setup · 관리자 계정', () => {
  function fakeAuth(existing: { id: string; email: string }[] = []) {
    const users = [...existing];
    const created: { email: string; password: string; email_confirm: boolean }[] = [];
    return {
      created,
      api: {
        async listUsers({ page }: { page: number; perPage: number }) {
          return { data: { users: page === 1 ? users : [] }, error: null };
        },
        async createUser(attrs: { email: string; password: string; email_confirm: boolean }) {
          created.push(attrs);
          const user = { id: '22222222-2222-4222-8222-222222222222', email: attrs.email };
          users.push(user);
          return { data: { user }, error: null };
        },
      },
    };
  }

  it('같은 이메일(대소문자 무시) 계정이 있으면 만들지 않는다', async () => {
    const auth = fakeAuth([{ id: ADMIN, email: 'Admin@Example.com' }]);
    const result = await ensureAdminUser(auth.api, { email: 'admin@example.com', create: true, getPassword: async () => 'x'.repeat(20) });
    expect(result).toMatchObject({ status: 'exists', user: { id: ADMIN } });
    expect(auth.created).toHaveLength(0);
  });

  it('없으면 이메일 확인된 상태로 만든다', async () => {
    const auth = fakeAuth();
    const result = await ensureAdminUser(auth.api, { email: 'new@example.com', create: true, getPassword: async () => 'a-strong-password-123' });
    expect(result.status).toBe('created');
    expect(auth.created[0]).toMatchObject({ email: 'new@example.com', email_confirm: true });
  });

  it('확인만 할 때는 없어도 만들지 않는다', async () => {
    const auth = fakeAuth();
    expect(await ensureAdminUser(auth.api, { email: 'new@example.com', create: false, getPassword: async () => null })).toEqual({ status: 'missing', user: null });
    expect(auth.created).toHaveLength(0);
  });

  it('12자 미만 비밀번호·이메일 형식 오류는 거절', async () => {
    const auth = fakeAuth();
    await expect(ensureAdminUser(auth.api, { email: 'new@example.com', create: true, getPassword: async () => 'short' })).rejects.toMatchObject({ code: 'ADMIN_PASSWORD_TOO_SHORT' });
    await expect(ensureAdminUser(auth.api, { email: 'not-an-email', create: true, getPassword: async () => 'x'.repeat(20) })).rejects.toMatchObject({ code: 'ADMIN_EMAIL_INVALID' });
  });

  it('ADMIN_USER_IDS 처리: 비었거나 pending이면 기록, 이미 있으면 유지, 다른 UUID가 있으면 추가 제안', () => {
    expect(planAdminIds('', ADMIN)).toEqual({ action: 'write', value: ADMIN });
    expect(planAdminIds('pending', ADMIN)).toEqual({ action: 'write', value: ADMIN });
    expect(planAdminIds(ADMIN, ADMIN)).toEqual({ action: 'keep', value: ADMIN });
    const other = '33333333-3333-4333-8333-333333333333';
    expect(planAdminIds(other, ADMIN)).toEqual({ action: 'suggest-append', value: `${other},${ADMIN}` });
  });

  it('자동 생성 비밀번호는 24자, 매번 다르다', () => {
    const a = generatePassword();
    expect(a).toHaveLength(24);
    expect(a).not.toBe(generatePassword());
  });
});

describe('db:setup · .env 파일', () => {
  it('값을 읽고, 한 줄만 바꾸거나 없으면 끝에 붙인다', () => {
    const text = '# 주석\nNEXT_PUBLIC_SUPABASE_URL=https://x.supabase.co\nADMIN_USER_IDS=pending\nQUOTED="a b" # 설명\n';
    expect(parseEnvFile(text)).toEqual({ NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co', ADMIN_USER_IDS: 'pending', QUOTED: 'a b' });
    const next = upsertEnvValue(text, 'ADMIN_USER_IDS', ADMIN);
    expect(next).toContain(`ADMIN_USER_IDS=${ADMIN}`);
    expect(next).toContain('# 주석');
    expect(upsertEnvValue('A=1\n', 'B', '2')).toBe('A=1\nB=2\n');
  });

  it('접속 문자열 비밀번호를 가린다', () => {
    expect(maskDbUrl('postgresql://postgres.ref:p%40ss@aws-0-ap.pooler.supabase.com:5432/postgres')).toBe('postgresql://postgres.ref:****@aws-0-ap.pooler.supabase.com:5432/postgres');
  });
});
