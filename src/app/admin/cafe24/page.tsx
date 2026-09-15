import { redirect } from 'next/navigation';
import { checkAdmin } from '@/lib/auth/admin';
import { LAB } from '@/lib/cafe24/lab-config';
import AdminPanel from './AdminPanel';

export default async function Cafe24AdminPage({ searchParams }: PageProps<'/admin/cafe24'>) {
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
        {LAB.product.categoryNo} · display_group {LAB.product.displayGroup}
      </p>
      <AdminPanel oauthResult={typeof cafe24 === 'string' ? cafe24 : null} />
    </main>
  );
}
