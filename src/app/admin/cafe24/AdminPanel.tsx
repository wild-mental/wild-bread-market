'use client';

import { useState } from 'react';

type Output = { title: string; status: number; body: unknown };

export default function AdminPanel({ oauthResult }: { oauthResult: string | null }) {
  const [busy, setBusy] = useState(false);
  const [scenario, setScenario] = useState<'up' | 'down'>('up');
  const [applyDiscount, setApplyDiscount] = useState(false);
  const [output, setOutput] = useState<Output | null>(null);

  async function call(title: string, path: string, method: 'GET' | 'POST' | 'DELETE', body?: unknown) {
    setBusy(true);
    try {
      const res = await fetch(path, {
        method,
        headers: method === 'GET' ? undefined : { 'Content-Type': 'application/json' },
        body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
      });
      setOutput({ title, status: res.status, body: await res.json().catch(() => null) });
    } catch {
      setOutput({ title, status: 0, body: '네트워크 오류' });
    } finally {
      setBusy(false);
    }
  }

  const choice = { scenario, applyDiscount };

  return (
    <>
      {oauthResult ? (
        <section>
          <strong>연결 결과: {oauthResult}</strong>
          <p className="muted">connected가 아니면 가이드의 &quot;인증이 안 될 때&quot; 표에서 같은 값을 찾으세요.</p>
        </section>
      ) : null}

      <section>
        <h2>1. 연결</h2>
        <div className="row">
          <a className="btn" href="/api/cafe24/oauth/start">카페24 연결하기</a>
          <button type="button" className="secondary" disabled={busy} onClick={() => call('연결 상태', '/api/admin/cafe24/status', 'GET')}>
            연결 상태
          </button>
        </div>
      </section>

      <section>
        <h2>2. 상품</h2>
        <div className="row">
          <button type="button" className="secondary" disabled={busy} onClick={() => call('상품 조회', '/api/admin/cafe24/product', 'GET')}>
            상품 조회
          </button>
          <button type="button" disabled={busy} onClick={() => call('기준값 저장', '/api/admin/cafe24/product', 'POST')}>
            기준값 저장
          </button>
        </div>
      </section>

      <section>
        <h2>3. 지수 반영</h2>
        <div className="row">
          <select value={scenario} onChange={(e) => setScenario(e.target.value as 'up' | 'down')}>
            <option value="up">up · 통밀 브레드 지수 102.4 ▲1.2%</option>
            <option value="down">down · 통밀 브레드 지수 101.9 ▼0.5%</option>
          </select>
          <label className="row">
            <input type="checkbox" checked={applyDiscount} onChange={(e) => setApplyDiscount(e.target.checked)} />
            하락일 5% 할인 규칙 적용
          </label>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button type="button" className="secondary" disabled={busy} onClick={() => call('미리보기', '/api/admin/cafe24/preview', 'POST', choice)}>
            미리보기
          </button>
          <button type="button" disabled={busy} onClick={() => call('적용', '/api/admin/cafe24/apply', 'POST', choice)}>
            적용
          </button>
          <button type="button" className="secondary" disabled={busy} onClick={() => call('복원', '/api/admin/cafe24/restore', 'POST')}>
            기준값으로 복원
          </button>
        </div>
      </section>

      <section>
        <h2>4. 상품 상세 위젯</h2>
        <div className="row">
          <button type="button" className="secondary" disabled={busy} onClick={() => call('위젯 설치 확인', '/api/admin/cafe24/scripttags', 'GET')}>
            설치 확인
          </button>
          <button type="button" disabled={busy} onClick={() => call('위젯 설치', '/api/admin/cafe24/scripttags', 'POST')}>
            위젯 설치
          </button>
          <button type="button" className="secondary" disabled={busy} onClick={() => call('위젯 삭제', '/api/admin/cafe24/scripttags', 'DELETE')}>
            위젯 삭제
          </button>
        </div>
      </section>

      <section aria-live="polite">
        <h2>결과 {output ? `· ${output.title} (HTTP ${output.status})` : ''}</h2>
        <pre>{output ? JSON.stringify(output.body, null, 2) : '버튼을 누르면 서버 응답이 여기에 표시됩니다.'}</pre>
      </section>
    </>
  );
}
