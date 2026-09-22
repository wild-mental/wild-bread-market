#!/usr/bin/env node
// MAKJI 카페24 연동 · Supabase 설치 스크립트 (사람이 자기 컴퓨터 터미널에서 실행)
//
//   npm run db:setup                         마이그레이션 적용 → 스키마 확인 → 관리자 계정이 없으면 생성 → ADMIN_USER_IDS 기록
//   npm run setup:check                      아무것도 바꾸지 않고 상태만 확인
//
// 옵션: --env-file <경로>(기본 .env.local) · --admin-email <이메일> · --generate-password
//       --no-write-env · --skip-migrations · --skip-admin · --help
//
// 필요한 값(.env.local 또는 환경변수):
//   SUPABASE_DB_URL                     DB 접속 문자열(비밀번호 포함) — 이 스크립트 전용, Vercel에는 넣지 않는다
//   NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SECRET_KEY   관리자 계정 확인·생성용
//   SETUP_ADMIN_EMAIL                   만들 관리자 이메일(--admin-email로 대신 줄 수 있음)
// 관리자 비밀번호는 파일에 두지 않는다. 터미널에서 두 번 입력하거나(--generate-password면 한 번만 화면에 표시).
//
// 출력에는 비밀값을 쓰지 않는다(접속 문자열 비밀번호는 ****). 마지막 줄: SETUP: ok=N warn=N fail=N skip=N
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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
} from './lib/db-setup-core.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// src/lib/setup/env-rules.ts(웹 점검과 같은 규칙)를 Node 24 타입 제거 기능으로 바로 불러올 때 나는 안내 경고만 숨긴다.
process.removeAllListeners('warning');
process.on('warning', (w) => {
  if (w.code !== 'MODULE_TYPELESS_PACKAGE_JSON' && w.name !== 'ExperimentalWarning') console.warn(w.message);
});
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const option = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

if (flag('--help') || flag('-h')) {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 18).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(0);
}

const CHECK_ONLY = flag('--check');
const envPath = resolve(ROOT, option('--env-file') ?? '.env.local');
const results = [];
const record = (item) => {
  results.push(item);
  const tag = { ok: 'OK  ', warn: 'WARN', fail: 'FAIL', skip: 'SKIP' }[item.status];
  console.log(`${tag}  ${item.label} — ${item.detail}${item.fix && item.status !== 'ok' ? `\n      → ${item.fix}` : ''}`);
};

// ── 값 읽기: .env.local → 환경변수가 있으면 환경변수 우선 ─────────────
const fileEnv = existsSync(envPath) ? parseEnvFile(readFileSync(envPath, 'utf8')) : {};
const env = { ...fileEnv };
for (const [k, v] of Object.entries(process.env)) if (v && v.trim()) env[k] = v;

console.log(`db:setup ${CHECK_ONLY ? '(확인만 · 아무것도 바꾸지 않음)' : ''}`);
console.log(`값 파일: ${existsSync(envPath) ? envPath : `${envPath} (없음 — 환경변수만 사용)`}`);

// ── 1. 환경변수 규칙 (웹 점검 화면과 같은 규칙) ─────────────────────
console.log('\n[1] 환경변수');
try {
  const { evaluateEnv } = await import('../src/lib/setup/env-rules.ts');
  // 이 스크립트에 꼭 필요한 값은 관리자 단계의 Supabase URL·Secret key뿐이다. 나머지는 Vercel에만 넣었을 수 있으므로 경고로 낮춘다.
  const adminStepRuns = !flag('--skip-admin') && Boolean((option('--admin-email') ?? env.SETUP_ADMIN_EMAIL ?? '').trim());
  const needed = new Set(adminStepRuns ? ['env.NEXT_PUBLIC_SUPABASE_URL', 'env.SUPABASE_SECRET_KEY'] : []);
  for (const item of evaluateEnv(env, { runtime: 'local' })) {
    if (item.status === 'fail' && !needed.has(item.id)) {
      record({ ...item, status: 'warn', detail: `${item.detail} (로컬 파일 기준 — Vercel에 넣었다면 /admin/setup에서 확인)` });
    } else record(item);
  }
} catch (e) {
  record({ id: 'env.rules', label: '환경변수 규칙', status: 'warn', detail: `규칙 파일을 불러오지 못함(${e instanceof Error ? e.message.split('\n')[0] : 'ERROR'}) — Node.js 24가 필요` });
}

