import 'server-only';
import { env } from '@/lib/env';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { LAB } from './lab-config';
import { requestToken, toStoredToken, type Cafe24TokenResponse, type StoredToken } from './oauth';
import { loadEncryptionKey, openJson, sealJson } from './token-crypto';

const REFRESH_BEFORE_MS = 5 * 60_000; // 만료 5분 전이면 미리 갱신

export class Cafe24NotConnectedError extends Error {
  constructor(public readonly reason: 'NO_TOKEN' | 'REFRESH_EXPIRED') {
    super(`CAFE24_NOT_CONNECTED:${reason}`);
  }
}

const tokenKey = () => loadEncryptionKey(env.cafe24TokenKey);
const connections = () => supabaseAdmin().from('cafe24_connections');
const isFresh = (t: StoredToken) => Date.parse(t.accessExpiresAt) - Date.now() > REFRESH_BEFORE_MS;

async function readToken(): Promise<StoredToken | null> {
  const { data, error } = await connections()
    .select('token_cipher')
    .eq('mall_id', LAB.mallId)
    .maybeSingle<{ token_cipher: string }>();
  if (error) throw new Error(`DB_READ_FAILED:${error.code}`);
  return data ? openJson<StoredToken>(data.token_cipher, tokenKey()) : null;
}

async function releaseRefreshLock() {
  await connections().update({ refresh_lock_until: null }).eq('mall_id', LAB.mallId);
}

export async function saveTokenResponse(res: Cafe24TokenResponse): Promise<StoredToken> {
  const token = toStoredToken(res, new Date());
  const { error } = await connections().upsert({
    mall_id: LAB.mallId,
    token_cipher: sealJson(token, tokenKey()),
    access_expires_at: token.accessExpiresAt,
    refresh_expires_at: token.refreshExpiresAt,
    scopes: token.scopes,
    refresh_lock_until: null,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`DB_SAVE_FAILED:${error.code}`);
  return token;
}

// 화면에 보여줄 연결 상태. 토큰 값은 절대 반환하지 않는다.
export async function getConnectionStatus() {
  const { data, error } = await connections()
    .select('access_expires_at, refresh_expires_at, scopes, updated_at')
    .eq('mall_id', LAB.mallId)
    .maybeSingle<{
      access_expires_at: string;
      refresh_expires_at: string;
      scopes: string[];
      updated_at: string;
    }>();
  if (error) throw new Error(`DB_READ_FAILED:${error.code}`);
  if (!data) return { mallId: LAB.mallId, connected: false as const };
  return {
    mallId: LAB.mallId,
    connected: Date.parse(data.refresh_expires_at) > Date.now(),
    accessExpiresAt: data.access_expires_at,
    refreshExpiresAt: data.refresh_expires_at,
    scopes: data.scopes,
    updatedAt: data.updated_at,
  };
}

// 유효한 access token을 돌려준다. 필요하면 refresh token으로 갱신한다.
// refresh token은 한 번 쓰면 폐기되므로, 여러 서버 인스턴스가 동시에 갱신하지 않도록 DB 잠금을 쓴다.
export async function getAccessToken(options: { rejectedToken?: string } = {}): Promise<string> {
  const usable = (t: StoredToken) => isFresh(t) && t.accessToken !== options.rejectedToken;

  for (let attempt = 0; attempt < 6; attempt++) {
    const token = await readToken();
    if (!token) throw new Cafe24NotConnectedError('NO_TOKEN');
    if (usable(token)) return token.accessToken;
    if (Date.parse(token.refreshExpiresAt) <= Date.now()) {
      throw new Cafe24NotConnectedError('REFRESH_EXPIRED');
    }

    const { data: locked, error } = await supabaseAdmin().rpc('cafe24_try_refresh_lock', {
      p_mall_id: LAB.mallId,
      p_seconds: 30,
    });
    if (error) throw new Error(`DB_LOCK_FAILED:${error.code}`);

    if (locked === true) {
      // 잠금을 얻는 사이 다른 요청이 이미 갱신했을 수 있으니 다시 읽는다.
      const latest = await readToken();
      if (latest && usable(latest)) {
        await releaseRefreshLock();
        return latest.accessToken;
      }
      try {
        const res = await requestToken({
          mallId: LAB.mallId,
          clientId: env.cafe24ClientId,
          clientSecret: env.cafe24ClientSecret,
          body: { grant_type: 'refresh_token', refresh_token: (latest ?? token).refreshToken },
        });
        return (await saveTokenResponse(res)).accessToken;
      } catch (e) {
        await releaseRefreshLock();
        throw e;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1000)); // 다른 요청이 갱신 중
  }
  throw new Error('CAFE24_REFRESH_BUSY');
}
