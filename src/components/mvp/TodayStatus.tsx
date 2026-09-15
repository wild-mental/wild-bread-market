'use client';

import { formatDay, DEMO } from '@/lib/mvp/mock-data';
import { useSavedPrediction } from './hooks';
import s from './mvp.module.css';

// 결과 화면 하단: 오늘 회차 예측을 저장했는지 알려준다.
export default function TodayStatus() {
  const saved = useSavedPrediction();
  return (
    <p className={s.note} data-testid="today-status" style={{ marginTop: 14 }}>
      {saved
        ? `${formatDay(DEMO.today)} 예측 제출 완료 · 결과는 다음 회차와 함께 공개돼요`
        : `${formatDay(DEMO.today)} 회차가 열려 있어요 · 마감 전에 예측해 주세요`}
    </p>
  );
}
