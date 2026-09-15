import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { checkAdmin, jsonError } from '@/lib/auth/admin';
import { env } from '@/lib/env';
import { CAFE24_SCOPES, LAB } from '@/lib/cafe24/lab-config';
import { buildAuthorizeUrl } from '@/lib/cafe24/oauth';

const STATE_COOKIE = 'cafe24_oauth_state';

// [카페24 연결하기] 버튼 → 카페24 권한 동의 화면으로 이동
export async function GET() {
  const admin = await checkAdmin();
  if (!admin.ok) {
    return admin.status === 401
      ? jsonError(401, 'LOGIN_REQUIRED', '먼저 /login 에서 관리자 로그인하세요.')
      : jsonError(403, 'NOT_ADMIN', 'ADMIN_USER_IDS에 등록된 사용자가 아닙니다.');
  }

  const state = randomBytes(32).toString('base64url');
  const response = NextResponse.redirect(
    buildAuthorizeUrl({
      mallId: LAB.mallId,
      clientId: env.cafe24ClientId,
      redirectUri: env.cafe24RedirectUri,
      state,
      scopes: CAFE24_SCOPES,
    }),
  );
  // state를 로그인한 관리자와 묶어 5분 동안만 보관한다.
  response.cookies.set(STATE_COOKIE, `${state}.${admin.userId}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/cafe24/oauth',
    maxAge: 300,
  });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
