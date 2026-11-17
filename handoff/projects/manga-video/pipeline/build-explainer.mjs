/* 图解模板的构建：分镜 storyboard.json → 配音 → 时间轴 → 口型 → 字幕 → 效果音 → 混音
   用法：node pipeline/build-explainer.mjs episodes/pilot-explainer
   产物：public/episodes/<id>/timeline.json、mix.wav；out/<id>.srt */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// 配音、口型、发音词典：直接用漫画模板的共用模块（scripts/lib/*.ts，node 原生跑 TS）
import { synthLine } from '../scripts/lib/tts.ts';
import { analyzeMouth } from '../scripts/lib/mouth.ts';
import { loadPronunciation, applyPronunciation } from '../scripts/lib/pronunciation.ts';
import { loadPlaceholderManifest, isPlaceholder } from '../scripts/lib/placeholder-manifest.ts';
import { parseEmphasis, stripMarks, chunk, toRuns, toSrt } from './subtitles.mjs';
import { ensureSfx } from './sfx.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FPS = 30;
const epDir = path.resolve(ROOT, process.argv[2] ?? 'episodes/pilot-explainer');
const id = path.basename(epDir);
const board = JSON.parse(fs.readFileSync(path.join(epDir, 'storyboard.json'), 'utf8'));
// 角色表与漫画模板共用（结构以漫画模板为准：characters.<id>.voice.say）
const charCfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/characters.json'), 'utf8'));
const chars = charCfg.characters ?? charCfg;
// 读音：先套图解版自己的 lexicon.json（数字、英文词），再套共用的 pronunciation.yaml
const lexicon = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/lexicon.json'), 'utf8'));
const shared = loadPronunciation();
const toSpeech = text => {
  let out = text;
  for (const [from, to] of lexicon.replace ?? []) out = out.split(from).join(to);
  return applyPronunciation(out, shared);
};
const pubDir = path.join(ROOT, 'public/episodes', id);
fs.mkdirSync(pubDir, { recursive: true });
fs.mkdirSync(path.join(ROOT, 'out'), { recursive: true });

const T = { intro: 0.5, segLead: 0.35, linePause: 0.35, segGap: 0.45, outro: 1.2, ...(board.timing ?? {}) };
const f = s => Math.round(s * FPS);

/* ---------- 1. 配音 + 时间轴 ---------- */
let t = T.intro;
let made = 0, reused = 0;
const lines = [];
const segments = [];
for (const [si, seg] of board.segments.entries()) {
  const segStart = t;
  t += seg.lead ?? T.segLead;
  const segLines = [];
  for (const [li, ln] of seg.lines.entries()) {
    const who = chars[ln.speaker];
    if (!who) throw new Error(`第 ${si + 1} 段第 ${li + 1} 句：未知角色 ${ln.speaker}`);
    const plain = stripMarks(ln.text);
    const ttsText = ln.ttsText ?? toSpeech(plain);
    const a = await synthLine({ label: `${id}-s${si + 1}-L${li + 1}`, text: ttsText, lang: ln.lang ?? 'zh', voice: who.voice, emotion: ln.emotion });
    a.cached ? reused++ : made++;
    const m = analyzeMouth(a.file, FPS);
    const rec = { seg: si, idx: li, speaker: ln.speaker, text: ln.text, plain, ttsText, expression: ln.expression ?? 'normal',
      start: t, end: t + m.durationSec, file: a.file, mouth: m, emphasis: ln.emphasis ?? [] };
    t = rec.end + (ln.pauseAfter ?? T.linePause);
    lines.push(rec);
    segLines.push(rec);
  }
  t += T.segGap;
  segments.push({ ...seg, start: segStart, end: t, lines: segLines });
}
const total = t + T.outro;
console.log(`配音（${lines[0] ? path.extname(lines[0].file) : ''}，共用 scripts/lib/tts.ts）：新生成 ${made} 句，复用缓存 ${reused} 句；总长 ${total.toFixed(1)} 秒`);

/* ---------- 2. 触发时间：按台词 / 按词 / 按其他组件的第几步 ---------- */
const resolved = {}; // visualId -> {enter, steps[]}
function cueTime(cue, seg, fallback) {
  if (cue == null) return fallback;
  if (typeof cue === 'number') cue = { line: cue };
  let base;
  if (cue.after) {
    const ref = resolved[cue.after];
    if (!ref) throw new Error(`触发引用了还没出现的组件：${cue.after}`);
    base = cue.step == null ? ref.enter : ref.steps[Math.min(cue.step, ref.steps.length - 1)];
  } else {
    const ln = seg.lines[cue.line ?? 0];
    if (!ln) throw new Error(`「${seg.chapter}」没有第 ${cue.line} 句`);
    base = ln.start;
    if (cue.word) {
      const k = ln.plain.indexOf(cue.word);
      if (k < 0) throw new Error(`第 ${cue.line} 句里找不到「${cue.word}」：${ln.plain}`);
      base += (k / ln.plain.length) * (ln.end - ln.start);
    }
    if (cue.at === 'end') base = ln.end;
  }
  return base + (cue.offset ?? 0);
}

