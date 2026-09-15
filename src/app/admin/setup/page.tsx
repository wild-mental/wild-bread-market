import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { checkAdmin } from '@/lib/auth/admin';
import { runReadiness } from '@/lib/setup/readiness';
import { setupAccessMode, summarize, type CheckItem } from '@/lib/setup/env-rules';

export const metadata: Metadata = { title: '배포 준비 상태 점검 · MAKJI 카페24 연동' };

const GROUPS: { key: CheckItem['group']; title: string }[] = [
  { key: 'env', title: '1. 환경변수' },
  { key: 'db', title: '2. Supabase DB' },
  { key: 'admin', title: '3. 관리자 계정' },
  { key: 'cafe24', title: '4. 카페24' },
];

const BADGE: Record<CheckItem['status'], { text: string; color: string }> = {
  ok: { text: 'OK', color: '#1f8a5b' },
  warn: { text: '확인', color: '#b7791f' },
  fail: { text: '필요', color: '#c0392b' },
  skip: { text: '건너뜀', color: '#5b6b7d' },
};

// 설정 전(ADMIN_USER_IDS 없음)에는 로그인 없이 보인다. 설정 뒤에는 관리자만 볼 수 있다.
export default async function SetupPage() {
  await connection(); // 환경변수를 빌드 때가 아니라 요청 때 읽는다
  const mode = setupAccessMode(process.env);
  if (mode === 'admin') {
    const admin = await checkAdmin();
    if (!admin.ok && admin.status === 401) redirect('/login');
    if (!admin.ok) {
      return (
        <main>
          <section>
            <h1>관리자 권한이 없습니다</h1>
            <p>준비 상태 점검은 ADMIN_USER_IDS에 등록된 관리자만 볼 수 있습니다.</p>
          </section>
        </main>
      );
    }
  }

  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? (host?.startsWith('localhost') || host?.startsWith('127.0.0.1') ? 'http' : 'https');
  const requestOrigin = host ? `${proto}://${host}` : undefined;

  const items = await runReadiness({ requestOrigin, includeConnection: mode === 'admin' });
  const total = summarize(items);
  const next = items.find((i) => i.status === 'fail') ?? items.find((i) => i.status === 'warn' && i.fix);

  return (
    <main>
      <h1>배포 준비 상태 점검</h1>
      <p className="muted">
        값은 표시하지 않고 상태만 보여 줍니다. 이 화면은 아무것도 바꾸지 않습니다.
        {mode === 'bootstrap' ? ' 관리자 UUID 설정 전이라 로그인 없이 열립니다. 설정을 마치면 관리자만 볼 수 있습니다.' : ''}
      </p>
      <section data-testid="setup-summary" data-fail={total.fail} data-warn={total.warn} data-ok={total.ok}>
        <h2>{total.fail === 0 ? (total.warn === 0 ? '준비 완료' : '기본 준비 완료 · 확인할 항목 있음') : '준비가 더 필요합니다'}</h2>
        <p>
          OK {total.ok} · 확인 {total.warn} · 필요 {total.fail} · 건너뜀 {total.skip}
        </p>
        {next?.fix ? (
          <p>
            <strong>다음에 할 일:</strong> {next.label} — {next.fix}
          </p>
        ) : null}
      </section>
      {GROUPS.map((group) => {
        const list = items.filter((i) => i.group === group.key);
        if (list.length === 0) return null;
        return (
          <section key={group.key}>
            <h2>{group.title}</h2>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
              {list.map((item) => (
                <li key={item.id} data-check={item.id} data-status={item.status}>
                  <span style={{ display: 'inline-block', minWidth: 52, marginRight: 8, fontWeight: 700, color: BADGE[item.status].color }}>
                    {BADGE[item.status].text}
                  </span>
                  <code>{item.label}</code> — {item.detail}
                  {item.fix && item.status !== 'ok' ? <div className="muted">→ {item.fix}</div> : null}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <p className="muted">
        내 컴퓨터에서 같은 점검: <code>npm run setup:check</code> · 테이블·관리자 준비: <code>npm run db:setup</code> ·{' '}
        <Link href="/admin/cafe24">카페24 연동 관리</Link>
      </p>
    </main>
  );
}
