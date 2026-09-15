// 지수 변화 → 상품 요약설명·판매가 목표값을 만드는 순수 함수.
// 외부 API·DB를 부르지 않으므로 네트워크 없이 테스트할 수 있다.

export type Direction = 'UP' | 'DOWN' | 'FLAT';

export type Baseline = { price: number; summary_description: string };

export type Target = {
  direction: Direction;
  changePct: number;
  summary_description: string;
  price: number;
};

export function describeChange(previous: number, current: number) {
  if (![previous, current].every((v) => Number.isFinite(v) && v > 0)) {
    throw new Error('INVALID_INDEX');
  }
  const direction: Direction =
    current > previous ? 'UP' : current < previous ? 'DOWN' : 'FLAT';
  const changePct = Math.round(((current - previous) / previous) * 1000) / 10;
  return { direction, changePct };
}

export function buildTarget(input: {
  baseline: Baseline;
  indexName: string;
  previous: number;
  current: number;
  applyDiscount: boolean;
}): Target {
  const { baseline, indexName, previous, current, applyDiscount } = input;
  if (!Number.isSafeInteger(baseline.price) || baseline.price < 0) {
    throw new Error('INVALID_PRICE');
  }
  const { direction, changePct } = describeChange(previous, current);
  const arrow = direction === 'UP' ? '▲' : direction === 'DOWN' ? '▼' : '-';
  const summary =
    `[MAKJI 브레드마켓] ${indexName} ${current.toFixed(1)} ` +
    `${arrow}${Math.abs(changePct).toFixed(1)}% ${direction} · 오늘의 UP/DOWN 예측에 참여하세요`;

  // 가격은 항상 "처음 저장한 기준가"에서 계산한다. 현재가에서 계산하면 적용할 때마다 계속 내려간다.
  const price =
    applyDiscount && direction === 'DOWN'
      ? Math.round((baseline.price * 0.95) / 10) * 10
      : baseline.price;

  return { direction, changePct, summary_description: summary, price };
}
