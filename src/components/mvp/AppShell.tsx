import Link from 'next/link';
import type { ReactNode } from 'react';
import s from './mvp.module.css';

const TABS = [
  { href: '/', label: '홈', icon: '⌂' },
  { href: '/predict', label: '예측', icon: '↕' },
  { href: '/result', label: '결과', icon: '▥' },
] as const;

export default function AppShell({ current, children }: { current: (typeof TABS)[number]['href']; children: ReactNode }) {
  return (
    <div className={s.backdrop}>
      <main className={s.app}>
        <header className={s.topbar}>
          <Link href="/" aria-label="MAKJI 브레드마켓 홈">
            {/* eslint-disable-next-line @next/next/no-img-element -- 작은 로고 한 장이라 최적화 파이프라인이 필요 없다 */}
            <img className={s.logo} src="/brand/makji-logo.png" alt="MAKJI" width={84} height={70} />
          </Link>
          <span className={s.demoChip}>체험 목업 · 수치는 기획 예시</span>
        </header>
        {children}
        <nav className={s.tabbar} aria-label="브레드마켓 메뉴">
          {TABS.map((tab) => (
            <Link key={tab.href} href={tab.href} className={s.tab} aria-current={tab.href === current ? 'page' : undefined}>
              <span aria-hidden="true">{tab.icon}</span>
              {tab.label}
            </Link>
          ))}
        </nav>
      </main>
    </div>
  );
}
