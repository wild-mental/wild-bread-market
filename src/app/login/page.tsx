import { login } from './actions';

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { error } = await searchParams;
  return (
    <main>
      <section style={{ maxWidth: 420 }}>
        <h1>관리자 로그인</h1>
        <p className="muted">Supabase Authentication에서 만든 관리자 계정으로 로그인합니다.</p>
        {error ? <p style={{ color: '#c0392b' }}>이메일 또는 비밀번호가 올바르지 않습니다.</p> : null}
        <form action={login} style={{ display: 'grid', gap: 10 }}>
          <input name="email" type="email" placeholder="이메일" autoComplete="username" required />
          <input name="password" type="password" placeholder="비밀번호" autoComplete="current-password" required />
          <button type="submit">로그인</button>
        </form>
      </section>
    </main>
  );
}
