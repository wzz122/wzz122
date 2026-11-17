/* 视频号封面（另可出横版封面、YouTube 缩略图）：给标题、副标题、插图，按平台规范一次出齐，并出一张检查图和一份报告。
   规范（2026-10-05 定，详见 video-assembly skill「交付」一节）：
   - 9x16  1080×1920：上传竖屏视频时的整张封面。标题块（标题+副标题）必须落在中间正方形 y420–1500（分享到朋友圈等场景可能裁成方形）；
                      全部内容（含小标、插图）落在中间 3:4 区 y240–1680（平台默认居中裁主页卡片）；顶部、底部留给状态栏和平台文字条。
   - 3x4   1080×1440：个人主页卡片。
   - 4x3   1440×1080：分享卡片。
   - 16x9  1920×1080：横屏视频的整张封面（可选）。
   - yt    1280×720 ：YouTube 缩略图（可选）。
   版式沿用视频工厂片头：纸纹底、宋体粗标题、砖红小标；插图放白边相框，AI 生成的左上角标「AI 示意」。标题字号按列宽自动缩，插图按安全区自动缩。
   任何文字含「新闻大写」直接报错退出（那是参考博主的频道名）。
   用法：node 视频号封面.mjs 配置.json
   配置：{"out_dir": "输出目录", "name": "文件名前缀", "kicker": "小标（可空）", "title": ["第一行", "第二行"], "sub": "副标题（可空）",
          "image": "插图路径（可空）", "ai": true, "sizes": ["9x16", "3x4", "4x3"], "yt_name": "YouTube 缩略图的文件名前缀（可空，默认用 name）",
          "check_dir": "检查图、报告放哪（可空，默认 out_dir；建议放本期 封面/ 目录，别弄乱 2-成片）"}
   输出：<name>-封面-视频号9x16.jpg、-封面-视频号3x4.jpg、-封面-视频号4x3.jpg、-封面-16x9.jpg、<yt_name>-缩略图.jpg、<name>-封面检查.jpg、<name>-封面报告.json */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import os from 'node:os';

const ENG = path.join(os.homedir(), 'Desktop/视频工厂/engine');
const { launch, CDP, openPage, evalJS } = await import(url.pathToFileURL(path.join(ENG, 'cdp.mjs')).href);
const cfgFile = process.argv[2];
if (!cfgFile) { console.error('用法：node 视频号封面.mjs 配置.json'); process.exit(1); }
const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));
const title = Array.isArray(cfg.title) ? cfg.title : String(cfg.title || '').split('|');
const BAN = ['新闻大写'];
const allText = [cfg.kicker, ...title, cfg.sub, cfg.name, cfg.yt_name].filter(Boolean).join('\n');
for (const b of BAN) if (allText.includes(b)) { console.error(`❌ 封面文字或文件名含禁用词「${b}」`); process.exit(2); }
if (!title.length || !title[0]) { console.error('❌ 缺标题'); process.exit(1); }
if (title.length > 3) console.warn('⚠️ 标题超过 3 行，手机上很难一眼读完');
const outDir = cfg.out_dir; fs.mkdirSync(outDir, { recursive: true });
const chkDir = cfg.check_dir || outDir; fs.mkdirSync(chkDir, { recursive: true });
const sizes = cfg.sizes || ['9x16', '3x4', '4x3'];
const css = url.pathToFileURL(path.join(ENG, 'stage.css')).href;
const pic = cfg.image ? url.pathToFileURL(path.resolve(cfg.image)).href : null;
if (cfg.image && !fs.existsSync(cfg.image)) { console.error('❌ 找不到插图：' + cfg.image); process.exit(1); }
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// kind v：竖排（文字在上、插图在下居中）；h：横排（文字在左、插图在右）
const SPEC = {
  '9x16': { W: 1080, H: 1920, kind: 'v', top: 372, side: 90, maxTs: 104, maxSs: 70, img: 800, imgBottom: 1640, core: [420, 1500], all: [240, 1680], file: n => `${n}-封面-视频号9x16` },
  '3x4':  { W: 1080, H: 1440, kind: 'v', top: 150, side: 90, maxTs: 104, maxSs: 70, img: 680, imgBottom: 1380, all: [60, 1400], file: n => `${n}-封面-视频号3x4` },
  '4x3':  { W: 1440, H: 1080, kind: 'h', side: 90, right: 74, maxTs: 80, maxSs: 58, img: 576, all: [40, 1040], file: n => `${n}-封面-视频号4x3` },
  '16x9': { W: 1920, H: 1080, kind: 'h', side: 120, right: 110, maxTs: 100, maxSs: 66, img: 760, all: [40, 1040], file: n => `${n}-封面-16x9` },
  'yt':   { W: 1280, H: 720,  kind: 'h', side: 56, right: 50, maxTs: 66, maxSs: 46, img: 540, all: [30, 690], file: () => `${cfg.yt_name || cfg.name}-缩略图` },
};

