import { BREAD_INDEXES, LAB, SCENARIOS, storefrontProductUrl } from '@/lib/cafe24/lab-config';
import { describeChange } from '@/lib/cafe24/policy';

// MAKJI 앱 랜딩(실습용). 기존 MVP가 있으면 이 파일 대신 MVP의 랜딩을 사용한다.
export default function Home() {
  const wheat = SCENARIOS.up;
  const { changePct } = describeChange(wheat.previous, wheat.current);
  return (
    <main>
      <h1>MAKJI 브레드마켓</h1>
      <p className="muted">시장을 읽는 작은 예측이, 더 맛있는 내일을 만듭니다 · 수치는 수업용 예시</p>
      <div className="cards">
        <div className="card">
          <strong>{BREAD_INDEXES.wheat.name}</strong>
          <p style={{ fontSize: 24, fontWeight: 800, margin: '4px 0' }}>
            {wheat.current.toFixed(1)} <span style={{ color: '#d8453b', fontSize: 14 }}>▲{changePct.toFixed(1)}%</span>
          </p>
          <p className="muted">{BREAD_INDEXES.wheat.market}</p>
          <a href={storefrontProductUrl()} target="_blank" rel="noopener">
            오늘의 브레드 보러 가기 (상품 {LAB.product.productNo}) →
          </a>
        </div>
        <div className="card">
          <strong>{BREAD_INDEXES.croissant.name}</strong>
          <p className="muted">{BREAD_INDEXES.croissant.market} · 연결 상품 미정</p>
        </div>
        <div className="card">
          <strong>{BREAD_INDEXES.golden.name}</strong>
          <p className="muted">{BREAD_INDEXES.golden.market} · 연결 상품 미정</p>
        </div>
      </div>
    </main>
  );
}
