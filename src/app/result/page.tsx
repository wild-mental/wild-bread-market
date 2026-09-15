import type { Metadata } from 'next';
import Link from 'next/link';
import AppShell from '@/components/mvp/AppShell';
import TodayStatus from '@/components/mvp/TodayStatus';
import WeekDots from '@/components/mvp/WeekDots';
import s from '@/components/mvp/mvp.module.css';
import { formatRate, type Outcome } from '@/lib/mvp/challenge';
import { INDEX_META, formatDay, latestRound, weekSummary } from '@/lib/mvp/mock-data';

export const metadata: Metadata = {
  title: '예측 결과 · MAKJI 브레드마켓',
};

const VERDICT: Record<Outcome, string> = { HIT: '적중', MISS: '미적중', VOID: '무효', NONE: '미참여' };

export default function ResultPage() {
  const round = latestRound();
  const week = weekSummary();
  return (
    <AppShell current="/result">
      <h1 className={`${s.title} ${s.center}`} style={{ marginTop: 8 }}>
        지난 회차 예측 결과
      </h1>
      <p className={`${s.lede} ${s.center}`}>{formatDay(round.date)} 회차 · 확정값 공시 후 판정</p>

      <p className={s.scoreHead} data-testid="round-score">
        {round.rows.length}개 중 <b>{round.hits}개</b> 적중
      </p>

      <div className={s.stack}>
        {round.rows.map((row) => (
          <article key={row.key} className={`${s.card} ${s.resultRow}`} data-index={row.key} data-outcome={row.outcome}>
            <span className={s.thumb} aria-hidden="true">
              {INDEX_META[row.key].emoji}
            </span>
            <p>
              <strong className={s.indexName}>{INDEX_META[row.key].short}</strong>
              <br />
              <small>
                내 예측 {row.pick ?? '-'} · 실제 {row.actual ?? '확정값 없음'}
              </small>
            </p>
            <span className={`${s.verdict} ${s[row.outcome]}`}>{VERDICT[row.outcome]}</span>
          </article>
        ))}
      </div>

      <section className={s.panel} style={{ marginTop: 14 }} aria-label="이번 주 정확도">
        <div className={s.accuracy}>
          <p>
            <span className={s.caption} style={{ color: 'var(--ink-2)', fontSize: 14 }}>
              이번 주 정확도
            </span>
            <br />
            <span className={s.rate} data-testid="weekly-rate">
              {formatRate(week.rate)}
              <small>%</small>
            </span>
            <br />
            <strong>
              {week.valid}개 중 {week.hits}개 적중
            </strong>
          </p>
          <p className={s.formula}>
            정확도 = 정답 수 ÷ 유효 예측 수
            <br />
            무효 회차는 분모에서 제외
          </p>
        </div>
        <WeekDots />
      </section>

      <TodayStatus />

      <Link className={s.cta} href="/predict">
        다음 회차 예측하기 <span aria-hidden="true">›</span>
      </Link>
      <p className={s.footer}>주간 랭킹은 금요일 회차 판정 직후 확정됩니다 · 화면과 수치는 기획 예시입니다</p>
    </AppShell>
  );
}
