#!/usr/bin/env node
// MAKJI 카페24 연동 실습 · 로컬 스모크 점검
//
//   node scripts/smoke.mjs                      이 프로젝트 점검 (.next 빌드가 없으면 먼저 빌드)
//   node scripts/smoke.mjs --project <경로>     다른 프로젝트 폴더 점검 (같은 라우트 계약을 따르는 앱)
//   node scripts/smoke.mjs --build              빌드를 항상 새로 한 뒤 점검
//
// 프로덕션 빌드를 로컬에서 실행하고, 가짜 Supabase 서버를 붙여 관리 API·OAuth·공개 위젯 API·화면을 확인한다.
// 실제 Supabase·카페24에는 요청을 보내지 않는다. 환경변수는 모두 테스트 전용 가짜 값이며 출력하지 않는다.
// 마지막 줄은 항상 `SMOKE: 통과수/전체수 PASS`이고, 하나라도 실패하면 exit 1.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import http from 'node:http';
import net from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { launchChrome, waitUntil } from './lib/chrome.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

// ── 인자 ────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const option = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
if (flag('--help') || flag('-h')) {
  console.log('usage: node scripts/smoke.mjs [--project <경로>] [--build]');
  process.exit(0);
}
const projectDir = resolve(option('--project') ?? join(HERE, '..'));

// ── 실습 계약 값 (연동 레퍼런스 lab-config.ts와 같음) ────────────────
const STOREFRONT = 'https://wildmental.cafe24.com';
const PRODUCT_PATH = '/product/%ED%96%A5%EA%B8%B0%EB%A1%9C%EC%9A%B4-%ED%97%88%EB%B8%8C-%EC%8C%80%EC%B9%98%EC%95%84%EB%B0%94%ED%83%80/16/category/81/display/1/';
const APP_ORIGIN = 'https://wild-bread-market.test'; // 브라우저 점검용 가짜 앱 주소 (요청은 로컬 서버로 돌린다)
const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const SCOPES = 'mall.read_application,mall.write_application,mall.read_product,mall.write_product';

// ── 작은 도우미 ────────────────────────────────────────────────────
function freePort() {
  return new Promise((ok, fail) => {
    const srv = net.createServer();
    srv.once('error', fail);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => ok(port));
    });
  });
}

// fetch 대신 node:http를 써서 Origin·Cookie 헤더와 Set-Cookie 배열을 그대로 다룬다.
function request(base, path, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((ok, fail) => {
    const req = http.request(new URL(path, base), { method, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try {
          json = JSON.parse(text);
        } catch {}
        ok({ status: res.statusCode, headers: res.headers, text, json, raw: Buffer.concat(chunks) });
      });
    });
    req.setTimeout(30000, () => req.destroy(new Error('요청 시간 초과')));
    req.on('error', fail);
    if (body) req.write(body);
    req.end();
  });
}

const b64url = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

