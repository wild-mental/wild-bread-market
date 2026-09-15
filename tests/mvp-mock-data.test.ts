import { describe, expect, it } from 'vitest';
import { formatCountdown, formatRate, remainingMs } from '@/lib/mvp/challenge';
import { DEMO, INDEX_CARDS, latestRound, remainingRounds, weekSummary } from '@/lib/mvp/mock-data';

describe('체험 목업 데이터 · 발표자료 값과 맞는지', () => {
  it('3종 지수 카드 값은 발표자료와 같다 (102.4 ▲1.2 · 98.7 ▼0.5 · 105.1 ▲0.8)', () => {
    expect(INDEX_CARDS.map((c) => [c.name, c.value, c.direction, c.changePct])).toEqual([
      ['통밀 브레드 지수', 102.4, 'UP', 1.2],
      ['크루아상 지수', 98.7, 'DOWN', -0.5],
      ['골든 브레드 지수', 105.1, 'UP', 0.8],
    ]);
  });

  it('시장 연동 이름은 연동 레퍼런스(lab-config)와 같다', () => {
    expect(INDEX_CARDS.map((c) => c.market)).toEqual(['KOSPI 연동', '원/달러 환율 연동', '금 시세 연동']);
  });

  it('예측 화면 카운트다운은 02:35:10에서 시작한다', () => {
    expect(formatCountdown(remainingMs(Date.parse(DEMO.now), Date.parse(DEMO.deadline)))).toBe('02:35:10');
  });

  it('최근 판정 회차는 3개 중 2개 적중이다', () => {
    const round = latestRound();
    expect(round.date).toBe('2026-09-16');
    expect(round.hits).toBe(2);
    expect(round.valid).toBe(3);
  });

  it('이번 주 정확도는 9개 중 6개 적중, 66.7%', () => {
    const week = weekSummary();
    expect([week.hits, week.valid, formatRate(week.rate)]).toEqual([6, 9, '66.7']);
  });

  it('이번 주 남은 회차는 오늘(목)과 금요일 2회', () => {
    expect(remainingRounds()).toBe(2);
  });

  it('스파크라인 마지막 값은 카드 값과 같다', () => {
    for (const card of INDEX_CARDS) expect(card.spark.at(-1)).toBe(card.value);
  });
});
