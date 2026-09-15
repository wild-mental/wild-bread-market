'use client';

import Link from 'next/link';
import { useState } from 'react';
import { canSubmit, isPredictionOpen, PREDICTION_KEYS, type Pick, type Picks } from '@/lib/mvp/challenge';
import { INDEX_CARDS, INDEX_META } from '@/lib/mvp/mock-data';
import { clearPrediction, savePrediction } from '@/lib/mvp/prediction-store';
import Countdown from './Countdown';
import { DEADLINE, moveClockTo, resetClock, useDemoNow, useSavedPrediction } from './hooks';
import WeekDots from './WeekDots';
import s from './mvp.module.css';

type IndexKey = (typeof PREDICTION_KEYS)[number];

export default function PredictBoard() {
  const now = useDemoNow();
  const saved = useSavedPrediction();
  const open = isPredictionOpen(now, DEADLINE);
  const [draft, setDraft] = useState<Picks<IndexKey> | null>(null);
  const [message, setMessage] = useState('');

  // draft가 null이면 "저장 완료" 화면, 값이 있으면 선택 화면. 저장한 적이 없으면 처음부터 선택 화면이다.
  const editing = draft !== null || saved === null;
  const picks: Picks<IndexKey> = draft ?? saved?.picks ?? {};
  const chosen = PREDICTION_KEYS.filter((key) => picks[key]).length;

  function choose(key: IndexKey, pick: Pick) {
    setMessage('');
    // 연달아 눌러도 앞선 선택이 사라지지 않게 직전 상태에서 이어 붙인다.
    setDraft((prev) => ({ ...(prev ?? saved?.picks ?? {}), [key]: pick }));
  }

  function submit() {
    // 버튼이 눌린 순간의 시각으로 다시 확인한다(화면 표시와 별개로 마감을 막는다).
    if (!isPredictionOpen(now, DEADLINE)) {
      setMessage('예측이 마감되어 제출할 수 없어요.');
      return;
    }
    if (!canSubmit(picks)) {
      setMessage('세 지수를 모두 골라 주세요.');
      return;
    }
    savePrediction({ picks, savedAt: new Date(now).toISOString(), revision: (saved?.revision ?? 0) + 1 });
    setDraft(null);
    setMessage('');
  }

  if (!editing && saved) {
    return (
      <>
        <div className={s.bigCheck} aria-hidden="true">
          ✓
        </div>
        <h1 className={`${s.title} ${s.center}`} style={{ marginTop: 12 }}>
          예측이 저장됐어요
        </h1>
        <p className={`${s.lede} ${s.center}`}>
          {saved.revision > 1 ? `수정 ${saved.revision - 1}회 반영 · ` : ''}마감 전까지 언제든 바꿀 수 있어요.
        </p>
        <Countdown />
        <section className={s.card} style={{ marginTop: 14 }} aria-label="내가 선택한 방향">
          <h2 className={s.indexName}>내가 선택한 방향</h2>
          <ul className={s.chipList} data-testid="saved-picks">
            {INDEX_CARDS.map((card) => (
              <li key={card.key}>
                <span className={s.emoji} aria-hidden="true">
                  {card.emoji}
                </span>
                {INDEX_META[card.key].short}
                <span className={`${s.dirChip} ${s[saved.picks[card.key] as Pick]}`}>
                  {saved.picks[card.key]} {saved.picks[card.key] === 'UP' ? '↑' : '↓'}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className={s.panel} style={{ marginTop: 12 }} aria-label="결과 안내">
          <h2 className={s.indexName} style={{ color: 'var(--forest)' }}>
            결과를 기다리는 중
          </h2>
          <p className={s.market}>마감 후 확정값이 공시되면 판정해 다음 회차와 함께 공개돼요.</p>
          <p className={s.caption} style={{ marginTop: 10 }}>
            이번 주 참여
          </p>
          <WeekDots />
        </section>
        {open ? (
          <button type="button" className={s.cta} onClick={() => setDraft({ ...saved.picks })}>
            마감 전까지 수정하기
          </button>
        ) : (
          <p className={s.message}>마감되어 더 이상 수정할 수 없어요.</p>
        )}
        <Link className={s.ghost} href="/">
          브레드마켓 홈으로
        </Link>
        <DemoTools />
      </>
    );
  }

  return (
    <>
      <h1 className={s.title} style={{ marginTop: 8 }}>
        오늘의 <em>UP/DOWN</em> 예측
      </h1>
      <p className={s.lede}>오늘의 브레드 지수 방향을 선택하세요.</p>
      <Countdown label="마감까지" />
      <div className={s.stack}>
        {INDEX_CARDS.map((card) => (
          <fieldset key={card.key} className={`${s.card} ${s.pickRow}`} data-index={card.key} disabled={!open}>
            <span className={s.thumb} aria-hidden="true">
              {card.emoji}
            </span>
            <div>
              <legend className={s.indexName} style={{ float: 'left', padding: 0 }}>
                {card.name}
              </legend>
              <p className={s.value} style={{ clear: 'left', fontSize: 19 }}>
                {card.value.toFixed(1)}
              </p>
              <div className={s.pickButtons}>
                {(['UP', 'DOWN'] as const).map((pick) => (
                  <button
                    key={pick}
                    type="button"
                    className={s.pick}
                    aria-pressed={picks[card.key] === pick}
                    onClick={() => choose(card.key, pick)}
                  >
                    {pick === 'UP' ? '↑' : '↓'} {pick}
                    {picks[card.key] === pick ? ' ✓' : ''}
                  </button>
                ))}
              </div>
            </div>
          </fieldset>
        ))}
      </div>
      <p className={`${s.status} ${chosen === 3 ? '' : s.pending}`} data-testid="pick-status">
        <i aria-hidden="true">✓</i>
        {chosen === 3 ? '3개 지수 선택 완료' : `${chosen}/3개 지수 선택`}
      </p>
      {message ? (
        <p className={s.message} role="alert">
          {message}
        </p>
      ) : null}
      <button type="button" className={s.cta} onClick={submit} disabled={!open || chosen < 3}>
        {saved ? '수정 내용 저장하기' : '예측 제출하기'} <span aria-hidden="true">›</span>
      </button>
      {saved && draft ? (
        <button type="button" className={s.ghost} onClick={() => setDraft(null)}>
          수정 취소
        </button>
      ) : null}
      <p className={s.note}>{open ? '마감 후에는 변경할 수 없어요' : '오늘 회차가 마감되어 선택할 수 없어요'}</p>
      <DemoTools />
    </>
  );
}

// 체험 도구: 마감 규칙을 바로 확인할 수 있게 시계를 옮긴다. 실서비스에는 없다.
function DemoTools() {
  return (
    <div className={s.tools}>
      <span>체험 도구 (실서비스에는 없음)</span>
      <button type="button" className={s.tool} onClick={() => moveClockTo(DEADLINE - 10_000)}>
        마감 10초 전으로
      </button>
      <button type="button" className={s.tool} onClick={resetClock}>
        시계 처음으로
      </button>
      <button type="button" className={s.tool} onClick={clearPrediction}>
        저장한 예측 지우기
      </button>
    </div>
  );
}
