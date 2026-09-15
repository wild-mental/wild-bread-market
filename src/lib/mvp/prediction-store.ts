// 체험 목업의 "오늘 예측" 보관소. DB 대신 이 브라우저의 localStorage에만 둔다.
// 저장소를 쓸 수 없는 환경(사생활 보호 모드 등)에서는 메모리에만 두고 화면은 그대로 동작한다.
import { canSubmit, PREDICTION_KEYS, type Pick, type Picks } from '@/lib/mvp/challenge';
import { DEMO } from '@/lib/mvp/mock-data';

export type SavedPrediction = {
  picks: Picks<(typeof PREDICTION_KEYS)[number]>;
  savedAt: string;
  revision: number;
};

export const STORAGE_KEY = `makji-mvp:prediction:${DEMO.today}`;

export function serializePrediction(value: SavedPrediction): string {
  return JSON.stringify(value);
}

export function parseSavedPrediction(raw: string | null): SavedPrediction | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const record = data as { picks?: Record<string, unknown>; savedAt?: unknown; revision?: unknown };
  const picks: SavedPrediction['picks'] = {};
  for (const key of PREDICTION_KEYS) {
    const pick = record.picks?.[key];
    if (pick === 'UP' || pick === 'DOWN') picks[key] = pick as Pick;
  }
  if (!canSubmit(picks)) return null;
  const revision = Number.isSafeInteger(record.revision) && (record.revision as number) > 0 ? (record.revision as number) : 1;
  return { picks, savedAt: typeof record.savedAt === 'string' ? record.savedAt : '', revision };
}

let memory: string | null = null;
const listeners = new Set<() => void>();

export function readRaw(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? memory;
  } catch {
    return memory;
  }
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function savePrediction(value: SavedPrediction) {
  memory = serializePrediction(value);
  try {
    window.localStorage.setItem(STORAGE_KEY, memory);
  } catch {
    // 저장소를 못 쓰면 메모리 값만 유지한다.
  }
  listeners.forEach((listener) => listener());
}

export function clearPrediction() {
  memory = null;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {}
  listeners.forEach((listener) => listener());
}
