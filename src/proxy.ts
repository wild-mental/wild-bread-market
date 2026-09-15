import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// 관리 화면·관리 API 요청마다 Supabase 로그인 세션을 갱신한다(Next.js 16의 proxy = 이전 middleware).
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  // 설정 전(Supabase 값 없음)에는 세션 갱신을 건너뛴다. /admin/setup 점검 화면이 열려야 하기 때문이다.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) return response;

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*', '/api/cafe24/:path*'],
};
