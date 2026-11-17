/* 税务图解整期构建：script.json + visuals.json + lines/*.wav（MiniMax 配好的逐句配音）
   → 时间轴（台词、口型、字幕、图解触发）+ 混音（配音 + 音效 + 背景音乐，背景音乐在说话时自动压低）
   用法：node pipeline/build-episode.mjs episodes/furusato
   产物：public/episodes/<期名>/timeline.json、mix.wav；out/<期名>.srt */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeMouth } from '../scripts/lib/mouth.ts';
import { parseEmphasis, chunk, toRuns, toSrt } from './subtitles.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FPS = 30, SR = 48000;
const epDir = path.resolve(ROOT, process.argv[2] ?? 'episodes/furusato');
const id = path.basename(epDir);
const script = JSON.parse(fs.readFileSync(path.join(epDir, 'script.json'), 'utf8'));
const vis = JSON.parse(fs.readFileSync(path.join(epDir, 'visuals.json'), 'utf8'));
// 动画场景（大物件按台词逐步出现、移动）写在 scenes.mjs 里，visuals.json 用 {type:'scene', scene:'名字'} 引用
const scenesFile = path.join(epDir, 'scenes.mjs');
const SCENES = fs.existsSync(scenesFile) ? (await import(scenesFile)).default : {};
const pubDir = path.join(ROOT, 'public/episodes', id);
const work = path.join(epDir, 'build');
fs.mkdirSync(pubDir, { recursive: true }); fs.mkdirSync(work, { recursive: true }); fs.mkdirSync(path.join(ROOT, 'out'), { recursive: true });
// 音效库在谷歌云盘上，常有文件读超时；cache/sfx/ 里有本地副本就优先用（见 cache/sfx/README.txt）
const SFX_DIR = path.join(process.env.HOME, 'Desktop/视频工厂/模板-v6/声音/音效'), SFX_CACHE = path.join(ROOT, 'cache/sfx');
const BGM_DIR = path.join(process.env.HOME, 'Desktop/视频工厂/样片/2026-10-07-老登化/配乐');

const T = { intro: 0.4, chapterHold: 2.4, gapSame: 0.32, gapSwap: 0.48, segTail: 0.6, outro: 3.0, ...(vis.timing ?? {}) };
const f = s => Math.round(s * FPS);
const dur = p => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p], { encoding: 'utf8' }));

/* ---------- 1. 时间轴 ---------- */
let t = T.intro;
const lines = [];
const segs = script.map((sg, si) => {
  const segStart = t;
  const hasCard = (vis.segments[si]?.chapterCard ?? null) !== null;
  t += hasCard ? T.chapterHold : 0.2;
  const L = sg.lines.map((ln, li) => {
    const file = path.join(epDir, 'lines', `s${String(si).padStart(2, '0')}_l${String(li).padStart(2, '0')}.wav`);
    if (li > 0) t += ln.speaker === sg.lines[li - 1].speaker ? T.gapSame : T.gapSwap;
    const d = dur(file);
    const rec = { seg: si, idx: li, key: path.basename(file, '.wav'), speaker: ln.speaker, text: ln.text, plain: ln.text.replace(/[「」]/g, ''), tts: ln.tts ?? ln.text, file, start: t, end: t + d };
    t = rec.end + (vis.holdAfter?.[rec.key] ?? 0); lines.push(rec); return rec;  // holdAfter：这句说完多停几秒（例：整张对照表留给观众看），写 {"s03_l22": 5}
  });
  t += T.segTail;
  return { ...sg, start: segStart, end: t, lines: L };
});
const total = t + T.outro;
console.log(`时间轴：${lines.length} 句，总长 ${(total / 60).toFixed(1)} 分钟`);

