import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { LAB } from '@/lib/cafe24/lab-config';
import { getConnectionStatus } from '@/lib/cafe24/token-store';
import { evaluateEnv, missingEnv, parseAdminIds, type CheckItem, type EnvMap } from '@/lib/setup/env-rules';

// 배포 준비 상태 점검. 값은 읽기만 하고 아무것도 만들거나 바꾸지 않는다.
// 결과에는 이름·개수·상태만 담는다(키·토큰·이메일 값은 담지 않는다).

const TABLES = ['cafe24_connections', 'cafe24_products', 'cafe24_change_log'] as const;
const TIMEOUT_MS = 8000;

function client(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) }) },
  });
}

const errorText = (e: { code?: string; message?: string } | null | undefined) =>
  e ? `${e.code ?? 'ERROR'}${e.message ? ` · ${e.message.slice(0, 80)}` : ''}` : '';

async function checkDatabase(env: EnvMap): Promise<CheckItem[]> {
  const skip = (detail: string): CheckItem[] =>
    ['db.tables', 'db.lock_function', 'db.anon_blocked'].map((id) => ({
      id,
      group: 'db' as const,
      label: id === 'db.tables' ? '테이블 3개' : id === 'db.lock_function' ? '토큰 갱신 잠금 함수' : '브라우저 키 접근 차단',
      status: 'skip' as const,
      detail,
    }));
  if (missingEnv(env, ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SECRET_KEY']).length) {
    return skip('Supabase URL·Secret key가 없어 확인하지 못함');
  }
  const admin = client(env.NEXT_PUBLIC_SUPABASE_URL!.trim(), env.SUPABASE_SECRET_KEY!.trim());
  const items: CheckItem[] = [];

  try {
    const missing: string[] = [];
    for (const table of TABLES) {
      const { error } = await admin.from(table).select('*', { count: 'exact', head: true });
      if (error) missing.push(`${table}(${error.code ?? 'ERROR'})`);
    }
    items.push(
      missing.length === 0
        ? { id: 'db.tables', group: 'db', label: '테이블 3개', status: 'ok', detail: TABLES.join(' · ') }
        : { id: 'db.tables', group: 'db', label: '테이블 3개', status: 'fail', detail: `없거나 읽을 수 없음: ${missing.join(', ')}`, fix: '내 컴퓨터에서 npm run db:setup 실행, 또는 Supabase SQL Editor에서 마이그레이션 SQL 실행 (가이드 4-2)' },
    );

    // 존재하지 않는 몰 ID로 호출하므로 어떤 행도 바꾸지 않고 false가 돌아온다.
    const lock = await admin.rpc('cafe24_try_refresh_lock', { p_mall_id: '__readiness_check__', p_seconds: 1 });
    items.push(
      lock.error
        ? { id: 'db.lock_function', group: 'db', label: '토큰 갱신 잠금 함수', status: 'fail', detail: errorText(lock.error), fix: 'npm run db:setup 또는 마이그레이션 SQL 다시 실행' }
        : { id: 'db.lock_function', group: 'db', label: '토큰 갱신 잠금 함수', status: 'ok', detail: 'cafe24_try_refresh_lock 호출 가능' },
    );
  } catch (e) {
    return skip(`Supabase에 연결하지 못함: ${e instanceof Error ? e.name : 'ERROR'}`);
  }

  if (missingEnv(env, ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']).length) {
    items.push({ id: 'db.anon_blocked', group: 'db', label: '브라우저 키 접근 차단', status: 'skip', detail: 'Publishable key가 없어 확인하지 못함' });
  } else {
    try {
      const anon = client(env.NEXT_PUBLIC_SUPABASE_URL!.trim(), env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!.trim());
      const { error } = await anon.from('cafe24_connections').select('mall_id').limit(1);
      if (error && (error.code === '42501' || /permission denied/i.test(error.message ?? ''))) {
        items.push({ id: 'db.anon_blocked', group: 'db', label: '브라우저 키 접근 차단', status: 'ok', detail: 'Publishable key로 토큰 테이블을 읽을 수 없음' });
      } else if (error) {
        items.push({ id: 'db.anon_blocked', group: 'db', label: '브라우저 키 접근 차단', status: 'warn', detail: `예상과 다른 응답: ${errorText(error)}` });
      } else {
        items.push({ id: 'db.anon_blocked', group: 'db', label: '브라우저 키 접근 차단', status: 'fail', detail: 'Publishable key로 토큰 테이블 조회가 허용됨', fix: '마이그레이션 SQL의 revoke 부분이 실행됐는지 확인 (npm run db:setup이 다시 적용)' });
      }
    } catch (e) {
      items.push({ id: 'db.anon_blocked', group: 'db', label: '브라우저 키 접근 차단', status: 'warn', detail: `확인 실패: ${e instanceof Error ? e.name : 'ERROR'}` });
    }
  }
  return items;
}

async function checkAdmins(env: EnvMap): Promise<CheckItem[]> {
  const ids = parseAdminIds(env.ADMIN_USER_IDS).filter((id) => id.toLowerCase() !== 'pending');
  const label = '관리자 계정';
  if (ids.length === 0) {
    return [{ id: 'admin.exists', group: 'admin', label, status: 'fail', detail: 'ADMIN_USER_IDS에 UUID가 없음', fix: '내 컴퓨터에서 npm run db:setup (관리자 계정이 없으면 만들고 UUID를 알려 줌) → Vercel ADMIN_USER_IDS에 넣고 Redeploy' }];
  }
  if (missingEnv(env, ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SECRET_KEY']).length) {
    return [{ id: 'admin.exists', group: 'admin', label, status: 'skip', detail: 'Supabase URL·Secret key가 없어 확인하지 못함' }];
  }
  const admin = client(env.NEXT_PUBLIC_SUPABASE_URL!.trim(), env.SUPABASE_SECRET_KEY!.trim());
  let found = 0;
  let confirmed = 0;
  try {
    for (const id of ids) {
      const { data, error } = await admin.auth.admin.getUserById(id);
      if (!error && data.user) {
        found++;
        if (data.user.email_confirmed_at) confirmed++;
      }
    }
  } catch (e) {
    return [{ id: 'admin.exists', group: 'admin', label, status: 'warn', detail: `확인 실패: ${e instanceof Error ? e.name : 'ERROR'}` }];
  }
  if (found === 0) {
    return [{ id: 'admin.exists', group: 'admin', label, status: 'fail', detail: `UUID ${ids.length}개 중 Supabase에 있는 계정 0개`, fix: 'npm run db:setup으로 관리자 계정을 만들거나 Supabase Users의 UID로 ADMIN_USER_IDS 고치기' }];
  }
  if (found < ids.length || confirmed < found) {
    return [{ id: 'admin.exists', group: 'admin', label, status: 'warn', detail: `UUID ${ids.length}개 중 계정 ${found}개, 이메일 확인됨 ${confirmed}개`, fix: '없는 UUID는 지우고, 확인 안 된 계정은 Auto Confirm으로 다시 만들기' }];
  }
  return [{ id: 'admin.exists', group: 'admin', label, status: 'ok', detail: `UUID ${ids.length}개 모두 이메일 확인된 계정` }];
}

async function checkCafe24Connection(env: EnvMap): Promise<CheckItem[]> {
  const label = '카페24 연결';
  if (missingEnv(env, ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SECRET_KEY']).length) {
    return [{ id: 'cafe24.connection', group: 'cafe24', label, status: 'skip', detail: 'Supabase 값이 없어 확인하지 못함' }];
  }
  try {
    const status = await getConnectionStatus();
    return status.connected
      ? [{ id: 'cafe24.connection', group: 'cafe24', label, status: 'ok', detail: `${LAB.mallId} 연결됨` }]
      : [{ id: 'cafe24.connection', group: 'cafe24', label, status: 'warn', detail: `${LAB.mallId} 아직 연결 전(또는 refresh token 만료)`, fix: '카페24 앱 설치 후 /admin/cafe24 [카페24 연결하기] (가이드 7-1)' }];
  } catch (e) {
    return [{ id: 'cafe24.connection', group: 'cafe24', label, status: 'warn', detail: `확인 실패: ${e instanceof Error ? e.message.split(':')[0] : 'ERROR'}` }];
  }
}

export async function runReadiness(options: { requestOrigin?: string; includeConnection: boolean }): Promise<CheckItem[]> {
  const env: EnvMap = process.env;
  const items = evaluateEnv(env, { requestOrigin: options.requestOrigin, runtime: 'server' });
  items.push(...(await checkDatabase(env)));
  items.push(...(await checkAdmins(env)));
  if (options.includeConnection) items.push(...(await checkCafe24Connection(env)));
  return items;
}
