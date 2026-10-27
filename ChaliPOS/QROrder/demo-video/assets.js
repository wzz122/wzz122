// 把视频里所有带字的画面用浏览器画成 PNG：片头/流程/费用/试用/片尾幻灯片、每个镜头的字幕、设备外框背景、弹出标签。
//   用法：node assets.js <工作目录>     （需要 <工作目录>/poster-shot.png，由 record.js 生成）
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const WORK = path.resolve(process.argv[2] || 'work');
const OUT = path.join(WORK, 'assets');
fs.mkdirSync(OUT, { recursive: true });
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'video.json'), 'utf8'));
const { PH, TB } = cfg.layout;
const poster = 'data:image/png;base64,' + fs.readFileSync(path.join(WORK, 'poster-shot.png')).toString('base64');

const C = { green: '#2E7D4F', soft: '#E3F1E7', ink: '#1F2A24', muted: '#6B746F', bg: '#EEF2EF', orange: '#E07B39', yellow: '#FFD43B' };
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const css = `*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"PingFang SC","Hiragino Sans GB","Hiragino Sans",sans-serif;color:${C.ink};-webkit-font-smoothing:antialiased}
.top{position:absolute;left:0;top:0;width:1920px;height:64px;background:${C.green};display:flex;align-items:center;justify-content:space-between;padding:0 40px}
.top .b{color:#fff;font-size:27px;font-weight:700}
.top .c{background:#fff;color:${C.green};border-radius:22px;padding:5px 22px;font-size:26px;font-weight:800}
.note{position:absolute;right:30px;bottom:8px;font-size:16px;color:#9aa39e}
.num{flex:none;width:58px;height:58px;border-radius:50%;background:${C.green};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:30px}
h1{font-size:64px;font-weight:900;color:${C.ink};letter-spacing:1px}
.chip{display:inline-flex;align-items:center;gap:10px;background:#fff;border:3px solid ${C.green};color:${C.green};border-radius:40px;padding:12px 30px;font-size:34px;font-weight:800}`;

let page;
async function shot(html, file, { w = 1920, h = 1080, selector = null, transparent = false } = {}) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><head><style>${css}</style></head><body style="width:${w}px;height:${h}px;position:relative;${transparent ? 'background:transparent' : 'background:' + C.bg}">${html}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  const target = selector ? page.locator(selector) : page;
  await target.screenshot({ path: path.join(OUT, file), omitBackground: transparent });
}