// 서명 검증을 하지 않는 가짜 서버용 JWT 모양 문자열
function fakeAccessToken(sub) {
  const now = Math.floor(Date.now() / 1000);
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 86400 })}.smoke-signature`;
}

function fakeUser(id) {
  return {
    id,
    aud: 'authenticated',
    role: 'authenticated',
    email: `${id === ADMIN_ID ? 'admin' : 'member'}@smoke.test`,
    app_metadata: { provider: 'email' },
    user_metadata: {},
    created_at: '2026-09-01T00:00:00Z',
    email_confirmed_at: '2026-09-01T00:00:00Z',
  };
}

// @supabase/ssr 기본 쿠키 형식: sb-<호스트 첫 조각>-auth-token = base64-<base64url(JSON 세션)>
function sessionCookie(supabaseUrl, userId) {
  const now = Math.floor(Date.now() / 1000);
  const session = {
    access_token: fakeAccessToken(userId),
    token_type: 'bearer',
    expires_in: 86400,
    expires_at: now + 86400,
    refresh_token: 'smoke-refresh-token',
    user: fakeUser(userId),
  };
  return `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token=base64-${b64url(session)}`;
}

// ── 가짜 Supabase (Auth /user · Auth Admin · REST 3개 테이블 · 잠금 RPC) ─────
const FAKE_PUBLISHABLE = 'sb_publishable_smoke_fake';
const FAKE_SECRET = 'sb_secret_smoke_fake';
const LAB_TABLES = ['cafe24_connections', 'cafe24_products', 'cafe24_change_log'];
const authUsers = []; // db:setup 점검에서 만든 사용자

function startFakeSupabase(port) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const send = (status, body, headers = {}) => {
      res.writeHead(status, { 'content-type': 'application/json', ...headers });
      res.end(body === undefined ? '' : JSON.stringify(body));
    };
    const apikey = req.headers.apikey ?? '';
    const isSecret = apikey === FAKE_SECRET || (req.headers.authorization ?? '') === `Bearer ${FAKE_SECRET}`;
    if (url.pathname.startsWith('/auth/v1/admin/users')) {
      if (!isSecret) return send(401, { code: 401, msg: 'invalid api key' });
      const id = url.pathname.split('/')[5];
      if (id) {
        const user = [fakeUser(ADMIN_ID), fakeUser(USER_ID), ...authUsers].find((u) => u.id === id);
        return user ? send(200, user) : send(404, { code: 404, error_code: 'user_not_found', msg: 'User not found' });
      }
      if (req.method === 'GET') return send(200, { users: authUsers, aud: 'authenticated' }, { 'x-total-count': String(authUsers.length) });
      if (req.method === 'POST') {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          const attrs = JSON.parse(body || '{}');
          const user = { ...fakeUser(randomUUID()), email: attrs.email, email_confirmed_at: attrs.email_confirm ? '2026-09-16T00:00:00Z' : null };
          authUsers.push(user);
          send(200, user);
        });
        return;
      }
    }
    if (url.pathname === '/rest/v1/rpc/cafe24_try_refresh_lock') {
      return isSecret ? send(200, false) : send(401, { code: '42501', message: 'permission denied for function cafe24_try_refresh_lock' });
    }
    const table = LAB_TABLES.find((t) => url.pathname === `/rest/v1/${t}`);
    if (table && !isSecret) {
      return send(401, { code: '42501', details: null, hint: null, message: `permission denied for table ${table}` });
    }
    if (table && req.method === 'HEAD') return send(200, undefined, { 'content-range': '*/0' });
    if (url.pathname === '/rest/v1/cafe24_connections' || url.pathname === '/rest/v1/cafe24_change_log') {
      return send(200, [], { 'content-range': '*/0' });
    }
    if (url.pathname === '/auth/v1/user') {
      const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
      let sub = '';
      try {
        sub = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()).sub;
      } catch {}
      if (sub === ADMIN_ID || sub === USER_ID) return send(200, fakeUser(sub));
      return send(401, { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' });
    }
    if (url.pathname === '/rest/v1/cafe24_products') {
      const row = url.searchParams.get('product_no') === 'eq.16' ? { scenario: 'up' } : null;
      if ((req.headers.accept ?? '').includes('vnd.pgrst.object')) {
        return row ? send(200, row) : send(406, { code: 'PGRST116', message: 'no rows' });
      }
      return send(200, row ? [row] : []);
    }
    return send(404, { message: 'not found in smoke fake' });
  });
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok(server)));
}

// ── Next 프로덕션 서버 ────────────────────────────────────────────
function run(cmd, args, cwd) {
  return new Promise((ok, fail) => {
    const child = spawn(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('exit', (code) => (code === 0 ? ok() : fail(new Error(`${cmd} ${args.join(' ')} → exit ${code}`))));
  });
}

async function startNext(port, env) {
  const nextBin = join(projectDir, 'node_modules', 'next', 'dist', 'bin', 'next');
  const child = spawn(process.execPath, [nextBin, 'start', '-p', String(port), '-H', '127.0.0.1'], {
    cwd: projectDir,
    env: { ...process.env, ...env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  const base = `http://127.0.0.1:${port}`;
  const ready = await waitUntil(
    async () => {
      if (child.exitCode !== null) throw new Error('exited');
      return (await request(base, '/')).status === 200;
    },
    { timeoutMs: 60000, intervalMs: 300 },
  );
  if (!ready) {
    child.kill();
    throw new Error(`next start가 준비되지 않았습니다.\n${log.slice(-2000)}`);
  }
  return { base, child, log: () => log };
}

