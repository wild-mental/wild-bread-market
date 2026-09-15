import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { CAFE24_SCOPES } from '@/lib/cafe24/lab-config';
import { buildAuthorizeUrl, requestToken, toStoredToken } from '@/lib/cafe24/oauth';
import { loadEncryptionKey, openJson, sealJson } from '@/lib/cafe24/token-crypto';

describe('카페24 OAuth', () => {
  it('wildmental 몰의 인가 URL을 만든다', () => {
    const url = new URL(
      buildAuthorizeUrl({
        mallId: 'wildmental',
        clientId: 'CLIENT_ID',
        redirectUri: 'https://makji-lab.vercel.app/api/cafe24/oauth/callback',
        state: 'STATE',
        scopes: CAFE24_SCOPES,
      }),
    );
    expect(url.origin).toBe('https://wildmental.cafe24api.com');
    expect(url.pathname).toBe('/api/v2/oauth/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('redirect_uri')).toBe('https://makji-lab.vercel.app/api/cafe24/oauth/callback');
    expect(url.searchParams.get('scope')).toBe(
      'mall.read_application,mall.write_application,mall.read_product,mall.write_product',
    );
  });

  it('시간대 없는 만료 시각을 "발급 후 2시간 / 14일"로 정확히 환산한다', () => {
    const stored = toStoredToken(
      {
        access_token: 'a',
        refresh_token: 'r',
        issued_at: '2026-09-14T18:12:25.918',
        expires_at: '2026-09-14T20:12:25.918',
        refresh_token_expires_at: '2026-09-28T18:12:25.918',
        client_id: 'c',
        mall_id: 'wildmental',
        user_id: 'u',
        scopes: [],
        shop_no: '1',
      },
      new Date('2026-09-14T09:12:26.000Z'),
    );
    expect(stored.accessExpiresAt).toBe('2026-09-14T11:12:26.000Z');
    expect(stored.refreshExpiresAt).toBe('2026-09-28T09:12:26.000Z');
  });

  it('토큰 요청은 Basic 인증 + form body로 보내고, 다른 몰의 응답은 거절한다', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ access_token: 'a', mall_id: 'othermall', client_id: 'CLIENT_ID' }),
    );
    await expect(
      requestToken(
        { mallId: 'wildmental', clientId: 'CLIENT_ID', clientSecret: 'SECRET', body: { grant_type: 'authorization_code', code: 'CODE', redirect_uri: 'https://x.example/cb' } },
        fetchMock as unknown as typeof fetch,
      ),
    ).rejects.toThrow('CAFE24_OAUTH_mall_mismatch');

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://wildmental.cafe24api.com/api/v2/oauth/token');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from('CLIENT_ID:SECRET').toString('base64')}`,
    );
    expect(init.body).toBe('grant_type=authorization_code&code=CODE&redirect_uri=https%3A%2F%2Fx.example%2Fcb');
  });
});

describe('토큰 암호화', () => {
  const key = loadEncryptionKey(randomBytes(32).toString('base64'));

  it('암호화한 값을 같은 키로 복호화한다', () => {
    const sealed = sealJson({ accessToken: 'secret-value' }, key);
    expect(sealed).not.toContain('secret-value');
    expect(openJson(sealed, key)).toEqual({ accessToken: 'secret-value' });
  });

  it('다른 키나 변조된 값은 복호화되지 않는다', () => {
    const sealed = sealJson({ a: 1 }, key);
    expect(() => openJson(sealed, loadEncryptionKey(randomBytes(32).toString('base64')))).toThrow();
    const tampered = sealed.slice(0, -2) + (sealed.endsWith('A') ? 'BB' : 'AA');
    expect(() => openJson(tampered, key)).toThrow();
  });

  it('32바이트가 아닌 키는 거절한다', () => {
    expect(() => loadEncryptionKey('c2hvcnQ=')).toThrow('32바이트');
  });
});
