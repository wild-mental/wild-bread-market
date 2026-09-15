// 실습 몰·상품 정보. 비밀값이 아니므로 코드에 둔다.
// 다른 쇼핑몰로 실습한다면 이 파일의 값만 바꾼다.
export const LAB = {
  mallId: 'wildmental',
  shopNo: 1,
  storefrontOrigins: ['https://wildmental.cafe24.com'],
  product: {
    productNo: 16,
    productCode: 'P000000Q',
    categoryNo: 81,
    displayGroup: 1,
    indexKey: 'wheat',
  },
} as const;

// 카페24 개발자센터 앱의 [버전관리]에 표시된 값과 같게 맞춘다.
export const CAFE24_API_VERSION = '2026-09-01';

// 앱 [권한관리]에서 체크한 권한과 같아야 한다.
export const CAFE24_SCOPES = [
  'mall.read_application',
  'mall.write_application',
  'mall.read_product',
  'mall.write_product',
] as const;

// MAKJI 브레드마켓 3종 지수 (발표자료 기준 이름)
export const BREAD_INDEXES = {
  wheat: { name: '통밀 브레드 지수', market: 'KOSPI 연동' },
  croissant: { name: '크루아상 지수', market: '원/달러 환율 연동' },
  golden: { name: '골든 브레드 지수', market: '금 시세 연동' },
} as const;

// 실제 시장 API 대신 쓰는 수업용 고정값. up은 발표자료의 102.4 ▲1.2%.
export const SCENARIOS = {
  up: { label: '발표자료 값 (상승)', previous: 101.2, current: 102.4 },
  down: { label: '하락 연습', previous: 102.4, current: 101.9 },
} as const;

export type IndexKey = keyof typeof BREAD_INDEXES;
export type ScenarioKey = keyof typeof SCENARIOS;

export function isScenarioKey(value: unknown): value is ScenarioKey {
  return value === 'up' || value === 'down';
}

// MAKJI 앱의 지수 카드에서 자사몰 상품 상세로 보내는 링크
export function storefrontProductUrl(utmMedium = 'index_card'): string {
  const url = new URL('/product/detail.html', LAB.storefrontOrigins[0]);
  url.searchParams.set('product_no', String(LAB.product.productNo));
  url.searchParams.set('cate_no', String(LAB.product.categoryNo));
  url.searchParams.set('display_group', String(LAB.product.displayGroup));
  url.searchParams.set('utm_source', 'makji_app');
  url.searchParams.set('utm_medium', utmMedium);
  url.searchParams.set('utm_campaign', 'bread_market');
  return url.toString();
}