function stepCount(v) {
  const d = v.data ?? {};
  switch (v.type) {
    case 'keyNumber': return d.sub ? 2 : 1;
    case 'bulletReveal': return d.items.length;
    case 'calculation': return d.terms.length + 1;
    case 'compare': return 3;
    case 'table': return d.rows.length + (d.highlight ? 1 : 0) + (d.callout ? 1 : 0);
    case 'barChart': return d.bars.length;
    case 'timeline': return d.nodes.length + (d.footer ? 1 : 0);
    case 'iconGrid': return d.items.length;
    default: return 1;
  }
}

const OVERLAY = new Set(['cheeseCameo']);
const visuals = [];
const sfx = [];
const SFX_GAIN = { pop: 0.5, tick: 0.35, ding: 0.55, whoosh: 0.45, buzz: 0.5 };
const addSfx = (name, at) => sfx.push({ name, at });

segments.forEach((seg, si) => {
  const segVis = [];
  (seg.visuals ?? []).forEach((v0, vi) => {
    let v = v0;
    const vid = v.id ?? `s${si}v${vi}`;
    let enter, exit, steps;
    if (v.type === 'cheeseCameo') {
      const ln = seg.lines[v.data?.line ?? 0];
      enter = cueTime(v.enter, seg, ln.start - 0.45);
      exit = ln.end + 0.5;
      steps = [enter];
      v = { ...v, data: { text: ln.plain, ...v.data } }; // 气泡默认说这句台词
    } else {
      enter = cueTime(v.enter, seg, seg.lines[0].start - 0.25);
      const n = stepCount(v);
      if (Array.isArray(v.steps)) {
        steps = v.steps.map(c => cueTime(c, seg, enter));
      } else if (v.steps?.every) {
        steps = Array.from({ length: n }, (_, i) => enter + i * v.steps.every);
      } else {
        steps = [];
      }
      // 没写满的步骤：在出现那句台词里均匀分布
      const enterLine = seg.lines.find(l => l.end > enter) ?? seg.lines[0];
      const remain = n - steps.length;
      if (remain > 0) {
        const from = steps.length ? steps[steps.length - 1] + 0.4 : enter + 0.1;
        const span = Math.max(0, enterLine.end - 0.4 - from);
        const gap = Math.min(0.9, Math.max(0.35, remain > 1 ? span / (remain - 1) : 0));
        for (let i = 0; i < remain; i++) steps.push(from + i * gap);
      }
    }
    resolved[vid] = { enter, steps };
    segVis.push({ id: vid, type: v.type, data: v.data ?? {}, overlay: OVERLAY.has(v.type), enter, exit, steps });
  });
  // 主画面：下一个主组件出现时上一个退场；段末统一退场
  const mains = segVis.filter(v => !v.overlay).sort((a, b) => a.enter - b.enter);
  mains.forEach((v, i) => { v.exit = v.exit ?? (mains[i + 1]?.enter ?? seg.end + 0.2); });
  visuals.push(...segVis);
});

// 效果音：按组件类型挂在每一步上
for (const v of visuals) {
  const s = v.steps;
  switch (v.type) {
    case 'chapterTitle': addSfx('whoosh', v.enter); addSfx('pop', s[0] + 0.15); break;
    case 'keyNumber': {
      const dur = v.data.countDuration ?? 1.2;
      for (let k = 0; k < dur - 0.05; k += 0.08) addSfx('tick', s[0] + k);
      addSfx('ding', s[0] + dur);
      if (s[1] != null) addSfx('pop', s[1]);
      break;
    }
    case 'calculation': s.forEach((x, i) => addSfx(i === s.length - 1 ? 'ding' : 'pop', x)); break;
    case 'compare': addSfx('whoosh', s[0]); addSfx('whoosh', s[1]); addSfx('ding', s[2]); break;
    case 'table': s.forEach((x, i) => addSfx(i < v.data.rows.length ? 'tick' : 'ding', x)); break;
    case 'warningBox': addSfx('buzz', s[0]); break;
    case 'cheeseCameo': addSfx('whoosh', v.enter); break;
    default: s.forEach(x => addSfx('pop', x));
  }
}

