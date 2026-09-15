// 배포 준비 상태 점검 규칙. 외부 모듈을 import하지 않는 순수 함수만 둔다.
// 웹 점검 화면(/admin/setup)과 설치 스크립트(scripts/db-setup.mjs)가 함께 쓴다.
// 결과 문구에는 환경변수 값을 넣지 않는다(공개 가능한 Redirect URI 안내만 예외).

export type EnvMap = Record<string, string | undefined>;
export type CheckStatus = 'ok' | 'warn' | 'fail' | 'skip';
export type CheckItem = {
  id: string;
  group: 'env' | 'db' | 'admin' | 'cafe24';
  label: string;
  status: CheckStatus;
  detail: string;
  fix?: string;
};

export const REQUIRED_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'ADMIN_USER_IDS',
  'APP_BASE_URL',
  'CAFE24_CLIENT_ID',
  'CAFE24_CLIENT_SECRET',
  'CAFE24_TOKEN_ENCRYPTION_KEY',
] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const value = (env: EnvMap, name: string) => (env[name] ?? '').trim();

export function missingEnv(env: EnvMap, names: readonly string[]): string[] {
  return names.filter((name) => value(env, name) === '');
}

export function parseAdminIds(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

function parseUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

const isLocalHost = (host: string) => host === 'localhost' || host === '127.0.0.1';
const looksLikeJwt = (key: string) => /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key);

function base64Bytes(raw: string): number | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw) || raw.length % 4 !== 0) return null;
  try {
    return atob(raw).length;
  } catch {
    return null;
  }
}

