// 헤드리스 Chrome을 띄워 DevTools 프로토콜(CDP)로 조작하는 최소 도우미. 외부 패키지 없이 Node 24 내장 WebSocket을 쓴다.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];

export function findChrome() {
  return CANDIDATES.find((p) => p && existsSync(p)) ?? null;
}

class Connection {
  #ws;
  #nextId = 1;
  #pending = new Map();
  #listeners = new Set();

  constructor(ws) {
    this.#ws = ws;
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(String(event.data));
      if (msg.id && this.#pending.has(msg.id)) {
        const { resolve, reject, method } = this.#pending.get(msg.id);
        this.#pending.delete(msg.id);
        if (msg.error) reject(new Error(`${method}: ${msg.error.message}`));
        else resolve(msg.result);
      } else if (msg.method) {
        for (const listener of this.#listeners) listener(msg);
      }
    });
  }

  send(method, params = {}, sessionId) {
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject, method });
      this.#ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  on(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  close() {
    this.#ws.close();
  }
}

export async function launchChrome() {
  const chromePath = findChrome();
  if (!chromePath) throw new Error('Chrome을 찾지 못했습니다. CHROME_PATH 환경변수로 경로를 지정하세요.');
  const profile = await mkdtemp(join(tmpdir(), 'makji-chrome-'));
  const proc = spawn(
    chromePath,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-networking',
      '--hide-scrollbars',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  const exited = new Promise((resolve) => proc.once('exit', resolve));

  let active = '';
  for (let i = 0; i < 100 && !active; i++) {
    active = await readFile(join(profile, 'DevToolsActivePort'), 'utf8').catch(() => '');
    if (!active) await sleep(100);
  }
  if (!active) {
    proc.kill();
    throw new Error('Chrome DevTools 포트를 열지 못했습니다.');
  }
  const [port, path] = active.trim().split('\n');
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  const conn = new Connection(ws);

  return {
    conn,
    async newPage() {
      const { targetId } = await conn.send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await conn.send('Target.attachToTarget', { targetId, flatten: true });
      return {
        send: (method, params) => conn.send(method, params, sessionId),
        on: (event, handler) => conn.on((msg) => msg.sessionId === sessionId && msg.method === event && handler(msg.params)),
        waitFor(event, timeoutMs = 15000) {
          return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
              off();
              reject(new Error(`${event} 대기 시간 초과`));
            }, timeoutMs);
            const off = conn.on((msg) => {
              if (msg.sessionId === sessionId && msg.method === event) {
                clearTimeout(timer);
                off();
                resolve(msg.params);
              }
            });
          });
        },
        async evaluate(expression) {
          const { result, exceptionDetails } = await conn.send(
            'Runtime.evaluate',
            { expression, returnByValue: true, awaitPromise: true },
            sessionId,
          );
          if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
          return result.value;
        },
        close: () => conn.send('Target.closeTarget', { targetId }),
      };
    },
    async close() {
      conn.close();
      proc.kill();
      await Promise.race([exited, sleep(3000)]);
      await rm(profile, { recursive: true, force: true }).catch(() => {});
    },
  };
}

// 조건 함수가 true를 돌려줄 때까지 기다린다.
export async function waitUntil(check, { timeoutMs = 10000, intervalMs = 150 } = {}) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const value = await check().catch(() => null);
    if (value) return value;
    await sleep(intervalMs);
  }
  return null;
}
