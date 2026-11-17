// npm run analyze [-- --episode pilot]
// 读每句配音 → 量时长、算口型（每帧 RMS + 阈值滞回）→ 排出整期时间线
// 输出：build/<episode>/timeline.json（渲染时直接读）、out/<episode>.srt
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type {
  CharacterImages,
  FrameRange,
  FxType,
  Plan,
  PlanCut,
  PlanLine,
  PlanSfx,
  Position,
  StoryCut,
  Timing,
  TransitionType,
} from "../src/manga/types.ts";
import { analyzeMouth, type MouthResult } from "./lib/mouth.ts";
import { decodeMono } from "./lib/audio.ts";
import {
  AUDIO_EXTS,
  BUILD,
  CONFIG,
  IMAGE_EXTS,
  OUT,
  ROOT,
  assetSrc,
  audioSrc,
  episodeArg,
  findAsset,
  readJson,
} from "./lib/paths.ts";
import { lineId, loadCharacters, loadStoryboard, reportValidation, validateStoryboard } from "./lib/storyboard.ts";
import { loadPlaceholderManifest } from "./lib/placeholder-manifest.ts";

const episode = episodeArg();
const sb = loadStoryboard(episode);
const chars = loadCharacters();
reportValidation(validateStoryboard(sb, chars));

const fps = sb.episode.fps ?? 30;
const width = sb.episode.width ?? 1920;
const height = sb.episode.height ?? 1080;
const defaultPause = sb.episode.defaultPause ?? 0.25;
const sec = (s: number) => Math.round(s * fps);

const ttsFile = path.join(BUILD, episode, "tts.json");
if (!existsSync(ttsFile)) throw new Error(`没有配音清单 ${path.relative(ROOT, ttsFile)}，先跑 npm run tts`);
const tts = readJson<{ lines: Record<string, { file: string; ttsText: string }> }>(ttsFile).lines;

type SfxDefaults = {
  volume?: number;
  enter?: Record<string, string | null>;
  propAppear?: Record<string, string | null>;
  fx?: Record<string, string | null>;
  transition?: Record<string, string | null>;
  titleCard?: string | null;
};
const sfxDefaults: SfxDefaults = existsSync(path.join(CONFIG, "sfx-defaults.json"))
  ? readJson<SfxDefaults>(path.join(CONFIG, "sfx-defaults.json"))
  : {};

const missingImages = new Set<string>();
const missingSounds = new Set<string>();

