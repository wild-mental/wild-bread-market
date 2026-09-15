#!/usr/bin/env node
// 교육가이드 단일 HTML 점검 (헤드리스 Chrome)
//
//   node scripts/guide-check.mjs <가이드 HTML 경로>
//
// 출력 마지막 줄: GUIDE_CHECK: slides=N errors=E overflow=O prompts=P fullcode=F appOrigin=OK|FAIL
// - slides     : .slide 페이지 수
// - errors     : 페이지 이동·전체 읽기·내 앱 주소 입력 중 발생한 JS 예외 + console.error 수
// - overflow   : 390px·1366px 폭에서 가로로 넘친 페이지 수 합계 (스크롤 상자 안 요소·문서 전체 가로 스크롤 포함)
// - prompts    : 🤖 에이전트 프롬프트 박스(.codebox.k-prompt) 수
// - fullcode   : "새 파일/전체 교체" 코드 박스 수 + 앱 소스 코드처럼 보이는 긴 코드 박스 수
// - appOrigin  : 내 앱 주소 입력 → 문서 안 주소 자리 치환 → 새로고침 후 유지 → 지우기 동작
// errors·overflow·fullcode가 0이고 appOrigin=OK이며 slides·prompts가 1 이상이면 exit 0.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { launchChrome } from './lib/chrome.mjs';

const target = process.argv[2];
if (!target || !existsSync(target)) {
  console.log('usage: node scripts/guide-check.mjs <guide.html>');
  process.exit(2);
}
const url = pathToFileURL(resolve(target)).href;
const TEST_ORIGIN = 'https://guide-check-app.vercel.app';

const chrome = await launchChrome();
const report = { slides: 0, errors: 0, overflow: 0, prompts: 0, fullcode: 0, appOrigin: 'FAIL' };
const errorMessages = [];
const overflowPages = [];

