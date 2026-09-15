import type { Metadata } from 'next';
import AppShell from '@/components/mvp/AppShell';
import PredictBoard from '@/components/mvp/PredictBoard';

export const metadata: Metadata = {
  title: '오늘의 UP/DOWN 예측 · MAKJI 브레드마켓',
};

export default function PredictPage() {
  return (
    <AppShell current="/predict">
      <PredictBoard />
    </AppShell>
  );
}
