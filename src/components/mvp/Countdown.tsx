'use client';

import { formatCountdown, isPredictionOpen, remainingMs } from '@/lib/mvp/challenge';
import { DEADLINE, useDemoNow } from './hooks';
import s from './mvp.module.css';

export default function Countdown({ label = '예측 마감까지' }: { label?: string }) {
  const now = useDemoNow();
  const open = isPredictionOpen(now, DEADLINE);
  return (
    <div className={`${s.countdown} ${open ? '' : s.closed}`} role="timer" aria-live="off">
      <span aria-hidden="true">🕘</span>
      {open ? label : '오늘 회차 마감'}
      <b data-testid="countdown">{formatCountdown(remainingMs(now, DEADLINE))}</b>
    </div>
  );
}
