'use client';

import { weekProgress, type DayStatus } from '@/lib/mvp/challenge';
import { DEMO, JUDGED_DAYS } from '@/lib/mvp/mock-data';
import { useSavedPrediction } from './hooks';
import s from './mvp.module.css';

const STATUS_TEXT: Record<DayStatus, string> = {
  judged: '판정 완료',
  submitted: '오늘 예측 완료',
  today: '오늘 · 예측 전',
  missed: '미참여',
  upcoming: '예정',
};

// 월~금 진행 도트. 오늘 예측을 저장하면 오늘 도트가 바로 채워진다.
export default function WeekDots() {
  const saved = useSavedPrediction();
  const days = weekProgress(DEMO.weekDays, { today: DEMO.today, judged: JUDGED_DAYS, submittedToday: saved !== null });
  const done = days.filter((d) => d.status === 'judged' || d.status === 'submitted').length;
  return (
    <>
      <ol className={s.week} aria-label="이번 주 참여 진행">
        {days.map((day) => (
          <li key={day.date} data-status={day.status}>
            <span className={`${s.dot} ${s[day.status]}`} title={`${day.label} · ${STATUS_TEXT[day.status]}`} />
            {day.label}
          </li>
        ))}
      </ol>
      <p className={s.weekMeta} data-testid="week-done">
        {done}회 참여 완료 · 월~금 5회차
      </p>
    </>
  );
}
