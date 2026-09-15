import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { checkAdmin } from '@/lib/auth/admin';
import { env } from '@/lib/env';
import { LAB } from '@/lib/cafe24/lab-config';
import { Cafe24OAuthError, requestToken } from '@/lib/cafe24/oauth';
import { saveTokenResponse } from '@/lib/cafe24/token-store';

const STATE_COOKIE = 'cafe24_oauth_state';

function sameText(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// 카페24 동의 후 돌아오는 주소. code는 1분 안에 서버에서 바로 토큰으로 교환한다.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const finish = (result: string) => {
    const response = NextResponse.redirect(new URL(`/admin/cafe24?cafe24=${result}`, env.appBaseUrl));
    response.cookies.set(STATE_COOKIE, '', { path: '/api/cafe24/oauth', maxAge: 0 });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  };

  const admin = await checkAdmin();
  if (!admin.ok) return finish('login_required');

  const [savedState = '', savedUserId = ''] = (request.cookies.get(STATE_COOKIE)?.value ?? '').split('.');
  const state = params.get('state') ?? '';
  if (!savedState || !sameText(savedState, state) || savedUserId !== admin.userId) {
    return finish('state_mismatch');
  }

  const error = params.get('error');
  if (error) return finish(`denied_${error.replace(/[^a-z_]/g, '')}`);

  const code = params.get('code');
  if (!code) return finish('code_missing');

  try {
    const token = await requestToken({
      mallId: LAB.mallId,
      clientId: env.cafe24ClientId,
      clientSecret: env.cafe24ClientSecret,
      body: { grant_type: 'authorization_code', code, redirect_uri: env.cafe24RedirectUri },
    });
    await saveTokenResponse(token);
    return finish('connected');
  } catch (e) {
    const reason = e instanceof Cafe24OAuthError ? e.code : e instanceof Error ? e.message : 'unknown';
    console.error('[cafe24] token exchange failed:', reason); // 코드·토큰은 로그에 남기지 않는다.
    return finish('token_failed');
  }
}
