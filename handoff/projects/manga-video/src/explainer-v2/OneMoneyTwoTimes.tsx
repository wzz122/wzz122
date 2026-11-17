/* 图解 v2 · 15 秒无声样片「一笔钱，两个时间」
   按 Codex 复核：同一笔钱一直留在画面上 → 拆成两份 → 移到不同时间 → 排成账本 → 老师指向结论。
   金额固定，不滚数字；颜色含义全程不变：橙=付出去的捐款，绿=以后抵扣，黄=自己负担。 */
import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { C, FONT, loadFonts, pop } from '../explainer/theme';
import { TeacherSVG, blinking } from '../explainer/Characters';
import { Calendar, MoneyBag, TaxSlip } from './Art';

loadFonts();

export const V2_DURATION = 450;

const ORANGE = { body: '#F4A259', shade: '#D9803A', pill: '#E8853D' };
const GREEN = { body: '#5DBB8A', shade: '#3E9A6C', pill: '#2E8B62' };
const YELLOW = { body: '#FFD45C', shade: '#E8B23A', pill: '#F2B705' };

const E = Easing.bezier(0.33, 1, 0.68, 1);
const kf = (f: number, ks: number[], vs: number[]) =>
  interpolate(f, ks, vs, { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: E });
const fade = (f: number, a: number, b: number) => kf(f, [a, b], [0, 1]);

