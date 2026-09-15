import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MAKJI 브레드마켓 · 카페24 연동 실습',
  description: '브레드 인덱스 3종 업다운 예측 서비스와 카페24 자사몰 연동',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