const POS_X: Record<Position, number> = { left: 0.27, center: 0.5, right: 0.73 };
const TRANSITION_SEC: Record<TransitionType, number> = { cut: 0, fade: 0.4, slide: 0.5 };
const PUNCT = /[\s，。、！？!?,.…—~～「」『』（）()“”"':：；;]/u;

// ---------- 素材 ----------

function imageSrc(rel: string): string | null {
  const found = findAsset(rel, IMAGE_EXTS);
  if (!found) {
    missingImages.add(rel);
    return null;
  }
  return assetSrc(found);
}

function soundSrc(rel: string | null | undefined): string | null {
  if (!rel) return null;
  const found = findAsset(rel, AUDIO_EXTS);
  if (!found) {
    missingSounds.add(rel);
    return null;
  }
  return assetSrc(found);
}

/** 每个角色用到的表情 → 图片。命名：{表情}_closed / {表情}_open / {表情}_blink，没有专用眨眼图就用 blink */
function characterImages(id: string, expressions: Set<string>): Record<string, CharacterImages> {
  const dir = `characters/${id}`;
  const out: Record<string, CharacterImages> = {};
  const genericBlink = findAsset(`${dir}/blink`, IMAGE_EXTS);
  for (const expr of expressions) {
    const closed = findAsset(`${dir}/${expr}_closed`, IMAGE_EXTS) ?? findAsset(`${dir}/${expr}`, IMAGE_EXTS);
    if (!closed) {
      missingImages.add(`${dir}/${expr}_closed`);
      continue;
    }
    const open = findAsset(`${dir}/${expr}_open`, IMAGE_EXTS);
    const blink = findAsset(`${dir}/${expr}_blink`, IMAGE_EXTS) ?? genericBlink;
    out[expr] = { closed: assetSrc(closed), open: open ? assetSrc(open) : null, blink: blink ? assetSrc(blink) : null };
  }
  return out;
}

// ---------- 配音与口型 ----------

const mouthCache = new Map<string, MouthResult>();
function mouthOf(id: string): { mouth: MouthResult; audioFile: string } {
  const entry = tts[id];
  const file = entry ? path.join(ROOT, entry.file) : "";
  if (!entry || !existsSync(file)) throw new Error(`${id} 没有配音文件，先跑 npm run tts`);
  if (!mouthCache.has(file)) mouthCache.set(file, analyzeMouth(file, fps));
  return { mouth: mouthCache.get(file)!, audioFile: file };
}

/** 文本里第 charIndex 个字大约在第几帧：按「有声音的帧」比例对应，标点不算字 */
function frameAtChar(text: string, charIndex: number, mouth: MouthResult): number {
  const glyphs = [...text];
  const spoken = (arr: string[]) => arr.filter((c) => !PUNCT.test(c)).length;
  const total = Math.max(1, spoken(glyphs));
  const target = spoken(glyphs.slice(0, charIndex)) / total;
  const voiced = mouth.rms.map((v) => (v >= 0.18 ? 1 : 0));
  const voicedTotal = voiced.reduce((a: number, b) => a + b, 0);
  if (voicedTotal === 0) return Math.round(target * mouth.frames);
  let acc = 0;
  for (let f = 0; f < voiced.length; f++) {
    if (acc / voicedTotal >= target) return f;
    acc += voiced[f];
  }
  return voiced.length;
}

// ---------- 字幕分段 ----------

function splitSubtitle(text: string, max = 22): { text: string; start: number }[] {
  const glyphs = [...text];
  if (glyphs.length <= max) return [{ text, start: 0 }];
  // 先按句号类切，再按逗号类切，然后贪心合并到不超过 max
  const pieces: { text: string; start: number }[] = [];
  let buf = "";
  let start = 0;
  glyphs.forEach((g, i) => {
    if (!buf) start = i;
    buf += g;
    const next = glyphs[i + 1];
    // 半角逗号不切（会把 2,000 切开）
    const isBreak = /[。！？!?]/.test(g) || (/[，、；;…]/.test(g) && !/[…，、。！？]/.test(next ?? ""));
    if (isBreak || i === glyphs.length - 1) {
      pieces.push({ text: buf, start });
      buf = "";
    }
  });
  const merged: { text: string; start: number }[] = [];
  for (const p of pieces) {
    const last = merged[merged.length - 1];
    if (last && [...last.text].length + [...p.text].length <= max) last.text += p.text;
    else merged.push({ ...p });
  }
  return merged;
}

// ---------- 时间线 ----------

function resolveTiming(t: Timing, cut: StoryCut, lineStarts: number[], lineMouths: MouthResult[]): number {
  let f = 0;
  if (t.atLine !== undefined) f = lineStarts[t.atLine];
  else if (t.atText) {
    const li = (cut.lines ?? []).findIndex((l) => l.text.includes(t.atText!));
    const text = cut.lines![li].text;
    const charIndex = [...text.slice(0, text.indexOf(t.atText))].length;
    f = lineStarts[li] + frameAtChar(text, charIndex, lineMouths[li]);
  } else if (t.at !== undefined) f = sec(t.at);
  return Math.max(0, f + sec(t.offset ?? 0));
}

const cuts: PlanCut[] = [];
const lines: PlanLine[] = [];
const sfx: PlanSfx[] = [];
const addSfx = (src: string | null, frame: number, reason: string, volume = sfxDefaults.volume ?? 0.7) => {
  if (src) sfx.push({ src, frame, volume, reason });
};

let cursor = 0; // 帧
const usedExpressions = new Map<string, Set<string>>();
const useExpr = (id: string, expr: string) => {
  if (!usedExpressions.has(id)) usedExpressions.set(id, new Set());
  usedExpressions.get(id)!.add(expr);
};

sb.cuts.forEach((cut, index) => {
  const startFrame = cursor;
  const storyLines = cut.lines ?? [];
  const trType: TransitionType = (typeof cut.transition === "string" ? cut.transition : cut.transition?.type) ?? "cut";
  const trSec = typeof cut.transition === "object" && cut.transition.duration !== undefined ? cut.transition.duration : TRANSITION_SEC[trType];
  const transitionIn = { type: index === 0 ? ("cut" as const) : trType, frames: index === 0 ? 0 : sec(trSec) };

  // 有角色在镜头一开头进场，就多留一点时间再开口
  const entersAtStart = (cut.characters ?? []).some((c) => (c.enter ?? "none") !== "none" && c.at === undefined && c.atLine === undefined && !c.atText);
  const leadIn = cut.leadIn ?? (storyLines.length ? (entersAtStart ? 0.55 : 0.3) : 0);

  // 1) 台词排时间
  let t = startFrame + sec(leadIn);
  const lineStarts: number[] = [];
  const lineMouths: MouthResult[] = [];
  const planLines: PlanLine[] = [];
  storyLines.forEach((l, i) => {
    const id = lineId(cut, i);
    const { mouth, audioFile } = mouthOf(id);
    const lineStart = t;
    const lineEnd = lineStart + Math.ceil(mouth.durationSec * fps);
    lineStarts.push(lineStart - startFrame);
    lineMouths.push(mouth);
    planLines.push({
      id,
      cutId: cut.id,
      speaker: l.speaker,
      kind: l.kind ?? "say",
      lang: l.lang ?? "zh",
      text: l.text,
      subtitleZh: l.subtitleZh ?? null,
      startFrame: lineStart,
      endFrame: lineEnd,
      displayEndFrame: lineEnd,
      audio: audioSrc(audioFile),
      durationSec: Math.round(mouth.durationSec * 1000) / 1000,
      mouth: mouth.open,
      chunks: [],
    });
    t = lineEnd + sec(l.pauseAfter ?? defaultPause);
  });

  // 2) 镜头结束时间
  let endFrame: number;
  if (storyLines.length) {
    const lastPause = storyLines[storyLines.length - 1].pauseAfter ?? defaultPause;
    endFrame = planLines[planLines.length - 1].endFrame + sec(Math.max(lastPause, cut.tail ?? 0.2));
    if (cut.duration) endFrame = Math.max(endFrame, startFrame + sec(cut.duration));
  } else {
    endFrame = startFrame + sec(cut.duration ?? 2);
  }

  // 3) 字幕：显示到下一句开始 / 镜头结束 / 音频结束后 0.6 秒，取最早的
  planLines.forEach((pl, i) => {
    const next = planLines[i + 1];
    pl.displayEndFrame = Math.min(next ? next.startFrame : endFrame, pl.endFrame + sec(0.6), endFrame);
    pl.displayEndFrame = Math.max(pl.displayEndFrame, pl.endFrame);
    const mouth = lineMouths[i];
    const pieces = pl.lang === "ja" ? [{ text: pl.text, start: 0 }] : splitSubtitle(pl.text);
    pl.chunks = pieces.map((p, k) => {
      const s = k === 0 ? pl.startFrame : pl.startFrame + frameAtChar(pl.text, p.start, mouth);
      const nextPiece = pieces[k + 1];
      const e = nextPiece ? pl.startFrame + frameAtChar(pl.text, nextPiece.start, mouth) : pl.displayEndFrame;
      return { text: p.text, zh: k === 0 ? pl.subtitleZh : null, startFrame: s, endFrame: Math.max(e, s + 1) };
    });
  });

  // 4) 角色、表情、进场
  const onStage = new Set((cut.characters ?? []).map((c) => c.id));
  const planChars = (cut.characters ?? []).map((c) => {
    const def = chars[c.id];
    const first = c.expression ?? def.defaultExpression;
    useExpr(c.id, first);
    const expressions = [{ frame: 0, expression: first }];
    storyLines.forEach((l, i) => {
      if (l.speaker === c.id && l.expression) {
        expressions.push({ frame: lineStarts[i], expression: l.expression });
        useExpr(c.id, l.expression);
      }
    });
    const enter = c.enter ?? "none";
    const enterFrame = resolveTiming(c, cut, lineStarts, lineMouths);
    if (enter !== "none") addSfx(soundSrc(sfxDefaults.enter?.[enter]), startFrame + enterFrame, `${cut.id} ${def.name}进场`);
    return {
      id: c.id,
      x: c.x ?? POS_X[c.position ?? "center"],
      flip: c.flip ?? false,
      enter,
      enterFrame,
      expressions,
    };
  });

  // 5) 道具
  const props = (cut.props ?? []).flatMap((p) => {
    const src = imageSrc(`props/${p.image}`);
    const frame = resolveTiming(p, cut, lineStarts, lineMouths);
    const appear = p.appear ?? "pop";
    if (!src) return [];
    addSfx(soundSrc(sfxDefaults.propAppear?.[appear]), startFrame + frame, `${cut.id} 道具 ${p.image}`);
    return [{ image: src, x: p.x ?? POS_X[p.position ?? "center"], y: p.y ?? 0.45, size: p.size ?? 0.18, appear, frame }];
  });

  // 6) 效果（跟着台词）
  const fx: PlanCut["fx"] = [];
  storyLines.forEach((l, i) => {
    const list: FxType[] = l.fx === undefined ? [] : Array.isArray(l.fx) ? l.fx : [l.fx];
    for (const type of list) {
      const frame = lineStarts[i] + 2;
      // 汗、闪光、生气标记挂满整句；感叹号、问号只弹一下
      const lineLen = planLines[i].endFrame - planLines[i].startFrame;
      const duration = type === "shake" ? sec(0.3) : type === "exclaim" || type === "question" ? sec(1.3) : Math.max(sec(1.6), lineLen);
      fx.push({ type, frame, duration, target: type === "shake" ? null : onStage.has(l.speaker) ? l.speaker : null });
      addSfx(soundSrc(sfxDefaults.fx?.[type]), startFrame + frame, `${cut.id} 效果 ${type}`);
    }
  });

  // 7) 手写的效果音
  for (const s of cut.sfx ?? []) {
    const src = soundSrc(s.file);
    addSfx(src, startFrame + resolveTiming(s, cut, lineStarts, lineMouths), `${cut.id} ${s.file}`, s.volume ?? sfxDefaults.volume ?? 0.7);
  }
  if (cut.titleCard) addSfx(soundSrc(sfxDefaults.titleCard), startFrame + 2, `${cut.id} 标题卡`);
  if (transitionIn.frames > 0) addSfx(soundSrc(sfxDefaults.transition?.[transitionIn.type]), startFrame, `${cut.id} 转场`);

  cuts.push({
    id: cut.id,
    index,
    startFrame,
    endFrame,
    background: cut.background ? imageSrc(`backgrounds/${cut.background}`) : null,
    shot: cut.shot ?? "wide",
    camera: { type: cut.camera?.type ?? "static", strength: cut.camera?.strength ?? 0.08, focus: cut.camera?.focus ?? "center" },
    transitionIn,
    characters: planChars,
    props,
    fx,
    lineIds: planLines.map((l) => l.id),
    titleCard: cut.titleCard
      ? { text: cut.titleCard.text, sub: cut.titleCard.sub ?? null, animation: cut.titleCard.animation ?? "pop", color: cut.titleCard.color ?? "#E8743B" }
      : null,
  });
  lines.push(...planLines);
  cursor = endFrame;
});

const durationInFrames = cursor;

// 背景音乐
const cutIndex = new Map(cuts.map((c, i) => [c.id, i]));
const bgm = (sb.episode.bgm ?? []).flatMap((b) => {
  const src = soundSrc(b.file);
  if (!src) return [];
  const from = cuts[cutIndex.get(b.fromCut ?? cuts[0].id) ?? 0];
  const to = cuts[cutIndex.get(b.toCut ?? cuts[cuts.length - 1].id) ?? cuts.length - 1];
  const volume = b.volume ?? 0.25;
  // 量音乐长度（Remotion 的 loop 在渲染时不可靠，改成按长度一段接一段铺）
  const file = path.join(ROOT, "assets", path.relative("manga/assets", src));
  const loopFrames = Math.max(1, Math.floor((decodeMono(file, 8000).length / 8000) * fps));
  return [
    {
      src,
      startFrame: from.startFrame,
      endFrame: to.endFrame,
      loopFrames,
      volume,
      duckVolume: b.duckVolume ?? Math.round(volume * 0.35 * 1000) / 1000,
    },
  ];
});

// 说话区间（合并相邻的），给背景音乐压低用
const speech: FrameRange[] = [];
for (const l of [...lines].sort((a, b) => a.startFrame - b.startFrame)) {
  const last = speech[speech.length - 1];
  if (last && l.startFrame <= last[1] + sec(0.4)) last[1] = Math.max(last[1], l.endFrame);
  else speech.push([l.startFrame, l.endFrame]);
}

// 角色图
const characters: Plan["characters"] = {};
for (const [id, exprs] of usedExpressions) {
  const def = chars[id];
  exprs.add(def.defaultExpression);
  characters[id] = { id, name: def.name, color: def.color, images: characterImages(id, exprs) };
}
for (const l of lines) {
  if (!characters[l.speaker]) {
    const def = chars[l.speaker];
    characters[l.speaker] = { id: l.speaker, name: def.name, color: def.color, images: {} };
  }
}

const plan: Plan = {
  version: 1,
  generatedAt: new Date().toISOString(),
  episode: { id: sb.episode.id, title: sb.episode.title, width, height, fps, durationInFrames },
  characters,
  cuts,
  lines,
  sfx: sfx.sort((a, b) => a.frame - b.frame),
  bgm,
  speech,
};

const outDir = path.join(BUILD, episode);
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, "timeline.json"), JSON.stringify(plan, null, 1));

