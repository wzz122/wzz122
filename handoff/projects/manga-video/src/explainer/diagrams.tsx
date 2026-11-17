/* 图解组件：全部用 React + SVG 代码绘制，数据驱动。
   每个组件拿到 v.from（出现）、v.to（退场）、v.steps[i]（第 i 步出现的帧）。 */
import React from 'react';
import { Img, interpolate, staticFile } from 'remotion';
import { C, FONT, SHADOW, ease, lin, pop, shown } from './theme';
import { CheeseHead, blinking, findImage, mouthAt } from './Characters';
import type { DiagramProps } from './types';

const card: React.CSSProperties = { background: C.card, borderRadius: 32, boxShadow: SHADOW, fontFamily: FONT, color: C.ink };
const center: React.CSSProperties = { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' };

/* 1. 章节标题卡 */
export const ChapterTitle: React.FC<DiagramProps> = ({ v, frame }) => {
  const d = v.data;
  const s0 = v.steps[0];
  const lines = String(d.title).split('\n');  // 章节卡只淡入，文字不跳（用户 2026-10-29）
  const accent = d.color ?? C.accent, soft = d.soft ?? C.accentSoft;  // 不动产线写 color：白卡上的橙色圆号像日本国旗（用户 2026-11-05）
  return (
    <div style={center}>
      <div style={{ ...card, minWidth: 1180, padding: '70px 80px', textAlign: 'center', opacity: ease(frame, s0, 10) }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, marginBottom: 26 }}>
          <div style={{ width: 96, height: 96, borderRadius: 48, background: accent, color: '#fff', fontSize: 46, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{d.no}</div>
          <div style={{ fontSize: 40, fontWeight: 700, color: accent, letterSpacing: 6 }}>{d.kicker}</div>
        </div>
        {lines.map((l, i) => (
          <div key={i} style={{ fontSize: lines.length > 1 ? (i === 0 ? 92 : 72) : 84, fontWeight: 900, lineHeight: 1.25, whiteSpace: 'nowrap', opacity: ease(frame, s0 + 4 + i * 5, 10) }}>{l}</div>
        ))}
        <div style={{ display: 'flex', gap: 18, justifyContent: 'center', marginTop: 40 }}>
          {(d.tags ?? []).map((t: string, i: number) => (
            <div key={t} style={{ padding: '10px 28px', borderRadius: 40, background: soft, color: accent, fontSize: 36, fontWeight: 700, opacity: ease(frame, s0 + 14 + i * 4, 8) }}>{t}</div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* 2. 关键数字：从 0 滚动到目标值 */
export const KeyNumber: React.FC<DiagramProps> = ({ v, frame }) => {
  const d = v.data;
  const s0 = v.steps[0];
  const countFrames = d.count === false ? 1 : Math.round((d.countDuration ?? 1.2) * 30);
  const t = interpolate(frame, [s0, s0 + countFrames], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: (x) => 1 - Math.pow(1 - x, 3) });
  const val = (d.value * t).toFixed(d.decimals ?? 0);
  const done = frame >= s0 + countFrames;
  const bump = done ? 1 + 0.08 * Math.max(0, 1 - (frame - s0 - countFrames) / 8) : 1;
  return (
    <div style={center}>
      <div style={{ ...card, width: 1140, padding: '60px 70px', textAlign: 'center', opacity: ease(frame, v.from, 10), scale: `${0.92 + 0.08 * ease(frame, v.from, 12)}` }}>
        <div style={{ fontSize: 46, fontWeight: 700, color: C.sub }}>{d.label}</div>
        <div style={{ position: 'relative', display: 'inline-block', marginTop: 10 }}>
          <div style={{ position: 'absolute', left: -10, right: -10, bottom: 34, height: 54, background: C.yellow, borderRadius: 12, scale: `${ease(frame, s0 + countFrames, 10)} 1`, transformOrigin: 'left' }} />
          <span style={{ position: 'relative', fontSize: 250, fontWeight: 900, color: C.accent, letterSpacing: -6, fontVariantNumeric: 'tabular-nums', display: 'inline-block', scale: `${bump}` }}>{frame >= s0 ? val : '?'}</span>
          <span style={{ position: 'relative', fontSize: 76, fontWeight: 900, marginLeft: 14 }}>{d.unit}</span>
        </div>
        {d.sub ? (
          <div style={{ marginTop: 18, height: 80 }}>
            <span style={{ display: 'inline-block', padding: '12px 36px', borderRadius: 50, background: C.ink, color: '#fff', fontSize: 42, fontWeight: 700, scale: `${pop(frame, v.steps[1])}` }}>{d.sub}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
};

/* 3. 要点列表 */
export const BulletReveal: React.FC<DiagramProps> = ({ v, frame }) => {
  const d = v.data;
  const last = v.steps.filter(s => frame >= s).length - 1;
  return (
    <div style={center}>
      <div style={{ ...card, width: 1180, padding: '50px 64px', opacity: ease(frame, v.from, 10) }}>
        {d.title ? <div style={{ fontSize: 54, fontWeight: 900, marginBottom: 26 }}>{d.title}</div> : null}
        {d.items.map((it: any, i: number) => {
          const p = ease(frame, v.steps[i], 12);
          const text = typeof it === 'string' ? it : it.text;
          const icon = typeof it === 'string' ? String(i + 1) : it.icon ?? String(i + 1);
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 26, padding: '16px 18px', borderRadius: 20, marginBottom: 10, opacity: p, translate: `${(1 - p) * -60}px 0px`, background: i === last ? C.yellowSoft : 'transparent' }}>
              <div style={{ width: 70, height: 70, flex: 'none', borderRadius: 35, background: i === last ? C.accent : C.ink, color: '#fff', fontSize: 38, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', scale: `${pop(frame, v.steps[i])}` }}>{icon}</div>
              <div style={{ fontSize: 50, fontWeight: 700 }}>{text}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* 4. 算式逐步出现，结果高亮 */
export const Calculation: React.FC<DiagramProps> = ({ v, frame }) => {
  const d = v.data;
  const n = d.terms.length;
  const rs = v.steps[n];
  const rp = pop(frame, rs, 30, 9);
  const Box: React.FC<{ value: string; label: string; at: number; hl?: boolean }> = ({ value, label, at, hl }) => (
    <div style={{ textAlign: 'center', scale: `${pop(frame, at)}`, opacity: shown(frame, at) ? 1 : 0 }}>
      <div style={{ fontSize: 100, fontWeight: 900, padding: '6px 26px', borderRadius: 26, background: hl ? C.accent : 'transparent', color: hl ? '#fff' : C.ink, fontVariantNumeric: 'tabular-nums', boxShadow: hl ? '0 12px 30px rgba(232,116,59,0.35)' : 'none' }}>{value}</div>
      <div style={{ fontSize: 36, fontWeight: 700, color: hl ? C.accent : C.sub, marginTop: 12 }}>{label}</div>
    </div>
  );
  const Op: React.FC<{ s: string; at: number }> = ({ s, at }) => (
    <div style={{ fontSize: 88, fontWeight: 900, color: C.gray, opacity: ease(frame, at, 8), marginBottom: 56 }}>{s}</div>
  );
  return (
    <div style={center}>
      <div style={{ ...card, width: 1380, padding: '70px 20px 60px', opacity: ease(frame, v.from, 10) }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          {d.terms.map((t: any, i: number) => (
            <React.Fragment key={i}>
              {t.op ? <Op s={t.op} at={v.steps[i]} /> : null}
              <Box value={t.value} label={t.label} at={v.steps[i]} />
            </React.Fragment>
          ))}
          <Op s="=" at={rs} />
          <div style={{ position: 'relative' }}>
            {shown(frame, rs) ? (
              <div style={{ position: 'absolute', left: '50%', top: 70, width: 10, height: 10, borderRadius: '50%', border: `6px solid ${C.yellow}`, translate: '-50% -50%', scale: `${1 + 40 * lin(frame, rs, rs + 16)}`, opacity: 1 - lin(frame, rs, rs + 16) }} />
            ) : null}
            <Box value={d.result.value} label={d.result.label} at={rs} hl />
          </div>
        </div>
        {d.unit ? <div style={{ textAlign: 'right', fontSize: 34, color: C.sub, marginTop: 20, marginRight: 30, opacity: rp }}>单位：{d.unit}</div> : null}
      </div>
    </div>
  );
};

/* 5. 左右对比 */
export const Compare: React.FC<DiagramProps> = ({ v, frame }) => {
  const d = v.data;
  const hs = v.steps[2];
  const hl = shown(frame, hs);
  const side = (s: any, key: 'left' | 'right', at: number) => {
    const good = s.tone === 'good';
    const p = ease(frame, at, 14);
    const head = good ? C.teal : C.gray;
    const lift = good && hl ? pop(frame, hs) : 0;
    return (
      <div style={{ ...card, width: 650, overflow: 'hidden', opacity: p, translate: `${(1 - p) * (key === 'left' ? -120 : 120)}px ${-lift * 14}px`, scale: `${1 + lift * 0.03}`, outline: hl && good ? `6px solid ${C.teal}` : 'none' }}>
        <div style={{ background: head, color: '#fff', fontSize: 52, fontWeight: 900, padding: '24px 0', textAlign: 'center' }}>{s.title}</div>
        <div style={{ padding: '28px 34px' }}>
          {s.items.map((it: string, i: number) => {
            const mark = hl && (d.highlight?.[key] ?? []).includes(i);
            return (
              <div key={i} style={{ display: 'flex', gap: 18, alignItems: 'flex-start', fontSize: 37, fontWeight: 700, padding: '14px 12px', borderRadius: 14, background: mark ? (good ? C.yellowSoft : C.redSoft) : 'transparent', marginBottom: 6 }}>
                <span style={{ color: good ? C.teal : C.red, fontWeight: 900, flex: 'none' }}>{good ? '✓' : '✗'}</span>
                <span style={{ color: !good && mark ? C.red : C.ink }}>{it}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };
  return (
    <div style={{ ...center, gap: 70 }}>
      {side(d.left, 'left', v.steps[0])}
      <div style={{ position: 'absolute', width: 110, height: 110, borderRadius: 55, background: C.ink, color: '#fff', fontFamily: FONT, fontSize: 46, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', scale: `${pop(frame, v.steps[1])}`, zIndex: 2 }}>VS</div>
      {side(d.right, 'right', v.steps[1])}
    </div>
  );
};

/* 6. 表格逐行出现 */
export const Table: React.FC<DiagramProps> = ({ v, frame }) => {
  const d = v.data;
  const n = d.rows.length;
  const cols: string[] = d.columns;
  const hAt = d.highlight ? v.steps[n] : undefined;
  const cAt = d.callout ? v.steps[n + (d.highlight ? 1 : 0)] : undefined;
  const hl = (i: number) => shown(frame, hAt) && (d.highlight ?? []).includes(i);
  const w = d.width ?? 1060;
  const colW = cols.length > 2 ? 330 : 440;
  const fs = d.fontSize ?? (n > 4 ? 42 : 48);
  return (
    <div style={center}>
      <div style={{ position: 'relative', translate: d.callout ? '-110px 0px' : '0px 0px' }}>
        <div style={{ ...card, width: w, overflow: 'hidden', opacity: ease(frame, v.from, 10) }}>
          <div style={{ display: 'flex', background: C.ink, color: '#fff', fontSize: 38, fontWeight: 700, padding: '20px 44px' }}>
            {cols.map((c, k) => <div key={k} style={k === 0 ? { flex: 1 } : { width: colW, textAlign: 'right' }}>{c}</div>)}
          </div>
          {d.rows.map((r: string[], i: number) => {
            const p = ease(frame, v.steps[i], 10);
            const on = hl(i);
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', padding: `${n > 4 ? 16 : 22}px 44px`, fontSize: fs, fontWeight: on ? 900 : 700, borderTop: `2px solid ${C.line}`, opacity: p, translate: `0px ${(1 - p) * 24}px`, background: on ? C.yellowSoft : 'transparent' }}>
                {r.map((cell, k) => (
                  <div key={k} style={k === 0 ? { flex: 1 } : { width: colW, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: on ? C.accent : cell.startsWith('−') ? C.teal : C.ink }}>{cell}</div>
                ))}
              </div>
            );
          })}
        </div>
        {d.callout && shown(frame, cAt) ? (
          <div style={{ position: 'absolute', right: -250, bottom: 30, width: 210, height: 210, borderRadius: 105, background: C.red, color: '#fff', fontFamily: FONT, fontSize: 46, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', lineHeight: 1.1, border: '8px solid #fff', boxShadow: SHADOW, rotate: '-12deg', scale: `${pop(frame, cAt!, 30, 8)}` }}>{d.callout}</div>
        ) : null}
      </div>
    </div>
  );
};

/* 7. 横条图：生长动画 */
export const BarChart: React.FC<DiagramProps> = ({ v, frame }) => {
  const d = v.data;
  const max = d.max ?? Math.max(...d.bars.map((b: any) => b.value));
  return (
    <div style={center}>
      <div style={{ ...card, width: 1200, padding: '50px 60px', opacity: ease(frame, v.from, 10) }}>
        {d.title ? <div style={{ fontSize: 50, fontWeight: 900, marginBottom: 30 }}>{d.title}</div> : null}
        {d.bars.map((b: any, i: number) => {
          const g = ease(frame, v.steps[i], 22);
          const color = b.color ?? (i === (d.highlight ?? -1) ? C.accent : C.ink);
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 26, opacity: shown(frame, v.steps[i]) ? 1 : 0.15 }}>
              <div style={{ width: 260, fontSize: 40, fontWeight: 700, textAlign: 'right' }}>{b.label}</div>
              <div style={{ flex: 1, height: 72, background: '#F1ECE2', borderRadius: 14, overflow: 'hidden' }}>
                <div style={{ width: `${(b.value / max) * 100 * g}%`, height: '100%', background: color, borderRadius: 14 }} />
              </div>
              <div style={{ width: 280, fontSize: 44, fontWeight: 900, color, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{Math.round(b.value * g).toLocaleString()}{d.unit ?? ''}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* 8. 时间轴：节点逐个点亮 */
export const Timeline: React.FC<DiagramProps> = ({ v, frame }) => {
  const d = v.data;
  const n = d.nodes.length;
  const W = 1100, x0 = 120, gap = (W - 2 * x0) / (n - 1);
  const lit = d.nodes.map((_: any, i: number) => shown(frame, v.steps[i]));
  const lastLit = lit.lastIndexOf(true);
  let prog = 0;
  for (let i = 1; i < n; i++) prog += ease(frame, v.steps[i], 18);
  const footAt = d.footer ? v.steps[n] : undefined;
  return (
    <div style={center}>
      <div style={{ ...card, width: 1240, height: 560, position: 'relative', opacity: ease(frame, v.from, 10) }}>
        <svg width={1240} height={360} style={{ position: 'absolute', left: 0, top: 40 }}>
          <g transform="translate(70,0)">
            <line x1={x0} y1={180} x2={W - x0} y2={180} stroke={C.line} strokeWidth={14} strokeLinecap="round" />
            <line x1={x0} y1={180} x2={x0 + gap * prog} y2={180} stroke={C.accent} strokeWidth={14} strokeLinecap="round" />
            {d.nodes.map((nd: any, i: number) => {
              const cx = x0 + gap * i;
              const p = pop(frame, v.steps[i]);
              const on = lit[i];
              const pulse = on && i === lastLit ? lin(frame, v.steps[i], v.steps[i] + 20) : 1;
              return (
                <g key={i}>
                  {on && pulse < 1 ? <circle cx={cx} cy={180} r={40 + 50 * pulse} fill="none" stroke={C.accent} strokeWidth={6} opacity={1 - pulse} /> : null}
                  <circle cx={cx} cy={180} r={30 + 8 * p} fill={on ? C.accent : '#fff'} stroke={on ? C.accent : C.gray} strokeWidth={8} />
                  <text x={cx} y={100} textAnchor="middle" fontFamily={FONT} fontSize={40} fontWeight={900} fill={on ? C.ink : C.gray}>{nd.date}</text>
                  <text x={cx} y={280} textAnchor="middle" fontFamily={FONT} fontSize={42} fontWeight={700} fill={on ? C.accent : C.gray}>{nd.label}</text>
                </g>
              );
            })}
          </g>
        </svg>
        {d.footer ? (
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 50, textAlign: 'center' }}>
            <span style={{ display: 'inline-block', padding: '16px 44px', borderRadius: 50, background: C.ink, color: '#fff', fontSize: 46, fontWeight: 900, scale: `${pop(frame, footAt)}` }}>{d.footer}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
};

/* 9. 道具网格：有图用图，没图用带文字的占位块 */
export const IconGrid: React.FC<DiagramProps> = ({ v, frame, assets }) => {
  const d = v.data;
  return (
    <div style={{ ...center, flexDirection: 'column', gap: 40, fontFamily: FONT }}>
      {d.title ? <div style={{ fontSize: 50, fontWeight: 900, color: C.ink, background: C.card, padding: '18px 44px', borderRadius: 24, boxShadow: SHADOW, opacity: ease(frame, v.from, 10) }}>{d.title}</div> : null}
      <div style={{ display: 'flex', gap: 46 }}>
        {d.items.map((it: any, i: number) => {
          const p = pop(frame, v.steps[i]);
          const src = [it.img, it.img && `manga/${it.img}`].find((s: string | undefined) => s && assets.includes(s));
          return (
            <div key={i} style={{ ...card, width: d.items.length > 3 ? 300 : 340, padding: 24, textAlign: 'center', scale: `${p}`, rotate: `${(1 - p) * (i % 2 ? 8 : -8)}deg` }}>
              {src ? (
                <Img src={staticFile(src)} style={{ width: 292, height: 292, objectFit: 'contain' }} />
              ) : it.emoji ? (
                <div style={{ width: 292, height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 190, lineHeight: 1, fontFamily: '"Apple Color Emoji"' }}>{it.emoji}</div>
              ) : (
                <div style={{ width: 292, height: 292, borderRadius: 24, border: `5px dashed ${C.line}`, background: C.accentSoft, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ fontSize: 150, fontWeight: 900, color: C.accent, lineHeight: 1 }}>{it.glyph ?? it.label[0]}</div>
                </div>
              )}
              <div style={{ fontSize: 42, fontWeight: 900, marginTop: 16 }}>{it.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* 10. 注意事项框：轻微抖动出现 */
export const WarningBox: React.FC<DiagramProps> = ({ v, frame }) => {
  const d = v.data;
  const s0 = v.steps[0];
  const red = d.level === 'red';
  const main = red ? C.red : '#E0A800';
  const soft = red ? C.redSoft : C.yellowSoft;
  const k = frame - s0;
  const shake = k >= 0 && k < 18 ? Math.sin(k * 1.9) * 3.5 * (1 - k / 18) : 0;
  const p = pop(frame, s0);
  return (
    <div style={center}>
      <div style={{ ...card, width: 1300, background: soft, border: `8px solid ${main}`, padding: '50px 60px', display: 'flex', gap: 44, alignItems: 'center', scale: `${0.7 + 0.3 * p}`, opacity: Math.min(1, p * 1.6), rotate: `${shake}deg` }}>
        <svg width={190} height={170} viewBox="0 0 190 170" style={{ flex: 'none' }}>
          <path d="M95 10 L182 160 L8 160 Z" fill={main} stroke="#fff" strokeWidth={8} strokeLinejoin="round" />
          <rect x={86} y={58} width={18} height={58} rx={9} fill="#fff" />
          <circle cx={95} cy={136} r={11} fill="#fff" />
        </svg>
        <div>
          <div style={{ fontSize: 60, fontWeight: 900, color: main }}>{d.title}</div>
          <div style={{ fontSize: 46, fontWeight: 700, marginTop: 16, lineHeight: 1.4, textWrap: 'balance' }}>{d.text}</div>
          {d.sub ? <div style={{ fontSize: 40, fontWeight: 700, color: C.sub, marginTop: 14, opacity: ease(frame, s0 + 12, 10) }}>{d.sub}</div> : null}
        </div>
      </div>
    </div>
  );
};

/* 11. 芝士插话：从画面边缘滑入，带气泡 */
export const CheeseCameo: React.FC<DiagramProps> = ({ v, frame, lines, characters, assets }) => {
  const inP = ease(frame, v.from, 12);
  const outP = ease(frame, v.to - 10, 10);
  const x = interpolate(inP - outP, [0, 1], [-320, 0]);
  const { level, line } = mouthAt(lines, 'cheese', frame);
  const ln = line ?? lines.find(l => l.speaker === 'cheese' && l.from >= v.from - 30);
  const text = v.data.text ?? null;
  const info = characters.cheese ?? { name: '芝士', color: C.yellow, placeholder: {} };
  return (
    <div style={{ position: 'absolute', left: 40 + x, bottom: 150, display: 'flex', alignItems: 'flex-end', gap: 20, fontFamily: FONT, opacity: 1 - outP }}>
      <div style={{ position: 'relative' }}>
        {(() => {
          const img = findImage(assets, 'cheese', 'normal', level >= 2, blinking(frame, 2));
          return img ? (
            <div style={{ width: 210, height: 210, borderRadius: 105, overflow: 'hidden', background: C.yellowSoft, border: '5px solid #5A4A42' }}>
              <Img src={staticFile(img)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
            </div>
          ) : (
            <CheeseHead mouth={level} blink={blinking(frame, 2)} ph={info.placeholder} />
          );
        })()}
        <div style={{ position: 'absolute', bottom: -14, left: '50%', translate: '-50% 0px', background: info.color, color: '#fff', fontSize: 30, fontWeight: 900, padding: '4px 20px', borderRadius: 20, whiteSpace: 'nowrap' }}>{info.name}</div>
      </div>
      {text ? (
        <div style={{ ...card, marginBottom: 70, padding: '20px 30px', fontSize: 42, fontWeight: 900, scale: `${pop(frame, ln?.from ?? v.from)}`, transformOrigin: 'left bottom' }}>{text}</div>
      ) : null}
    </div>
  );
};

/* 12. 大字结论卡：一句话 + 小字补充 */
export const BigText: React.FC<DiagramProps> = ({ v, frame }) => {
  const d = v.data;
  const p = pop(frame, v.steps[0] ?? v.from);
  const tone = d.tone === 'red' ? C.red : d.tone === 'teal' ? C.teal : C.accent;
  return (
    <div style={center}>
      <div style={{ ...card, maxWidth: 1240, padding: '56px 70px', textAlign: 'center', borderTop: `14px solid ${tone}`, scale: `${0.8 + 0.2 * p}`, opacity: Math.min(1, p * 1.6) }}>
        {d.emoji ? <div style={{ fontSize: 120, lineHeight: 1.1, fontFamily: '"Apple Color Emoji"', marginBottom: 10 }}>{d.emoji}</div> : null}
        <div style={{ fontSize: d.size ?? 76, fontWeight: 900, lineHeight: 1.3, whiteSpace: 'pre-line' }}>{d.text}</div>
        {d.sub ? <div style={{ fontSize: 42, fontWeight: 700, color: C.sub, marginTop: 22, lineHeight: 1.4, whiteSpace: 'pre-line', opacity: ease(frame, (v.steps[1] ?? v.steps[0] ?? v.from) + 6, 10) }}>{d.sub}</div> : null}
      </div>
    </div>
  );
};

/* 13. 流向图：钱从「你」流到哪里（默认去向 + 可选的另一条路） */
export const Flow: React.FC<DiagramProps> = ({ v, frame }) => {
  const d = v.data;
  const node = (label: string, sub: string | undefined, color: string, soft: string, at: number | undefined, dim = false) => (
    <div style={{ ...card, width: 330, padding: '30px 20px', textAlign: 'center', border: `6px solid ${color}`, background: soft, scale: `${pop(frame, at)}`, opacity: dim ? 0.45 : 1 }}>
      <div style={{ fontSize: 54, fontWeight: 900, color }}>{label}</div>
      {sub ? <div style={{ fontSize: 34, fontWeight: 700, color: C.sub, marginTop: 8 }}>{sub}</div> : null}
    </div>
  );
  const arrow = (at: number | undefined, label: string, color: string) => {
    const p = at == null ? 0 : ease(frame, at, 14);
    return (
      <div style={{ width: 230, textAlign: 'center', opacity: p > 0 ? 1 : 0 }}>
        <div style={{ fontSize: 34, fontWeight: 900, color, marginBottom: 8 }}>{label}</div>
        <svg width={230} height={40}><line x1={10} y1={20} x2={10 + 190 * p} y2={20} stroke={color} strokeWidth={10} strokeLinecap="round" />{p >= 1 ? <path d="M186 6 L214 20 L186 34" fill="none" stroke={color} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" /> : null}</svg>
      </div>
    );
  };
  const altOn = shown(frame, v.steps[2]);
  return (
    <div style={{ ...center, flexDirection: 'column', gap: 40 }}>
      {d.title ? <div style={{ fontSize: 52, fontWeight: 900, color: C.ink, opacity: ease(frame, v.from, 10) }}>{d.title}</div> : null}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {node(d.from, d.fromSub, C.ink, '#FFFFFF', v.steps[0])}
        {arrow(v.steps[1], d.label, altOn ? C.gray : C.accent)}
        {node(d.to, d.toSub, C.accent, C.accentSoft, v.steps[1], altOn)}
      </div>
      {d.alt ? (
        <div style={{ display: 'flex', alignItems: 'center', marginLeft: 330, opacity: altOn ? 1 : 0 }}>
          {arrow(v.steps[2], d.altLabel ?? '改去这里', C.teal)}
          {node(d.alt, d.altSub, C.teal, C.tealSoft, v.steps[2])}
        </div>
      ) : null}
    </div>
  );
};

export const DIAGRAMS: Record<string, React.FC<DiagramProps>> = {
  bigText: BigText,
  flow: Flow,
  chapterTitle: ChapterTitle,
  keyNumber: KeyNumber,
  bulletReveal: BulletReveal,
  calculation: Calculation,
  compare: Compare,
  table: Table,
  barChart: BarChart,
  timeline: Timeline,
  iconGrid: IconGrid,
  warningBox: WarningBox,
  cheeseCameo: CheeseCameo,
};
