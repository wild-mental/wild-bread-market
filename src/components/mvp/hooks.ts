'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { DEMO } from '@/lib/mvp/mock-data';
import { parseSavedPrediction, readRaw, subscribe } from '@/lib/mvp/prediction-store';

const START = Date.parse(DEMO.now);
export const DEADLINE = Date.parse(DEMO.deadline);

// 체험 시계. 서버·첫 화면은 기준 시각(마감 02:35:10 전)으로 그리고, 이후 실제 흐른 초만큼 간다.
// 페이지를 이동해도 같은 시계를 쓰도록 모듈에 한 번만 둔다.
let clockBase = 0;
let clockOffset = 0;
const clockListeners = new Set<() => void>();

function subscribeClock(listener: () => void) {
  clockListeners.add(listener);
  const timer = window.setInterval(listener, 1000);
  return () => {
    clockListeners.delete(listener);
    window.clearInterval(timer);
  };
}

function readClock() {
  if (!clockBase) clockBase = Date.now();
  return START + clockOffset + Math.floor((Date.now() - clockBase) / 1000) * 1000;
}

export function useDemoNow() {
  return useSyncExternalStore(subscribeClock, readClock, () => START);
}

// 체험 도구: 마감 직전으로 이동하거나 기준 시각으로 되돌린다.
export function moveClockTo(target: number) {
  clockOffset += target - readClock();
  clockListeners.forEach((listener) => listener());
}

export function resetClock() {
  clockBase = Date.now();
  clockOffset = 0;
  clockListeners.forEach((listener) => listener());
}

export function useSavedPrediction() {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  return useMemo(() => parseSavedPrediction(raw), [raw]);
}