// 설정 전(관리자 UUID가 없을 때)에는 로그인 없이 점검 화면을 보여 주고, 설정 뒤에는 관리자만 본다.
export function setupAccessMode(env: EnvMap): 'bootstrap' | 'admin' {
  const ids = parseAdminIds(env.ADMIN_USER_IDS);
  const supabaseReady = missingEnv(env, ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']).length === 0;
  return supabaseReady && ids.length > 0 && ids.every((id) => UUID.test(id)) ? 'admin' : 'bootstrap';
}

export function evaluateEnv(
  env: EnvMap,
  options: { requestOrigin?: string; runtime?: 'server' | 'local' } = {},
): CheckItem[] {
  const items: CheckItem[] = [];
  const add = (item: Omit<CheckItem, 'group'> & { group?: CheckItem['group'] }) =>
    items.push({ group: 'env', ...item });

  // Supabase URL
  {
    const raw = value(env, 'NEXT_PUBLIC_SUPABASE_URL');
    const url = parseUrl(raw);
    const id = 'env.NEXT_PUBLIC_SUPABASE_URL';
    const label = 'NEXT_PUBLIC_SUPABASE_URL';
    if (!raw) add({ id, label, status: 'fail', detail: '비어 있음', fix: 'Supabase Connect 화면의 Project URL을 넣고 Redeploy (가이드 4-1)' });
    else if (!url || !(url.protocol === 'https:' || (url.protocol === 'http:' && isLocalHost(url.hostname)))) add({ id, label, status: 'fail', detail: 'https 주소 형식이 아님(http는 로컬 Supabase만 허용)', fix: 'https://영문.supabase.co 형식으로 넣기' });
    else if (url.protocol === 'http:') add({ id, label, status: 'ok', detail: '로컬 Supabase 주소' });
    else if (!url.hostname.endsWith('.supabase.co')) add({ id, label, status: 'warn', detail: 'supabase.co 주소가 아님(사용자 도메인이면 무시)' });
    else add({ id, label, status: 'ok', detail: '형식 확인' });
  }

  // Publishable key
  {
    const raw = value(env, 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
    const id = 'env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY';
    const label = 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY';
    if (!raw) add({ id, label, status: 'fail', detail: '비어 있음', fix: 'Supabase API Keys의 Publishable key를 넣고 Redeploy (가이드 4-1)' });
    else if (raw.startsWith('sb_secret_')) add({ id, label, status: 'fail', detail: 'Secret key가 들어 있음 — 브라우저 코드에 노출되는 자리', fix: 'Publishable key로 바꾸고, 노출된 Secret key는 교체 (6쪽 비밀값 관리)' });
    else if (raw.startsWith('sb_publishable_') || looksLikeJwt(raw)) add({ id, label, status: 'ok', detail: '형식 확인' });
    else add({ id, label, status: 'warn', detail: '예상한 키 형식(sb_publishable_ 또는 JWT)이 아님' });
  }

  // Secret key
  {
    const raw = value(env, 'SUPABASE_SECRET_KEY');
    const id = 'env.SUPABASE_SECRET_KEY';
    const label = 'SUPABASE_SECRET_KEY';
    if (!raw) add({ id, label, status: 'fail', detail: '비어 있음', fix: 'Supabase API Keys의 Secret key를 Vercel(Production)에 넣고 Redeploy (가이드 4-1 · 5-2)' });
    else if (raw.startsWith('sb_publishable_') || raw === value(env, 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')) add({ id, label, status: 'fail', detail: 'Publishable key가 들어 있음', fix: 'Secret key로 바꾸기' });
    else if (raw.startsWith('sb_secret_') || looksLikeJwt(raw)) add({ id, label, status: 'ok', detail: '형식 확인' });
    else add({ id, label, status: 'warn', detail: '예상한 키 형식(sb_secret_ 또는 JWT)이 아님' });
  }

  // 관리자 UUID
  {
    const raw = value(env, 'ADMIN_USER_IDS');
    const ids = parseAdminIds(raw);
    const id = 'env.ADMIN_USER_IDS';
    const label = 'ADMIN_USER_IDS';
    if (!raw) add({ id, label, status: 'fail', detail: '비어 있음', fix: 'npm run db:setup이 알려 준 UUID(또는 /admin/cafe24 권한 없음 화면의 UUID)를 넣고 Redeploy (가이드 5-3)' });
    else if (raw.toLowerCase() === 'pending') add({ id, label, status: 'fail', detail: '아직 pending', fix: '관리자 UUID로 바꾸고 Redeploy (가이드 5-3)' });
    else if (ids.length === 0 || !ids.every((x) => UUID.test(x))) add({ id, label, status: 'fail', detail: 'UUID 형식이 아닌 값이 있음', fix: '쉼표로 구분한 UUID만 넣기' });
    else add({ id, label, status: 'ok', detail: `UUID ${ids.length}개` });
  }

  // 앱 주소
  const appRaw = value(env, 'APP_BASE_URL');
  const appUrl = parseUrl(appRaw);
  {
    const id = 'env.APP_BASE_URL';
    const label = 'APP_BASE_URL';
    const trimmed = appRaw.replace(/\/+$/, '');
    if (!appRaw) add({ id, label, status: 'fail', detail: '비어 있음', fix: 'Vercel Production 주소를 끝에 / 없이 넣고 Redeploy (가이드 5-3)' });
    else if (!appUrl || (appUrl.protocol !== 'https:' && !(appUrl.protocol === 'http:' && isLocalHost(appUrl.hostname)))) add({ id, label, status: 'fail', detail: 'https 주소가 아님(http는 localhost만 허용)', fix: 'https://…vercel.app 형식으로 넣기' });
    else if ((appUrl.pathname !== '/' && appUrl.pathname !== '') || appUrl.search || appUrl.hash) add({ id, label, status: 'fail', detail: '경로·쿼리가 붙어 있음', fix: '도메인까지만 넣기' });
    else if (options.requestOrigin && new URL(trimmed).origin !== options.requestOrigin) add({ id, label, status: 'warn', detail: '지금 접속한 주소와 다름 — 관리 화면 쓰기 요청이 BAD_ORIGIN으로 막힘', fix: 'Production 주소로 접속하거나 APP_BASE_URL을 고치고 Redeploy' });
    else add({ id, label, status: 'ok', detail: '형식 확인' });
  }

  // 카페24 Client 값 (6-4 전 단계에서는 비어 있는 것이 정상)
  for (const name of ['CAFE24_CLIENT_ID', 'CAFE24_CLIENT_SECRET'] as const) {
    const raw = value(env, name);
    add(
      raw
        ? { id: `env.${name}`, label: name, status: 'ok', detail: '입력됨' }
        : { id: `env.${name}`, label: name, status: 'warn', detail: '비어 있음 — 카페24 앱 등록 전이면 정상', fix: '개발자센터 인증정보 값을 Vercel(Production)에 넣고 Redeploy (가이드 6-4)' },
    );
  }

  // 토큰 암호화 키
  {
    const raw = value(env, 'CAFE24_TOKEN_ENCRYPTION_KEY');
    const id = 'env.CAFE24_TOKEN_ENCRYPTION_KEY';
    const label = 'CAFE24_TOKEN_ENCRYPTION_KEY';
    if (!raw) add({ id, label, status: 'fail', detail: '비어 있음', fix: '내 터미널에서 32바이트 키를 만들어 Vercel(Production)에 넣기 (가이드 4-4)' });
    else if (base64Bytes(raw) !== 32) add({ id, label, status: 'fail', detail: '32바이트 base64(44글자)가 아님', fix: '가이드 4-4 명령으로 다시 만들기 — 바꾸면 카페24 연결을 다시 해야 함' });
    else add({ id, label, status: 'ok', detail: '32바이트 확인' });
  }

  // DB 접속 문자열은 내 컴퓨터(.env.local)에서만 쓴다
  if (options.runtime === 'server' && value(env, 'SUPABASE_DB_URL')) {
    const local = appUrl ? isLocalHost(appUrl.hostname) : false;
    if (!local) {
      add({ id: 'env.SUPABASE_DB_URL', label: 'SUPABASE_DB_URL', status: 'warn', detail: '배포 서버 환경변수에 DB 접속 문자열(비밀번호 포함)이 있음', fix: 'Vercel 환경변수에서 지우고 Redeploy. 설치 스크립트는 내 컴퓨터에서만 실행' });
    }
  }

  // Redirect URI 안내 (공개 값)
  if (appUrl && appRaw) {
    const origin = appRaw.replace(/\/+$/, '');
    items.push({ id: 'cafe24.redirect_uri', group: 'cafe24', label: 'Redirect URI', status: 'ok', detail: `카페24 앱에 등록할 값: ${origin}/api/cafe24/oauth/callback` });
  }

  return items;
}

export function summarize(items: readonly CheckItem[]) {
  const count = (s: CheckStatus) => items.filter((i) => i.status === s).length;
  return { ok: count('ok'), warn: count('warn'), fail: count('fail'), skip: count('skip') };
}
