/* 主讲老师与芝士：有真实立绘就用图（open/closed 两张切口型），没有就用代码画的いらすとや风占位 */
import React from 'react';
import { Img, staticFile } from 'remotion';
import type { LineTL } from './types';
import { CheeseArt, TeacherArt } from './CharacterArt';


// 当前帧的口型：0 闭嘴，1–9 张开程度
export function mouthAt(lines: LineTL[], speaker: string, frame: number) {
  const ln = lines.find(l => l.speaker === speaker && frame >= l.from && frame < l.to);
  if (!ln) return { level: 0, line: undefined as LineTL | undefined };
  const level = Number(ln.mouth[frame - ln.from] ?? '0');
  return { level, line: ln };
}

// 表情别名：漫画模板的表情名也能用
const ALIAS: Record<string, string> = { calm: 'normal', smug: 'smile', happy: 'smile', panic: 'surprised', speechless: 'serious' };

export function teacherExpression(lines: LineTL[], frame: number) {
  // 当前或最近一句老师台词的表情；说到强调词时 24 帧「指」
  const mine = lines.filter(l => l.speaker === 'gyudon' && l.from <= frame);
  const ln = mine[mine.length - 1];
  if (!ln) return 'normal';
  if (frame < ln.to + 10 && ln.pointAt.some(p => frame >= p - 3 && frame < p + 24)) return 'point';
  const e = ln.expression ?? 'normal';
  return ALIAS[e] ?? e;
}

// 有规律但不机械的眨眼
// 眨眼：间隔不固定（约 4.5–8 秒一次），每次闭眼 3 帧，看起来更自然
export const blinking = (frame: number, seed = 0) => {
  let start = 40 + seed * 53;
  for (let n = 0; start <= frame; n++) {
    if (frame < start + 3) return true;
    const h = Math.abs(Math.sin((n + 1) * 12.9898 + seed * 78.233) * 43758.5453) % 1;
    start += 135 + Math.floor(h * 105);
  }
  return false;
};

export function findImage(assets: string[], who: string, expr: string, open: boolean, blink = false) {
  const state = blink && !open ? 'blink' : open ? 'open' : 'closed';
  const base = `manga/assets/characters/${who}/`;
  const cands = [`${expr}_${state}`, `${expr}-${state}`, `${expr}/${state}`, `normal_${state}`, `calm_${state}`, ...(state === 'blink' ? [`${expr}_closed`, 'normal_closed', 'calm_closed'] : [])];
  for (const c of cands) {
    const hit = assets.find(a => a.startsWith(base + c + '.'));
    if (hit) return hit;
  }
  return null;
}

type TeacherProps = { frame: number; lines: LineTL[]; assets: string[] };

export const Teacher: React.FC<TeacherProps> = ({ frame, lines, assets }) => {
  const { level } = mouthAt(lines, 'gyudon', frame);
  const expr = teacherExpression(lines, frame);
  const blink = blinking(frame, 1);
  const talking = level > 0;
  const breathe = Math.sin(frame / 22) * 3 + (talking ? Math.sin(frame / 3.2) * 1.5 : 0);
  const img = findImage(assets, 'gyudon', expr, level >= 2, blink);
  return (
    <div style={{ position: 'absolute', right: 10, bottom: -20, width: 470, height: 660, translate: `0px ${breathe}px` }}>
      {img ? (
        <Img src={staticFile(img)} style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'bottom' }} />
      ) : (
        <TeacherSVG expr={expr} mouth={level} blink={blink} />
      )}
    </div>
  );
};

// ---------- 代码画的占位老师：精修版见 CharacterArt.tsx ----------
export const TeacherSVG = TeacherArt;

// ---------- 芝士小头像：精修版见 CharacterArt.tsx ----------
export const CheeseHead = CheeseArt;
