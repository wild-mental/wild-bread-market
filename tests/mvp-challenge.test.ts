import { describe, expect, it } from 'vitest';
import {
  actualDirection,
  canSubmit,
  formatCountdown,
  formatRate,
  isPredictionOpen,
  judgePrediction,
  remainingMs,
  summarizeRound,
  weekProgress,
  weeklyAccuracy,
} from '@/lib/mvp/challenge';

const deadline = Date.parse('2026-09-17T09:00:00+09:00');

describe('예측 마감 판정 · 서버 시각 단일 기준', () => {
  it('마감 1초 전은 제출 가능', () => {
    expect(isPredictionOpen(deadline - 1000, deadline)).toBe(true);
  });

  it('마감 시각 정각부터는 제출 불가', () => {
    expect(isPredictionOpen(deadline, deadline)).toBe(false);
    expect(isPredictionOpen(deadline + 1, deadline)).toBe(false);
  });

  it('숫자가 아닌 시각은 닫힌 것으로 본다', () => {
    expect(isPredictionOpen(Number.NaN, deadline)).toBe(false);
  });

  it('남은 시간은 0 아래로 내려가지 않는다', () => {
    expect(remainingMs(deadline - 9_310_000, deadline)).toBe(9_310_000);
    expect(remainingMs(deadline + 5000, deadline)).toBe(0);
  });

  it('카운트다운은 HH:MM:SS, 초 미만은 올림', () => {
    expect(formatCountdown(9_310_000)).toBe('02:35:10');
    expect(formatCountdown(9_309_001)).toBe('02:35:10');
    expect(formatCountdown(0)).toBe('00:00:00');
    expect(formatCountdown(-10)).toBe('00:00:00');
  });

  it('세 지수를 모두 골라야 제출할 수 있다', () => {
    expect(canSubmit({ wheat: 'UP', croissant: 'DOWN', golden: 'UP' })).toBe(true);
    expect(canSubmit({ wheat: 'UP', croissant: 'DOWN' })).toBe(false);
    expect(canSubmit({})).toBe(false);
  });
});

describe('정답 판정 · 직전 확정값 대비 상승/하락', () => {
  it('상승·하락 방향', () => {
    expect(actualDirection(101.2, 102.4)).toBe('UP');
    expect(actualDirection(99.2, 98.7)).toBe('DOWN');
  });

  it('보합이거나 확정값이 없으면 방향이 없다', () => {
    expect(actualDirection(100, 100)).toBeNull();
    expect(actualDirection(100, null)).toBeNull();
    expect(actualDirection(null, 100)).toBeNull();
  });

  it('예측과 실제가 같으면 HIT, 다르면 MISS', () => {
    expect(judgePrediction('UP', 101.2, 102.4)).toBe('HIT');
    expect(judgePrediction('DOWN', 101.2, 102.4)).toBe('MISS');
  });

  it('휴장·미공시(확정값 없음)와 보합은 VOID', () => {
    expect(judgePrediction('UP', 101.2, null)).toBe('VOID');
    expect(judgePrediction('DOWN', 100, 100)).toBe('VOID');
  });

  it('예측하지 않은 지수는 NONE', () => {
    expect(judgePrediction(undefined, 101.2, 102.4)).toBe('NONE');
  });
});

describe('주간 정확도 = 정답 수 ÷ 유효 예측 수', () => {
  it('9개 중 6개 적중이면 66.7%', () => {
    const outcomes = ['HIT', 'HIT', 'MISS', 'HIT', 'MISS', 'HIT', 'HIT', 'HIT', 'MISS'] as const;
    const acc = weeklyAccuracy(outcomes);
    expect(acc).toEqual({ hits: 6, valid: 9, rate: 6 / 9 });
    expect(formatRate(acc.rate)).toBe('66.7');
  });

  it('무효 회차와 미참여는 분모에서 제외한다', () => {
    const acc = weeklyAccuracy(['HIT', 'VOID', 'MISS', 'NONE', 'VOID', 'HIT']);
    expect(acc).toEqual({ hits: 2, valid: 3, rate: 2 / 3 });
  });

  it('유효 예측이 없으면 정확도는 null', () => {
    const acc = weeklyAccuracy(['VOID', 'NONE']);
    expect(acc.rate).toBeNull();
    expect(formatRate(acc.rate)).toBe('-');
  });

  it('100%와 0%', () => {
    expect(formatRate(weeklyAccuracy(['HIT', 'HIT']).rate)).toBe('100.0');
    expect(formatRate(weeklyAccuracy(['MISS']).rate)).toBe('0.0');
  });
});

describe('회차 요약과 월~금 진행 표시', () => {
  const indexes = ['wheat', 'croissant', 'golden'] as const;

  it('회차 요약은 지수별 결과와 적중 수를 준다', () => {
    const summary = summarizeRound(indexes, {
      predictions: { wheat: 'UP', croissant: 'DOWN', golden: 'DOWN' },
      values: {
        wheat: { previous: 101.2, confirmed: 102.4 },
        croissant: { previous: 99.2, confirmed: 98.7 },
        golden: { previous: 104.3, confirmed: 105.1 },
      },
    });
    expect(summary.rows.map((r) => [r.key, r.pick, r.actual, r.outcome])).toEqual([
      ['wheat', 'UP', 'UP', 'HIT'],
      ['croissant', 'DOWN', 'DOWN', 'HIT'],
      ['golden', 'DOWN', 'UP', 'MISS'],
    ]);
    expect(summary.hits).toBe(2);
    expect(summary.valid).toBe(3);
  });

  it('확정값이 없는 지수는 VOID로 요약된다', () => {
    const summary = summarizeRound(indexes, {
      predictions: { wheat: 'UP', croissant: 'UP', golden: 'UP' },
      values: {
        wheat: { previous: 101.2, confirmed: 102.4 },
        croissant: { previous: 99.2, confirmed: null },
        golden: { previous: 104.3, confirmed: 105.1 },
      },
    });
    expect(summary.rows[1].outcome).toBe('VOID');
    expect(summary.valid).toBe(2);
  });

  it('판정 완료·오늘·예정 순서, 오늘 제출하면 오늘 도트가 점등된다', () => {
    const days = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'];
    const judged = new Set(['2026-09-14', '2026-09-15', '2026-09-16']);
    const before = weekProgress(days, { today: '2026-09-17', judged, submittedToday: false });
    expect(before.map((d) => d.status)).toEqual(['judged', 'judged', 'judged', 'today', 'upcoming']);
    expect(before.map((d) => d.label)).toEqual(['월', '화', '수', '목', '금']);

    const after = weekProgress(days, { today: '2026-09-17', judged, submittedToday: true });
    expect(after[3].status).toBe('submitted');
    expect(after.filter((d) => d.status !== 'upcoming' && d.status !== 'today')).toHaveLength(4);
  });

  it('지난 회차에 참여하지 않았으면 missed', () => {
    const days = ['2026-09-14', '2026-09-15', '2026-09-16'];
    const progress = weekProgress(days, { today: '2026-09-16', judged: new Set(['2026-09-14']), submittedToday: false });
    expect(progress.map((d) => d.status)).toEqual(['judged', 'missed', 'today']);
  });
});
