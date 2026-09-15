// 카페24 OAuth: 인가 URL 만들기, 토큰 발급·재발급 요청.
export type Cafe24TokenResponse = {
  access_token: string;
  expires_at: string;
  refresh_token: string;
  refresh_token_expires_at: string;
  client_id: string;
  mall_id: string;
  user_id: string;
  scopes: string[];
  issued_at: string;
  shop_no: string;
};

export type StoredToken = {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
  scopes: string[];
};

export class Cafe24OAuthError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(`CAFE24_OAUTH_${code}`);
  }
}

export function cafe24ApiOrigin(mallId: string): string {
  if (!/^[a-z0-9]{4,16}$/.test(mallId)) throw new Error('MALL_ID_INVALID');
  return `https://${mallId}.cafe24api.com`;
}

export function buildAuthorizeUrl(input: {
  mallId: string;
  clientId: string;
  redirectUri: string;
  state: string;
  scopes: readonly string[];
}): string {
  const url = new URL('/api/v2/oauth/authorize', cafe24ApiOrigin(input.mallId));
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: input.clientId,
    state: input.state,
    redirect_uri: input.redirectUri,
    scope: input.scopes.join(','),
  }).toString();
  return url.toString();
}

// 토큰 응답의 날짜에는 시간대 표기가 없다(예: 2026-09-14T19:12:25.916).
// 발급 시각과 만료 시각의 "차이"만 쓰면 시간대와 무관하게 남은 시간을 구할 수 있다.
function parseCafe24Date(value: string): number {
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(value);
  const ms = Date.parse(hasZone ? value : `${value}Z`);
  if (Number.isNaN(ms)) throw new Error('TOKEN_DATE_INVALID');
  return ms;
}

export function toStoredToken(res: Cafe24TokenResponse, receivedAt: Date): StoredToken {
  const issued = parseCafe24Date(res.issued_at);
  const accessMs = parseCafe24Date(res.expires_at) - issued;
  const refreshMs = parseCafe24Date(res.refresh_token_expires_at) - issued;
  if (!(accessMs > 0) || !(refreshMs > 0)) throw new Error('TOKEN_EXPIRY_INVALID');
  return {
    accessToken: res.access_token,
    refreshToken: res.refresh_token,
    accessExpiresAt: new Date(receivedAt.getTime() + accessMs).toISOString(),
    refreshExpiresAt: new Date(receivedAt.getTime() + refreshMs).toISOString(),
    scopes: res.scopes,
  };
}

export async function requestToken(
  input: {
    mallId: string;
    clientId: string;
    clientSecret: string;
    body: Record<string, string>;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<Cafe24TokenResponse> {
  const basic = Buffer.from(`${input.clientId}:${input.clientSecret}`).toString('base64');
  const res = await fetchImpl(`${cafe24ApiOrigin(input.mallId)}/api/v2/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(input.body).toString(),
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await res.json().catch(() => null)) as
    | (Partial<Cafe24TokenResponse> & { error?: string })
    | null;
  if (!res.ok || !data?.access_token) {
    throw new Cafe24OAuthError(res.status, data?.error ?? 'token_request_failed');
  }
  if (data.mall_id !== input.mallId) throw new Cafe24OAuthError(res.status, 'mall_mismatch');
  if (data.client_id !== input.clientId) throw new Cafe24OAuthError(res.status, 'client_mismatch');
  return data as Cafe24TokenResponse;
}
