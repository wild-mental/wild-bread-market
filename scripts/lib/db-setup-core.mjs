// db:setup 설치 스크립트의 핵심 로직. 네트워크·터미널 입출력 없이 테스트할 수 있게 분리한다.
// db 인터페이스: { query(sql, params?) → { rows }, exec(sql) } — pg Client와 PGlite 모두 맞춘다.
import { createHash, randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const LAB_TABLES = ['cafe24_connections', 'cafe24_products', 'cafe24_change_log'];
const LOCK_FN = 'public.cafe24_try_refresh_lock(text, integer)';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── .env 파일 ─────────────────────────────────────────────────────
export function parseEnvFile(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const quoted = m[2].match(/^(["'])(.*)\1(?:\s+#.*)?$/);
    out[m[1]] = quoted ? quoted[2] : m[2].replace(/\s+#.*$/, '');
  }
  return out;
}

// KEY=… 줄의 값만 바꾼다. 줄이 없으면 맨 끝에 붙인다. 다른 줄·주석은 그대로 둔다.
export function upsertEnvValue(text, key, value) {
  const lines = text.split(/\r?\n/);
  const idx = lines.findIndex((line) => new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=`).test(line));
  if (idx >= 0) lines[idx] = `${key}=${value}`;
  else {
    if (lines.length && lines[lines.length - 1] === '') lines.pop();
    lines.push(`${key}=${value}`, '');
  }
  return lines.join('\n');
}

// 접속 문자열에서 비밀번호를 가린다(출력용).
export function maskDbUrl(raw) {
  try {
    const url = new URL(raw);
    if (url.password) url.password = '****';
    return url.toString();
  } catch {
    return '(형식을 읽을 수 없는 값)';
  }
}

export function generatePassword(length = 24) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-_';
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

// ── 마이그레이션 ──────────────────────────────────────────────────
export function listMigrationFiles(dir) {
  return readdirSync(dir)
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort()
    .map((name) => {
      const sql = readFileSync(join(dir, name), 'utf8');
      return { name, sql, checksum: createHash('sha256').update(sql).digest('hex') };
    });
}

// 적용 기록은 API로 노출되지 않는 별도 스키마(lab_private)에 둔다.
export async function ensureMigrationTable(db) {
  await db.exec(`
    create schema if not exists lab_private;
    revoke all on schema lab_private from public;
    create table if not exists lab_private.schema_migrations (
      name text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    );
  `);
}

async function readApplied(db) {
  const exists = await db.query(`select to_regclass('lab_private.schema_migrations') is not null as ok`);
  if (!exists.rows[0]?.ok) return new Map();
  const { rows } = await db.query('select name, checksum from lab_private.schema_migrations');
  return new Map(rows.map((r) => [r.name, r.checksum]));
}

// dryRun이면 무엇을 적용할지만 알려 준다. 이미 적용한 파일의 내용이 바뀌었으면 멈춘다.
export async function applyMigrations(db, files, { dryRun = false } = {}) {
  if (!dryRun) await ensureMigrationTable(db);
  const applied = await readApplied(db);
  const results = [];
  for (const file of files) {
    const prev = applied.get(file.name);
    if (prev === file.checksum) {
      results.push({ name: file.name, action: 'skipped' });
      continue;
    }
    if (prev && prev !== file.checksum) {
      results.push({ name: file.name, action: 'changed' });
      if (!dryRun) {
        throw Object.assign(new Error(`MIGRATION_CHANGED:${file.name}`), { code: 'MIGRATION_CHANGED' });
      }
      continue;
    }
    if (dryRun) {
      results.push({ name: file.name, action: 'pending' });
      continue;
    }
    await db.exec('begin');
    try {
      await db.exec(file.sql);
      await db.query('insert into lab_private.schema_migrations (name, checksum) values ($1, $2)', [file.name, file.checksum]);
      await db.exec('commit');
    } catch (e) {
      await db.exec('rollback').catch(() => {});
      throw e;
    }
    results.push({ name: file.name, action: 'applied' });
  }
  return results;
}

// ── 스키마 확인 (값을 바꾸지 않는 조회만) ─────────────────────────
export async function verifySchema(db) {
  const items = [];
  const push = (id, label, status, detail, fix) => items.push({ id, group: 'db', label, status, detail, ...(fix ? { fix } : {}) });

  const tables = await db.query(
    `select table_name from information_schema.tables where table_schema = 'public' and table_name = any($1::text[])`,
    [LAB_TABLES],
  );
  const found = tables.rows.map((r) => r.table_name);
  const missing = LAB_TABLES.filter((t) => !found.includes(t));
  push('db.tables', '테이블 3개', missing.length ? 'fail' : 'ok', missing.length ? `없음: ${missing.join(', ')}` : LAB_TABLES.join(' · '), missing.length ? 'npm run db:setup으로 마이그레이션 적용' : undefined);

  if (!missing.length) {
    const rls = await db.query(
      `select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = any($1::text[])`,
      [LAB_TABLES],
    );
    const off = rls.rows.filter((r) => !r.relrowsecurity).map((r) => r.relname);
    push('db.rls', 'RLS 켜짐', off.length ? 'fail' : 'ok', off.length ? `꺼짐: ${off.join(', ')}` : '세 테이블 모두');
  }

  const fn = await db.query(`select to_regprocedure($1) is not null as ok`, [LOCK_FN]);
  push('db.lock_function', '토큰 갱신 잠금 함수', fn.rows[0]?.ok ? 'ok' : 'fail', fn.rows[0]?.ok ? 'cafe24_try_refresh_lock 있음' : '없음', fn.rows[0]?.ok ? undefined : 'npm run db:setup으로 마이그레이션 적용');

  const roles = await db.query(`select rolname from pg_roles where rolname in ('anon', 'service_role')`);
  const hasRole = (r) => roles.rows.some((x) => x.rolname === r);
  if (!missing.length && hasRole('anon')) {
    const anon = await db.query(
      `select has_table_privilege('anon', 'public.cafe24_connections', 'select') as can_read,
              ${fn.rows[0]?.ok ? `has_function_privilege('anon', '${LOCK_FN}', 'execute')` : 'false'} as can_lock`,
    );
    const { can_read, can_lock } = anon.rows[0];
    push('db.anon_blocked', '브라우저 키(anon) 접근 차단', can_read || can_lock ? 'fail' : 'ok', can_read || can_lock ? `anon 권한 남아 있음(읽기 ${can_read}, 잠금 함수 ${can_lock})` : '토큰 테이블 읽기·잠금 함수 실행 불가', can_read || can_lock ? '마이그레이션 SQL의 revoke 부분 다시 실행' : undefined);
  } else {
    push('db.anon_blocked', '브라우저 키(anon) 접근 차단', 'skip', hasRole('anon') ? '테이블이 없어 확인하지 못함' : 'anon 역할이 없는 DB(Supabase가 아님)');
  }
  if (!missing.length && hasRole('service_role')) {
    const srv = await db.query(`select has_table_privilege('service_role', 'public.cafe24_products', 'insert') as ok`);
    push('db.service_role', '서버 키(service_role) 쓰기 권한', srv.rows[0]?.ok ? 'ok' : 'fail', srv.rows[0]?.ok ? '있음' : '없음', srv.rows[0]?.ok ? undefined : '마이그레이션 SQL의 grant 부분 다시 실행');
  }
  return items;
}

// ── 관리자 계정 ───────────────────────────────────────────────────
// adminApi: supabase.auth.admin (listUsers · createUser)
export async function findUserByEmail(adminApi, email) {
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await adminApi.listUsers({ page, perPage: 1000 });
    if (error) throw Object.assign(new Error(`AUTH_LIST_FAILED:${error.status ?? ''}`), { code: 'AUTH_LIST_FAILED' });
    const users = data?.users ?? [];
    const hit = users.find((u) => (u.email ?? '').toLowerCase() === target);
    if (hit) return hit;
    if (users.length < 1000) return null;
  }
  return null;
}

// 계정이 없을 때만 만든다. 이미 있으면 절대 바꾸지 않는다(비밀번호 재설정 없음).
export async function ensureAdminUser(adminApi, { email, create, getPassword }) {
  if (!EMAIL.test(email ?? '')) throw Object.assign(new Error('ADMIN_EMAIL_INVALID'), { code: 'ADMIN_EMAIL_INVALID' });
  const existing = await findUserByEmail(adminApi, email);
  if (existing) return { status: 'exists', user: existing };
  if (!create) return { status: 'missing', user: null };
  const password = await getPassword();
  if (!password || password.length < 12) {
    throw Object.assign(new Error('ADMIN_PASSWORD_TOO_SHORT'), { code: 'ADMIN_PASSWORD_TOO_SHORT' });
  }
  const { data, error } = await adminApi.createUser({ email: email.trim(), password, email_confirm: true });
  if (error || !data?.user) {
    throw Object.assign(new Error(`AUTH_CREATE_FAILED:${error?.status ?? ''}`), { code: 'AUTH_CREATE_FAILED' });
  }
  return { status: 'created', user: data.user };
}

// ADMIN_USER_IDS를 어떻게 다룰지 결정한다(파일 쓰기는 호출하는 쪽이 한다).
export function planAdminIds(current, userId) {
  const raw = (current ?? '').trim();
  const ids = raw
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  if (!raw || raw.toLowerCase() === 'pending') return { action: 'write', value: userId };
  if (ids.includes(userId)) return { action: 'keep', value: raw };
  if (ids.every((x) => UUID.test(x))) return { action: 'suggest-append', value: [...ids, userId].join(',') };
  return { action: 'write', value: userId };
}