function page(sp) {
  const { W, H, kind } = sp;
  const kick = cfg.kicker ? `<div class="k">${esc(cfg.kicker)}</div>` : '';
  const t = `<div class="t" id="t">${title.map(esc).join('\n')}</div>`;
  const s = cfg.sub ? `<div class="s" id="s">${esc(cfg.sub)}</div>` : '';
  const frame = (style) => pic ? `<div class="f" id="f" style="${style}"><img src="${pic}">${cfg.ai ? '<div class="ai">AI 示意</div>' : ''}</div>` : '';
  let body;
  if (kind === 'v') {
    body = `<div id="box" style="position:absolute;left:${sp.side}px;top:${sp.top}px;width:${W - 2 * sp.side}px;display:flex;flex-direction:column;align-items:flex-start">
      ${kick}${t}${s}${frame(`align-self:center;margin-top:60px;width:${sp.img}px;height:${sp.img}px`)}</div>`;
  } else {
    const colW = pic ? W - sp.right - sp.img - 50 - sp.side : W - 2 * sp.side;
    body = `<div id="box" style="position:absolute;left:${sp.side}px;top:0;height:${H}px;width:${colW}px;display:flex;flex-direction:column;justify-content:center;align-items:flex-start">
      ${kick}${t}${s}</div>${frame(`position:absolute;left:${W - sp.right - sp.img}px;top:${Math.round((H - sp.img) / 2)}px;width:${sp.img}px;height:${sp.img}px`)}`;
  }
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${css}">
<style>:root{--W:${W}px;--H:${H}px} html,body{width:${W}px;height:${H}px;margin:0;background:var(--paper)}
.k{font-family:"Helvetica Neue",Arial,sans-serif;font-size:${Math.round(sp.maxSs * 0.4)}px;font-weight:600;letter-spacing:.32em;color:var(--ink);margin:0 0 18px 6px;white-space:nowrap}
.k::before{content:"";display:inline-block;width:10px;height:10px;background:var(--red);margin-right:18px;vertical-align:4px}
.t{font-family:var(--serif);font-weight:900;font-size:${sp.maxTs}px;line-height:1.18;color:var(--ink);white-space:pre;margin:0}
.s{font-family:var(--serif);font-weight:900;font-size:${sp.maxSs}px;color:var(--ink);white-space:pre;margin:20px 0 0 2px}
.f{position:relative;box-sizing:border-box;border:14px solid #f7f3e9;background:#f7f3e9;box-shadow:6px 9px 0 rgba(60,52,38,.10),0 2px 14px rgba(60,52,38,.18)}
.f img{width:100%;height:100%;object-fit:cover;display:block}
.ai{position:absolute;left:16px;top:16px;font-family:var(--sans);font-weight:600;font-size:22px;color:#fff;background:rgba(20,18,15,.6);padding:5px 12px;border-radius:6px}
</style></head><body class="portrait"><div id="viewport" style="width:${W}px;height:${H}px">
<div class="paper-bg" style="width:${W}px;height:${H}px"></div>${body}</div></body></html>`;
}

// 在页面里：标题/副标题按列宽缩字号；竖排时插图按下边界缩；没插图时文字块居中；最后量各块位置
const fitJS = sp => `(() => {
  const box = document.getElementById('box'), t = document.getElementById('t'), s = document.getElementById('s'), f = document.getElementById('f');
  const colW = box.clientWidth, w = e => e.getBoundingClientRect().width;
  let ts = ${sp.maxTs}; while (w(t) > colW && ts > 40) { ts -= 2; t.style.fontSize = ts + 'px'; }
  let ss = ${sp.maxSs}; if (s) while (w(s) > colW && ss > 28) { ss -= 2; s.style.fontSize = ss + 'px'; }
  if ('${sp.kind}' === 'v') {
    if (f) { const top = f.getBoundingClientRect().top; const size = Math.max(200, Math.min(${sp.img}, ${sp.imgBottom || 0} - top, colW));
             f.style.width = f.style.height = Math.round(size) + 'px'; }
    else { const z = ${JSON.stringify(sp.core || [0, sp.H])}; box.style.top = Math.round((z[0] + z[1]) / 2 - box.offsetHeight / 2) + 'px'; }
  }
  const r = e => { if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)]; };
  return { ts, ss, k: r(document.querySelector('.k')), t: r(t), s: r(s), f: r(f) };
})()`;

const br = await launch(9860 + (process.pid % 120));
const cdp = await CDP.connect(br.wsUrl);
const report = { config: cfg, outputs: [] };
const tmp = fs.mkdtempSync(path.join(outDir, '.封面-'));
for (const key of sizes) {
  const sp = SPEC[key]; if (!sp) { console.error('未知尺寸：' + key); continue; }
  const html = path.join(tmp, key + '.html'); fs.writeFileSync(html, page(sp));
  const S = await openPage(cdp, url.pathToFileURL(html).href, sp.W, sp.H);
  await evalJS(cdp, S, 'document.fonts ? document.fonts.ready.then(()=>1) : 1');
  if (pic) await evalJS(cdp, S, "new Promise(r => { const i = document.querySelector('img'); i.complete ? r(1) : (i.onload = () => r(1)); })");
  const m = await evalJS(cdp, S, fitJS(sp));
  await new Promise(r => setTimeout(r, 150));
  const shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 92, clip: { x: 0, y: 0, width: sp.W, height: sp.H, scale: 1 } }, S);
  const file = path.join(outDir, sp.file(cfg.name) + '.jpg');
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
  // 检查安全区
  const warn = [];
  const textTop = (m.k || m.t)[1], textBottom = (m.s || m.t)[3], bottom = m.f ? Math.max(m.f[3], textBottom) : textBottom;
  if (sp.core && (m.t[1] < sp.core[0] || textBottom > sp.core[1])) warn.push(`标题块 y${m.t[1]}–${textBottom} 超出中间正方形 ${sp.core.join('–')}`);
  if (sp.all && (textTop < sp.all[0] || bottom > sp.all[1])) warn.push(`内容 y${textTop}–${bottom} 超出安全区 ${sp.all.join('–')}`);
  for (const b of [m.k, m.t, m.s, m.f]) if (b && (b[0] < 20 || b[2] > sp.W - 20)) warn.push(`有元素贴到左右边缘：x${b[0]}–${b[2]}`);
  if (m.ts < sp.maxTs * 0.75) warn.push(`标题太长，字号缩到 ${m.ts}px（上限 ${sp.maxTs}），考虑缩短或改分行`);
  report.outputs.push({ size: key, file, W: sp.W, H: sp.H, ...m, warnings: warn });
  console.log(`${key} → ${path.basename(file)}  标题 ${m.ts}px${warn.length ? '  ⚠️ ' + warn.join('；') : '  ✓'}`);
}

// 检查图：各尺寸缩略 + 9x16 的安全区线和两种居中裁切
const rows = report.outputs.map(o => {
  const u = url.pathToFileURL(o.file).href, sc = o.W > o.H ? 432 / o.W : 324 / o.W, w = Math.round(o.W * sc), h = Math.round(o.H * sc);
  let lines = '', crops = '';
  if (o.size === '9x16') {
    const L = (y, c) => `<div style="position:absolute;left:0;right:0;top:${Math.round(y * sc)}px;border-top:2px dashed ${c}"></div>`;
    lines = L(240, '#2a6fdb') + L(1680, '#2a6fdb') + L(420, '#1f9d55') + L(1500, '#1f9d55');
    const crop = (y0, y1, lab) => `<div class="cell"><div class="lab">${lab}</div><div style="width:${w}px;height:${Math.round((y1 - y0) * sc)}px;background:url('${u}') 0 ${-Math.round(y0 * sc)}px / ${w}px ${h}px no-repeat;outline:1px solid #999"></div></div>`;
    crops = crop(240, 1680, '居中裁 3:4（主页卡片）') + crop(420, 1500, '居中裁 1:1（方形分享）');
  }
  return `<div class="cell"><div class="lab">${o.size}　${o.W}×${o.H}${o.warnings.length ? '　⚠️' : '　✓'}</div><div style="position:relative;width:${w}px;height:${h}px;background:url('${u}') 0 0 / ${w}px ${h}px;outline:1px solid #999">${lines}</div></div>${crops}`;
}).join('');
const chk = path.join(tmp, 'check.html');
fs.writeFileSync(chk, `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;background:#3a3a3a;font-family:"PingFang SC",sans-serif}
#c{display:flex;flex-wrap:wrap;align-items:flex-start;gap:22px;padding:22px;width:1756px}.cell{color:#fff}.lab{font-size:20px;margin-bottom:8px;color:#ffe680}
.note{width:100%;color:#ddd;font-size:18px}</style></head><body><div id="c">${rows}
<div class="note">蓝虚线：中间 3:4 区（y240–1680），全部内容要在里面；绿虚线：中间正方形（y420–1500），标题块要在里面。</div></div></body></html>`);
const C = await openPage(cdp, url.pathToFileURL(chk).href, 1800, 1300);
await new Promise(r => setTimeout(r, 400));
const hgt = await evalJS(cdp, C, 'Math.ceil(document.getElementById("c").getBoundingClientRect().height)');
const cs = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 88, clip: { x: 0, y: 0, width: 1800, height: Math.min(1300, hgt), scale: 1 } }, C);
fs.writeFileSync(path.join(chkDir, `${cfg.name}-封面检查.jpg`), Buffer.from(cs.data, 'base64'));
fs.writeFileSync(path.join(chkDir, `${cfg.name}-封面报告.json`), JSON.stringify(report, null, 1));
cdp.close(); try { br.proc.kill('SIGKILL'); } catch (e) { }
await new Promise(r => setTimeout(r, 400)); try { fs.rmSync(br.profile, { recursive: true, force: true }); } catch (e) { }
fs.rmSync(tmp, { recursive: true, force: true });
const nWarn = report.outputs.reduce((n, o) => n + o.warnings.length, 0);
console.log(`检查图：${path.join(chkDir, cfg.name + '-封面检查.jpg')}　${nWarn ? '有 ' + nWarn + ' 条警告，看报告' : '安全区全部通过'}`);
