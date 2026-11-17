/* 故乡税封面（动漫画风，与视频同一套角色和底色）：「ふるさと納税 / 日本故乡税 / 一次讲明白」+ 老师指向标题 + 芝士吃惊 + 礼品。
   版式按画幅分两种：竖版（视频号 3:4、9:16）上字下人；横版（4:3、16:9）左字右人。不放频道标志、不放角落小字。 */
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { C, FONT, loadFonts } from '../explainer/theme';
import { CheeseArt, TeacherArt } from '../explainer/CharacterArt';
import { MoneyBag } from '../explainer-v2/Art';

loadFonts();
const INK = '#1F2A44', OL = '#5A4A42';

const Gift: React.FC<{ e: string; size: number; x: number; y: number; r?: number }> = ({ e, size, x, y, r = 0 }) => (
  <div style={{ position: 'absolute', left: x, top: y, width: size * 1.35, height: size * 1.35, borderRadius: '50%', background: '#fff', border: `${Math.max(4, size / 22)}px solid ${OL}`, boxShadow: '0 10px 0 rgba(90,74,66,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', rotate: `${r}deg`, translate: '-50% -50%' }}>
    <span style={{ fontSize: size, lineHeight: 1, fontFamily: '"Apple Color Emoji"' }}>{e}</span>
  </div>
);

const Title: React.FC<{ s: number }> = ({ s }) => (
  <div style={{ fontFamily: FONT, textAlign: 'center', lineHeight: 1 }}>
    <div style={{ fontFamily: '"Noto Sans JP", "Noto Sans SC", sans-serif', fontSize: 78 * s, fontWeight: 900, color: C.accent, letterSpacing: 10 * s, marginBottom: 18 * s }}>ふるさと納税</div>
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <div style={{ position: 'absolute', left: -14 * s, right: -14 * s, bottom: 14 * s, height: 58 * s, background: C.yellow, borderRadius: 16 * s }} />
      <div style={{ position: 'relative', fontSize: 196 * s, fontWeight: 900, color: INK, letterSpacing: 2 * s, whiteSpace: 'nowrap' }}>日本故乡税</div>
    </div>
    <div style={{ marginTop: 26 * s, display: 'inline-block', background: C.accent, color: '#fff', fontSize: 88 * s, fontWeight: 900, padding: `${10 * s}px ${44 * s}px ${16 * s}px`, borderRadius: 26 * s, border: `${7 * s}px solid ${OL}`, boxShadow: `0 ${10 * s}px 0 rgba(90,74,66,0.18)` }}>一次讲明白</div>
  </div>
);

const Bubble: React.FC<{ s: number; tail: 'left' | 'down' }> = ({ s, tail }) => (
  <div style={{ position: 'relative', fontFamily: FONT, background: '#fff', border: `${6 * s}px solid ${OL}`, borderRadius: 34 * s, padding: `${14 * s}px ${34 * s}px ${18 * s}px`, fontSize: 64 * s, fontWeight: 900, color: INK, whiteSpace: 'nowrap', boxShadow: `0 ${8 * s}px 0 rgba(90,74,66,0.14)` }}>
    只花 <span style={{ color: C.accent, fontSize: 80 * s }}>2,000</span>？！
    <div style={{ position: 'absolute', ...(tail === 'down' ? { left: 70 * s, bottom: -30 * s } : { left: -30 * s, bottom: 30 * s }), width: 44 * s, height: 44 * s, background: '#fff', borderRight: `${6 * s}px solid ${OL}`, borderBottom: `${6 * s}px solid ${OL}`, rotate: tail === 'down' ? '45deg' : '135deg' }} />
  </div>
);

