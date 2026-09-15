import 'server-only';
import { jsonError } from '@/lib/auth/admin';
import { Cafe24ApiError } from './client';
import { Cafe24OAuthError } from './oauth';
import { SyncError } from './product-sync';
import { Cafe24NotConnectedError } from './token-store';

// 어떤 오류든 화면에 보여줄 수 있는 JSON으로 바꾼다. 토큰·헤더·스택은 내보내지 않는다.
export function toErrorResponse(e: unknown) {
  if (e instanceof SyncError) {
    return Response.json(
      { error: { code: e.code, message: e.message, detail: e.detail ?? null } },
      { status: e.status, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (e instanceof Cafe24NotConnectedError) {
    return jsonError(409, 'CAFE24_NOT_CONNECTED', `카페24 연결이 필요합니다(${e.reason}). [카페24 연결하기]를 누르세요.`);
  }
  if (e instanceof Cafe24OAuthError) {
    return jsonError(409, 'RECONNECT_REQUIRED', `토큰 갱신에 실패했습니다(${e.code}). [카페24 연결하기]로 다시 연결하세요.`);
  }
  if (e instanceof Cafe24ApiError) {
    const wait = e.retryAfterSec ? ` ${e.retryAfterSec}초 후 다시 시도하세요.` : '';
    return jsonError(502, `CAFE24_${e.status}`, `카페24 API 오류 ${e.status} (${e.code}): ${e.message}.${wait}`);
  }
  if (e instanceof Error && e.name === 'TimeoutError') {
    return jsonError(504, 'CAFE24_TIMEOUT', '카페24 응답이 10초 안에 오지 않았습니다.');
  }
  console.error('[cafe24] unexpected error', e instanceof Error ? e.message : e);
  return jsonError(500, 'INTERNAL', '서버 오류입니다. Vercel 로그의 [cafe24] 줄을 확인하세요.');
}
