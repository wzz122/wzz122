/* 审片页：按场景状态截「开始前 / 变化中 / 结束」三张，可选同一时刻的另一版本做对比，生成一张 HTML。
   用法：node pipeline/review-states.mjs episodes/<期名> <输出目录> [--compare episodes/<旧版期名>] [--from 秒] [--to 秒]
   两版用同一份配音时时间轴一致，同一帧就是同一句话的同一时刻。图片按 960 宽显示，等于在 960×540 下检查。 */
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const [epArg, outArg] = args;
const id = path.basename(epArg), cmpId = opt('--compare') ? path.basename(opt('--compare')) : null;
const outDir = path.resolve(outArg);
const from = Number(opt('--from') ?? 0) * 30, to = Number(opt('--to') ?? 1e9) * 30;
const tl = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/episodes', id, 'timeline.json'), 'utf8'));
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');

// 每个状态三个时刻：开始前（上一状态的样子）、变化中（+8 帧）、结束（下一状态前 3 帧）
const rows = [];
for (const v of tl.visuals) {
  // 章节卡和片头卡也要看（2026-11-05 只看动画场景，漏了出框的标题）
  if (v.type === 'chapterTitle') { if (v.from >= from && v.from <= to) rows.push({ s: { id: `标题卡 ${v.id}`, f: v.from, why: String(v.data.title).replace('\n', ' / '), focus: '标题在白卡里' }, shots: { before: v.from + 12, during: v.from + 36, after: Math.min(v.to - 6, v.from + 60) } }); continue; }
  if (v.type !== 'scene' || !v.data.states?.length) continue;
  const st = v.data.states;
  st.forEach((s, i) => {
    const end = Math.min((st[i + 1]?.f ?? v.to) - 3, v.to - 12, tl.durationInFrames - 1);  // 最后一个状态截在退场淡出之前
    if (s.f < from || s.f > to) return;
    rows.push({ s, shots: { before: Math.max(0, s.f - 2), during: s.f + 8, after: end } });
  });
}
if (!rows.length) throw new Error('时间轴里没有带 states 的场景');

fs.mkdirSync(outDir, { recursive: true });
const serveUrl = await bundle({ entryPoint: path.join(ROOT, 'src/episode/index.ts'), publicDir: path.join(ROOT, 'public') });
const shoot = async (ep, frames) => {
  const inputProps = { episode: ep };
  const composition = await selectComposition({ serveUrl, id: 'Episode', inputProps });
  for (const f of frames) {
    const p = path.join(outDir, `${ep}-${String(f).padStart(5, '0')}.jpg`);
    if (!fs.existsSync(p)) await renderStill({ serveUrl, composition, frame: f, output: p, inputProps, imageFormat: 'jpeg', jpegQuality: 85 });
  }
};
const all = [...new Set(rows.flatMap(r => Object.values(r.shots)))].sort((a, b) => a - b);
await shoot(id, all);
if (cmpId) await shoot(cmpId, [...new Set(rows.map(r => r.shots.after))]);

const img = (ep, f) => `<figure><img src="${ep}-${String(f).padStart(5, '0')}.jpg" width="480"><figcaption>${ep === id ? '' : '旧版 '}${(f / 30).toFixed(2)}s · 帧 ${f}</figcaption></figure>`;
const html = `<!doctype html><meta charset="utf-8"><title>${esc(id)} 状态审片</title>
<style>body{font:15px/1.6 system-ui,"PingFang SC";background:#FBF7EF;color:#1F2A44;margin:24px auto;max-width:2050px;padding:0 16px}
section{background:#fff;border-radius:14px;padding:14px 18px;margin:18px 0;box-shadow:0 2px 8px rgba(0,0,0,.06)}
h2{font-size:18px;margin:0 0 4px}.meta{color:#6B7287;margin-bottom:8px}.row{display:flex;gap:10px;flex-wrap:wrap}
figure{margin:0}figcaption{font-size:12px;color:#6B7287}img{border-radius:8px;display:block}.old img{outline:3px solid #C9CED8}</style>
<h1>${esc(id)}：按状态审片${cmpId ? `（右侧灰框 = ${esc(cmpId)} 同一时刻）` : ''}</h1>
<p>每行：开始前 / 变化中（+0.27 秒）/ 这一状态结束前${cmpId ? ' / 旧版同一时刻' : ''}。图片以 480 宽显示，点开看原尺寸；按 960×540 检查时把浏览器缩到图片 960 宽。</p>
${rows.map(({ s, shots }) => `<section><h2>${esc(s.id)} · ${(s.f / 30).toFixed(2)}s</h2>
<div class="meta">看懂什么：${esc(s.why)}　｜　焦点：${esc(s.focus)}${s.point ? `　｜　老师指向：${esc(s.point)}` : ''}　｜　最短停留：${s.hold ?? '—'}s${s.sfx ? `　｜　音效：${esc(s.sfx)}` : ''}</div>
<div class="row">${img(id, shots.before)}${img(id, shots.during)}${img(id, shots.after)}${cmpId ? `<div class="old">${img(cmpId, shots.after)}</div>` : ''}</div></section>`).join('\n')}`;
fs.writeFileSync(path.join(outDir, 'index.html'), html);
console.log(`审片页：${path.join(outDir, 'index.html')}（${rows.length} 个状态，${all.length + (cmpId ? rows.length : 0)} 张图）`);