/* ---------- 3. 角色状态、字幕 ---------- */
// 共用口型结果 {rms[], open:[s,e][]} → 每帧一个 0–9 的字符（0 闭嘴，数字越大张得越大）
const mouthString = m => {
  const lv = new Array(m.frames).fill(0);
  for (const [s, e] of m.open) for (let k = s; k < Math.min(e, m.frames); k++) lv[k] = Math.max(2, Math.min(9, Math.round((m.rms[k] ?? 0.5) * 7)));
  return lv.join('');
};
const subs = [];
const lineOut = lines.map(ln => {
  const terms = [...(lexicon.emphasisTerms ?? []), ...(board.emphasisTerms ?? [])];
  const emChars = parseEmphasis(ln.text, terms, ln.emphasis);
  const pieces = chunk(emChars, board.subtitleMaxWidth ?? 22);
  const totalW = pieces.reduce((s, p) => s + p.length, 0);
  let acc = ln.start;
  pieces.forEach(p => {
    const d = (p.length / totalW) * (ln.end - ln.start);
    const runs = toRuns(p);
    subs.push({ speaker: ln.speaker, start: acc, end: acc + d, runs, text: runs.map(r => r.t).join('') });
    acc += d;
  });
  // 说到强调词时老师切「指」表情
  const plain = emChars.map(c => c.ch).join('');
  const pointAt = [];
  const explicit = [...ln.text.matchAll(/\*\*(.+?)\*\*/g)].map(m => m[1]).concat(ln.emphasis);
  for (const w of explicit) {
    const k = plain.indexOf(w);
    if (k >= 0) pointAt.push(f(ln.start + (k / plain.length) * (ln.end - ln.start)));
  }
  return { speaker: ln.speaker, expression: ln.expression, from: f(ln.start), to: f(ln.end), mouth: mouthString(ln.mouth), pointAt };
});
// 字幕不留空档：一条一直显示到下一条开始（同一段内）
for (let i = 0; i < subs.length - 1; i++) if (subs[i + 1].start - subs[i].end < 0.6) subs[i].end = subs[i + 1].start;

fs.writeFileSync(path.join(ROOT, 'out', `${id}.srt`), toSrt(subs.map(s => ({ ...s, text: s.text }))), 'utf8');

/* ---------- 4. 混音：配音 + 效果音 → mix.wav ---------- */
const sfxFiles = ensureSfx(path.join(ROOT, 'public/sfx'));
const inputs = [], chains = [];
lines.forEach(ln => { inputs.push(ln.file); chains.push({ at: ln.start, gain: 1 }); });
sfx.forEach(s => { inputs.push(sfxFiles[s.name]); chains.push({ at: s.at, gain: (SFX_GAIN[s.name] ?? 0.4) * (board.sfxVolume ?? 1) }); });
const args = ['-y', '-loglevel', 'error'];
inputs.forEach(i => args.push('-i', i));
const fc = chains.map((c, i) => `[${i}:a]volume=${c.gain.toFixed(3)},adelay=${Math.max(0, Math.round(c.at * 1000))}:all=1[a${i}]`).join(';')
  + `;${chains.map((_, i) => `[a${i}]`).join('')}amix=inputs=${chains.length}:normalize=0:dropout_transition=0,apad=whole_dur=${total.toFixed(2)},atrim=0:${total.toFixed(2)},loudnorm=I=-15:TP=-1.5:LRA=11[out]`;
const fcFile = path.join(ROOT, 'cache', `${id}-mix.txt`);
fs.writeFileSync(fcFile, fc);
args.push('-filter_complex_script', fcFile, '-map', '[out]', '-ar', '48000', '-ac', '2', path.join(pubDir, 'mix.wav'));
execFileSync('ffmpeg', args);

/* ---------- 5. 素材清单（有图用图，没图走代码画的占位） ---------- */
// 素材在根目录 assets/，经 public/manga/assets 链接给 Remotion。
// 漫画模板自动画的占位图不算真图，跳过，图解版用自己的代码占位。
// isPlaceholder 会比对内容哈希：同名位置换成真图后立刻认得出来。
const phManifest = loadPlaceholderManifest();
const listAssets = sub => {
  const abs = path.join(ROOT, 'assets', sub);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { recursive: true })
    .filter(n => /\.(png|webp|jpg)$/i.test(n) && !isPlaceholder(`${sub}/${n}`, phManifest))
    .map(n => `manga/assets/${sub}/${n}`);
};
const assets = [...listAssets('characters'), ...listAssets('props')];

const timeline = {
  id, characters: Object.fromEntries(Object.entries(chars).filter(([k]) => !k.startsWith('_')).map(([k, c]) => [k, { name: c.name, color: c.color, placeholder: c.placeholder ?? {} }])), fps: FPS, width: 1920, height: 1080, durationInFrames: f(total),
  title: board.title, audio: `episodes/${id}/mix.wav`, assets,
  segments: segments.map(s => ({ chapter: s.chapter, label: s.label ?? null, from: f(s.start), to: f(s.end) })),
  visuals: visuals.map(v => ({ id: v.id, type: v.type, data: v.data, overlay: v.overlay, from: f(v.enter), to: f(v.exit), steps: v.steps.map(f) })),
  lines: lineOut,
  subtitles: subs.map(s => ({ speaker: s.speaker, from: f(s.start), to: f(s.end), runs: s.runs })),
};
fs.writeFileSync(path.join(pubDir, 'timeline.json'), JSON.stringify(timeline, null, 1));
console.log(`时间轴：${visuals.length} 个图解组件、${subs.length} 条字幕、${sfx.length} 个效果音 → public/episodes/${id}/timeline.json`);
console.log(`字幕：out/${id}.srt；素材：找到 ${assets.length} 张真实图片，其余用代码占位`);
