// MAKJI 브레드마켓 체험 목업의 판정 규칙. 화면·DB·시계에 기대지 않는 순수 함수만 둔다.
// 시각은 호출하는 쪽이 넘긴다(실서비스에서는 서버 시각 하나만 기준으로 쓴다).

export type Pick = 'UP' | 'DOWN';
export type Outcome = 'HIT' | 'MISS' | 'VOID' | 'NONE';
export type Picks<K extends string = string> = Partial<Record<K, Pick>>;

export const PREDICTION_KEYS = ['wheat', 'croissant', 'golden'] as const;

// 마감 시각 정각부터는 제출·수정할 수 없다.
export function isPredictionOpen(nowMs: number, deadlineMs: number): boolean {
  return Number.isFinite(nowMs) && Number.isFinite(deadlineMs) && nowMs < deadlineMs;
}

export function remainingMs(nowMs: number, deadlineMs: number): number {
  return Math.max(0, deadlineMs - nowMs);
}

// 남은 시간을 HH:MM:SS로. 1초 미만이 남아 있으면 1초로 보여 마감 전에 00:00:00이 뜨지 않게 한다.
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

export function canSubmit(picks: Picks, keys: readonly string[] = PREDICTION_KEYS): boolean {
  return keys.every((key) => picks[key] === 'UP' || picks[key] === 'DOWN');
}

// 직전 확정값 대비 방향. 보합이거나 확정값이 없으면(휴장·미공시) 방향이 없다.
export function actualDirection(previous: number | null, confirmed: number | null): Pick | null {
  if (previous === null || confirmed === null) return null;
  if (!Number.isFinite(previous) || !Number.isFinite(confirmed) || confirmed === previous) return null;
  return confirmed > previous ? 'UP' : 'DOWN';
}

// 판정 규칙 (GRIP-06)
//   확정값 없음(휴장·미공시) → VOID, 분모에서 뺀다
//   보합(직전과 같은 값)     → HIT, 사용자가 통제할 수 없는 사유이므로 정답으로 본다
//   그 밖                     → 방향이 맞으면 HIT, 틀리면 MISS
export function judgePrediction(
  pick: Pick | null | undefined,
  previous: number | null,
  confirmed: number | null,
): Outcome {
  if (pick !== 'UP' && pick !== 'DOWN') return 'NONE';
  if (previous === null || confirmed === null) return 'VOID';
  if (!Number.isFinite(previous) || !Number.isFinite(confirmed)) return 'VOID';
  if (confirmed === previous) return 'HIT';
  return pick === actualDirection(previous, confirmed) ? 'HIT' : 'MISS';
}

// 주간 정확도 = 정답 수 ÷ 유효 예측 수. 무효 회차(VOID)와 미참여(NONE)는 분모에서 뺀다.
export function weeklyAccuracy(outcomes: readonly Outcome[]) {
  const hits = outcomes.filter((o) => o === 'HIT').length;
  const valid = outcomes.filter((o) => o === 'HIT' || o === 'MISS').length;
  return { hits, valid, rate: valid === 0 ? null : hits / valid };
}

export function formatRate(rate: number | null): string {
  return rate === null ? '-' : (Math.round(rate * 1000) / 10).toFixed(1);
}

export type RoundValues<K extends string> = Record<K, { previous: number | null; confirmed: number | null }>;

export function summarizeRound<K extends string>(
  keys: readonly K[],
  round: { predictions: Picks<K>; values: RoundValues<K> },
) {
  const rows = keys.map((key) => {
    const { previous, confirmed } = round.values[key];
    const pick = round.predictions[key] ?? null;
    return {
      key,
      pick,
      actual: actualDirection(previous, confirmed),
      outcome: judgePrediction(pick, previous, confirmed),
    };
  });
  return { rows, ...weeklyAccuracy(rows.map((r) => r.outcome)) };
}

export type DayStatus = 'judged' | 'missed' | 'submitted' | 'today' | 'upcoming';

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

// 월~금 진행 도트. 날짜는 'YYYY-MM-DD'(KST 달력 날짜) 문자열로 받아 시간대 영향을 받지 않게 한다.
export function weekProgress(
  days: readonly string[],
  state: { today: string; judged: ReadonlySet<string>; submittedToday: boolean },
): { date: string; label: string; status: DayStatus }[] {
  return days.map((date) => {
    const label = WEEKDAY[new Date(`${date}T00:00:00Z`).getUTCDay()];
    let status: DayStatus;
    if (date === state.today) status = state.submittedToday ? 'submitted' : 'today';
    else if (date > state.today) status = 'upcoming';
    else status = state.judged.has(date) ? 'judged' : 'missed';
    return { date, label, status };
  });
}