// SRT 字幕
const ts = (frame: number) => {
  const ms = Math.round((frame / fps) * 1000);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
const srt: string[] = [];
let n = 0;
for (const l of lines) {
  const name = chars[l.speaker].name + (l.kind === "thought" ? "（心声）" : "");
  for (const c of l.chunks) {
    const body = l.kind === "thought" ? `（${c.text}）` : c.text;
    srt.push(`${++n}\n${ts(c.startFrame)} --> ${ts(c.endFrame)}\n${name}：${body}${c.zh ? `\n${c.zh}` : ""}\n`);
  }
}
for (const c of cuts) {
  if (c.titleCard) {
    srt.push(`${++n}\n${ts(c.startFrame)} --> ${ts(c.endFrame)}\n${c.titleCard.text}${c.titleCard.sub ?? ""}\n`);
  }
}
mkdirSync(OUT, { recursive: true });
const srtText = srt.join("\n");
writeFileSync(path.join(outDir, `${episode}.srt`), srtText);
writeFileSync(path.join(OUT, `${episode}.srt`), srtText);

// 报告
console.log(`时间线：${episode}  ${cuts.length} 个镜头、${lines.length} 句、总长 ${(durationInFrames / fps).toFixed(2)} 秒（${durationInFrames} 帧 @${fps}fps）`);
for (const c of cuts) {
  const ls = lines.filter((l) => l.cutId === c.id);
  const openFrames = ls.reduce((a, l) => a + l.mouth.reduce((s, [x, y]) => s + y - x, 0), 0);
  const speakFrames = ls.reduce((a, l) => a + (l.endFrame - l.startFrame), 0);
  console.log(
    `  ${c.id}  ${(c.startFrame / fps).toFixed(2)}s → ${(c.endFrame / fps).toFixed(2)}s` +
      (ls.length ? `  台词 ${ls.length} 句，张嘴 ${openFrames}/${speakFrames} 帧` : "  （无台词）") +
      (c.transitionIn.frames ? `  转场 ${c.transitionIn.type}` : ""),
  );
}
console.log(`效果音 ${sfx.length} 个、背景音乐 ${bgm.length} 段 → build/${episode}/timeline.json，字幕 → out/${episode}.srt`);
// 用到的图里还有多少是占位图
const placeholderSet = new Set(loadPlaceholderManifest().files.map((f) => `manga/assets/${f}`));
const usedImages = new Set<string>([
  ...cuts.flatMap((c) => [c.background, ...c.props.map((p) => p.image)]),
  ...Object.values(characters).flatMap((c) => Object.values(c.images).flatMap((i) => [i.closed, i.open, i.blink])),
].filter((x): x is string => !!x));
const stillPlaceholder = [...usedImages].filter((f) => placeholderSet.has(f)).length;
console.log(`用到图片 ${usedImages.size} 张，其中占位图 ${stillPlaceholder} 张、真图 ${usedImages.size - stillPlaceholder} 张`);
if (missingImages.size) {
  console.warn(`缺图 ${missingImages.size} 张（先跑 npm run placeholders 生成占位图）：\n  ${[...missingImages].join("\n  ")}`);
}
if (missingSounds.size) {
  console.log(`以下声音文件还没放（不影响渲染，放进 assets/ 后重跑 analyze 就有声音）：\n  ${[...missingSounds].sort().join("\n  ")}`);
}