export const FurusatoCover: React.FC<{ W: number; H: number }> = ({ W, H }) => {
  const portrait = H > W;
  const u = portrait ? W / 1080 : H / 1080; // 以短边 1080 为基准缩放
  const bg = (
    <>
      <AbsoluteFill style={{ background: '#FBEFC8' }} />
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 65% 55% at 50% 42%, rgba(255,250,232,0.95) 0%, rgba(255,250,232,0) 100%)' }} />
      <div style={{ position: 'absolute', left: -220 * u, bottom: -240 * u, width: 760 * u, height: 760 * u, borderRadius: '50%', background: 'rgba(255,190,120,0.25)' }} />
      <div style={{ position: 'absolute', right: -200 * u, top: -120 * u, width: 640 * u, height: 640 * u, borderRadius: '50%', background: 'rgba(140,210,170,0.22)' }} />
    </>
  );
  if (portrait) {
    const tall = H / W > 1.6; // 9:16
    const titleY = tall ? 0.17 : 0.07;
    const peopleH = (tall ? 820 : 640) * u;
    return (
      <AbsoluteFill style={{ overflow: 'hidden' }}>
        {bg}
        <div style={{ position: 'absolute', left: 0, right: 0, top: H * titleY, display: 'flex', justifyContent: 'center' }}><Title s={u * 1.0} /></div>
        {/* 礼品：标题下面排成一行 */}
        {['🦀', '🥩', '🍚', '🧻'].map((e, i) => <Gift key={e} e={e} size={(tall ? 96 : 86) * u} x={W * (0.2 + i * 0.2)} y={H * (tall ? 0.5 : 0.49)} r={[-8, 6, -4, 8][i]} />)}
        {/* 芝士（左下）+ 气泡 */}
        <div style={{ position: 'absolute', left: W * 0.05, bottom: H * (tall ? 0.1 : 0.06), filter: 'drop-shadow(0 10px 0 rgba(90,74,66,0.15))' }}>
          <CheeseArt mouth={8} blink={false} ph={{ badge: true }} size={330 * u} />
        </div>
        <div style={{ position: 'absolute', left: W * 0.08, bottom: H * (tall ? 0.1 : 0.06) + 360 * u }}><Bubble s={u * 0.95} tail="down" /></div>
        {/* 钱袋 */}
        <div style={{ position: 'absolute', left: W * 0.4, bottom: H * (tall ? 0.12 : 0.07), rotate: '-6deg' }}><MoneyBag size={190 * u} body="#F4A259" shade="#D9803A" /></div>
        {/* 老师（右下，指向标题） */}
        <div style={{ position: 'absolute', right: -40 * u, bottom: -60 * u, width: peopleH * 470 / 660, height: peopleH }}>
          <TeacherArt expr="pointLeft" mouth={3} blink={false} />
        </div>
      </AbsoluteFill>
    );
  }
  // 横版：左边标题 + 礼品一行 + 芝士和气泡（左下），右边老师
  const wide = W / H > 1.6;
  const L = W * (wide ? 0.05 : 0.04), colW = W * (wide ? 0.56 : 0.6);
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      {bg}
      <div style={{ position: 'absolute', left: L, top: H * 0.05, width: colW, display: 'flex', justifyContent: 'center' }}><Title s={u * (wide ? 0.92 : 0.8)} /></div>
      {['🦀', '🥩', '🍚', '🧻'].map((e, i) => <Gift key={e} e={e} size={70 * u} x={L + colW * (0.14 + i * 0.24)} y={H * 0.62} r={[-8, 6, -4, 8][i]} />)}
      <div style={{ position: 'absolute', left: L + 10 * u, bottom: H * 0.03, filter: 'drop-shadow(0 10px 0 rgba(90,74,66,0.15))' }}>
        <CheeseArt mouth={8} blink={false} ph={{ badge: true }} size={280 * u} />
      </div>
      <div style={{ position: 'absolute', left: L + 320 * u, bottom: H * 0.03 + 150 * u }}><Bubble s={u * (wide ? 0.9 : 0.78)} tail="left" /></div>
      <div style={{ position: 'absolute', right: (wide ? -20 : -50) * u, bottom: -70 * u, width: (wide ? 900 : 800) * u * 470 / 660, height: (wide ? 900 : 800) * u }}>
        <TeacherArt expr="pointLeft" mouth={3} blink={false} />
      </div>
    </AbsoluteFill>
  );
};
