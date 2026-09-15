import { describe, expect, it } from 'vitest';
import { buildTarget, describeChange } from '@/lib/cafe24/policy';

const baseline = { price: 5200, summary_description: '' };
const wheat = '통밀 브레드 지수';

describe('buildTarget · 향기로운 허브 쌀치아바타(5,200원)', () => {
  it('발표자료 값 101.2 → 102.4는 UP ▲1.2%, 가격은 5,200원 유지', () => {
    const t = buildTarget({ baseline, indexName: wheat, previous: 101.2, current: 102.4, applyDiscount: true });
    expect(t.direction).toBe('UP');
    expect(t.changePct).toBe(1.2);
    expect(t.price).toBe(5200);
    expect(t.summary_description).toBe(
      '[MAKJI 브레드마켓] 통밀 브레드 지수 102.4 ▲1.2% UP · 오늘의 UP/DOWN 예측에 참여하세요',
    );
  });

  it('하락 연습 102.4 → 101.9 + 할인 규칙이면 4,940원', () => {
    const t = buildTarget({ baseline, indexName: wheat, previous: 102.4, current: 101.9, applyDiscount: true });
    expect(t.direction).toBe('DOWN');
    expect(t.changePct).toBe(-0.5);
    expect(t.price).toBe(4940);
  });

  it('할인 규칙을 끄면 하락이어도 5,200원', () => {
    const t = buildTarget({ baseline, indexName: wheat, previous: 102.4, current: 101.9, applyDiscount: false });
    expect(t.price).toBe(5200);
  });

  it('같은 입력을 여러 번 계산해도 결과가 같다(누적 할인 없음)', () => {
    const input = { baseline, indexName: wheat, previous: 102.4, current: 101.9, applyDiscount: true };
    expect(buildTarget(input)).toEqual(buildTarget(input));
  });

  it('요약설명은 카페24 제한 255자 이내', () => {
    const t = buildTarget({ baseline, indexName: wheat, previous: 101.2, current: 102.4, applyDiscount: false });
    expect(t.summary_description.length).toBeLessThanOrEqual(255);
  });

  it('0·NaN 지수와 잘못된 가격은 거절한다', () => {
    expect(() => describeChange(100, 0)).toThrow('INVALID_INDEX');
    expect(() => describeChange(Number.NaN, 100)).toThrow('INVALID_INDEX');
    expect(() =>
      buildTarget({ baseline: { price: 52.5, summary_description: '' }, indexName: wheat, previous: 1, current: 2, applyDiscount: false }),
    ).toThrow('INVALID_PRICE');
  });
});
