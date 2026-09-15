/* MAKJI 브레드마켓 · 카페24 상품 상세 위젯
 * 카페24 Scripttags로 설치된다. 쇼핑몰 화면이 모두 로드된 뒤 실행되며,
 * 실패하면 아무것도 표시하지 않고 조용히 끝난다(구매 버튼·상품 화면에 영향 없음). */
(function () {
  'use strict';

  // 카페24 네임스페이스 규칙: {앱이름}_FRONT_{경로}_{파일명}. 두 번 실행되지 않게 막는다.
  var NS = 'MAKJIBREAD_FRONT_WIDGETS_MAKJI_BREAD';
  if (window[NS]) return;
  window[NS] = { version: '1.0.0' };

  var script = document.currentScript;
  var APP_ORIGIN = script && script.src ? new URL(script.src).origin : '';
  if (!APP_ORIGIN) return;

  // 상품번호 찾기: ① ?product_no=16  ② /product/상품명/16/category/81/display/1/  ③ 스킨 변수 iProductNo
  function findProductNo() {
    var query = new URLSearchParams(location.search).get('product_no');
    if (query && /^\d+$/.test(query)) return query;
    var path = location.pathname.match(/^\/(?:m\/)?product\/[^/]+\/(\d+)(?:\/|$)/);
    if (path) return path[1];
    var skinValue = String(window.iProductNo || '');
    return /^\d+$/.test(skinValue) ? skinValue : null;
  }

  function closedBefore(productNo) {
    try {
      return sessionStorage.getItem(NS + ':closed:' + productNo) === '1';
    } catch {
      return false;
    }
  }

  function render(data, productNo) {
    var host = document.createElement('div');
    host.id = 'makji-bread-widget';
    var root = host.attachShadow({ mode: 'open' });
    root.innerHTML =
      '<style>' +
      ':host{all:initial}' +
      '.card{position:fixed;right:16px;bottom:24px;z-index:2147483000;width:260px;box-sizing:border-box;' +
      'padding:14px 16px;border-radius:14px;background:#fff;color:#172f4b;border:1px solid #dbe5ef;' +
      'box-shadow:0 10px 30px rgba(23,47,75,.18);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Noto Sans KR",sans-serif}' +
      '.eyebrow{margin:0;font-size:11px;font-weight:700;color:#2879bc;letter-spacing:.02em}' +
      '.name{margin:4px 0 0;font-weight:700}' +
      '.value{margin:2px 0 0;font-size:22px;font-weight:800}' +
      '.chg{font-size:13px;font-weight:700;margin-left:6px}.UP{color:#d8453b}.DOWN{color:#2a6fd6}.FLAT{color:#5b6b7d}' +
      '.market{margin:2px 0 10px;font-size:12px;color:#5b6b7d}' +
      '.cta{display:block;text-align:center;padding:9px 10px;border-radius:9px;background:#2879bc;color:#fff;text-decoration:none;font-weight:700}' +
      '.close{position:absolute;top:6px;right:8px;border:0;background:none;font-size:18px;line-height:1;color:#5b6b7d;cursor:pointer;padding:4px}' +
      '@media (max-width:768px){.card{left:12px;right:12px;width:auto;bottom:calc(104px + env(safe-area-inset-bottom))}}' +
      '</style>' +
      '<aside class="card" role="complementary" aria-label="MAKJI 브레드마켓 지수">' +
      '<button class="close" type="button" aria-label="위젯 닫기">×</button>' +
      '<p class="eyebrow">MAKJI 브레드마켓 · 실습 데이터</p>' +
      '<p class="name"></p><p class="value"><span class="num"></span><span class="chg"></span></p>' +
      '<p class="market"></p><a class="cta" target="_blank" rel="noopener">오늘의 UP/DOWN 예측하기 →</a>' +
      '</aside>';

    // 서버 값은 textContent로만 넣는다(HTML 주입 방지).
    var arrow = data.direction === 'UP' ? '▲' : data.direction === 'DOWN' ? '▼' : '-';
    root.querySelector('.name').textContent = data.indexName;
    root.querySelector('.num').textContent = Number(data.value).toFixed(1);
    var chg = root.querySelector('.chg');
    chg.textContent = arrow + Math.abs(Number(data.changePct)).toFixed(1) + '%';
    chg.className = 'chg ' + (data.direction === 'UP' || data.direction === 'DOWN' ? data.direction : 'FLAT');
    root.querySelector('.market').textContent = data.market + (data.demo ? ' · 수업용 예시값' : '');

    var cta = root.querySelector('.cta');
    try {
      var url = new URL(data.ctaUrl);
      if (url.origin === APP_ORIGIN) cta.href = url.toString();
      else cta.remove();
    } catch {
      cta.remove();
    }

    root.querySelector('.close').addEventListener('click', function () {
      host.remove();
      try {
        sessionStorage.setItem(NS + ':closed:' + productNo, '1');
      } catch {}
    });
    document.body.appendChild(host);
  }

  function start() {
    var productNo = findProductNo();
    if (!productNo || closedBefore(productNo)) return;

    var controller = new AbortController();
    var timer = setTimeout(function () {
      controller.abort();
    }, 5000);

    fetch(APP_ORIGIN + '/api/public/bread-widget?product_no=' + encodeURIComponent(productNo), {
      credentials: 'omit',
      signal: controller.signal,
    })
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .then(function (data) {
        if (data && data.indexName) render(data, productNo);
      })
      .catch(function () {})
      .finally(function () {
        clearTimeout(timer);
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