const Pill: React.FC<{ x: number; y: number; color: string; label: string; value: string; s?: number; dark?: boolean; o?: number }> = ({ x, y, color, label, value, s = 1, dark, o = 1 }) => (
  <div style={{ position: 'absolute', left: x, top: y, translate: '-50% -50%', scale: `${s}`, opacity: o, background: color, color: dark ? C.ink : '#fff', borderRadius: 22, padding: '10px 28px 12px', textAlign: 'center', border: '5px solid #5A4A42', boxShadow: '0 6px 0 rgba(90,74,66,0.18)', whiteSpace: 'nowrap', fontFamily: FONT }}>
    <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.2 }}>{label}</div>
    <div style={{ fontSize: 58, fontWeight: 900, lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
  </div>
);

const Obj: React.FC<{ x: number; y: number; s?: number; o?: number; children: React.ReactNode }> = ({ x, y, s = 1, o = 1, children }) => (
  <div style={{ position: 'absolute', left: x, top: y, translate: '-50% -50%', scale: `${s}`, opacity: o }}>{children}</div>
);

// embed：嵌进整期视频时用，帧由外部按台词时间换算传入；不画背景、老师、气泡、结论条
export const OneMoneyTwoTimes: React.FC<{ frame?: number; embed?: boolean }> = ({ frame, embed }) => {
  const cur = useCurrentFrame();
  const f = frame ?? cur;

  // ---------- A 0–78：一笔完整的钱 ----------
  const bag57In = pop(f, 0, 30, 11);
  const bag57S = f < 80 ? bag57In : kf(f, [80, 100], [1, 0]);
  const tag57x = kf(f, [165, 195], [960, 520]);
  const tag57y = kf(f, [165, 195], [292, 385]);

  // ---------- B 80–165：拆成两份 ----------
  const split = kf(f, [82, 108], [0, 1]);
  // 55,000：先拆到左边，C 段进左边面板，再沿箭头走到「以后」
  const b55x = f < 165 ? 960 + (720 - 960) * split : kf(f, [165, 195, 205, 245], [720, 650, 650, 1270]);
  const b55y = f < 165 ? 625 : kf(f, [165, 195, 205, 225, 245], [625, 610, 610, 520, 600]);
  const p2x = f < 165 ? 960 + (1220 - 960) * split : kf(f, [165, 195], [1220, 300]);
  const p2y = f < 165 ? 620 + (665 - 620) * split : kf(f, [165, 195], [665, 640]);
  const bracket = kf(f, [98, 114], [0, 1]) * (1 - fade(f, 165, 178));

  // ---------- C 165–270：放进两个时间 ----------
  const panels = fade(f, 165, 185);
  const arrow = kf(f, [198, 222], [0, 1]);
  const stamp = pop(f, 248, 30, 9);

  // ---------- D 270–360：缩到上方，排成账本 ----------
  const shrink = kf(f, [270, 296], [1, 0.5]);
  const ORIGIN = { x: 960, y: 215 };
  const sc = (x: number, y: number) => ({ x: ORIGIN.x + (x - ORIGIN.x) * shrink, y: ORIGIN.y + (y - ORIGIN.y) * shrink });
  const ledger = fade(f, 290, 306);
  const rows = [
    { at: 300, from: sc(tag57x, tag57y), label: '今年先付出去的捐款', value: '57,000', color: ORANGE.pill },
    { at: 318, from: sc(b55x, b55y + 215), label: '以后从税里抵扣', value: '−55,000', color: GREEN.pill },
    { at: 336, from: sc(p2x, p2y + 190), label: '自己负担', value: '2,000', color: YELLOW.pill },
  ];
  const ROW_Y = [700, 800, 920];
  const ROW_X = 1190;

  // ---------- E 360–450：老师指向结论 ----------
  const hl = fade(f, 358, 372);
  const teacherX = kf(f, [372, 392], [1990, 1490]);
  const bubble = pop(f, 394, 30, 12);
  const bar = kf(f, [384, 400], [0, 1]);

  const headline = fade(f, 6, 18) * (1 - fade(f, 160, 172));

  return (
    <AbsoluteFill style={{ background: embed ? 'transparent' : '#FBEFC8', fontFamily: FONT, color: C.ink, overflow: 'hidden' }}>
      {!embed ? (
        <>
      {/* 底纹：纯色 + 中间柔光 + 两团淡色圆块。不用放射线（避免联想到旭日旗），也不用格子、线条（用户 2026-10-28 指定） */}
          <AbsoluteFill style={{ background: 'radial-gradient(ellipse 60% 55% at 50% 55%, rgba(255,250,232,0.9) 0%, rgba(255,250,232,0) 100%)' }} />
          <div style={{ position: 'absolute', left: -120, bottom: -160, width: 520, height: 520, borderRadius: '50%', background: 'rgba(255,190,120,0.22)' }} />
          <div style={{ position: 'absolute', right: -140, top: 120, width: 420, height: 420, borderRadius: '50%', background: 'rgba(140,210,170,0.18)' }} />

        </>
      ) : null}
      {/* 开场问题 */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 96, textAlign: 'center', fontSize: 62, fontWeight: 900, opacity: headline }}>
        先付 <span style={{ color: ORANGE.pill }}>57,000</span>，为什么自己只负担 <span style={{ color: '#C98A00' }}>2,000</span>？
      </div>

      {/* A–C 的整组画面（D 段整体缩到上方，对象不消失） */}
      <div style={{ position: 'absolute', inset: 0, transformOrigin: `${ORIGIN.x}px ${ORIGIN.y}px`, scale: `${shrink}` }}>
        {/* 两个时间的面板 */}
        <div style={{ position: 'absolute', left: 110, top: 230, width: 780, height: 700, borderRadius: 40, background: 'rgba(255,240,220,0.95)', border: '5px solid #E2B98A', opacity: panels }}>
          <div style={{ position: 'absolute', left: 36, top: 22, fontSize: 40, fontWeight: 900, color: '#B5652A' }}>今年 · 先付出去</div>
        </div>
        <div style={{ position: 'absolute', left: 1030, top: 230, width: 780, height: 700, borderRadius: 40, background: 'rgba(220,243,231,0.95)', border: '5px solid #9CCFB4', opacity: panels }}>
          <div style={{ position: 'absolute', left: 36, top: 22, fontSize: 40, fontWeight: 900, color: GREEN.pill }}>以后 · 从税里抵扣</div>
        </div>
        {/* 「以后」的道具：日历 + 税单 */}
        <Obj x={1640} y={420} s={pop(f, 214)} ><Calendar size={170} label="明年" /></Obj>
        <Obj x={1640} y={700} s={pop(f, 222)}><TaxSlip size={190} /></Obj>
        <div style={{ position: 'absolute', left: 1640, top: 740, translate: '-50% -50%', rotate: '-10deg', scale: `${stamp}`, opacity: stamp > 0 ? 1 : 0, border: `6px solid ${GREEN.pill}`, color: GREEN.pill, background: 'rgba(255,255,255,0.85)', borderRadius: 14, padding: '2px 14px', fontSize: 46, fontWeight: 900 }}>−55,000</div>

        {/* 箭头：现在 → 以后 */}
        <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
          <path d="M800 470 Q 960 330 1140 470" fill="none" stroke={GREEN.pill} strokeWidth={10} strokeLinecap="round" strokeDasharray="22 18" pathLength={1000} strokeDashoffset={0} opacity={arrow > 0 ? 1 : 0} style={{ clipPath: `inset(0 ${(1 - arrow) * 100}% 0 0)` }} />
          <path d="M1112 446 L1146 474 L1106 488" fill="none" stroke={GREEN.pill} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" opacity={arrow >= 1 ? 1 : 0} />
          {/* 拆分的括号：两份合起来就是原来那 57,000 */}
          {bracket > 0.01 ? <path d="M560 400 L560 372 L1380 372 L1380 400" fill="none" stroke={ORANGE.pill} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={`${bracket} 1`} /> : null}
        </svg>

        {/* 钱：原来那一袋 → 两份 */}
        {bag57S > 0.03 ? <Obj x={960} y={kf(f, [0, 14], [440, 620])} s={bag57S}><MoneyBag size={400} body={ORANGE.body} shade={ORANGE.shade} /></Obj> : null}
        <Obj x={b55x} y={b55y} s={split}><MoneyBag size={340} body={GREEN.body} shade={GREEN.shade} /></Obj>
        <Obj x={p2x} y={p2y} s={split}><MoneyBag size={200} body={YELLOW.body} shade={YELLOW.shade} /></Obj>

        {/* 标签贴在对象旁边，跟着对象走 */}
        <Pill x={tag57x} y={tag57y} color={ORANGE.pill} label={f < 165 ? '今年先付出去的捐款' : '付出去'} value="57,000" s={pop(f, 12)} />
        <Pill x={b55x} y={b55y + 215} color={GREEN.pill} label="符合条件，以后可抵扣" value="55,000" s={pop(f, 108)} />
        <Pill x={p2x} y={p2y + 190} color={YELLOW.pill} label="自己负担" value="2,000" s={pop(f, 116)} dark />
      </div>

      {/* D：账本（数字从上方对象飞进来） */}
      <div style={{ position: 'absolute', left: 300, top: 600, width: 1150, height: 380, borderRadius: 30, background: '#FFFDF6', border: '5px solid #5A4A42', boxShadow: '0 8px 0 rgba(90,74,66,0.15)', opacity: ledger, translate: `0px ${(1 - ledger) * 40}px` }}>
        <div style={{ position: 'absolute', left: 40, right: 40, top: 260, height: 5, background: '#5A4A42', borderRadius: 3, scale: `${fade(f, 330, 342)} 1`, transformOrigin: 'left' }} />
      </div>
      {rows.map((r, i) => {
        const p = kf(f, [r.at, r.at + 16], [0, 1]);
        const on = i === 2 ? hl : 0;
        return (
          <React.Fragment key={i}>
            {i === 2 && on > 0 ? <div style={{ position: 'absolute', left: 318, top: ROW_Y[2] - 50, width: 1114, height: 100, borderRadius: 22, background: `rgba(255,212,92,${0.55 * on})` }} /> : null}
            <div style={{ position: 'absolute', left: 350, top: ROW_Y[i], translate: '0 -50%', fontSize: i === 2 ? 50 : 44, fontWeight: 900, opacity: fade(f, r.at + 4, r.at + 14) }}>{i === 2 ? '= ' : ''}{r.label}</div>
            <div style={{ position: 'absolute', left: r.from.x + (ROW_X - r.from.x) * p, top: r.from.y + (ROW_Y[i] - r.from.y) * p, translate: '-50% -50%', scale: `${(0.5 + 0.5 * p) * (1 + 0.12 * on)}`, opacity: f >= r.at ? 1 : 0, background: r.color, color: i === 2 ? C.ink : '#fff', borderRadius: 18, border: '5px solid #5A4A42', padding: '4px 26px', fontSize: 58, fontWeight: 900, fontVariantNumeric: 'tabular-nums', minWidth: 300, textAlign: 'right' }}>{r.value}</div>
          </React.Fragment>
        );
      })}

      {!embed ? (
        <>
      {/* E：老师只在需要时进场，指向结论那一行 */}
      <div style={{ position: 'absolute', left: teacherX, top: 560, width: 370, height: 520 }}>
        <TeacherSVG expr="pointLeft" mouth={0} blink={blinking(f, 1)} />
      </div>
      <div style={{ position: 'absolute', right: 40, top: 470, translate: '0 -50%', scale: `${bubble}`, transformOrigin: 'right bottom', background: '#fff', border: '5px solid #5A4A42', borderRadius: 26, padding: '14px 26px', fontSize: 38, fontWeight: 900, whiteSpace: 'nowrap', opacity: bubble > 0 ? 1 : 0 }}>
        自己掏的，只有这 <span style={{ color: '#C98A00' }}>2,000</span>
      </div>

      {/* 结论条 */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 86, background: C.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', translate: `0px ${(1 - bar) * 90}px`, fontSize: 46, fontWeight: 900, color: '#fff' }}>
        钱是<span style={{ color: '#FFD45C', margin: '0 8px' }}>先付出去</span>的，抵扣发生在<span style={{ color: '#7FE0AE', margin: '0 8px' }}>以后</span>
      </div>
        </>
      ) : null}
    </AbsoluteFill>
  );
};
