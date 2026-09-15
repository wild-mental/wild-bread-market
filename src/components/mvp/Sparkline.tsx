import type { Direction } from '@/lib/cafe24/policy';
import s from './mvp.module.css';

// 최근 흐름 미니 차트. 값 배열을 40×76 상자에 맞춰 그린다.
export default function Sparkline({ values, direction }: { values: readonly number[]; direction: Direction }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((v, i) => `${((i / (values.length - 1)) * 74 + 1).toFixed(1)},${(38 - ((v - min) / span) * 34).toFixed(1)}`)
    .join(' ');
  const color = direction === 'UP' ? '#2e9e5b' : direction === 'DOWN' ? '#e0463f' : '#64748b';
  return (
    <svg className={s.spark} viewBox="0 0 76 40" role="img" aria-label="최근 흐름">
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