/* ---------- 2. 图解触发 ---------- */
// 关键词落在一句里的什么时候。三种办法，按可靠程度：
//   manual：episodes/<期名>/cue-fixes.json 里人工听过写下的时间 {"s02_l06:固定扣除": 1.42}（秒，从这句配音开头算）
//   phrase：visuals.json 写 "cueAlign": "phrase" 时，用配音里的停顿把句子按标点切成短语，词时间 = 短语起点 + 短语内按字比例
//   char：整句按字数比例估（旧做法，误差可到一两秒）；phrase 对不上时也退回这个
// 每个词触发都记进 build/cue-report.json，配音定稿后先校正金额首次出现、公式代入、转折句、例外条件这几类
const cueFixFile = path.join(epDir, 'cue-fixes.json');
const CUE_FIX = fs.existsSync(cueFixFile) ? JSON.parse(fs.readFileSync(cueFixFile, 'utf8')) : {};
const cueReport = new Map();
const SPLIT = /[，。！？：；、…—!?:;]|,(?!\d)/;
const phrasesOf = s => { const out = []; let cur = ''; for (let i = 0; i < s.length; i++) { const ch = s[i]; if (SPLIT.test(ch) && !(ch === ',' && /\d/.test(s[i - 1] ?? '') && /\d/.test(s[i + 1] ?? ''))) { if (cur.trim()) out.push(cur); cur = ''; } else cur += ch; } if (cur.trim()) out.push(cur); return out; };
const speakLen = s => s.replace(/[\s「」“”"*]/g, '').length;
const pauseCache = {};
function phraseSpans(ln) {
  if (pauseCache[ln.file] !== undefined) return pauseCache[ln.file];
  const want = phrasesOf(ln.tts);
  let res = null;
  if (want.length > 1 && want.length === phrasesOf(ln.plain).length) {
    const b = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', ln.file, '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
    const x = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
    const e = []; for (let i = 0; i + 160 <= x.length; i += 160) { let s = 0; for (let j = i; j < i + 160; j++) s += x[j] * x[j]; e.push(Math.sqrt(s / 160)); }
    const ref = [...e].sort((a, c) => a - c)[Math.floor(e.length * 0.95)] || 1e-4;
    const quiet = e.map(v => v < ref * 0.06);
    const first = quiet.indexOf(false), last = quiet.lastIndexOf(false);
    const gaps = []; let s0 = -1;
    for (let i = first; i <= last; i++) { if (quiet[i]) { if (s0 < 0) s0 = i; } else if (s0 >= 0) { if (i - s0 >= 5) gaps.push([s0 / 100, i / 100]); s0 = -1; } }
    if (first >= 0 && gaps.length >= want.length - 1) {
      // 每个标点处按字数比例有一个预计时间；按顺序给每个标点挑一个停顿：离预计时间越近越好、停顿越长越好（小动态规划），
      // 再检查每段时长和字数大致成比例，不成比例就退回按字估
      const totC = want.reduce((a, p) => a + speakLen(p), 0), t0 = first / 100, span = (last + 1) / 100 - t0;
      let acc = 0; const exp = want.slice(0, -1).map(p => t0 + ((acc += speakLen(p)) / totC) * span);
      const cost = (i, j) => Math.abs((gaps[j][0] + gaps[j][1]) / 2 - exp[i]) / span - 0.5 * (gaps[j][1] - gaps[j][0]);
      const n = exp.length, m = gaps.length, dp = exp.map(() => new Array(m).fill(Infinity)), from = exp.map(() => new Array(m).fill(-1));
      for (let j = 0; j < m; j++) dp[0][j] = cost(0, j);
      for (let i = 1; i < n; i++) for (let j = i; j < m; j++) for (let k = i - 1; k < j; k++) if (dp[i - 1][k] + cost(i, j) < dp[i][j]) { dp[i][j] = dp[i - 1][k] + cost(i, j); from[i][j] = k; }
      let j = dp[n - 1].indexOf(Math.min(...dp[n - 1])); const cut = [];
      for (let i = n - 1; i >= 0; i--) { cut.unshift(gaps[j]); j = from[i][j]; }
      const spans = want.map((_, k) => [k === 0 ? t0 : cut[k - 1][1], k === want.length - 1 ? (last + 1) / 100 : cut[k][0]]);
      const totD = spans.reduce((a, [p, q]) => a + q - p, 0);
      const ok = spans.every(([p, q], k) => { const r = ((q - p) / totD) / (speakLen(want[k]) / totC); return q - p > 0.12 && r > 0.35 && r < 2.8; });
      if (ok) res = spans;
    }
  }
  return (pauseCache[ln.file] = res);
}
function wordTime(ln, word) {
  const k = ln.plain.indexOf(word);
  if (k < 0) throw new Error(`「${word}」不在：${ln.plain}`);
  const byChar = ln.start + (k / ln.plain.length) * (ln.end - ln.start);
  let byPhrase = null;
  const spans = vis.cueAlign === 'phrase' ? phraseSpans(ln) : null;
  if (spans) {
    const ph = phrasesOf(ln.plain); let pos = 0, pi = 0;
    for (; pi < ph.length; pi++) { const at = ln.plain.indexOf(ph[pi], pos); if (at <= k && k < at + ph[pi].length) { pos = at; break; } pos = at + ph[pi].length; }
    if (pi < ph.length) { const [a, b] = spans[pi]; byPhrase = ln.start + a + (speakLen(ph[pi].slice(0, k - pos)) / Math.max(1, speakLen(ph[pi]))) * (b - a); }
  }
  const fix = CUE_FIX[`${ln.key}:${word}`];
  const used = fix != null ? ln.start + fix : byPhrase ?? byChar;
  cueReport.set(`${ln.key}:${word}`, { line: ln.key, word, text: ln.plain, method: fix != null ? 'manual' : byPhrase != null ? 'phrase' : 'char', char: +(byChar - ln.start).toFixed(2), phrase: byPhrase == null ? null : +(byPhrase - ln.start).toFixed(2), used: +(used - ln.start).toFixed(2), at: +used.toFixed(2) });
  return used;
}

const resolved = {};
function cueTime(cue, seg, fallback) {
  if (cue == null) return fallback;
  if (typeof cue === 'number') cue = { line: cue };
  // 简写："7" = 第 7 句开头；"7:词" = 说到这个词；"7:end" = 第 7 句结束；末尾可加 "+0.3" / "-0.2" 秒
  if (typeof cue === 'string') {
    const m = cue.match(/^(\d+)(?::(.*?))?([+-]\d+(?:\.\d+)?)?$/);
    if (!m) throw new Error(`看不懂的触发点：${cue}`);
    cue = { line: Number(m[1]), offset: m[3] ? Number(m[3]) : 0 };
    if (m[2] === 'end') cue.at = 'end'; else if (m[2]) cue.word = m[2];
  }
  let base;
  if (cue.at === 'segStart') base = seg.start + 0.2;
  else if (cue.after) { const r = resolved[cue.after]; base = cue.step == null ? r.enter : r.steps[Math.min(cue.step, r.steps.length - 1)]; }
  else {
    const ln = seg.lines[cue.line ?? 0];
    if (!ln) throw new Error(`段 ${seg.chapter} 没有第 ${cue.line} 句`);
    base = ln.start;
    if (cue.word) base = wordTime(ln, cue.word);
    if (cue.at === 'end') base = ln.end;
  }
  return base + (cue.offset ?? 0);
}
const stepCount = v => {
  const d = v.data ?? {};
  switch (v.type) {
    case 'keyNumber': return d.sub ? 2 : 1;
    case 'bulletReveal': case 'iconGrid': return d.items.length;
    case 'calculation': return d.terms.length + 1;
    case 'compare': return 3;
    case 'table': return d.rows.length + (d.highlight ? 1 : 0) + (d.callout ? 1 : 0);
    case 'timeline': return d.nodes.length + (d.footer ? 1 : 0);
    case 'flow': return d.alt ? 3 : 2;
    case 'bigText': return d.sub ? 2 : 1;
    default: return 1;
  }
};
// 资料截图（scene 里的 image 对象）：自动读图片像素尺寸
const imgSize = o => {
  if (o.kind !== 'image' || o.iw) return {};
  const p = path.join(ROOT, 'public', o.src);
  if (!fs.existsSync(p)) throw new Error(`资料图不存在：public/${o.src}`);
  const [iw, ih] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', p], { encoding: 'utf8' }).trim().split(',').map(Number);
  return { iw, ih };
};
const visuals = [];
const cast = [];  // 角色轨：{t, pose}；只用来切老师手势（point 时 pointLeft）。来自段落的 cast 和场景状态
// 老师和芝士从头到尾都在画面上，不能离场（用户 2026-10-29 定）：写了 'out' 直接报错
const mustStay = (where, c) => { for (const [k, who] of [['teacher', '老师'], ['cheese', '芝士']]) if (c[k] === 'out') throw new Error(`${where}：${who}写了 'out'。老师和芝士从头到尾都在画面上，不能离场`); };
segs.forEach((seg, si) => {
  for (const c of vis.segments[si]?.cast ?? []) { mustStay(`第 ${si} 段的 cast`, c); const { at, ...rest } = c; cast.push({ t: cueTime(at, seg, seg.start), ...rest }); }
  const list = [...(vis.segments[si]?.visuals ?? [])];
  if (vis.segments[si]?.chapterCard) list.unshift({ id: `ch${si}`, type: 'chapterTitle', data: vis.segments[si].chapterCard, enter: { at: 'segStart' }, steps: [{ at: 'segStart', offset: 0.1 }] });
  const segVis = [];
  list.forEach((v, vi) => {
    const vid = v.id ?? `s${si}v${vi}`;
    const enter = cueTime(v.enter, seg, seg.lines[0].start - 0.2);
    let steps, auto = 0;
    if (v.type === 'moneyScene') {
      steps = v.data.keys.map(([, cue]) => cueTime(cue, seg, enter));
    } else if (v.type === 'scene') {
      const def = SCENES[v.scene];
      if (!def) throw new Error(`scenes.mjs 里没有场景：${v.scene}`);
      // states（可选）：按「观众这一步要看懂什么」写的状态，每个有触发点 cue、理由 why、视线焦点 focus、最短停留 hold，
      // 可选 point（老师指向的对象，套指示框）、sfx。对象关键帧可写 '@状态id' 或 '@状态id+0.3'
      const states = (def.states ?? []).map(s => ({ ...s, t: cueTime(s.cue, seg, enter) }));
      for (const s of states) mustStay(`场景 ${v.scene} 的状态 ${s.id}`, s);
      const stT = Object.fromEntries(states.map(s => [s.id, s.t]));
      for (let k = 1; k < states.length; k++) if (states[k].t < states[k - 1].t) throw new Error(`场景 ${v.scene} 的状态 ${states[k].id} 比上一个状态早`);
      const keyTime = cue => {
        const m = typeof cue === 'string' && cue.match(/^@([\w-]+)([+-]\d+(?:\.\d+)?)?$/);
        if (!m) return cueTime(cue, seg, enter);
        if (!(m[1] in stT)) throw new Error(`场景 ${v.scene} 没有状态：${m[1]}`);
        return stT[m[1]] + Number(m[2] ?? 0);
      };
      const objects = def.objects.map(o => ({ ...o, ...imgSize(o), keys: o.keys.map(([cue, p]) => ({ ...p, t: keyTime(cue) })) }));
      for (const o of objects) for (let k = 1; k < o.keys.length; k++) if (o.keys[k].t < o.keys[k - 1].t) throw new Error(`场景 ${v.scene} 的 ${o.id ?? o.kind} 关键帧顺序倒了`);
      const ids = new Set(objects.map(o => o.id).filter(Boolean));
      for (const s of states) for (const r of [s.focus, s.point].filter(Boolean)) if (!ids.has(r)) throw new Error(`场景 ${v.scene} 的状态 ${s.id} 指向不存在的对象：${r}`);
      if (states.some(s => s.teacher || s.cheese || s.point)) for (const s of states) cast.push({ t: s.t, teacher: s.point ? 'in' : s.teacher, cheese: s.cheese, pose: s.point ? 'pointLeft' : null });
      v.data = { objects, states, sfxPolicy: def.sfx ?? vis.sfxPolicy };
      steps = [...new Set(objects.flatMap(o => o.keys.map(k => k.t)))].sort((a, b) => a - b);
    } else {
      const n = stepCount(v);
      steps = Array.isArray(v.steps) ? v.steps.map(c => cueTime(c, seg, enter)) : [];
      const line = seg.lines.find(l => l.end > enter) ?? seg.lines[0];
      const remain = n - steps.length;  // 没写够的步骤自动按 0.4–0.9 秒补齐；lint 会把它们列出来
      if (remain > 0) {
        auto = remain;
        const from = steps.length ? steps[steps.length - 1] + 0.45 : enter + 0.15;
        const span = Math.max(0, line.end - 0.4 - from);
        const gap = Math.min(0.9, Math.max(0.4, remain > 1 ? span / (remain - 1) : 0));
        for (let i = 0; i < remain; i++) steps.push(from + i * gap);
      }
    }
    resolved[vid] = { enter, steps };
    segVis.push({ id: vid, type: v.type, data: v.data ?? {}, enter, exit: v.exit ? cueTime(v.exit, seg, null) : null, steps, auto });
  });
  segVis.sort((a, b) => a.enter - b.enter);
  segVis.forEach((v, i) => { v.exit = v.exit ?? (segVis[i + 1]?.enter ?? seg.end); });
  // 场景最后一个状态在指向时，场景一结束就把手放下（不然指向手势会一直带到后面的场景，直到下一个写了 point 的场景）
  for (const v of segVis) if (v.type === 'scene' && v.data.states?.at(-1)?.point) cast.push({ t: v.exit, pose: null });
  visuals.push(...segVis);
});
// 最后一个画面一直留到片尾
if (visuals.length) visuals[visuals.length - 1].exit = total;

/* ---------- 3. 效果音 ---------- */
const sfx = [];
let popK = 0;
const add = (name, at, gain = 1) => sfx.push({ name, at, gain });
const pop = at => add(`pop-${(popK++ % 3) + 1}`, at + 0.03);
for (const v of visuals) {
  const s = v.steps;
  switch (v.type) {
    case 'chapterTitle': add('riser-1.2s', v.enter - 1.2, 0.8); add('嗖', v.enter + 0.05); add('盖章', s[0] + 0.25, 0.7); break;
    case 'keyNumber': add('叮-落定', s[0] + 0.1); if (s[1] != null) pop(s[1]); break;
    case 'table': s.forEach((x, i) => add(i < v.data.rows.length ? '纸张滑入' : '叮-落定', x - (i < v.data.rows.length ? 0.35 : 0), 0.8)); break;
    case 'compare': add('嗖', s[0] - 0.1, 0.8); add('嗖', s[1] - 0.1, 0.8); add('叮-落定', s[2]); break;
    case 'warningBox': add('hit-轻', s[0]); break;
    case 'bigText': add('纸张滑入', s[0] - 0.35, 0.9); break;
    case 'flow': pop(s[0]); add('嗖', s[1] - 0.1, 0.8); if (s[2] != null) add('嗖', s[2] - 0.1, 0.8); break;
    case 'moneyScene': s.forEach(x => add('嗖', x - 0.1, 0.7)); break;
    case 'scene': {
      // 每个物件第一次出现 = pop；关键帧上写了 sfx 就用写的；同一时刻只响一次
      // sfxPolicy 'explicit'（场景写 sfx:'explicit' 或 visuals.json 写 "sfxPolicy": "explicit"）：只响关键帧和状态上写明的 sfx，不再自动 pop
      const explicit = v.data.sfxPolicy === 'explicit';
      const seen = new Set();
      const sound = (name, t) => {
        if (!name || name === 'none') return;
        const slot = `${name}@${Math.round(t * 10)}`; if (seen.has(slot)) return; seen.add(slot);
        if (name === 'pop') pop(t); else add(name, t - (name === '嗖' ? 0.1 : 0), name === '嗖' ? 0.7 : 0.85);
      };
      for (const o of v.data.objects) o.keys.forEach((k, i) => sound(k.sfx ?? (!explicit && i === 0 && !o.quiet ? (o.kind === 'arrow' ? '嗖' : o.kind === 'stamp' ? '盖章' : 'pop') : null), k.t));
      for (const st of v.data.states ?? []) sound(st.sfx, st.t);
      break;
    }
    case 'timeline': s.forEach(x => pop(x)); break;
    default: s.forEach(x => pop(x));
  }
}

// explicit 模式下同一时刻（0.15 秒内）只留第一个音效，避免几个图层同时出现时叠响
if (vis.sfxPolicy === 'explicit') { sfx.sort((a, b) => a.at - b.at); for (let i = sfx.length - 1; i > 0; i--) if (sfx[i].at - sfx[i - 1].at < 0.15) sfx.splice(i, 1); }
fs.writeFileSync(path.join(work, 'sfx.json'), JSON.stringify(sfx.map(s => ({ ...s, at: +s.at.toFixed(2) })), null, 1));
fs.writeFileSync(path.join(work, 'cue-report.json'), JSON.stringify([...cueReport.values()], null, 1));

/* ---------- 4. 角色、字幕 ---------- */
const subs = [];
const lineOut = lines.map(ln => {
  const em = parseEmphasis(ln.text, vis.emphasisTerms ?? []);
  const pieces = chunk(em, 19);
  const totalW = pieces.reduce((a, p) => a + p.length, 0);
  let acc = ln.start;
  pieces.forEach(p => { const d = (p.length / totalW) * (ln.end - ln.start); const runs = toRuns(p); subs.push({ speaker: ln.speaker, start: acc, end: acc + d, runs, text: runs.map(r => r.t).join('') }); acc += d; });
  const m = analyzeMouth(ln.file, FPS);
  const lv = new Array(m.frames).fill(0);
  for (const [a, b] of m.open) for (let k = a; k < Math.min(b, m.frames); k++) lv[k] = Math.max(2, Math.min(9, Math.round((m.rms[k] ?? 0.5) * 7)));
  const mood = ln.speaker === 'cheese' ? (/[啊哇！!]|好狠|一百九十三万/.test(ln.text) ? 'surprised' : /懂了|我今晚|螃蟹/.test(ln.text) ? 'happy' : 'normal') : null;
  return { speaker: ln.speaker, from: f(ln.start), to: f(ln.end), mouth: lv.join(''), mood, expression: 'normal', pointAt: [] };
});
for (let i = 0; i < subs.length - 1; i++) if (subs[i + 1].start - subs[i].end < 0.7) subs[i].end = subs[i + 1].start;
fs.writeFileSync(path.join(ROOT, 'out', `${id}.srt`), toSrt(subs), 'utf8');

/* ---------- 5. 混音 ---------- */
// 5a 配音轨：每句按「说话部分」统一到 -20 dBFS，放到各自时间点（静态增益，不做动态压缩）
const pcm = file => { const b = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 }); return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); };
const N = Math.ceil(total * SR);
const voice = new Float32Array(N), fx = new Float32Array(N);
for (const ln of lines) {
  const x = pcm(ln.file); const fr = Math.round(0.02 * SR);
  let e = []; for (let i = 0; i + fr < x.length; i += fr) { let s = 0; for (let j = i; j < i + fr; j++) s += x[j] * x[j]; e.push(Math.sqrt(s / fr)); }
  const mx = Math.max(...e); const act = e.filter(v => v > mx * 10 ** (-30 / 20)); const rms = Math.sqrt(act.reduce((a, v) => a + v * v, 0) / act.length);
  const g = 10 ** (-20 / 20) / rms; const o = Math.round(ln.start * SR); const fade = Math.round(0.012 * SR);
  for (let i = 0; i < x.length && o + i < N; i++) { let w = 1; if (i < fade) w = i / fade; else if (i > x.length - fade) w = (x.length - i) / fade; voice[o + i] += x[i] * g * w; }
}
const sfxCache = {};
for (const s of sfx) {
  if (!fs.existsSync(path.join(SFX_CACHE, `${s.name}.wav`)) && !fs.existsSync(path.join(SFX_DIR, `${s.name}.wav`))) continue;
  // 音效库在谷歌云盘上，常有文件读超时：先用 cache/sfx/ 的本地副本（见 cache/sfx/README.txt），没有再读云盘
  const load = n => { const c = path.join(SFX_CACHE, `${n}.wav`); try { return pcm(fs.existsSync(c) && fs.statSync(c).size ? c : path.join(SFX_DIR, `${n}.wav`)); } catch { console.warn(`音效读不出来：${n}.wav`); return null; } };
  // 读不出来时的替代：pop-N 换另一个 pop；盖章 换「盖章-两下」（两下相隔 0.22 秒）
  const x = sfxCache[s.name] ??= load(s.name) ?? (/^pop-\d$/.test(s.name) ? (sfxCache['pop-1'] ??= load('pop-1')) : s.name === '盖章' ? (sfxCache['盖章-两下'] ??= load('盖章-两下')) : null);
  if (!x) continue;
  const o = Math.round(Math.max(0, s.at) * SR);
  for (let i = 0; i < x.length && o + i < N; i++) fx[o + i] += x[i] * s.gain * 1.6;
}
const writeRaw = (arr, name) => { const p = path.join(work, name); fs.writeFileSync(p, Buffer.from(arr.buffer)); return p; };
const vRaw = writeRaw(voice, 'voice.f32'), fxRaw = writeRaw(fx, 'fx.f32');
// 5b 背景音乐床：按顺序接几首，2.5 秒交叉淡入淡出，铺满全片
const order = vis.bgm ?? ['配乐-M1-开场好奇.mp3', '配乐-M3-综艺排行.mp3', '配乐-M4-开门收束-复用.mp3'];
const bgmFiles = []; let cover = 0;
// 这一期自己生成的配乐放在 episodes/<期名>/music/，有就用它；没有再去共用配乐库（谷歌云盘）找
const bgmPath = fn => fs.existsSync(path.join(epDir, 'music', fn)) ? path.join(epDir, 'music', fn) : path.join(BGM_DIR, fn);
while (cover < total + 5) { const fn = order[bgmFiles.length % order.length]; bgmFiles.push(bgmPath(fn)); cover += dur(bgmPath(fn)) - 2.5; }
const bgmArgs = ['-y', '-loglevel', 'error']; bgmFiles.forEach(p => bgmArgs.push('-i', p));
let chain = '', last = '[0:a]';
for (let i = 1; i < bgmFiles.length; i++) { const outL = `[c${i}]`; chain += `${last}[${i}:a]acrossfade=d=2.5${outL};`; last = outL; }
chain += `${last}atrim=0:${total.toFixed(2)},afade=t=in:d=2,afade=t=out:st=${(total - 4).toFixed(2)}:d=4,aresample=${SR},pan=mono|c0=0.5*c0+0.5*c1[b]`;
const bgmWav = path.join(work, 'bgm.wav');
execFileSync('ffmpeg', [...bgmArgs, '-filter_complex', bgmFiles.length > 1 ? chain : chain.replace('[0:a]atrim', '[0:a]atrim'), '-map', '[b]', '-ar', String(SR), '-ac', '1', bgmWav]);
// 5c 总混：背景音乐压到很低，说话时再自动让开（sidechain），最后只做整体增益 + 峰值保护
const mixWav = path.join(pubDir, 'mix.wav');
const fc = `[0:a]asplit=2[v1][vkey];[2:a]volume=-21dB[bg];[bg][vkey]sidechaincompress=threshold=0.02:ratio=6:attack=30:release=400[bgd];[v1][1:a][bgd]amix=inputs=3:normalize=0[m];[m]alimiter=limit=0.89:level=false[o]`;
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'f32le', '-ar', String(SR), '-ac', '1', '-i', vRaw, '-f', 'f32le', '-ar', String(SR), '-ac', '1', '-i', fxRaw, '-i', bgmWav, '-filter_complex', fc, '-map', '[o]', '-ar', String(SR), '-ac', '2', '-c:a', 'pcm_s16le', mixWav]);
const lufs = execFileSync('ffmpeg', ['-hide_banner', '-i', mixWav, '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 }).toString();
console.log(`混音完成：${mixWav}`);

/* ---------- 6. 写时间轴 ---------- */
const timeline = {
  id, fps: FPS, width: 1920, height: 1080, durationInFrames: f(total), title: vis.title, look: vis.look, audio: `episodes/${id}/mix.wav`,
  segments: segs.map(s => ({ chapter: s.chapter, from: f(s.start), to: f(s.end) })),
  visuals: visuals.map(v => ({ id: v.id, type: v.type, data: v.type === 'scene' ? { objects: v.data.objects.map(o => ({ ...o, keys: o.keys.map(({ t: kt, ...k }) => ({ ...k, f: f(kt) })) })), states: v.data.states.map(({ t: st, ...s }) => ({ ...s, f: f(st) })) } : v.data, from: f(v.enter), to: f(v.exit), steps: v.steps.map(f), auto: v.auto })),
  lines: lineOut,
  subtitles: subs.map(s => ({ speaker: s.speaker, from: f(s.start), to: f(s.end), runs: s.runs })),
  cast: cast.length ? cast.sort((a, b) => a.t - b.t).map(({ t: ct, ...c }) => ({ ...c, f: f(ct) })) : undefined,
};
fs.writeFileSync(path.join(pubDir, 'timeline.json'), JSON.stringify(timeline));
console.log(`图解 ${visuals.length} 个，字幕 ${subs.length} 条，音效 ${sfx.length} 个`);