// ── 2. DB 마이그레이션 · 스키마 확인 ───────────────────────────────
console.log('\n[2] Supabase DB');
async function connect(url) {
  if (url.startsWith('pglite://')) {
    // 테스트 전용: 메모리 Postgres(PGlite)에 Supabase 기본 구조(역할 3개 + auth 스키마)를 만들어 흉내 낸다.
    // 0002부터 auth.users를 참조하므로 역할만으로는 마이그레이션이 적용되지 않는다.
    const { PGlite } = await import('@electric-sql/pglite');
    const pg = new PGlite();
    await pg.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create table auth.users (id uuid primary key);
      create or replace function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      grant usage on schema auth to anon, authenticated, service_role;
      grant execute on function auth.uid() to anon, authenticated, service_role;
    `);
    return { db: { query: (s, p) => pg.query(s, p), exec: (s) => pg.exec(s) }, close: () => pg.close() };
  }
  const { default: pg } = await import('pg');
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  })();
  const local = host === 'localhost' || host === '127.0.0.1';
  const client = new pg.Client({
    connectionString: url,
    ssl: local ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
    application_name: 'makji-db-setup',
  });
  await client.connect();
  return { db: { query: (s, p) => client.query(s, p), exec: (s) => client.query(s) }, close: () => client.end() };
}

const dbUrl = (env.SUPABASE_DB_URL ?? '').trim();
if (flag('--skip-migrations') && !CHECK_ONLY) {
  record({ id: 'db.migrations', group: 'db', label: '마이그레이션', status: 'skip', detail: '--skip-migrations' });
} else if (!dbUrl) {
  record({ id: 'db.url', group: 'db', label: 'SUPABASE_DB_URL', status: CHECK_ONLY ? 'warn' : 'fail', detail: '비어 있어 DB에 접속하지 않음', fix: 'Supabase 대시보드 Connect → Session pooler 접속 문자열([YOUR-PASSWORD]를 DB 비밀번호로 바꿔)을 .env.local의 SUPABASE_DB_URL에 넣기. Vercel에는 넣지 않음' });
} else {
  let conn;
  try {
    conn = await connect(dbUrl);
    record({ id: 'db.connect', group: 'db', label: 'DB 접속', status: 'ok', detail: maskDbUrl(dbUrl) });
    const files = listMigrationFiles(join(ROOT, 'supabase', 'migrations'));
    const applied = await applyMigrations(conn.db, files, { dryRun: CHECK_ONLY });
    for (const r of applied) {
      const map = {
        applied: ['ok', '적용함'],
        skipped: ['ok', '이미 적용됨'],
        pending: ['warn', '아직 적용 안 됨'],
        changed: ['fail', '적용한 뒤 파일 내용이 바뀜'],
      };
      const [status, detail] = map[r.action];
      record({ id: `db.migration.${r.name}`, group: 'db', label: `마이그레이션 ${r.name}`, status, detail, ...(status !== 'ok' ? { fix: r.action === 'pending' ? 'npm run db:setup 실행' : '이미 적용한 파일은 고치지 말고 새 번호의 SQL 파일로 추가' } : {}) });
    }
    for (const item of await verifySchema(conn.db)) record(item);
  } catch (e) {
    const code = e?.code ?? (e instanceof Error ? e.name : 'ERROR');
    const hint =
      code === 'ENOTFOUND' || code === 'EHOSTUNREACH' || code === 'ENETUNREACH'
        ? 'Direct connection 주소는 IPv6만 되는 경우가 있음 → Connect 화면의 Session pooler 문자열 사용'
        : code === '28P01'
          ? 'DB 비밀번호가 틀림 → Supabase 프로젝트 설정에서 DB 비밀번호 확인·재설정'
          : code === 'MIGRATION_CHANGED'
            ? '이미 적용한 SQL 파일을 고쳤음 → 되돌리고 새 번호의 파일로 추가'
            : 'SUPABASE_DB_URL 형식과 네트워크를 확인';
    record({ id: 'db.connect', group: 'db', label: 'DB 작업', status: 'fail', detail: `실패 (${code})`, fix: hint });
  } finally {
    await conn?.close().catch(() => {});
  }
}

// ── 3. 관리자 계정 ────────────────────────────────────────────────
console.log('\n[3] 관리자 계정');
async function askHidden(question) {
  if (!process.stdin.isTTY) return null;
  process.stdout.write(question);
  return new Promise((resolveAnswer) => {
    let input = '';
    const onData = (buf) => {
      for (const ch of buf.toString('utf8')) {
        if (ch === '\r' || ch === '\n') {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.off('data', onData);
          process.stdout.write('\n');
          resolveAnswer(input);
          return;
        }
        if (ch === '\u0003') process.exit(130); // Ctrl+C
        if (ch === '\u007f') input = input.slice(0, -1); // Backspace
        else input += ch;
      }
    };
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', onData);
  });
}

const adminEmail = (option('--admin-email') ?? env.SETUP_ADMIN_EMAIL ?? '').trim();
let generatedPassword = null;
let adminUserId = null;
if (flag('--skip-admin')) {
  record({ id: 'admin.setup', group: 'admin', label: '관리자 계정', status: 'skip', detail: '--skip-admin' });
} else if (!adminEmail) {
  record({ id: 'admin.setup', group: 'admin', label: '관리자 계정', status: 'warn', detail: '관리자 이메일이 없어 확인하지 않음', fix: '.env.local에 SETUP_ADMIN_EMAIL=관리자이메일 을 넣거나 --admin-email 사용' });
} else if (!(env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim() || !(env.SUPABASE_SECRET_KEY ?? '').trim()) {
  record({ id: 'admin.setup', group: 'admin', label: '관리자 계정', status: 'fail', detail: 'NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SECRET_KEY가 없어 확인하지 못함', fix: '.env.local에 두 값을 넣기' });
} else {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL.trim(), env.SUPABASE_SECRET_KEY.trim(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const result = await ensureAdminUser(supabase.auth.admin, {
      email: adminEmail,
      create: !CHECK_ONLY,
      getPassword: async () => {
        if (flag('--generate-password')) return (generatedPassword = generatePassword());
        const first = await askHidden('관리자 비밀번호(12자 이상, 화면에 표시되지 않음): ');
        if (first === null) {
          throw Object.assign(new Error('NO_TTY'), { code: 'NO_TTY' });
        }
        const second = await askHidden('한 번 더 입력: ');
        if (first !== second) throw Object.assign(new Error('PASSWORD_MISMATCH'), { code: 'PASSWORD_MISMATCH' });
        return first;
      },
    });
    if (result.status === 'missing') {
      record({ id: 'admin.exists', group: 'admin', label: '관리자 계정', status: 'fail', detail: '이 이메일의 계정이 없음', fix: 'npm run db:setup 으로 생성' });
    } else {
      adminUserId = result.user.id;
      const confirmed = Boolean(result.user.email_confirmed_at) || result.status === 'created';
      record({
        id: 'admin.exists',
        group: 'admin',
        label: '관리자 계정',
        status: confirmed ? 'ok' : 'warn',
        detail: `${result.status === 'created' ? '새로 만듦(이메일 확인 처리)' : '이미 있음 — 바꾸지 않음'} · UUID ${adminUserId}`,
        ...(confirmed ? {} : { fix: 'Supabase Users에서 이메일 확인 상태를 확인(미확인이면 로그인 실패)' }),
      });
    }
  } catch (e) {
    const code = e?.code ?? (e instanceof Error ? e.message : 'ERROR');
    const fix = {
      NO_TTY: '터미널에서 직접 실행하거나 --generate-password 사용',
      PASSWORD_MISMATCH: '다시 실행해 같은 비밀번호를 두 번 입력',
      ADMIN_PASSWORD_TOO_SHORT: '12자 이상으로 입력',
      ADMIN_EMAIL_INVALID: '이메일 형식 확인',
    }[code] ?? 'SUPABASE_SECRET_KEY(Secret key인지)와 NEXT_PUBLIC_SUPABASE_URL을 확인';
    record({ id: 'admin.exists', group: 'admin', label: '관리자 계정', status: 'fail', detail: `실패 (${code})`, fix });
  }
}

// ── 4. ADMIN_USER_IDS ─────────────────────────────────────────────
if (adminUserId) {
  const plan = planAdminIds(env.ADMIN_USER_IDS, adminUserId);
  if (plan.action === 'keep') {
    record({ id: 'admin.ids', group: 'admin', label: 'ADMIN_USER_IDS', status: 'ok', detail: '이 관리자 UUID가 이미 들어 있음' });
  } else if (plan.action === 'suggest-append') {
    record({ id: 'admin.ids', group: 'admin', label: 'ADMIN_USER_IDS', status: 'warn', detail: '다른 UUID만 들어 있음 — 자동으로 바꾸지 않음', fix: `여러 명이면 쉼표로 추가: ${plan.value}` });
  } else if (CHECK_ONLY || flag('--no-write-env') || !existsSync(envPath) || fileEnv.ADMIN_USER_IDS === undefined && process.env.ADMIN_USER_IDS) {
    record({ id: 'admin.ids', group: 'admin', label: 'ADMIN_USER_IDS', status: 'warn', detail: '비었거나 pending — 파일에 쓰지 않음', fix: `ADMIN_USER_IDS=${plan.value}` });
  } else {
    writeFileSync(envPath, upsertEnvValue(readFileSync(envPath, 'utf8'), 'ADMIN_USER_IDS', plan.value));
    record({ id: 'admin.ids', group: 'admin', label: 'ADMIN_USER_IDS', status: 'ok', detail: `${envPath}에 기록함` });
  }
}

// ── 요약 ─────────────────────────────────────────────────────────
const count = (s) => results.filter((r) => r.status === s).length;
console.log('\n다음에 할 일');
if (adminUserId) console.log(`  · Vercel 환경변수 ADMIN_USER_IDS에 ${adminUserId} 를 넣고 Redeploy (가이드 5-3)`);
console.log('  · 배포 주소의 /admin/setup 에서 같은 점검을 확인');
console.log('  · SUPABASE_DB_URL은 Vercel에 넣지 않는다. 설치가 끝나면 .env.local에서 지워도 된다');
if (generatedPassword) {
  console.log('\n관리자 비밀번호(이번 한 번만 표시): ' + generatedPassword);
  console.log('  → 지금 비밀번호 관리자에 저장하고, 이 터미널 화면을 지우세요(clear). 에이전트 대화·채팅에 붙이지 마세요.');
}
console.log(`\nSETUP: ok=${count('ok')} warn=${count('warn')} fail=${count('fail')} skip=${count('skip')}`);
process.exit(count('fail') > 0 ? 1 : 0);
