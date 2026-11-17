/* 手机宽度网页截图：按手机排版（430px 宽、3 倍像素）打开网页，正文自动重排成短行、字大；
   给关键句加「黄底红框」，只截从 from 所在段落到 to 所在段落的一段。供竖屏截图卡用。
   用法：node mshot.mjs 配置.json [只做的键 …]
   配置：{"out_dir": "...", "pages": {键: {"url": "...", "hl": ["关键句", …], "clips": [{"from": "段首文字", "to": "段中文字"} 或 {"sel": "h1"}, …]}}}
   每个 clip 输出一张：<键>-<序号>.png（宽 1290px）。 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import url from 'node:url';
const { launch, CDP, evalJS } = await import(url.pathToFileURL(path.join(os.homedir(), 'Desktop/视频工厂/engine/cdp.mjs')).href);

const cfg = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const only = new Set(process.argv.slice(3));
const W = 430, H = 932, DPR = 3;
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 在页面里执行：清掉广告 / 悬浮条，给关键句加框，返回每个 clip 的上下边（文档坐标）
const PAGE_JS = (hl, clips) => `(() => {
  document.querySelectorAll('iframe, ins, .adsbygoogle, [id*="google_ads"], [class*="banner"], [class*="Banner"], [id*="ad-"], [class*=" ad-"], [class^="ad-"]').forEach(e => e.remove());
  document.querySelectorAll('body *').forEach(e => { const p = getComputedStyle(e).position; if (p === 'fixed' || p === 'sticky') e.style.setProperty('display', 'none', 'important'); });
  const st = document.createElement('style');
  st.textContent = 'mark.vhl{background:#ffe14d;color:inherit;box-shadow:0 0 0 2px #d93a2b;-webkit-box-decoration-break:clone;box-decoration-break:clone;padding:0 1px;border-radius:1px}';
  document.head.appendChild(st);
  const texts = () => { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); const a = []; let n; while ((n = w.nextNode())) a.push(n); return a; };
  const locate = s => {                       // 跨节点找一句话，返回 Range
    const ns = texts(); let all = '', map = [];
    ns.forEach(n => { map.push([n, all.length]); all += n.data; });
    const norm = all.replace(/\\s/g, ' ');
    const i = norm.indexOf(s); if (i < 0) return null;
    const at = k => { for (let j = map.length - 1; j >= 0; j--) if (map[j][1] <= k) return [map[j][0], k - map[j][1]]; };
    const r = document.createRange(); const a = at(i), b = at(i + s.length);
    r.setStart(a[0], a[1]); r.setEnd(b[0], b[1]); return r;
  };
  const miss = [];
  ${JSON.stringify(hl)}.forEach(s => {
    // 先在「含这句话的最内层元素」里直接替换（最稳）；句子跨了标签才用 Range
    const els = [...document.querySelectorAll('body *')].filter(e => e.innerHTML.includes(s));
    const inner = els.filter(e => !els.some(o => o !== e && e.contains(o)))[0];
    if (inner) { inner.innerHTML = inner.innerHTML.replace(s, '<mark class="vhl">' + s + '</mark>'); return; }
    const r = locate(s); if (!r) { miss.push(s); return; }
    const m = document.createElement('mark'); m.className = 'vhl';
    m.appendChild(r.extractContents()); r.insertNode(m);
  });
  const block = s => { const r = locate(s); if (!r) return null;
    let e = r.startContainer.nodeType === 3 ? r.startContainer.parentElement : r.startContainer;
    return e.closest('p, h1, h2, h3, li, td, tr, figure, dl, blockquote') || e; };
  const out = ${JSON.stringify(clips)}.map(c => {
    const a = c.sel ? document.querySelector(c.sel) : block(c.from), b = c.sel ? a : block(c.to);
    if (!a || !b) { miss.push(!a ? c.from : c.to); return null; }
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    return { top: ra.top + scrollY, bottom: rb.bottom + scrollY };
  });
  return { miss, out, width: document.documentElement.scrollWidth };
})()`;

const br = await launch(9500 + (process.pid % 200));
const cdp = await CDP.connect(br.wsUrl);
try {
  for (const [k, p] of Object.entries(cfg.pages)) {
    if (only.size && !only.has(k)) continue;
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId: S } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    await cdp.send('Page.enable', {}, S); await cdp.send('Runtime.enable', {}, S);
    await cdp.send('Emulation.setUserAgentOverride', { userAgent: UA }, S);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: true }, S);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true }, S);
    const loaded = new Promise(res => cdp.on('Page.loadEventFired', res));
    await cdp.send('Page.navigate', { url: p.url }, S);
    await Promise.race([loaded, sleep(20000)]);
    await sleep(2500);
    await evalJS(cdp, S, 'document.fonts ? document.fonts.ready.then(()=>1) : 1');
    const r = await evalJS(cdp, S, PAGE_JS(p.hl || [], p.clips));
    if (r.miss.length) console.log(`⚠️ ${k} 没找到：`, r.miss);
    await sleep(600);
    for (let i = 0; i < r.out.length; i++) {
      const c = r.out[i]; if (!c) continue;
      const pad = p.pad ?? 14, y = Math.max(0, c.top - pad), h = c.bottom - c.top + pad * 2;
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true,
        clip: { x: 0, y, width: W, height: h, scale: 1 } }, S);
      const f = path.join(cfg.out_dir, `${k}-${i + 1}.png`);
      fs.writeFileSync(f, Buffer.from(shot.data, 'base64'));
      console.log(`${k}-${i + 1}: y ${Math.round(y)}–${Math.round(y + h)}（页宽 ${r.width}）→ ${f}`);
    }
    await cdp.send('Target.closeTarget', { targetId });
  }
} finally {
  cdp.close(); try { br.proc.kill('SIGKILL'); } catch (e) { }
}
