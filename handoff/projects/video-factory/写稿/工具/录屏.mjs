/* 网页录屏（AI 片用，2026-10-23）：照脚本操作网页，逐帧截图拼成 1920×1080、30 帧/秒的 mp4。
   操作：动画光标移动、点击涟漪、逐字输入、按键、平滑滚动、关键句黄底红框（逐步划出）、执行 JS。
   画面时间完全按脚本走（「逐帧」）：光标、打字、滚动绝对平滑，加载网页的时间不进视频。
   网页自己的动画（流式回答、加载转圈）在逐帧截图时会被压快；要真实速度，在那一步用 {"wait":秒,"live":true}。
   另写 <输出>.时间点.json：每一步在视频里的开始秒数（镜头脚本里 videocard 的 t_in / play_at 对旁白用）。

   用法：node 录屏.mjs 配置.json [--keep]          （--keep 保留逐帧 JPG）
   配置：{"out":"…/录屏-xx.mp4", "url":"起始网址", "width":1920, "height":1080, "fps":30, "dpr":1,
          "hide":["css选择器"], "cursor":true, "start":[960,540],
          "steps":[
            {"wait":1.0}                         停住 1 秒；{"wait":3,"live":true} 按真实时间录（网页自己的动画照原速）
            {"goto":"https://…"}                 换页（等加载完；加载时间不计入视频）
            {"move":"#q","dur":0.8}              光标缓动到元素中心；也可 {"move":[960,540]}
            {"click":"#q"}                       移过去（0.6 秒）再真实点击 + 红色涟漪；{"click":true} 点当前位置
            {"type":"你好","cps":10}             往当前焦点逐字输入（中文可以）
            {"key":"Enter"}                      按键：Enter / Tab / Backspace / Escape / ArrowDown / ArrowUp
            {"scroll":600,"dur":1.2}             向下平滑滚 600 像素；{"scroll":"#sec2"} 滚到元素（离顶 120 像素）
            {"hl":"关键句","dur":0.5}            给关键句加黄底红框，从左往右划出
            {"js":"document.body.style.zoom=1.2"} 执行任意 JS
            {"mark":"名字"}                      只记一个时间点
          ]}
   每一步都可以加 "name":"…"，时间点文件里用它当名字。 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import url from 'node:url';
import { execFileSync } from 'node:child_process';
const { launch, CDP, openPage, evalJS } = await import(url.pathToFileURL(path.join(os.homedir(), 'Desktop/视频工厂/engine/cdp.mjs')).href);

const cfgPath = process.argv[2];
if (!cfgPath) { console.error('用法：node 录屏.mjs 配置.json [--keep]'); process.exit(2); }
const KEEP = process.argv.includes('--keep');
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const base = path.dirname(path.resolve(cfgPath));
const OUT = path.resolve(base, cfg.out);
const W = cfg.width || 1920, H = cfg.height || 1080, FPS = cfg.fps || 30, DPR = cfg.dpr || 1;
const FRAMES = OUT.replace(/\.mp4$/i, '') + '.帧';
const FF = execFileSync('python3', ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())'], { encoding: 'utf8' }).trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ease = p => p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
const resolveURL = u => /^[a-z]+:/i.test(u) ? u : url.pathToFileURL(path.resolve(base, u)).href;

fs.rmSync(FRAMES, { recursive: true, force: true });
fs.mkdirSync(FRAMES, { recursive: true });
fs.mkdirSync(path.dirname(OUT), { recursive: true });

// 光标 + 涟漪 + 高亮样式；每帧确保存在（换页后会自动补回）
const OVERLAY = `(() => { if (window.__rec) return;
  const st = document.createElement('style'); st.id = '__rec_st';
  st.textContent = '#__rec_cur{position:fixed;left:0;top:0;width:30px;height:38px;z-index:2147483647;pointer-events:none;transform-origin:0 0}' +
    '#__rec_rip{position:fixed;left:0;top:0;width:0;height:0;z-index:2147483646;pointer-events:none}' +
    '#__rec_rip i{position:absolute;border:4px solid #d93a2b;border-radius:50%}' +
    'mark.__rec_hl{color:inherit;padding:0 2px;border-radius:2px;background:linear-gradient(#ffe14d,#ffe14d) no-repeat 0 0/var(--p,0%) 100%;box-shadow:0 0 0 2px rgba(217,58,43,var(--b,0));-webkit-box-decoration-break:clone;box-decoration-break:clone}';
  document.documentElement.appendChild(st);
  const c = document.createElement('div'); c.id = '__rec_cur';
  c.innerHTML = '<svg width="30" height="38" viewBox="0 0 30 38"><path d="M3 2 L3 30 L10 23 L15 35 L20 33 L15 21 L25 21 Z" fill="#111" stroke="#fff" stroke-width="2.4" stroke-linejoin="round"/></svg>';
  const r = document.createElement('div'); r.id = '__rec_rip'; r.innerHTML = '<i></i>';
  document.documentElement.appendChild(c); document.documentElement.appendChild(r);
  window.__rec = { set(x, y, show, rp) { c.style.display = show ? '' : 'none'; c.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    const i = r.firstChild; if (rp == null || rp >= 1) { i.style.display = 'none'; return; }
    const R = 8 + 30 * rp; i.style.display = ''; i.style.left = (x - R) + 'px'; i.style.top = (y - R) + 'px';
    i.style.width = i.style.height = (2 * R) + 'px'; i.style.opacity = String(1 - rp); } };
})()`;

const HIDE = sels => `(${JSON.stringify(sels || [])}).forEach(q => document.querySelectorAll(q).forEach(e => e.style.setProperty('display','none','important')))`;
// 找关键句：先在最内层包含它的元素里替换；跨标签再用 Range
const MARK = (s, id) => `(() => {
  const s = ${JSON.stringify(s)};
  const els = [...document.querySelectorAll('body *')].filter(e => !e.closest('#__rec_cur') && e.textContent.includes(s));
  const inner = els.filter(e => !els.some(o => o !== e && e.contains(o)))[0];
  if (!inner) return null;
  if (inner.innerHTML.includes(s)) inner.innerHTML = inner.innerHTML.replace(s, '<mark class="__rec_hl" id="${id}">' + s + '</mark>');
  else { const w = document.createTreeWalker(inner, NodeFilter.SHOW_TEXT); let all = '', map = [], n;
    while ((n = w.nextNode())) { map.push([n, all.length]); all += n.data; }
    const i = all.indexOf(s); if (i < 0) return null;
    const at = k => { for (let j = map.length - 1; j >= 0; j--) if (map[j][1] <= k) return [map[j][0], k - map[j][1]]; };
    const r = document.createRange(), a = at(i), b = at(i + s.length); r.setStart(a[0], a[1]); r.setEnd(b[0], b[1]);
    const m = document.createElement('mark'); m.className = '__rec_hl'; m.id = '${id}'; m.appendChild(r.extractContents()); r.insertNode(m); }
  const m = document.getElementById('${id}'), rc = m.getBoundingClientRect();
  return { top: rc.top, bottom: rc.bottom };
})()`;
const CENTER = sel => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null;
  e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`;

const br = await launch(9600 + (process.pid % 300));
const cdp = await CDP.connect(br.wsUrl);
let S;
const marks = [];
let t = 0, nFrame = 0, cur = { x: (cfg.start || [W / 2, H / 2])[0], y: (cfg.start || [W / 2, H / 2])[1] }, ripAt = null;
const showCur = cfg.cursor !== false;
try {
  S = await openPage(cdp, resolveURL(cfg.url || 'about:blank'), W, H);
  if (DPR !== 1) await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: false }, S);
  await sleep(400);
  await evalJS(cdp, S, HIDE(cfg.hide));

  const writeFrame = buf => { fs.writeFileSync(path.join(FRAMES, `f${String(nFrame).padStart(6, '0')}.jpg`), buf); nFrame++; t = nFrame / FPS; };
  async function grab() {
    await evalJS(cdp, S, OVERLAY + `;window.__rec.set(${cur.x.toFixed(1)},${cur.y.toFixed(1)},${showCur},${ripAt == null ? 'null' : ((t - ripAt) / .4).toFixed(3)})`);
    const r = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 92, captureBeyondViewport: false }, S);
    return Buffer.from(r.data, 'base64');
  }
  const cap = async () => writeFrame(await grab());
  const capFor = async (sec, each) => { const n = Math.max(1, Math.round(sec * FPS)); for (let k = 0; k < n; k++) { if (each) await each((k + 1) / n); await cap(); } };
  async function moveTo(x, y, dur) {
    const x0 = cur.x, y0 = cur.y;
    if (Math.hypot(x - x0, y - y0) < 2) return;
    await capFor(dur, async q => { const e = ease(q); cur = { x: x0 + (x - x0) * e, y: y0 + (y - y0) * e }; });
  }
  async function target(v) {
    if (Array.isArray(v)) return v;
    const p = await evalJS(cdp, S, CENTER(v)); if (!p) throw new Error('找不到元素：' + v); return p;
  }
  async function mouse(type, x, y) {
    await cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }, S);
  }
  const KEYS = { Enter: 13, Tab: 9, Backspace: 8, Escape: 27, ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39 };
  let hlN = 0;

  for (const [i, st] of (cfg.steps || []).entries()) {
    marks.push({ step: i + 1, name: st.name || st.mark || Object.keys(st).find(k => k !== 'name' && k !== 'dur' && k !== 'cps') , at: +t.toFixed(3) });
    if (st.goto) {
      const loaded = new Promise(res => cdp.on('Page.loadEventFired', () => res()));
      await cdp.send('Page.navigate', { url: resolveURL(st.goto) }, S);
      await Promise.race([loaded, sleep(20000)]); await sleep(500); await evalJS(cdp, S, HIDE(cfg.hide));
      if (st.wait) await capFor(st.wait);
    } else if (st.wait != null && st.live) {
      const t0 = Date.now(), f0 = nFrame;
      while (Date.now() - t0 < st.wait * 1000) {
        const buf = await grab(); const want = f0 + Math.round((Date.now() - t0) / 1000 * FPS);
        do writeFrame(buf); while (nFrame < want);                  // 截图慢于帧率时补重复帧，保证真实时长
      }
    } else if (st.wait != null) {
      await capFor(st.wait);
    } else if (st.move) {
      const [x, y] = await target(st.move); await moveTo(x, y, st.dur || .8);
    } else if (st.click) {
      if (st.click !== true) { const [x, y] = await target(st.click); await moveTo(x, y, st.dur || .6); }
      await mouse('mouseMoved', cur.x, cur.y); await mouse('mousePressed', cur.x, cur.y); await mouse('mouseReleased', cur.x, cur.y);
      ripAt = t; await sleep(150); await capFor(.4); ripAt = null;
    } else if (st.type != null) {
      const cps = st.cps || 10; let acc = 0;
      for (const ch of [...String(st.type)]) {
        await cdp.send('Input.insertText', { text: ch }, S);
        acc += FPS / cps; const n = Math.floor(acc); acc -= n;
        for (let k = 0; k < Math.max(1, n); k++) await cap();
      }
    } else if (st.key) {
      const code = KEYS[st.key] || 0, base_ = { key: st.key, code: st.key, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code };
      const nav = new Promise(res => cdp.on('Page.loadEventFired', () => res()));
      await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base_ }, S);
      if (st.key === 'Enter') await cdp.send('Input.dispatchKeyEvent', { type: 'char', text: '\r', ...base_ }, S);
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base_ }, S);
      await Promise.race([nav, sleep(st.settle != null ? st.settle * 1000 : 600)]); await evalJS(cdp, S, HIDE(cfg.hide));
      await cap();
    } else if (st.scroll != null) {
      const y0 = await evalJS(cdp, S, 'scrollY');
      let y1 = typeof st.scroll === 'number' ? y0 + st.scroll
        : await evalJS(cdp, S, `(() => { const e = document.querySelector(${JSON.stringify(st.scroll)}); return e ? e.getBoundingClientRect().top + scrollY - ${st.offset ?? 120} : null; })()`);
      if (y1 == null) throw new Error('找不到元素：' + st.scroll);
      y1 = Math.max(0, Math.min(y1, await evalJS(cdp, S, 'document.documentElement.scrollHeight - innerHeight')));
      await capFor(st.dur || 1.2, async q => evalJS(cdp, S, `scrollTo(0, ${(y0 + (y1 - y0) * ease(q)).toFixed(1)})`));
    } else if (st.hl) {
      const id = `__rec_hl${++hlN}`, r = await evalJS(cdp, S, MARK(st.hl, id));
      if (!r) throw new Error('页面里找不到这句话：' + st.hl);
      if (r.top < 80 || r.bottom > H - 80) await evalJS(cdp, S, `document.getElementById('${id}').scrollIntoView({block:'center'})`);
      await capFor(st.dur || .5, async q => evalJS(cdp, S, `(m => { m.style.setProperty('--p', '${(ease(q) * 100).toFixed(1)}%'); m.style.setProperty('--b', '${Math.min(1, q * 1.6).toFixed(2)}'); })(document.getElementById('${id}'))`));
    } else if (st.js) {
      await evalJS(cdp, S, st.js); await cap();
    } else if (st.mark) {
      // 只记时间点
    } else {
      throw new Error('看不懂的一步：' + JSON.stringify(st));
    }
  }
  await cap();
} finally {
  cdp.close(); try { br.proc.kill('SIGKILL'); } catch (e) { }
  try { fs.rmSync(br.profile, { recursive: true, force: true }); } catch (e) { }
}

// JPEG 截图是全色域（pc），转成标准范围（tv）的 yuv420p，进剪辑和播放器都不偏色
const scaleArg = ['-vf', `scale=${W}:${H}:flags=lanczos:in_range=pc:out_range=tv,format=yuv420p`];
execFileSync(FF, ['-v', 'error', '-y', '-framerate', String(FPS), '-i', path.join(FRAMES, 'f%06d.jpg'), ...scaleArg,
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT]);
fs.writeFileSync(OUT.replace(/\.mp4$/i, '') + '.时间点.json', JSON.stringify({ out: OUT, fps: FPS, frames: nFrame, duration: +(nFrame / FPS).toFixed(3), steps: marks }, null, 1));
if (!KEEP) fs.rmSync(FRAMES, { recursive: true, force: true });
console.log(JSON.stringify({ out: OUT, frames: nFrame, seconds: +(nFrame / FPS).toFixed(2) }));
