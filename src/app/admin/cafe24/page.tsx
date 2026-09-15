import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { checkAdmin } from '@/lib/auth/admin';
import { LAB } from '@/lib/cafe24/lab-config';
import { missingEnv } from '@/lib/setup/env-rules';
import AdminPanel from './AdminPanel';

export default async function Cafe24AdminPage({ searchParams }: PageProps<'/admin/cafe24'>) {
  // 환경변수는 요청 때 읽어야 한다(빌드 때 읽으면 빌드 환경의 빈 값으로 굳는다).
  await connection();
  // 로그인에 필요한 값이 비어 있으면 500 대신 준비 상태 점검 화면으로 보낸다.
  if (missingEnv(process.env, ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'ADMIN_USER_IDS']).length > 0) {
    redirect('/admin/setup');
  }
  const admin = await checkAdmin();
  if (!admin.ok && admin.status === 401) redirect('/login');
  if (!admin.ok) {
    return (
      <main>
        <section>
          <h1>관리자 권한이 없습니다</h1>
          <p>아래 UUID를 Vercel 환경변수 <code>ADMIN_USER_IDS</code>에 넣고 재배포하세요.</p>
          <pre>{admin.status === 403 ? admin.userId : ''}</pre>
        </section>
      </main>
    );
  }
  const { cafe24 } = await searchParams;
  return (
    <main>
      <h1>카페24 연동 관리</h1>
      <p className="muted">
        쇼핑몰 {LAB.mallId} · shop_no {LAB.shopNo} · 상품 {LAB.product.productNo} ({LAB.product.productCode}) · 분류{' '}
        {LAB.product.categoryNo} · display_group {LAB.product.displayGroup} · <a href="/admin/setup">준비 상태 점검</a>
      </p>
      <AdminPanel oauthResult={typeof cafe24 === 'string' ? cafe24 : null} />
    </main>
  );
}
