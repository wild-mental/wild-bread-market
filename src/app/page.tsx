import Link from 'next/link';
import AppShell from '@/components/mvp/AppShell';
import Countdown from '@/components/mvp/Countdown';
import Sparkline from '@/components/mvp/Sparkline';
import WeekDots from '@/components/mvp/WeekDots';
import s from '@/components/mvp/mvp.module.css';
import { LAB, storefrontProductUrl } from '@/lib/cafe24/lab-config';
import { DEMO, INDEX_CARDS, formatDay, remainingRounds } from '@/lib/mvp/mock-data';

// MAKJI 브레드마켓 랜딩: 이번 주 챌린지 안내 + 3종 지수 카드. 수치는 목업(발표자료 값)이다.
export default function Home() {
  return (
    <AppShell current="/">
      <p className={s.eyebrow}>오늘의 브레드마켓</p>
      <h1 className={s.title}>
        내일의 <em>브레드 방향</em>을
        <br />
        맞혀보세요
      </h1>
      <p className={s.lede}>작은 호기심이 더 특별한 하루를 만듭니다. 참가비 없이 UP / DOWN 두 가지만 고르면 됩니다.</p>

      <div className={s.reward}>
        <span className={s.gift} aria-hidden="true">
          🎁
        </span>
        <div>
          <small>주간 정확도 상위 참여자에게</small>
          <strong>{DEMO.reward}</strong>
        </div>
      </div>

      <ol className={s.steps} aria-label="참여 방법">
        <li>
          <span>1</span>지수 확인
        </li>
        <li className={s.stepArrow} aria-hidden="true">
          →
        </li>
        <li>
          <span>2</span>UP/DOWN 예측
        </li>
        <li className={s.stepArrow} aria-hidden="true">
          →
        </li>
        <li>
          <span>3</span>결과 확인
        </li>
      </ol>

      <div className={s.sectionHead}>
        <h2>이번 주 챌린지</h2>
        <p className={s.caption}>
          {formatDay(DEMO.weekDays[0])} ~ {formatDay(DEMO.weekDays[4])}
        </p>
      </div>
      <section className={`${s.panel} ${s.stack}`} style={{ marginTop: 10 }} aria-label="이번 주 챌린지">
        <dl className={s.facts} style={{ margin: 0 }}>
          <div>
            <dt>남은 회차</dt>
            <dd data-testid="remaining-rounds">{remainingRounds()}회</dd>
          </div>
          <div>
            <dt>참여 인원</dt>
            <dd>{DEMO.participants.toLocaleString('ko-KR')}명</dd>
          </div>
          <div>
            <dt>참가비</dt>
            <dd>0원</dd>
          </div>
        </dl>
        <div>
          <WeekDots />
        </div>
        <p className={s.caption} style={{ color: 'var(--ink-2)' }}>
          정확도는 매주 초기화돼요. 지금 시작해도 이번 주 1위가 될 수 있어요.
        </p>
      </section>

      <Countdown />

      <div className={s.sectionHead}>
        <h2>오늘의 3종 지수</h2>
        <p className={s.caption}>최근 확정값 기준</p>
      </div>
      <div className={s.stack} style={{ marginTop: 10 }}>
        {INDEX_CARDS.map((card) => (
          <article key={card.key} className={`${s.card} ${s.indexCard}`} data-index={card.key}>
            <span className={s.thumb} aria-hidden="true">
              {card.emoji}
            </span>
            <div>
              <h3 className={s.indexName}>{card.name}</h3>
              <p className={s.market}>{card.market}</p>
              <p className={s.value}>
                {card.value.toFixed(1)}
                <span className={`${s.change} ${s[card.direction]}`}>
                  {card.direction === 'UP' ? '▲' : card.direction === 'DOWN' ? '▼' : '-'} {Math.abs(card.changePct).toFixed(1)}%
                </span>
              </p>
            </div>
            <Sparkline values={card.spark} direction={card.direction} />
            {card.key === LAB.product.indexKey ? (
              <a className={s.storeLink} href={storefrontProductUrl()} target="_blank" rel="noopener noreferrer">
                오늘의 브레드 보러 가기 (자사몰 상품 {LAB.product.productNo}) →
              </a>
            ) : null}
          </article>
        ))}
      </div>

      <Link className={s.cta} href="/predict">
        오늘의 예측 시작하기 <span aria-hidden="true">›</span>
      </Link>
      <Link className={s.ghost} href="/result">
        지난 회차 결과 보기
      </Link>

      <p className={s.footer}>
        화면과 수치는 기획 예시입니다 · 실제 시장 데이터가 아닙니다
        <br />
        <Link href="/admin/cafe24">카페24 연동 관리 (관리자)</Link>
      </p>
    </AppShell>
  );
}
