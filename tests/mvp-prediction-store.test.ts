import { describe, expect, it } from 'vitest';
import { parseSavedPrediction, serializePrediction } from '@/lib/mvp/prediction-store';

describe('저장된 예측 읽기 · 브라우저 저장소 값은 믿지 않고 검사한다', () => {
  it('저장한 값을 그대로 다시 읽는다', () => {
    const raw = serializePrediction({ picks: { wheat: 'UP', croissant: 'DOWN', golden: 'UP' }, savedAt: '2026-09-17T06:25:00.000Z', revision: 1 });
    expect(parseSavedPrediction(raw)).toEqual({
      picks: { wheat: 'UP', croissant: 'DOWN', golden: 'UP' },
      savedAt: '2026-09-17T06:25:00.000Z',
      revision: 1,
    });
  });

  it('비어 있거나 JSON이 아니면 null', () => {
    expect(parseSavedPrediction(null)).toBeNull();
    expect(parseSavedPrediction('not json')).toBeNull();
    expect(parseSavedPrediction('[]')).toBeNull();
  });

  it('세 지수 중 하나라도 UP/DOWN이 아니면 null', () => {
    expect(parseSavedPrediction(JSON.stringify({ picks: { wheat: 'UP', croissant: 'DOWN' }, savedAt: 'x', revision: 1 }))).toBeNull();
    expect(parseSavedPrediction(JSON.stringify({ picks: { wheat: 'UP', croissant: 'DOWN', golden: 'SIDEWAYS' }, savedAt: 'x', revision: 1 }))).toBeNull();
  });

  it('모르는 지수 키는 버린다', () => {
    const parsed = parseSavedPrediction(
      JSON.stringify({ picks: { wheat: 'UP', croissant: 'DOWN', golden: 'UP', extra: 'UP' }, savedAt: 'x', revision: 2 }),
    );
    expect(parsed?.picks).toEqual({ wheat: 'UP', croissant: 'DOWN', golden: 'UP' });
  });

  it('수정 횟수가 이상하면 1로 본다', () => {
    const parsed = parseSavedPrediction(JSON.stringify({ picks: { wheat: 'UP', croissant: 'UP', golden: 'UP' }, savedAt: 'x', revision: -3 }));
    expect(parsed?.revision).toBe(1);
  });
});
