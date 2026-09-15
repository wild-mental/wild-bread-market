import { describe, expect, it } from 'vitest';
import {
  evaluateEnv,
  missingEnv,
  parseAdminIds,
  setupAccessMode,
  summarize,
  type EnvMap,
} from '@/lib/setup/env-rules';

const ADMIN = '11111111-1111-4111-8111-111111111111';
const KEY32 = Buffer.alloc(32, 7).toString('base64');

const complete: EnvMap = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://abcd.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
  SUPABASE_SECRET_KEY: 'sb_secret_example',
  ADMIN_USER_IDS: ADMIN,
  APP_BASE_URL: 'https://wild-bread-market.vercel.app',
  CAFE24_CLIENT_ID: 'client-id',
  CAFE24_CLIENT_SECRET: 'client-secret',
  CAFE24_TOKEN_ENCRYPTION_KEY: KEY32,
};

const status = (env: EnvMap, id: string, opts = {}) => evaluateEnv(env, opts).find((i) => i.id === id)?.status;

describe('환경변수 점검 규칙', () => {
  it('모든 값이 맞으면 실패·경고가 없다', () => {
    const items = evaluateEnv(complete, { requestOrigin: 'https://wild-bread-market.vercel.app', runtime: 'server' });
    expect(summarize(items)).toMatchObject({ fail: 0, warn: 0 });
  });

  it('비어 있으면 fail, 카페24 Client 값만 비어 있으면 warn(6-4 전 단계)', () => {
    const env = { ...complete, SUPABASE_SECRET_KEY: '  ', CAFE24_CLIENT_ID: '', CAFE24_CLIENT_SECRET: undefined };
    expect(status(env, 'env.SUPABASE_SECRET_KEY')).toBe('fail');
    expect(status(env, 'env.CAFE24_CLIENT_ID')).toBe('warn');
    expect(status(env, 'env.CAFE24_CLIENT_SECRET')).toBe('warn');
  });

  it('Supabase URL: http는 로컬 Supabase(localhost·127.0.0.1)만 허용', () => {
    expect(status({ ...complete, NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' }, 'env.NEXT_PUBLIC_SUPABASE_URL')).toBe('ok');
    expect(status({ ...complete, NEXT_PUBLIC_SUPABASE_URL: 'http://abcd.supabase.co' }, 'env.NEXT_PUBLIC_SUPABASE_URL')).toBe('fail');
  });

  it('키 자리를 서로 바꿔 넣으면 fail', () => {
    const env = { ...complete, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_example', SUPABASE_SECRET_KEY: 'sb_publishable_example' };
    expect(status(env, 'env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')).toBe('fail');
    expect(status(env, 'env.SUPABASE_SECRET_KEY')).toBe('fail');
  });

  it('ADMIN_USER_IDS pending·UUID 형식 오류는 fail', () => {
    expect(status({ ...complete, ADMIN_USER_IDS: 'pending' }, 'env.ADMIN_USER_IDS')).toBe('fail');
    expect(status({ ...complete, ADMIN_USER_IDS: `${ADMIN}, not-a-uuid` }, 'env.ADMIN_USER_IDS')).toBe('fail');
    expect(parseAdminIds(` ${ADMIN} ,, `)).toEqual([ADMIN]);
  });

  it('APP_BASE_URL: 경로가 있거나 localhost가 아닌 http면 fail, 접속 주소와 다르면 warn', () => {
    expect(status({ ...complete, APP_BASE_URL: 'https://x.vercel.app/admin' }, 'env.APP_BASE_URL')).toBe('fail');
    expect(status({ ...complete, APP_BASE_URL: 'http://x.vercel.app' }, 'env.APP_BASE_URL')).toBe('fail');
    expect(status({ ...complete, APP_BASE_URL: 'http://localhost:3000' }, 'env.APP_BASE_URL', { requestOrigin: 'http://localhost:3000' })).toBe('ok');
    expect(status(complete, 'env.APP_BASE_URL', { requestOrigin: 'https://other.vercel.app' })).toBe('warn');
  });

  it('암호화 키는 32바이트 base64여야 한다', () => {
    expect(status({ ...complete, CAFE24_TOKEN_ENCRYPTION_KEY: Buffer.alloc(16).toString('base64') }, 'env.CAFE24_TOKEN_ENCRYPTION_KEY')).toBe('fail');
    expect(status({ ...complete, CAFE24_TOKEN_ENCRYPTION_KEY: 'not base64 at all!!' }, 'env.CAFE24_TOKEN_ENCRYPTION_KEY')).toBe('fail');
  });

  it('배포 서버 환경에 SUPABASE_DB_URL이 있으면 warn, 로컬 점검에서는 문제 삼지 않는다', () => {
    const env = { ...complete, SUPABASE_DB_URL: 'postgresql://x' };
    expect(status(env, 'env.SUPABASE_DB_URL', { runtime: 'server' })).toBe('warn');
    expect(status(env, 'env.SUPABASE_DB_URL', { runtime: 'local' })).toBeUndefined();
  });

  it('점검 결과 문구에 값(비밀값 포함)을 넣지 않는다', () => {
    const text = JSON.stringify(evaluateEnv(complete, { requestOrigin: 'https://other.example', runtime: 'server' }));
    for (const secret of ['sb_secret_example', 'client-secret', KEY32, 'sb_publishable_example']) {
      expect(text).not.toContain(secret);
    }
  });

  it('Redirect URI 안내는 APP_BASE_URL에서 만든다', () => {
    const item = evaluateEnv(complete).find((i) => i.id === 'cafe24.redirect_uri');
    expect(item?.detail).toContain('https://wild-bread-market.vercel.app/api/cafe24/oauth/callback');
  });
});

describe('점검 화면 접근 방식', () => {
  it('관리자 UUID가 설정되기 전에는 로그인 없이(bootstrap), 설정 뒤에는 관리자만', () => {
    expect(setupAccessMode({})).toBe('bootstrap');
    expect(setupAccessMode({ ...complete, ADMIN_USER_IDS: 'pending' })).toBe('bootstrap');
    expect(setupAccessMode({ ...complete, NEXT_PUBLIC_SUPABASE_URL: '' })).toBe('bootstrap');
    expect(setupAccessMode(complete)).toBe('admin');
  });

  it('missingEnv는 비었거나 공백인 이름만 돌려준다', () => {
    expect(missingEnv({ A: 'x', B: ' ', C: undefined }, ['A', 'B', 'C'])).toEqual(['B', 'C']);
  });
});