// ---------------------------------------------------------------------------
// 幻灯片
// ---------------------------------------------------------------------------
const SLIDES = {
  title: `
    <div style="position:absolute;left:150px;top:200px;width:1050px">
      <div class="chip" style="font-size:28px;padding:8px 24px">给老板看的试用演示</div>
      <div style="margin-top:36px;font-size:118px;font-weight:900;color:${C.green};letter-spacing:4px;line-height:1.1">茶里茶里<br>扫码点单</div>
      <div style="margin-top:36px;font-size:38px;line-height:1.6;color:${C.ink};font-weight:600">顾客用手机点单 → 柜台平板马上看到<br>→ 店员照常录进原来的收银机</div>
      <div style="margin-top:44px;display:flex;gap:18px">
        <div class="chip">✓ 不换收银系统</div><div class="chip">✓ 0 元试用</div><div class="chip">✓ 随时可停</div>
      </div>
    </div>
    <img src="${poster}" style="position:absolute;right:170px;top:150px;height:780px;transform:rotate(3deg);box-shadow:0 30px 60px rgba(0,0,0,.18);border-radius:6px">`,
  overview: `
    <h1 style="position:absolute;left:0;right:0;top:110px;text-align:center">整个流程就 3 步</h1>
    <div style="position:absolute;left:110px;right:110px;top:270px;display:flex;align-items:center;gap:26px">
      ${[
        ['📱', '顾客的手机', '扫码 → 选饮品 → 下单', '日文 / 中文 / 英文'],
        ['🔔', '柜台的平板', '「叮咚」一声，订单出现', '中日双语，规格一目了然'],
        ['🧾', '原来的收银机', '店员照着录入、收款', '系统不用换，账照旧'],
      ].map(([icon, t, d, s], i) => `${i ? '<div style="font-size:70px;color:' + C.orange + ';font-weight:900">→</div>' : ''}
        <div style="flex:1;background:#fff;border-radius:32px;padding:48px 30px;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.06);border:3px solid ${i === 2 ? C.yellow : '#fff'}">
          <div style="font-size:110px;line-height:1.1">${icon}</div>
          <div style="margin-top:18px;font-size:46px;font-weight:900;color:${C.green}">${t}</div>
          <div style="margin-top:16px;font-size:34px;font-weight:700">${d}</div>
          <div style="margin-top:10px;font-size:28px;color:${C.muted}">${s}</div>
        </div>`).join('')}
    </div>
    <div style="position:absolute;left:0;right:0;top:830px;text-align:center">
      <span style="display:inline-block;background:${C.soft};color:${C.green};border-radius:20px;padding:20px 44px;font-size:38px;font-weight:800">原来的收银系统一点不动，只是多了一台「看单」的平板</span>
    </div>`,
  cost: `
    <h1 style="position:absolute;left:0;right:0;top:90px;text-align:center">要花多少钱？<span style="color:${C.green};font-size:84px"> 0 元</span></h1>
    <table style="position:absolute;left:260px;width:1400px;top:250px;border-collapse:separate;border-spacing:0 14px;font-size:36px">
      ${[
        ['存订单的服务器', 'Supabase 免费版', '0 元'],
        ['菜单网页、接单屏', 'GitHub Pages 免费放网页', '0 元'],
        ['柜台平板', '店里现有的平板 / 旧手机', '0 元'],
        ['二维码', '自己打印，贴柜台和桌上', '几张纸'],
        ['收银系统', '不换、不改，照常用', '0 元'],
      ].map(([a, b, c]) => `<tr style="background:#fff">
        <td style="padding:24px 36px;border-radius:20px 0 0 20px;font-weight:800;width:430px">${a}</td>
        <td style="padding:24px 20px;color:${C.muted}">${b}</td>
        <td style="padding:24px 36px;border-radius:0 20px 20px 0;text-align:right;font-weight:900;color:${C.green};width:200px">${c}</td></tr>`).join('')}
    </table>
    <div style="position:absolute;left:0;right:0;top:900px;text-align:center;font-size:30px;color:${C.muted}">免费版的额度对一家店绰绰有余；以后想加在线付款等功能，再另外考虑</div>`,
  trial: `
    <h1 style="position:absolute;left:150px;top:100px">建议：先试一周</h1>
    <div style="position:absolute;left:150px;top:240px;width:880px">
      ${[
        ['柜台和每张桌子贴上二维码', '打印好的海报，带桌号'],
        ['柜台放一台平板，开着接单屏', '来单会响，屏幕常亮'],
        ['一周后看「今日记录」', '多少人扫码点单、店员忙不忙得过来'],
      ].map(([t, s], i) => `<div style="display:flex;gap:28px;align-items:flex-start;margin-bottom:46px">
        <div class="num" style="width:76px;height:76px;font-size:40px">${i + 1}</div>
        <div><div style="font-size:44px;font-weight:900">${t}</div><div style="font-size:30px;color:${C.muted};margin-top:8px">${s}</div></div></div>`).join('')}
    </div>
    <div style="position:absolute;left:1110px;top:240px;width:660px;background:#fff;border-radius:30px;padding:40px 44px">
      <div style="font-size:36px;font-weight:900;color:${C.orange}">现在这个版本</div>
      ${['顾客还是到柜台付款（现金、刷卡照旧）', '店员要把单子再录一次原来的收银机', '平板断网会提示；订单存在服务器上，连上就出现']
        .map((t) => `<div style="font-size:30px;margin-top:22px;line-height:1.45;display:flex;gap:12px"><span style="color:${C.orange}">●</span><span>${t}</span></div>`).join('')}
    </div>
    <div style="position:absolute;left:0;right:0;top:850px;text-align:center">
      <span style="display:inline-block;background:${C.soft};color:${C.green};border-radius:20px;padding:20px 44px;font-size:38px;font-weight:800">不想用了：撕掉二维码、关掉平板，就恢复原样</span>
    </div>`,
  end: `
    <div style="position:absolute;left:0;right:0;top:360px;text-align:center">
      <div style="font-size:100px;font-weight:900;color:${C.green};letter-spacing:4px">茶里茶里 · 扫码点单</div>
      <div style="margin-top:34px;font-size:38px;font-weight:700">准备：建免费服务器 → 打印二维码 → 平板打开接单屏</div>
      <div style="margin-top:22px;font-size:28px;color:${C.muted}">视频里都是真实运行的系统录屏（测试数据）</div>
    </div>`,
};

