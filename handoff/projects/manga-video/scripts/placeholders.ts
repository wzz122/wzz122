// npm run placeholders [-- --force]
// 给分镜里用到、但还没有真图的素材生成占位 PNG：
//   角色：不同颜色的剪影，嘴巴有 open / closed 两版（能看出口型有没有在动），另有眨眼图
//   背景：纯色 + 简单示意 + 场景名
//   道具：色块 + 名字
// 已经存在的真图不会被覆盖。--force 只重画以前由本脚本生成的占位图（记录在 assets/.placeholders.json）。
import { createCanvas, GlobalFonts, type Canvas, type SKRSContext2D } from "@napi-rs/canvas";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ASSETS, EPISODES, IMAGE_EXTS, findAsset } from "./lib/paths.ts";
import { fileHash, loadPlaceholderManifest, savePlaceholderManifest } from "./lib/placeholder-manifest.ts";
import { loadCharacters, loadStoryboard, type CharacterConfig } from "./lib/storyboard.ts";

const force = process.argv.includes("--force");
const FONT = "PlaceholderCJK";
const fontFile = path.join(ASSETS, "fonts", "NotoSansSC.ttf");
if (existsSync(fontFile)) GlobalFonts.registerFromPath(fontFile, FONT);
else GlobalFonts.registerFromPath("/System/Library/Fonts/Hiragino Sans GB.ttc", FONT);

// 读记录时会自动清掉「已经被真图替换」的条目（按内容哈希判断）
const manifest = loadPlaceholderManifest();
const isPlaceholder = new Set(manifest.files);

let made = 0;
let kept = 0;

/** rel 不带扩展名，例如 characters/cheese/panic_open */
function shouldWrite(rel: string): boolean {
  const existing = findAsset(rel, IMAGE_EXTS);
  if (!existing) return true;
  if (force && isPlaceholder.has(existing)) return true;
  kept++;
  return false;
}

function save(rel: string, canvas: Canvas): void {
  const file = path.join(ASSETS, `${rel}.png`);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, canvas.toBuffer("image/png"));
  isPlaceholder.add(`${rel}.png`);
  manifest.hashes[`${rel}.png`] = fileHash(file);
  made++;
}

function label(ctx: SKRSContext2D, lines: string[], cx: number, cy: number, size: number) {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((text, i) => {
    const y = cy + i * size * 1.25;
    ctx.font = `${i === 0 ? 900 : 700} ${i === 0 ? size : size * 0.8}px ${FONT}`;
    const w = ctx.measureText(text).width + size * 0.8;
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    roundRect(ctx, cx - w / 2, y - size * 0.62, w, size * 1.24, size * 0.3);
    ctx.fill();
    ctx.fillStyle = "#3A2A1E";
    ctx.fillText(text, cx, y);
  });
}

function roundRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------- 角色 ----------

type Face = { brow: number; eye: "dot" | "happy" | "flat" | "wide" | "half"; mouthClosed: "smile" | "flat" | "wavy" | "smirk" | "o" };
const FACES: Record<string, Face> = {
  normal: { brow: 0, eye: "dot", mouthClosed: "smile" },
  calm: { brow: 0, eye: "half", mouthClosed: "flat" },
  happy: { brow: -0.15, eye: "happy", mouthClosed: "smile" },
  smug: { brow: 0.25, eye: "half", mouthClosed: "smirk" },
  speechless: { brow: 0, eye: "flat", mouthClosed: "flat" },
  panic: { brow: -0.35, eye: "wide", mouthClosed: "wavy" },
  surprised: { brow: -0.45, eye: "wide", mouthClosed: "o" },
};