// ── 점검 실행기 ────────────────────────────────────────────────────
const results = [];
async function check(name, fn) {
  try {
    const detail = await fn();
    if (detail === true || detail === undefined) {
      results.push({ name, ok: true });
      console.log(`PASS  ${name}`);
    } else {
      results.push({ name, ok: false });
      console.log(`FAIL  ${name} — ${detail}`);
    }
  } catch (e) {
    results.push({ name, ok: false });
    console.log(`FAIL  ${name} — ${e instanceof Error ? e.message : String(e)}`);
  }
}

const expectEq = (label, actual, expected) =>
  actual === expected ? true : `${label}: 기대 ${JSON.stringify(expected)}, 실제 ${JSON.stringify(actual)}`;

function all(...conditions) {
  for (const c of conditions) if (c !== true) return c;
  return true;
}

function errorCode(res) {
  return res.json?.error?.code ?? res.json?.error ?? null;
}

// ── 본 점검 ────────────────────────────────────────────────────────
async function main() {
  console.log(`smoke project: ${projectDir}`);
  if (!existsSync(join(projectDir, 'node_modules', 'next'))) {
    throw new Error('node_modules/next가 없습니다. 프로젝트 폴더에서 npm install을 먼저 실행하세요.');
  }
  if (flag('--build') || !existsSync(join(projectDir, '.next', 'BUILD_ID'))) {
    console.log('프로덕션 빌드를 만듭니다 (npm run build)…');
    await run('npm', ['run', 'build'], projectDir);
  }
  const fixturePath = [join(projectDir, 'scripts', 'fixtures', 'product-16.html'), join(HERE, 'fixtures', 'product-16.html')].find(existsSync);
  if (!fixturePath) throw new Error('scripts/fixtures/product-16.html 픽스처가 없습니다.');
  const fixture = await readFile(fixturePath, 'utf8');

  const supabasePort = await freePort();
  const supabaseUrl = `http://127.0.0.1:${supabasePort}`;
  const fakeSupabase = await startFakeSupabase(supabasePort);
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE,
    SUPABASE_SECRET_KEY: FAKE_SECRET,
    ADMIN_USER_IDS: ADMIN_ID,
    APP_BASE_URL: APP_ORIGIN,
    CAFE24_CLIENT_ID: 'smoke-client-id',
    CAFE24_CLIENT_SECRET: 'smoke-fake-client-secret',
    CAFE24_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
  };

  const next = await startNext(await freePort(), env);
  const { base } = next;
  const admin = { cookie: sessionCookie(supabaseUrl, ADMIN_ID) };
  const member = { cookie: sessionCookie(supabaseUrl, USER_ID) };
  let chrome;

  try {
    // 1) MVP 체험 화면
    await check('화면 / 200 · 지수 카드 3종(102.4·98.7·105.1)과 이번 주 챌린지', async () => {
      const res = await request(base, '/');
      return all(
        expectEq('status', res.status, 200),
        ['통밀 브레드 지수', '102.4', '98.7', '105.1', '이번 주 챌린지'].every((t) => res.text.includes(t)) || '필수 문구 누락',
      );
    });
    await check('화면 /predict 200 · 3종 지수와 마감 카운트다운', async () => {
      const res = await request(base, '/predict');
      return all(
        expectEq('status', res.status, 200),
        ['오늘의 ', 'UP/DOWN', '02:35:10', '크루아상 지수', '골든 브레드 지수'].every((t) => res.text.includes(t)) || '필수 문구 누락',
      );
    });
    await check('화면 /result 200 · 지수별 적중/미적중과 주간 정확도', async () => {
      const res = await request(base, '/result');
      const text = res.text.replace(/<!-- -->/g, '');
      return all(
        expectEq('status', res.status, 200),
        (text.match(/data-outcome="HIT"/g) ?? []).length === 2 || '적중 행이 2개가 아님',
        (text.match(/data-outcome="MISS"/g) ?? []).length === 1 || '미적중 행이 1개가 아님',
        ['3개 중 ', '66.7', '9개 중 6개 적중', '월', '금'].every((t) => text.includes(t)) || '정확도·진행 문구 누락',
      );
    });

    // 2) 관리 API 입구 (guardAdmin)
    await check('관리 API 401 LOGIN_REQUIRED (로그인 없음)', async () => {
      const res = await request(base, '/api/admin/cafe24/status');
      return all(expectEq('status', res.status, 401), expectEq('code', errorCode(res), 'LOGIN_REQUIRED'));
    });
    await check('관리 API 403 NOT_ADMIN (관리자 목록에 없는 사용자)', async () => {
      const res = await request(base, '/api/admin/cafe24/status', { headers: member });
      return all(expectEq('status', res.status, 403), expectEq('code', errorCode(res), 'NOT_ADMIN'));
    });
    await check('관리 API 403 BAD_ORIGIN (다른 출처의 쓰기 요청)', async () => {
      const res = await request(base, '/api/admin/cafe24/apply', {
        method: 'POST',
        headers: { ...admin, origin: 'https://evil.example', 'content-type': 'application/json' },
        body: '{"scenario":"up"}',
      });
      return all(expectEq('status', res.status, 403), expectEq('code', errorCode(res), 'BAD_ORIGIN'));
    });
    await check('관리 API 415 JSON_REQUIRED (JSON이 아닌 쓰기 요청)', async () => {
      const res = await request(base, '/api/admin/cafe24/apply', {
        method: 'POST',
        headers: { ...admin, origin: APP_ORIGIN, 'content-type': 'text/plain' },
        body: 'scenario=up',
      });
      return all(expectEq('status', res.status, 415), expectEq('code', errorCode(res), 'JSON_REQUIRED'));
    });
    await check('관리 API 400 SCENARIO_INVALID (preview·apply에 up/down 외 값)', async () => {
      for (const path of ['/api/admin/cafe24/preview', '/api/admin/cafe24/apply']) {
        const res = await request(base, path, {
          method: 'POST',
          headers: { ...admin, origin: APP_ORIGIN, 'content-type': 'application/json' },
          body: '{"scenario":"sideways"}',
        });
        const r = all(expectEq(`${path} status`, res.status, 400), expectEq(`${path} code`, errorCode(res), 'SCENARIO_INVALID'));
        if (r !== true) return r;
      }
      return true;
    });

    // 3) OAuth 시작·콜백
    await check('OAuth 시작 401 (로그인 없음)', async () => {
      const res = await request(base, '/api/cafe24/oauth/start');
      return all(expectEq('status', res.status, 401), expectEq('code', errorCode(res), 'LOGIN_REQUIRED'));
    });

    let state = '';
    await check('OAuth 시작 주소 (wildmental 인가 URL · client_id · redirect_uri · scope 4종)', async () => {
      const res = await request(base, '/api/cafe24/oauth/start', { headers: admin });
      if (res.status < 300 || res.status > 399) return `status: 리다이렉트가 아님 (${res.status})`;
      const loc = new URL(res.headers.location ?? '');
      state = loc.searchParams.get('state') ?? '';
      return all(
        expectEq('origin', loc.origin, 'https://wildmental.cafe24api.com'),
        expectEq('path', loc.pathname, '/api/v2/oauth/authorize'),
        expectEq('response_type', loc.searchParams.get('response_type'), 'code'),
        expectEq('client_id', loc.searchParams.get('client_id'), env.CAFE24_CLIENT_ID),
        expectEq('redirect_uri', loc.searchParams.get('redirect_uri'), `${APP_ORIGIN}/api/cafe24/oauth/callback`),
        expectEq('scope', loc.searchParams.get('scope'), SCOPES),
        state.length >= 40 || 'state 길이가 짧음',
        expectEq('cache-control', res.headers['cache-control'], 'no-store'),
      );
    });
    await check('OAuth state 쿠키 (state.관리자UUID · HttpOnly · Path · 5분 · SameSite=Lax)', async () => {
      const res = await request(base, '/api/cafe24/oauth/start', { headers: admin });
      const loc = new URL(res.headers.location ?? '');
      const cookie = (res.headers['set-cookie'] ?? []).find((c) => c.startsWith('cafe24_oauth_state=')) ?? '';
      const value = decodeURIComponent(cookie.split(';')[0].split('=').slice(1).join('='));
      const attrs = cookie.toLowerCase();
      state = loc.searchParams.get('state') ?? '';
      return all(
        cookie ? true : 'cafe24_oauth_state 쿠키 없음',
        expectEq('value', value, `${state}.${ADMIN_ID}`),
        attrs.includes('httponly') || 'HttpOnly 없음',
        attrs.includes('path=/api/cafe24/oauth') || 'Path 불일치',
        attrs.includes('max-age=300') || 'Max-Age=300 아님',
        attrs.includes('samesite=lax') || 'SameSite=Lax 아님',
      );
    });

    const callback = async (query, headers) => {
      const res = await request(base, `/api/cafe24/oauth/callback?${query}`, { headers });
      const loc = res.headers.location ? new URL(res.headers.location) : null;
      return { res, loc, result: loc?.searchParams.get('cafe24') ?? null };
    };
    const withState = { cookie: `${admin.cookie}; cafe24_oauth_state=${encodeURIComponent(`${state}.${ADMIN_ID}`)}` };

    await check('콜백 state_mismatch (쿠키와 다른 state)', async () => {
      const { res, loc, result } = await callback('state=forged-state&code=smoke-code', withState);
      return all(
        res.status >= 300 && res.status < 400 ? true : `status ${res.status}`,
        expectEq('redirect', loc && `${loc.origin}${loc.pathname}`, `${APP_ORIGIN}/admin/cafe24`),
        expectEq('cafe24', result, 'state_mismatch'),
      );
    });
    await check('콜백 state_mismatch (다른 관리자에게 발급된 state)', async () => {
      const other = { cookie: `${admin.cookie}; cafe24_oauth_state=${encodeURIComponent(`${state}.${USER_ID}`)}` };
      const { result } = await callback(`state=${encodeURIComponent(state)}&code=smoke-code`, other);
      return expectEq('cafe24', result, 'state_mismatch');
    });
    await check('콜백 denied_access_denied (동의 화면에서 취소) · state 쿠키 삭제', async () => {
      const { res, result } = await callback(`state=${encodeURIComponent(state)}&error=access_denied`, withState);
      const cleared = (res.headers['set-cookie'] ?? []).some((c) => /^cafe24_oauth_state=;/.test(c) && /max-age=0/i.test(c));
      return all(expectEq('cafe24', result, 'denied_access_denied'), cleared || 'state 쿠키가 지워지지 않음');
    });
    await check('콜백 login_required (로그인 없음)', async () => {
      const { result } = await callback(`state=${encodeURIComponent(state)}&code=smoke-code`, {});
      return expectEq('cafe24', result, 'login_required');
    });

    // 4) 공개 위젯 API · 스크립트
    await check('공개 위젯 API 200 · CORS 허용(wildmental) · 응답 JSON 모양', async () => {
      const res = await request(base, '/api/public/bread-widget?product_no=16', { headers: { origin: STOREFRONT } });
      const j = res.json ?? {};
      return all(
        expectEq('status', res.status, 200),
        expectEq('access-control-allow-origin', res.headers['access-control-allow-origin'], STOREFRONT),
        expectEq('access-control-allow-methods', res.headers['access-control-allow-methods'], 'GET'),
        (res.headers.vary ?? '').includes('Origin') || 'Vary: Origin 없음',
        expectEq('cache-control', res.headers['cache-control'], 'public, max-age=60'),
        expectEq('keys', Object.keys(j).sort().join(','), 'changePct,ctaUrl,demo,direction,indexName,market,productNo,value'),
        expectEq('productNo', j.productNo, 16),
        expectEq('indexName', j.indexName, '통밀 브레드 지수'),
        expectEq('value', j.value, 102.4),
        expectEq('direction', j.direction, 'UP'),
        expectEq('changePct', j.changePct, 1.2),
        String(j.ctaUrl).startsWith(`${APP_ORIGIN}/?utm_source=cafe24&utm_medium=product_widget`) || `ctaUrl: ${j.ctaUrl}`,
      );
    });
    await check('공개 위젯 API CORS 차단 (허용 목록 밖 출처)', async () => {
      const res = await request(base, '/api/public/bread-widget?product_no=16', { headers: { origin: 'https://evil.example' } });
      return all(expectEq('status', res.status, 200), expectEq('access-control-allow-origin', res.headers['access-control-allow-origin'], undefined));
    });
    await check('공개 위젯 API OPTIONS 204 · CORS 허용', async () => {
      const res = await request(base, '/api/public/bread-widget?product_no=16', { method: 'OPTIONS', headers: { origin: STOREFRONT } });
      return all(expectEq('status', res.status, 204), expectEq('access-control-allow-origin', res.headers['access-control-allow-origin'], STOREFRONT));
    });
    await check('공개 위젯 API 404 NOT_REGISTERED (상품 17 · 잘못된 번호)', async () => {
      for (const q of ['17', '16abc', '']) {
        const res = await request(base, `/api/public/bread-widget?product_no=${q}`, { headers: { origin: STOREFRONT } });
        const r = all(expectEq(`[${q}] status`, res.status, 404), expectEq(`[${q}] error`, res.json?.error, 'NOT_REGISTERED'));
        if (r !== true) return r;
      }
      return true;
    });
    await check('위젯 스크립트 /widgets/makji-bread.js 200 · JavaScript', async () => {
      const res = await request(base, '/widgets/makji-bread.js');
      return all(
        expectEq('status', res.status, 200),
        /javascript/.test(res.headers['content-type'] ?? '') || `content-type: ${res.headers['content-type']}`,
        res.text.includes('MAKJIBREAD_FRONT_WIDGETS_MAKJI_BREAD') || '네임스페이스 없음',
      );
    });

    // 5) 관리 화면
    await check('/admin/cafe24 비관리자 → UUID와 ADMIN_USER_IDS 안내', async () => {
      const res = await request(base, '/admin/cafe24', { headers: member });
      return all(
        expectEq('status', res.status, 200),
        res.text.includes(USER_ID) || 'UUID 표시 없음',
        res.text.includes('ADMIN_USER_IDS') || 'ADMIN_USER_IDS 안내 없음',
      );
    });
    await check('/admin/cafe24 로그인 없음 → /login 이동', async () => {
      const res = await request(base, '/admin/cafe24');
      return all(res.status >= 300 && res.status < 400 ? true : `status ${res.status}`, (res.headers.location ?? '').endsWith('/login') || `location: ${res.headers.location}`);
    });

    // 5-1) 준비 상태 점검 화면 · 설치 스크립트 (이 기능이 있는 프로젝트만 점검)
    const hasSetupPage = existsSync(join(projectDir, 'src', 'app', 'admin', 'setup', 'page.tsx'));
    const hasDbSetup = existsSync(join(projectDir, 'scripts', 'db-setup.mjs'));
    if (!hasSetupPage) console.log('SKIP  /admin/setup 점검 — 이 프로젝트에 준비 상태 점검 화면이 없음(점수에 넣지 않음)');
    if (hasSetupPage) {
      const checksOf = (html) =>
        Object.fromEntries([...html.matchAll(/data-check="([^"]+)" data-status="([a-z]+)"/g)].map((m) => [m[1], m[2]]));
      await check('/admin/setup 관리자 → 환경변수·DB·관리자·카페24 점검, 실패 0', async () => {
        const res = await request(base, '/admin/setup', { headers: admin });
        const got = checksOf(res.text);
        const fails = Object.entries(got).filter(([, v]) => v === 'fail').map(([k]) => k);
        const need = ['env.NEXT_PUBLIC_SUPABASE_URL', 'env.SUPABASE_SECRET_KEY', 'env.CAFE24_TOKEN_ENCRYPTION_KEY', 'db.tables', 'db.lock_function', 'db.anon_blocked', 'admin.exists', 'cafe24.connection'];
        return all(
          expectEq('status', res.status, 200),
          need.every((id) => id in got) || `항목 누락: ${need.filter((id) => !(id in got)).join(', ')}`,
          ['db.tables', 'db.lock_function', 'db.anon_blocked', 'admin.exists'].every((id) => got[id] === 'ok') || `ok가 아님: ${JSON.stringify(got)}`,
          fails.length === 0 || `fail: ${fails.join(', ')}`,
        );
      });
      await check('/admin/setup 로그인 없음 → /login · 비관리자 → 권한 없음', async () => {
        const anon = await request(base, '/admin/setup');
        const other = await request(base, '/admin/setup', { headers: member });
        return all(
          anon.status >= 300 && anon.status < 400 ? true : `로그인 없음 status ${anon.status}`,
          (anon.headers.location ?? '').endsWith('/login') || `location: ${anon.headers.location}`,
          other.text.includes('관리자 권한이 없습니다') || '비관리자 안내 없음',
          !/data-check=/.test(other.text) || '비관리자에게 점검 항목이 보임',
        );
      });
      await check('/admin/setup 응답에 비밀값 없음', async () => {
        const res = await request(base, '/admin/setup', { headers: admin });
        const leaked = [FAKE_SECRET, env.CAFE24_CLIENT_SECRET, env.CAFE24_TOKEN_ENCRYPTION_KEY, FAKE_PUBLISHABLE].filter((v) => res.text.includes(v));
        return leaked.length === 0 || `노출: ${leaked.length}개 값`;
      });
    }
    if (hasDbSetup) {
      await check('npm run db:setup (PGlite · 가짜 Auth) → 마이그레이션·스키마 확인·관리자 생성·ADMIN_USER_IDS 기록', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'makji-dbsetup-'));
        const envFile = join(dir, 'env.local');
        await writeFile(
          envFile,
          [`SUPABASE_DB_URL=pglite://memory`, `NEXT_PUBLIC_SUPABASE_URL=${supabaseUrl}`, `SUPABASE_SECRET_KEY=${FAKE_SECRET}`, 'SETUP_ADMIN_EMAIL=new-admin@smoke.test', 'ADMIN_USER_IDS=pending', ''].join('\n'),
        );
        const runSetup = (args) =>
          new Promise((ok) => {
            const child = spawn(process.execPath, [join(projectDir, 'scripts', 'db-setup.mjs'), '--env-file', envFile, ...args], {
              cwd: projectDir,
              env: { PATH: process.env.PATH, HOME: process.env.HOME },
              stdio: ['ignore', 'pipe', 'pipe'],
            });
            let out = '';
            child.stdout.on('data', (d) => (out += d));
            child.stderr.on('data', (d) => (out += d));
            child.on('exit', (code) => ok({ code, out }));
          });
        try {
          const first = await runSetup(['--generate-password']);
          const created = authUsers.find((u) => u.email === 'new-admin@smoke.test');
          const written = (await readFile(envFile, 'utf8')).match(/^ADMIN_USER_IDS=(.*)$/m)?.[1];
          const second = await runSetup(['--check', '--skip-migrations']);
          return all(
            expectEq('exit', first.code, 0),
            /OK +마이그레이션 0001_cafe24_lab\.sql — 적용함/.test(first.out) || '마이그레이션 적용 줄 없음',
            /OK +브라우저 키\(anon\) 접근 차단/.test(first.out) || 'anon 차단 확인 줄 없음',
            /SETUP: ok=\d+ warn=\d+ fail=0/.test(first.out) || `요약: ${first.out.split('\n').filter((l) => l.startsWith('FAIL') || l.startsWith('SETUP')).join(' | ')}`,
            created ? true : '관리자 계정이 만들어지지 않음',
            expectEq('ADMIN_USER_IDS', written, created?.id),
            authUsers.filter((u) => u.email === 'new-admin@smoke.test').length === 1 || '관리자 계정이 중복 생성됨',
            /이미 있음 — 바꾸지 않음/.test(second.out) || '두 번째 실행에서 기존 계정 인식 실패',
            !first.out.includes(FAKE_SECRET) && !second.out.includes(FAKE_SECRET) || 'Secret key가 출력에 나옴',
          );
        } finally {
          await rm(dir, { recursive: true, force: true });
        }
      });
    }

    // 6) 실제 상품 16 공개 페이지 사본 + 위젯 (헤드리스 Chrome)
    chrome = await launchChrome();
    const page = await chrome.newPage();
    const appRequests = [];
    const pageErrors = [];
    const widgetTag = `<script src="${APP_ORIGIN}/widgets/makji-bread.js"></script>`;
    const fixtureWithWidget = fixture.includes('</body>') ? fixture.replace('</body>', `${widgetTag}</body>`) : fixture + widgetTag;

    page.on('Fetch.requestPaused', async ({ requestId, request: req, resourceType }) => {
      try {
        const url = new URL(req.url);
        if (url.origin === STOREFRONT && resourceType === 'Document' && url.pathname.startsWith('/product/')) {
          // 카페24 Scripttags가 설치한 것처럼 페이지 끝에 위젯 스크립트를 붙여 돌려준다.
          await page.send('Fetch.fulfillRequest', {
            requestId,
            responseCode: 200,
            responseHeaders: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }],
            body: Buffer.from(fixtureWithWidget).toString('base64'),
          });
        } else if (url.origin === APP_ORIGIN) {
          appRequests.push({ method: req.method, path: url.pathname + url.search });
          const headers = Object.fromEntries(Object.entries(req.headers).filter(([k]) => !/^(host|connection)$/i.test(k)));
          const res = await request(base, url.pathname + url.search, { method: req.method, headers });
          const responseHeaders = [];
          for (const [name, value] of Object.entries(res.headers)) {
            if (/^(connection|keep-alive|transfer-encoding)$/i.test(name)) continue;
            for (const v of [].concat(value)) responseHeaders.push({ name, value: String(v) });
          }
          await page.send('Fetch.fulfillRequest', {
            requestId,
            responseCode: res.status,
            responseHeaders,
            body: res.raw.toString('base64'),
          });
        } else {
          // 픽스처 속 카페24 CDN·외부 스크립트는 네트워크로 나가지 않게 막는다.
          await page.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' });
        }
      } catch (e) {
        pageErrors.push(`intercept: ${e.message}`);
        await page.send('Fetch.failRequest', { requestId, errorReason: 'Failed' }).catch(() => {});
      }
    });
    await page.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    page.on('Runtime.exceptionThrown', (p) => {
      const d = p.exceptionDetails;
      if ((d?.url ?? '').includes('makji-bread.js')) pageErrors.push(d.exception?.description ?? d.text);
    });
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

    const readWidget = () =>
      page.evaluate(`(() => {
        const host = document.getElementById('makji-bread-widget');
        const root = host && host.shadowRoot;
        if (!root) return null;
        const card = root.querySelector('.card');
        const box = card ? card.getBoundingClientRect() : { width: 0, height: 0 };
        return {
          name: root.querySelector('.name')?.textContent,
          num: root.querySelector('.num')?.textContent,
          chg: root.querySelector('.chg')?.textContent,
          cta: root.querySelector('.cta')?.href ?? null,
          visible: box.width > 0 && box.height > 0,
          pathRole: document.querySelector('meta[name="path_role"]')?.content ?? null,
        };
      })()`);

    await check('상품 16 공개 페이지 사본에서 위젯이 상품번호 16을 찾아 카드 표시 (Chrome)', async () => {
      const loaded = page.waitFor('Page.loadEventFired', 20000);
      await page.send('Page.navigate', { url: `${STOREFRONT}${PRODUCT_PATH}` });
      await loaded;
      const widget = await waitUntil(readWidget, { timeoutMs: 10000 });
      if (!widget) return `위젯이 표시되지 않음 (앱 요청: ${JSON.stringify(appRequests)}, 오류: ${pageErrors.join(' / ')})`;
      const cta = widget.cta ? new URL(widget.cta) : null;
      return all(
        expectEq('path_role', widget.pathRole, 'PRODUCT_DETAIL'),
        appRequests.some((r) => r.path === '/api/public/bread-widget?product_no=16') || `product_no=16 요청 없음: ${JSON.stringify(appRequests)}`,
        expectEq('name', widget.name, '통밀 브레드 지수'),
        expectEq('value', widget.num, '102.4'),
        expectEq('change', widget.chg, '▲1.2%'),
        widget.visible || '카드 크기가 0',
        expectEq('cta utm_content', cta?.searchParams.get('utm_content'), 'product_16'),
        pageErrors.length === 0 || `위젯 오류: ${pageErrors.join(' / ')}`,
      );
    });

    await check('등록되지 않은 상품 경로(17)에서는 위젯을 표시하지 않음 (Chrome)', async () => {
      appRequests.length = 0;
      const loaded = page.waitFor('Page.loadEventFired', 20000);
      await page.send('Page.navigate', { url: `${STOREFRONT}${PRODUCT_PATH.replace('/16/', '/17/')}` });
      await loaded;
      const asked = await waitUntil(async () => appRequests.some((r) => r.path === '/api/public/bread-widget?product_no=17'), { timeoutMs: 8000 });
      await sleep(1000);
      const widget = await readWidget();
      return all(asked ? true : `product_no=17 요청 없음: ${JSON.stringify(appRequests)}`, widget === null || `위젯이 표시됨: ${JSON.stringify(widget)}`);
    });
  } finally {
    await chrome?.close();
    next.child.kill();
    await Promise.race([new Promise((ok) => next.child.once('exit', ok)), sleep(5000)]);
    await new Promise((ok) => fakeSupabase.close(ok));
  }
}

try {
  await main();
} catch (e) {
  results.push({ name: 'smoke 준비', ok: false });
  console.log(`FAIL  smoke 준비 — ${e instanceof Error ? e.message : String(e)}`);
}
const passed = results.filter((r) => r.ok).length;
console.log(`SMOKE: ${passed}/${results.length} PASS`);
process.exit(passed === results.length && results.length > 0 ? 0 : 1);