// ---------------------------------------------------------------------------
// 设备镜头的背景（每个章节一张）：顶栏 + 设备外框 + 标签
// ---------------------------------------------------------------------------
function deviceBg(chapter) {
  const bez = (b, pad, r, color) => `<div style="position:absolute;left:${b.x - pad}px;top:${b.y - pad}px;width:${b.w + pad * 2}px;height:${b.h + pad * 2}px;border-radius:${r}px;background:${color};box-shadow:0 18px 40px rgba(0,0,0,.22)"></div>`;
  const label = (b, text) => `<div style="position:absolute;left:${b.x}px;width:${b.w}px;top:76px;text-align:center;font-size:22px;font-weight:800;color:${C.muted}">${text}</div>`;
  return `<div class="top"><div class="b">${esc(cfg.brand)}</div><div class="c">${esc(chapter)}</div></div>
    ${bez(PH, 14, 50, '#1b1d1c')}${bez(TB, 20, 34, '#2a2c2b')}
    ${label(PH, '📱 顾客的手机')}${label(TB, '🖥 柜台的平板（接单屏）')}
    <div class="note">${esc(cfg.note)}</div>`;
}

function caption(n, cap, sub) {
  return `<div id="c" style="display:inline-flex;gap:22px;align-items:center;background:#fff;border:3px solid ${C.green};border-radius:24px;padding:14px 40px 14px 18px;max-width:1800px;box-shadow:0 8px 24px rgba(0,0,0,.12)">
    <div class="num">${n}</div>
    <div><div style="font-size:40px;font-weight:900;line-height:1.3">${esc(cap)}</div>${sub ? `<div style="font-size:26px;color:${C.muted};margin-top:2px">${esc(sub)}</div>` : ''}</div></div>`;
}

const FX = {
  arrow: `<div id="c" style="display:inline-block;background:${C.orange};color:#fff;border-radius:16px;padding:8px 16px;font-size:24px;font-weight:900;white-space:nowrap">订单传到柜台</div>`,
  ding: `<div id="c" style="display:inline-block;background:${C.orange};color:#fff;border-radius:20px;padding:12px 26px;font-size:34px;font-weight:900;box-shadow:0 8px 20px rgba(0,0,0,.2)">🔔 叮咚！新订单</div>`,
  bubble: `<div id="c" style="display:inline-block;padding-bottom:30px"><div style="position:relative;background:#fff;border:4px solid ${C.ink};border-radius:26px;padding:16px 28px">
    <div style="font-size:40px;font-weight:900">「Q1 です！」</div><div style="font-size:22px;color:${C.muted};margin-top:2px">顾客到柜台报单号</div>
    <div style="position:absolute;left:40px;bottom:-26px;width:0;height:0;border-left:16px solid transparent;border-right:16px solid transparent;border-top:26px solid ${C.ink}"></div></div></div>`,
  pos: `<div id="c" style="display:inline-block;background:${C.yellow};border-radius:24px;padding:22px 30px;box-shadow:0 12px 30px rgba(0,0,0,.25);width:440px">
    <div style="font-size:36px;font-weight:900">🧾 原来的收银系统</div>
    <div style="font-size:28px;font-weight:700;margin-top:10px">照着平板录入 → 收款</div>
    <div style="font-size:22px;margin-top:6px;opacity:.75">（系统和平时一样，不用改）</div></div>`,
};

(async () => {
  const browser = await chromium.launch(process.env.PW_EXE ? { executablePath: process.env.PW_EXE } : {});
  page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const [name, html] of Object.entries(SLIDES)) await shot(html, `slide-${name}.png`);
  const chapters = [...new Set(cfg.scenes.filter((s) => s.at).map((s) => s.chapter))];
  for (const [i, ch] of chapters.entries()) await shot(deviceBg(ch), `bg-${i}.png`);
  let n = 0;
  const manifest = { chapters, caps: {} };
  for (const [i, s] of cfg.scenes.entries()) {
    if (!s.at) continue;
    n += 1;
    await shot(caption(n, s.cap, s.sub), `cap-${i}.png`, { selector: '#c', transparent: true });
    manifest.caps[i] = `cap-${i}.png`;
  }
  for (const [name, html] of Object.entries(FX)) await shot(html, `fx-${name}.png`, { selector: '#c', transparent: true });
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
  console.log('assets:', fs.readdirSync(OUT).length, 'files');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
