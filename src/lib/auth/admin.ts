import 'server-only';
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { env } from '@/lib/env';

export type AdminCheck =
  | { ok: true; userId: string }
  | { ok: false; status: 401 }
  | { ok: false; status: 403; userId: string };

// 화면에서 버튼을 숨기는 것과 별개로, 서버가 매 요청마다 관리자인지 확인한다.
export async function checkAdmin(): Promise<AdminCheck> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { ok: false, status: 401 };
  if (!env.adminUserIds.includes(data.user.id)) {
    return { ok: false, status: 403, userId: data.user.id };
  }
  return { ok: true, userId: data.user.id };
}

export function jsonError(status: number, code: string, message: string) {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

// 관리 API 공통 입구. write=true면 같은 사이트에서 보낸 JSON 요청인지도 확인한다(CSRF 방어).
export async function guardAdmin(
  request: Request,
  { write }: { write: boolean },
): Promise<{ userId: string; response?: never } | { response: NextResponse }> {
  if (write) {
    const origin = request.headers.get('origin');
    if (origin !== new URL(env.appBaseUrl).origin) {
      return { response: jsonError(403, 'BAD_ORIGIN', '허용되지 않은 출처의 요청입니다.') };
    }
    if (!request.headers.get('content-type')?.startsWith('application/json')) {
      return { response: jsonError(415, 'JSON_REQUIRED', 'Content-Type은 application/json이어야 합니다.') };
    }
  }
  const admin = await checkAdmin();
  if (!admin.ok) {
    return admin.status === 401
      ? { response: jsonError(401, 'LOGIN_REQUIRED', '로그인이 필요합니다.') }
      : { response: jsonError(403, 'NOT_ADMIN', 'ADMIN_USER_IDS에 등록된 사용자가 아닙니다.') };
  }
  return { userId: admin.userId };
}
