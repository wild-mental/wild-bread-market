// 체험 목업 데이터. DB·외부 시세 API 없이 발표자료 화면을 재현하기 위한 고정값이다.
// 확정값(종가)만 적어 두고, 카드 값·등락률·판정은 모두 이 값에서 계산한다.
import { BREAD_INDEXES, type IndexKey } from '@/lib/cafe24/lab-config';
import { describeChange } from '@/lib/cafe24/policy';
import {
  PREDICTION_KEYS,
  summarizeRound,
  weeklyAccuracy,
  type Picks,
  type RoundValues,
} from '@/lib/mvp/challenge';

// 체험 시계: 목요일 회차 마감(09:00 KST) 2시간 35분 10초 전
export const DEMO = {
  now: '2026-09-17T06:24:50+09:00',
  today: '2026-09-17',
  deadline: '2026-09-17T09:00:00+09:00',
  weekDays: ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'],
  participants: 1284,
  reward: '7일 프리미엄 브레드 구독권',
} as const;

export const INDEX_META: Record<IndexKey, { short: string; emoji: string; tone: string }> = {
  wheat: { short: '통밀 브레드', emoji: '🍞', tone: 'market' },
  croissant: { short: '크루아상', emoji: '🥐', tone: 'global' },
  golden: { short: '골든 브레드', emoji: '🥯', tone: 'gold' },
};

// 영업일 확정값. 첫 열은 직전 주 금요일(09-11) 종가.
const CLOSES: { date: string; values: Record<IndexKey, number | null> }[] = [
  { date: '2026-09-11', values: { wheat: 100.6, croissant: 98.9, golden: 103.6 } },
  { date: '2026-09-14', values: { wheat: 101.5, croissant: 99.4, golden: 104.0 } },
  { date: '2026-09-15', values: { wheat: 101.2, croissant: 99.2, golden: 104.3 } },
  { date: '2026-09-16', values: { wheat: 102.4, croissant: 98.7, golden: 105.1 } },
];

// 최근 흐름(스파크라인)에 쓸 이전 영업일 값. 마지막은 최신 확정값과 이어진다.
const HISTORY: Record<IndexKey, number[]> = {
  wheat: [99.1, 99.6, 99.3, 100.2, 99.8, 100.4, 100.1],
  croissant: [100.2, 99.8, 100.1, 99.6, 99.7, 99.1, 99.3],
  golden: [101.8, 102.3, 102.1, 102.9, 103.2, 102.8, 103.4],
};

// 내가 제출한 지난 회차 예측
const MY_PREDICTIONS: Record<string, Picks<IndexKey>> = {
  '2026-09-14': { wheat: 'UP', croissant: 'DOWN', golden: 'UP' },
  '2026-09-15': { wheat: 'UP', croissant: 'DOWN', golden: 'UP' },
  '2026-09-16': { wheat: 'UP', croissant: 'DOWN', golden: 'DOWN' },
};

const latestClose = CLOSES[CLOSES.length - 1];
const previousClose = CLOSES[CLOSES.length - 2];

export const INDEX_CARDS = PREDICTION_KEYS.map((key) => {
  const value = latestClose.values[key] as number;
  const { direction, changePct } = describeChange(previousClose.values[key] as number, value);
  return {
    key,
    name: BREAD_INDEXES[key].name,
    market: BREAD_INDEXES[key].market,
    ...INDEX_META[key],
    value,
    direction,
    changePct,
    spark: [...HISTORY[key], ...CLOSES.map((c) => c.values[key]).filter((v): v is number => v !== null)],
  };
});

function roundValues(date: string): RoundValues<IndexKey> {
  const i = CLOSES.findIndex((c) => c.date === date);
  if (i < 1) throw new Error(`NO_ROUND:${date}`);
  const pick = (key: IndexKey) => ({ previous: CLOSES[i - 1].values[key], confirmed: CLOSES[i].values[key] });
  return { wheat: pick('wheat'), croissant: pick('croissant'), golden: pick('golden') };
}

export function roundResult(date: string) {
  return { date, ...summarizeRound(PREDICTION_KEYS, { predictions: MY_PREDICTIONS[date] ?? {}, values: roundValues(date) }) };
}

export const JUDGED_DAYS: ReadonlySet<string> = new Set(Object.keys(MY_PREDICTIONS));

export function latestRound() {
  return roundResult(latestClose.date);
}

export function weekSummary() {
  const outcomes = DEMO.weekDays
    .filter((d) => JUDGED_DAYS.has(d))
    .flatMap((d) => roundResult(d).rows.map((r) => r.outcome));
  return weeklyAccuracy(outcomes);
}

export function remainingRounds() {
  return DEMO.weekDays.filter((d) => d >= DEMO.today).length;
}

// '2026-09-16' → '9월 16일(수)'
export function formatDay(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일(${'일월화수목금토'[d.getUTCDay()]})`;
}
