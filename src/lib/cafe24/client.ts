import 'server-only';
import { CAFE24_API_VERSION, LAB } from './lab-config';
import { cafe24ApiOrigin } from './oauth';
import { getAccessToken } from './token-store';

export class Cafe24ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly retryAfterSec?: number,
  ) {
    super(message);
  }
}

export type Cafe24Request = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  query?: Record<string, string | number>;
  body?: unknown;
};

export type Cafe24ClientDeps = {
  getAccessToken: (options?: { rejectedToken?: string }) => Promise<string>;
  fetch: typeof fetch;
};

const defaultDeps: Cafe24ClientDeps = {
  getAccessToken,
  fetch: (input, init) => fetch(input, init),
};

// 카페24 Admin API 호출은 모두 이 함수를 거친다. 브라우저에서 임의 URL을 넘기는 프록시는 만들지 않는다.
export async function cafe24Admin<T>(
  path: string,
  req: Cafe24Request = {},
  deps: Cafe24ClientDeps = defaultDeps,
): Promise<T> {
  if (!path.startsWith('/api/v2/admin/')) throw new Error('ADMIN_PATH_ONLY');
  const url = new URL(path, cafe24ApiOrigin(LAB.mallId));
  for (const [key, value] of Object.entries(req.query ?? {})) {
    url.searchParams.set(key, String(value));
  }

  let token = await deps.getAccessToken();
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await deps.fetch(url, {
      method: req.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Cafe24-Api-Version': CAFE24_API_VERSION,
      },
      body: req.body === undefined ? undefined : JSON.stringify(req.body),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });

    // 401은 토큰 문제일 수 있으므로 한 번만 갱신 후 다시 시도한다.
    if (res.status === 401 && attempt === 0) {
      token = await deps.getAccessToken({ rejectedToken: token });
      continue;
    }

    const text = await res.text();
    let data: { error?: { code?: string | number; message?: string } } | null = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      if (res.ok) throw new Cafe24ApiError(res.status, 'INVALID_JSON', '카페24 응답을 JSON으로 읽을 수 없습니다.');
    }
    if (!res.ok) {
      const remain = res.headers.get('X-Cafe24-Call-Remain');
      throw new Cafe24ApiError(
        res.status,
        String(data?.error?.code ?? res.status),
        data?.error?.message ?? res.statusText,
        remain ? Number(remain) : undefined,
      );
    }
    return data as T;
  }
  throw new Cafe24ApiError(401, 'UNAUTHORIZED', '토큰을 갱신해도 인증에 실패했습니다. 카페24 연결을 다시 진행하세요.');
}