try {
  const page = await chrome.newPage();
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  page.on('Runtime.exceptionThrown', (p) => {
    report.errors++;
    errorMessages.push(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text);
  });
  page.on('Runtime.consoleAPICalled', (p) => {
    if (p.type === 'error') {
      report.errors++;
      errorMessages.push(p.args.map((a) => a.value ?? a.description).join(' '));
    }
  });

  async function open(width, height) {
    await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    const loaded = page.waitFor('Page.loadEventFired', 30000);
    await page.send('Page.navigate', { url });
    await loaded;
    await sleep(400);
  }

  // 1) 기본 폭에서 구조 세기
  await open(1366, 900);
  await page.evaluate(`(() => { try { localStorage.clear() } catch {} })()`);
  await open(1366, 900);
  const counts = await page.evaluate(`(() => {
    const boxes = [...document.querySelectorAll('.codebox')];
    const badge = (b) => (b.querySelector('.badge')?.textContent || '').trim();
    const looksLikeSource = (text) => {
      const lines = text.split('\\n');
      if (lines.length < 12) return false;
      const hits = lines.filter((l) => /^\\s*(import\\s.+from\\s|export\\s+(default\\s+)?(async\\s+)?(function|const|class|type)\\b|'use (client|server)'|create\\s+(table|or\\s+replace\\s+function)\\b|\\(function\\s*\\(\\)\\s*\\{)/i.test(l)).length;
      return hits >= 2;
    };
    const full = boxes.filter((b) =>
      b.classList.contains('k-new') || b.classList.contains('k-replace') ||
      /^(새 파일|전체 교체)$/.test(badge(b)) ||
      (!b.classList.contains('k-prompt') && looksLikeSource(b.querySelector('code')?.textContent || '')) ||
      (b.classList.contains('k-prompt') && looksLikeSource(b.querySelector('code')?.textContent || ''))
    ).map((b) => (b.querySelector('.path')?.textContent || badge(b)).slice(0, 60));
    return {
      slides: document.querySelectorAll('.slide').length,
      prompts: document.querySelectorAll('.codebox.k-prompt').length,
      fullcode: full.length,
      fullList: full.slice(0, 10),
    };
  })()`);
  Object.assign(report, { slides: counts.slides, prompts: counts.prompts, fullcode: counts.fullcode });
  if (counts.fullList.length) console.log('fullcode boxes:', counts.fullList.join(' | '));

  // 2) 모든 페이지를 [다음]으로 넘기며 JS 오류 확인, 방향키 이동 확인
  const navOk = await page.evaluate(`(async () => {
    const n = document.querySelectorAll('.slide').length;
    for (let i = 0; i < n; i++) {
      document.getElementById('next').click();
      await new Promise((r) => setTimeout(r, 5));
    }
    const last = document.querySelector('.slide.active')?.dataset.index;
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    const first = document.querySelector('.slide.active')?.dataset.index;
    return String(last) === String(n - 1) && String(first) === '0';
  })()`);
  if (!navOk) {
    report.errors++;
    errorMessages.push('페이지 이동(다음·Home) 실패');
  }

  // 3) 가로 넘침: 전체 읽기 모드로 모든 페이지를 펼쳐 폭별로 확인
  const overflowScan = `(() => {
    const vw = document.documentElement.clientWidth;
    const bad = [];
    const scrollable = (el) => {
      for (let p = el.parentElement; p && !p.classList.contains('slide'); p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') return true;
      }
      return false;
    };
    for (const slide of document.querySelectorAll('.slide')) {
      const box = slide.getBoundingClientRect();
      const over = [...slide.querySelectorAll('*')].some((el) => {
        if (scrollable(el)) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.right > box.right + 1 || r.left < box.left - 1);
      });
      if (over) bad.push(slide.id);
    }
    if (document.documentElement.scrollWidth > vw + 1) bad.push('document');
    return bad;
  })()`;
  for (const [w, h] of [
    [390, 844],
    [1366, 900],
  ]) {
    await open(w, h);
    await page.evaluate(`document.getElementById('readall').click()`);
    await sleep(300);
    const bad = await page.evaluate(overflowScan);
    report.overflow += bad.length;
    if (bad.length) overflowPages.push(`${w}px: ${bad.slice(0, 8).join(', ')}`);
  }

  // 4) 내 앱 주소 치환
  await open(1366, 900);
  const applied = await page.evaluate(`(() => {
    const input = document.querySelector('.app-origin-input');
    const box = input && input.closest('.appbox');
    if (!input || !box) return { ok: false, why: '입력칸 없음' };
    input.value = '${TEST_ORIGIN}/';
    box.querySelector('button').click();
    const vars = [...document.querySelectorAll('.var[data-var="app"]')];
    const allSet = vars.length > 0 && vars.every((v) => v.textContent === '${TEST_ORIGIN}');
    const promptWithVar = [...document.querySelectorAll('.codebox.k-prompt code')].some((c) => c.textContent.includes('${TEST_ORIGIN}'));
    const leftover = [...document.querySelectorAll('.var[data-var="app"]')].some((v) => v.textContent.includes('YOUR-APP'));
    return { ok: allSet && !leftover, vars: vars.length, promptWithVar };
  })()`);
  await open(1366, 900);
  const persisted = await page.evaluate(
    `[...document.querySelectorAll('.var[data-var="app"]')].every((v) => v.textContent === '${TEST_ORIGIN}')`,
  );
  const cleared = await page.evaluate(`(() => {
    const input = document.querySelector('.app-origin-input');
    input.value = '';
    input.closest('.appbox').querySelector('button').click();
    return [...document.querySelectorAll('.var[data-var="app"]')].every((v) => v.textContent === 'https://YOUR-APP.vercel.app');
  })()`);
  report.appOrigin = applied.ok && applied.promptWithVar && persisted && cleared ? 'OK' : 'FAIL';
  if (report.appOrigin !== 'OK') console.log('appOrigin detail:', JSON.stringify({ applied, persisted, cleared }));
} finally {
  await chrome.close();
}

if (errorMessages.length) console.log('errors:', errorMessages.slice(0, 5).join(' / '));
if (overflowPages.length) console.log('overflow:', overflowPages.join(' / '));
const line = `GUIDE_CHECK: slides=${report.slides} errors=${report.errors} overflow=${report.overflow} prompts=${report.prompts} fullcode=${report.fullcode} appOrigin=${report.appOrigin}`;
console.log(line);
const pass =
  report.slides > 0 && report.prompts > 0 && report.errors === 0 && report.overflow === 0 && report.fullcode === 0 && report.appOrigin === 'OK';
process.exit(pass ? 0 : 1);
