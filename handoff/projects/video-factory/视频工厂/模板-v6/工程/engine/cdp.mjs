/* =========================================================================
   极简 Chrome 遥控器（零依赖，不用装 puppeteer / playwright）
   ========================================================================= */
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP_CHROMES = []; // Never launch system browsers.

/* 优先用 Playwright 缓存里的 chrome-headless-shell —— 专为无界面渲染做的，最稳 */
export function findChrome() {
  const base = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  if (fs.existsSync(base)) {
    const shells = fs.readdirSync(base)
      .filter(d => d.startsWith('chromium_headless_shell-'))
      .sort((a, b) => (+b.split('-')[1]) - (+a.split('-')[1]));
    for (const d of shells) {
      for (const sub of ['chrome-headless-shell-mac-arm64', 'chrome-headless-shell-mac-x64']) {
        const p = path.join(base, d, sub, 'chrome-headless-shell');
        if (fs.existsSync(p)) return { exe: p, headlessFlag: false };
      }
    }
    const chromiums = fs.readdirSync(base)
      .filter(d => /^chromium-\d+$/.test(d))
      .sort((a, b) => (+b.split('-')[1]) - (+a.split('-')[1]));
    for (const d of chromiums) {
      for (const sub of ['chrome-mac-arm64', 'chrome-mac']) {
        for (const app of ['Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
                           'Chromium.app/Contents/MacOS/Chromium']) {
          const p = path.join(base, d, sub, app);
          if (fs.existsSync(p)) return { exe: p, headlessFlag: true };
        }
      }
    }
  }
  for (const c of APP_CHROMES) if (fs.existsSync(c)) return { exe: c, headlessFlag: true };
  throw new Error('找不到可用的 Chrome。装一个 Google Chrome，或运行： npx playwright install chromium');
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function launch(port = 9422) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'usj-cli-'));
  const session='usj-render-'+process.pid;
  // Playwright CLI：优先用 Codex 自带的包装脚本（~/.codex/…）；另一台电脑没有它就直接 npx 同一版本
  const wrap=path.join(os.homedir(),'.codex/skills/playwright/scripts/playwright_cli.sh');
  const cli=fs.existsSync(wrap)?wrap:'npx', pre=fs.existsSync(wrap)?[]:['--yes','--package','@playwright/cli@0.1.18','playwright-cli'];
  const config=path.join(profile,'cli.json');
  fs.writeFileSync(config,JSON.stringify({browser:{browserName:'chromium',launchOptions:{headless:true,args:[`--remote-debugging-port=${port}`,'--allow-file-access-from-files','--disable-web-security','--font-render-hinting=none','--disable-lcd-text']}}}));
  execFileSync(cli,[...pre,'--session='+session,'open','about:blank','--config='+config],{stdio:'pipe',timeout:30000});
  let exited=false,errbuf='';
  const proc={kill(){try{execFileSync(cli,[...pre,'--session='+session,'close'],{stdio:'pipe',timeout:20000});}catch(e){}}};
  const exe='Playwright CLI isolated Chromium';
  let ver = null;
  for (let i = 0; i < 150; i++) {
    if (exited) break;
    try {
      const ctl = AbortSignal.timeout(1500);
      const r = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: ctl });
      if (r.ok) { ver = await r.json(); break; }
    } catch (e) { }
    await sleep(120);
  }
  if (!ver) {
    try { proc.kill('SIGKILL'); } catch (e) { }
    throw new Error('无头浏览器启动失败。\n浏览器: ' + exe + '\n日志: ' + errbuf.slice(-800));
  }
  return { proc, profile, wsUrl: ver.webSocketDebuggerUrl, port, exe };
}

export class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.waiters = new Map(); this.evs = new Map(); }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => {
      const to = setTimeout(() => rej(new Error('连接无头浏览器超时')), 15000);
      ws.onopen = () => { clearTimeout(to); res(); };
      ws.onerror = (e) => { clearTimeout(to); rej(new Error('无头浏览器连接失败')); };
    });
    const c = new CDP(ws);
    ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.id && c.waiters.has(m.id)) {
        const { res, rej } = c.waiters.get(m.id); c.waiters.delete(m.id);
        m.error ? rej(new Error(m.error.message)) : res(m.result);
      } else if (m.method) {
        (c.evs.get(m.method) || []).forEach(f => f(m.params));
      }
    };
    return c;
  }
  on(ev, fn) { if (!this.evs.has(ev)) this.evs.set(ev, []); this.evs.get(ev).push(fn); }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.waiters.set(id, { res, rej });
      this.ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
    });
  }
  close() { try { this.ws.close(); } catch (e) { } }
}

export async function openPage(cdp, url, w = 1920, h = 1080) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const S = sessionId;
  await cdp.send('Page.enable', {}, S);
  await cdp.send('Runtime.enable', {}, S);
  await cdp.send('Emulation.setDeviceMetricsOverride',
    { width: w, height: h, deviceScaleFactor: 1, mobile: false }, S);

  const loaded = new Promise(res => {
    const h2 = () => res();
    cdp.on('Page.loadEventFired', h2);
  });
  await cdp.send('Page.navigate', { url }, S);
  await Promise.race([loaded, sleep(15000)]);
  return S;
}

export async function evalJS(cdp, S, expr) {
  const r = await cdp.send('Runtime.evaluate',
    { expression: expr, awaitPromise: true, returnByValue: true }, S);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' :: ' + expr.slice(0, 120));
  return r.result && r.result.value;
}

export async function shot(cdp, S, w = 1920, h = 1080, quality = 92) {
  const r = await cdp.send('Page.captureScreenshot',
    { format: 'jpeg', quality, captureBeyondViewport: false,
      clip: { x: 0, y: 0, width: w, height: h, scale: 1 } }, S);
  return Buffer.from(r.data, 'base64');
}

// 模板·实拍底片：PNG 截图（配合 Emulation.setDefaultBackgroundColorOverride 透明底）
export async function shotPNG(cdp, S, w = 1920, h = 1080) {
  const r = await cdp.send('Page.captureScreenshot',
    { format: 'png', captureBeyondViewport: false, clip: { x: 0, y: 0, width: w, height: h, scale: 1 } }, S);
  return Buffer.from(r.data, 'base64');
}
