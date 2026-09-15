import { describe, expect, it, vi } from 'vitest';
import { cafe24Admin, Cafe24ApiError } from '@/lib/cafe24/client';

describe('cafe24Admin', () => {
  it('wildmental Admin API를 버전 헤더와 함께 호출한다', async () => {
    const fetchMock = vi.fn(async () => Response.json({ product: { product_no: 16 } }));
    const data = await cafe24Admin(
      '/api/v2/admin/products/16',
      { query: { shop_no: 1 } },
      { getAccessToken: async () => 'TOKEN', fetch: fetchMock as unknown as typeof fetch },
    );
    expect(data).toEqual({ product: { product_no: 16 } });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe('https://wildmental.cafe24api.com/api/v2/admin/products/16?shop_no=1');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer TOKEN', 'X-Cafe24-Api-Version': '2026-09-01' });
  });

  it('401이면 토큰을 한 번 갱신하고 다시 호출한다', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"error":{"code":401,"message":"expired"}}', { status: 401 }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    const getAccessToken = vi.fn(async (options?: { rejectedToken?: string }) =>
      options?.rejectedToken ? 'NEW' : 'OLD',
    );
    await cafe24Admin('/api/v2/admin/products/16', {}, { getAccessToken, fetch: fetchMock });
    expect(getAccessToken).toHaveBeenLastCalledWith({ rejectedToken: 'OLD' });
    expect((fetchMock.mock.calls[1][1] as RequestInit).headers).toMatchObject({ Authorization: 'Bearer NEW' });
  });

  it('429는 X-Cafe24-Call-Remain 초를 오류에 담는다', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response('{"error":{"code":429,"message":"Too Many Requests"}}', {
          status: 429,
          headers: { 'X-Cafe24-Call-Remain': '32' },
        }),
    );
    const error = await cafe24Admin('/api/v2/admin/products/16', {}, {
      getAccessToken: async () => 'T',
      fetch: fetchMock as unknown as typeof fetch,
    }).catch((e) => e);
    expect(error).toBeInstanceOf(Cafe24ApiError);
    expect(error).toMatchObject({ status: 429, retryAfterSec: 32 });
  });

  it('Admin API가 아닌 경로는 호출하지 않는다', async () => {
    await expect(
      cafe24Admin('/api/v2/oauth/token', {}, { getAccessToken: async () => 'T', fetch: vi.fn() }),
    ).rejects.toThrow('ADMIN_PATH_ONLY');
  });
});
