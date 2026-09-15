import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

let client: SupabaseClient | undefined;

// secret key를 쓰는 서버 전용 클라이언트. RLS를 통과하므로 반드시 관리자 검사 뒤에만 쓴다.
export function supabaseAdmin(): SupabaseClient {
  client ??= createClient(env.supabaseUrl, env.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