function drawCharacter(id: string, def: CharacterConfig, expr: string, state: "closed" | "open" | "blink") {
  const W = 800;
  const H = 1000;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  const ph = (def.placeholder ?? {}) as Record<string, string | boolean>;
  const body = (ph.body as string) ?? "#888";
  const skin = (ph.skin as string) ?? "#F4D6BC";
  const hair = (ph.hair as string) ?? "#333";
  const face = FACES[expr] ?? FACES.normal;
  const outline = "#6B4A33";
  ctx.lineWidth = 6;
  ctx.strokeStyle = outline;

  // 身体
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(180, H);
  ctx.bezierCurveTo(170, 640, 250, 560, 400, 560);
  ctx.bezierCurveTo(550, 560, 630, 640, 620, H);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // 领带 / 工牌
  if (ph.tie) {
    ctx.fillStyle = ph.tie as string;
    ctx.beginPath();
    ctx.moveTo(385, 575);
    ctx.lineTo(415, 575);
    ctx.lineTo(432, 820);
    ctx.lineTo(400, 860);
    ctx.lineTo(368, 820);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  if (ph.badge) {
    ctx.strokeStyle = "#C0392B";
    ctx.beginPath();
    ctx.moveTo(340, 575);
    ctx.lineTo(400, 760);
    ctx.lineTo(460, 575);
    ctx.stroke();
    ctx.fillStyle = "#FFFFFF";
    ctx.strokeStyle = outline;
    roundRect(ctx, 360, 750, 80, 100, 8);
    ctx.fill();
    ctx.stroke();
  }
  // 头
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(400, 330, 210, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // 头发
  ctx.fillStyle = hair;
  ctx.beginPath();
  ctx.arc(400, 330, 212, Math.PI * 1.02, Math.PI * 1.98);
  ctx.quadraticCurveTo(470, 210, 400, 230);
  ctx.quadraticCurveTo(320, 215, 190, 300);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // 腮红
  ctx.fillStyle = "rgba(255,140,150,0.45)";
  for (const x of [270, 530]) {
    ctx.beginPath();
    ctx.ellipse(x, 400, 34, 20, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // 眉毛
  ctx.strokeStyle = "#3A2A1E";
  ctx.lineWidth = 9;
  ctx.lineCap = "round";
  for (const [x, dir] of [[320, 1], [480, -1]] as const) {
    ctx.beginPath();
    ctx.moveTo(x - 32, 268 + face.brow * 40 * dir);
    ctx.lineTo(x + 32, 268 - face.brow * 40 * dir);
    ctx.stroke();
  }
  // 眼睛
  ctx.fillStyle = "#2A1E16";
  for (const x of [320, 480]) {
    if (state === "blink") {
      ctx.beginPath();
      ctx.moveTo(x - 22, 330);
      ctx.quadraticCurveTo(x, 342, x + 22, 330);
      ctx.stroke();
      continue;
    }
    if (face.eye === "dot") {
      ctx.beginPath();
      ctx.arc(x, 330, 14, 0, Math.PI * 2);
      ctx.fill();
    } else if (face.eye === "wide") {
      ctx.fillStyle = "#FFFFFF";
      ctx.beginPath();
      ctx.arc(x, 330, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#2A1E16";
      ctx.beginPath();
      ctx.arc(x, 330, 10, 0, Math.PI * 2);
      ctx.fill();
    } else if (face.eye === "happy") {
      ctx.beginPath();
      ctx.moveTo(x - 22, 338);
      ctx.quadraticCurveTo(x, 305, x + 22, 338);
      ctx.stroke();
    } else if (face.eye === "flat") {
      ctx.beginPath();
      ctx.moveTo(x - 24, 330);
      ctx.lineTo(x + 24, 330);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(x, 334, 14, Math.PI, 0, true);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - 24, 328);
      ctx.lineTo(x + 24, 328);
      ctx.stroke();
    }
  }
  // 眼镜
  ctx.strokeStyle = "#222";
  if (ph.glasses === "round") {
    ctx.lineWidth = 7;
    for (const x of [320, 480]) {
      ctx.beginPath();
      ctx.arc(x, 330, 50, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(370, 330);
    ctx.lineTo(430, 330);
    ctx.stroke();
  } else if (ph.glasses === "thick") {
    ctx.lineWidth = 16;
    for (const x of [320, 480]) {
      roundRect(ctx, x - 62, 292, 124, 80, 14);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(382, 325);
    ctx.lineTo(418, 325);
    ctx.stroke();
  }
  // 嘴巴：open 一律画成张开的椭圆，closed 按表情画
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#3A2A1E";
  if (state === "open") {
    ctx.fillStyle = "#8E2F2F";
    ctx.beginPath();
    ctx.ellipse(400, 448, 42, face.mouthClosed === "o" ? 46 : 32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#E57373";
    ctx.beginPath();
    ctx.ellipse(400, 466, 24, 10, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    const m = face.mouthClosed;
    if (m === "smile") {
      ctx.moveTo(360, 440);
      ctx.quadraticCurveTo(400, 475, 440, 440);
    } else if (m === "flat") {
      ctx.moveTo(368, 450);
      ctx.lineTo(432, 450);
    } else if (m === "wavy") {
      ctx.moveTo(355, 452);
      ctx.quadraticCurveTo(372, 436, 389, 452);
      ctx.quadraticCurveTo(406, 468, 423, 452);
      ctx.quadraticCurveTo(436, 440, 448, 450);
    } else if (m === "smirk") {
      ctx.moveTo(365, 452);
      ctx.quadraticCurveTo(410, 462, 440, 432);
    } else {
      ctx.ellipse(400, 450, 16, 18, 0, 0, Math.PI * 2);
    }
    ctx.stroke();
  }
  // 标注
  const exprName = def.expressions[expr] ?? expr;
  // 标注放在头顶上方，字幕挡不住、特写也看得见
  label(ctx, [`${def.name}  ${exprName} / ${state}`], 400, 62, 44);
  return canvas;
}

// ---------- 背景 ----------

const BG: Record<string, { color: string; name: string; draw?: (ctx: SKRSContext2D) => void }> = {
  office: {
    color: "#F4ECDD",
    name: "办公室",
    draw: (ctx) => {
      ctx.fillStyle = "#CFE3F1";
      roundRect(ctx, 1240, 120, 520, 360, 16);
      ctx.fill();
      ctx.fillStyle = "#E3D3B6";
      ctx.fillRect(0, 760, 1920, 320);
      ctx.fillStyle = "#C9AE86";
      roundRect(ctx, 140, 690, 700, 70, 10);
      ctx.fill();
      roundRect(ctx, 1080, 690, 700, 70, 10);
      ctx.fill();
      ctx.fillStyle = "#9FB3C8";
      roundRect(ctx, 420, 540, 220, 150, 10);
      ctx.fill();
      roundRect(ctx, 1300, 540, 220, 150, 10);
      ctx.fill();
    },
  },
  classroom: {
    color: "#E6F0E1",
    name: "教室（有白板）",
    draw: (ctx) => {
      ctx.fillStyle = "#8C6B4A";
      roundRect(ctx, 330, 110, 1260, 560, 18);
      ctx.fill();
      ctx.fillStyle = "#FBFBF7";
      roundRect(ctx, 355, 135, 1210, 510, 10);
      ctx.fill();
      ctx.fillStyle = "#D8C8A8";
      ctx.fillRect(0, 820, 1920, 260);
    },
  },
};

function drawBackground(name: string) {
  const canvas = createCanvas(1920, 1080);
  const ctx = canvas.getContext("2d");
  const spec = BG[name] ?? { color: `hsl(${[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360},45%,88%)`, name };
  ctx.fillStyle = spec.color;
  ctx.fillRect(0, 0, 1920, 1080);
  spec.draw?.(ctx);
  label(ctx, [`背景：${spec.name}`, `${name}.png（占位）`], 960, 70, 44);
  return canvas;
}

// ---------- 道具 ----------

const PROPS: Record<string, { color: string; name: string }> = {
  crab_box: { color: "#F08A4B", name: "螃蟹箱" },
  rice: { color: "#F3EFE2", name: "十公斤大米" },
  wagyu: { color: "#E07A86", name: "和牛" },
};

function drawProp(name: string) {
  const canvas = createCanvas(600, 600);
  const ctx = canvas.getContext("2d");
  const spec = PROPS[name] ?? { color: "#B9C7D8", name };
  ctx.fillStyle = spec.color;
  ctx.strokeStyle = "#6B4A33";
  ctx.lineWidth = 8;
  roundRect(ctx, 60, 120, 480, 400, 40);
  ctx.fill();
  ctx.stroke();
  label(ctx, [spec.name, `${name}.png`], 300, 290, 56);
  return canvas;
}

// ---------- 收集需要的素材 ----------

const chars = loadCharacters();
const needBackgrounds = new Set<string>();
const needProps = new Set<string>();
const needExpr = new Map<string, Set<string>>();
const want = (id: string, e: string | undefined) => {
  if (!e || !chars[id]) return;
  if (!needExpr.has(id)) needExpr.set(id, new Set());
  needExpr.get(id)!.add(e);
};

// characters.json 里登记的表情全画；所有分镜里用到的背景、道具、表情也补上
for (const [id, def] of Object.entries(chars)) {
  want(id, def.defaultExpression);
  for (const e of Object.keys(def.expressions)) want(id, e);
}
const episodes = existsSync(EPISODES) ? readdirSync(EPISODES).filter((d) => existsSync(path.join(EPISODES, d, "storyboard.json"))) : [];
for (const ep of episodes) {
  let sb;
  try {
    sb = loadStoryboard(ep);
  } catch {
    continue;
  }
  if (!Array.isArray(sb?.cuts)) continue;
  for (const cut of sb.cuts) {
    if (cut.background) needBackgrounds.add(cut.background);
    for (const p of cut.props ?? []) needProps.add(p.image);
    for (const c of cut.characters ?? []) want(c.id, c.expression);
    for (const l of cut.lines ?? []) want(l.speaker, l.expression);
  }
}

for (const [id, exprs] of needExpr) {
  for (const expr of exprs) {
    for (const state of ["closed", "open", "blink"] as const) {
      const rel = `characters/${id}/${expr}_${state}`;
      if (shouldWrite(rel)) save(rel, drawCharacter(id, chars[id], expr, state));
    }
  }
}
for (const bg of needBackgrounds) {
  const rel = `backgrounds/${bg}`;
  if (shouldWrite(rel)) save(rel, drawBackground(bg));
}
for (const p of needProps) {
  const rel = `props/${p}`;
  if (shouldWrite(rel)) save(rel, drawProp(p));
}
for (const dir of ["sfx", "bgm"]) mkdirSync(path.join(ASSETS, dir), { recursive: true });

savePlaceholderManifest({ files: [...isPlaceholder], hashes: manifest.hashes });
console.log(`占位图：新画 ${made} 张，已有图片保留 ${kept} 张。效果音和背景音乐留空（assets/sfx、assets/bgm），不影响渲染。`);
