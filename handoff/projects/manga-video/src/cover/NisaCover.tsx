/* NISA 零基础入门封面（和故乡税、iDeCo 封面同一套：同样的底色、角色、标题版式）：
   「少額投資非課税制度 / 日本 NISA / 在日华人零基础入门」+ 开场的对比「2018 年各放 100 万：存银行 100 万出头 vs 指数基金 约 440 万」（盖「免税」章）
   + 芝士问「NISA 到底是什么？」+ 老师指向。数字和片子开场一致（基准价 2018-10-31 → 2026-10-28，见 episodes/nisa-2026/facts.md C1–C2）。
   竖版（视频号 3:4、9:16）上字下人；横版（4:3、16:9）左字右人。不放频道标志、不放角落小字。 */
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { C, FONT, loadFonts } from '../explainer/theme';
import { CheeseArt, TeacherArt } from '../explainer/CharacterArt';

loadFonts();
const INK = '#1F2A44', OL = '#5A4A42';

const Title: React.FC<{ s: number }> = ({ s }) => (
  <div style={{ fontFamily: FONT, textAlign: 'center', lineHeight: 1 }}>
    <div style={{ fontFamily: '"Noto Sans JP", "Noto Sans SC", sans-serif', fontSize: 74 * s, fontWeight: 900, color: C.accent, letterSpacing: 8 * s, marginBottom: 20 * s, whiteSpace: 'nowrap' }}>少額投資非課税制度</div>
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <div style={{ position: 'absolute', left: -14 * s, right: -14 * s, bottom: 14 * s, height: 58 * s, background: C.yellow, borderRadius: 16 * s }} />
      <div style={{ position: 'relative', fontSize: 196 * s, fontWeight: 900, color: INK, letterSpacing: 2 * s, whiteSpace: 'nowrap' }}>日本 NISA</div>
    </div>
    <div style={{ marginTop: 26 * s, display: 'inline-block', background: C.accent, color: '#fff', fontSize: 84 * s, fontWeight: 900, padding: `${10 * s}px ${44 * s}px ${16 * s}px`, borderRadius: 26 * s, border: `${7 * s}px solid ${OL}`, boxShadow: `0 ${10 * s}px 0 rgba(90,74,66,0.18)`, whiteSpace: 'nowrap' }}>在日华人零基础入门</div>
  </div>
);

// 同样 100 万放 8 年：存银行（灰）vs 指数基金（橙，盖「免税」章）
const Box: React.FC<{ s: number; label: string; value: string; big?: boolean }> = ({ s, label, value, big }) => (
  <div style={{ position: 'relative', background: big ? '#F4A259' : '#fff', border: `${(big ? 7 : 6) * s}px solid ${OL}`, borderRadius: (big ? 28 : 24) * s, padding: `${8 * s}px ${(big ? 32 : 26) * s}px ${14 * s}px`, textAlign: 'center', boxShadow: `0 ${(big ? 10 : 8) * s}px 0 rgba(90,74,66,0.16)` }}>
    <div style={{ fontSize: 34 * s, fontWeight: 900, color: big ? '#fff' : '#7D8596', lineHeight: 1.2 }}>{label}</div>
    <div style={{ fontSize: (big ? 112 : 70) * s, fontWeight: 900, color: big ? '#fff' : '#9AA1B2', lineHeight: 1.05 }}>{value}</div>
    {big ? <div style={{ position: 'absolute', right: -50 * s, top: -46 * s, border: `${6 * s}px solid #2E8B62`, color: '#2E8B62', background: 'rgba(255,255,255,0.92)', borderRadius: 14 * s, padding: `${2 * s}px ${14 * s}px ${6 * s}px`, fontSize: 44 * s, fontWeight: 900, rotate: '12deg', lineHeight: 1.1 }}>免税</div> : null}
  </div>
);
const Compare: React.FC<{ s: number }> = ({ s }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 22 * s, fontFamily: FONT, whiteSpace: 'nowrap' }}>
    <div style={{ fontSize: 46 * s, fontWeight: 900, color: INK, lineHeight: 1.15, textAlign: 'right' }}><span style={{ color: C.accent }}>同样 100 万</span><br />放 8 年</div>
    <Box s={s} label="存银行" value="100万" />
    <div style={{ fontSize: 56 * s, fontWeight: 900, color: C.accent }}>vs</div>
    <Box s={s} label="指数基金" value="440万" big />
  </div>
);

const Bubble: React.FC<{ s: number; tail: 'left' | 'down' }> = ({ s, tail }) => (
  <div style={{ position: 'relative', fontFamily: FONT, background: '#fff', border: `${6 * s}px solid ${OL}`, borderRadius: 34 * s, padding: `${14 * s}px ${34 * s}px ${18 * s}px`, fontSize: 64 * s, fontWeight: 900, color: INK, whiteSpace: 'nowrap', boxShadow: `0 ${8 * s}px 0 rgba(90,74,66,0.14)` }}>
    <span style={{ color: C.accent }}>NISA</span> 到底是什么？！
    <div style={{ position: 'absolute', ...(tail === 'down' ? { left: 70 * s, bottom: -30 * s } : { left: -30 * s, bottom: 30 * s }), width: 44 * s, height: 44 * s, background: '#fff', borderRight: `${6 * s}px solid ${OL}`, borderBottom: `${6 * s}px solid ${OL}`, rotate: tail === 'down' ? '45deg' : '135deg' }} />
  </div>
);

export const NisaCover: React.FC<{ W: number; H: number }> = ({ W, H }) => {
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
    const peopleH = (tall ? 820 : 640) * u;
    return (
      <AbsoluteFill style={{ overflow: 'hidden' }}>
        {bg}
        <div style={{ position: 'absolute', left: 0, right: 0, top: H * (tall ? 0.15 : 0.07), display: 'flex', justifyContent: 'center' }}><Title s={u * 0.94} /></div>
        <div style={{ position: 'absolute', left: 0, right: 0, top: H * (tall ? 0.44 : 0.42), display: 'flex', justifyContent: 'center' }}><Compare s={u * (tall ? 0.92 : 0.88)} /></div>
        <div style={{ position: 'absolute', left: W * 0.05, bottom: H * (tall ? 0.1 : 0.06), filter: 'drop-shadow(0 10px 0 rgba(90,74,66,0.15))' }}>
          <CheeseArt mouth={8} blink={false} ph={{ badge: true }} size={330 * u} />
        </div>
        <div style={{ position: 'absolute', left: W * 0.08, bottom: H * (tall ? 0.1 : 0.06) + 360 * u }}><Bubble s={u * 0.95} tail="down" /></div>
        <div style={{ position: 'absolute', right: -40 * u, bottom: -60 * u, width: peopleH * 470 / 660, height: peopleH }}>
          <TeacherArt expr="pointLeft" mouth={3} blink={false} />
        </div>
      </AbsoluteFill>
    );
  }
  // 横版：左边标题 + 对比 + 芝士和气泡（左下），右边老师
  const wide = W / H > 1.6;
  const L = W * (wide ? 0.05 : 0.04), colW = W * (wide ? 0.58 : 0.62);
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      {bg}
      <div style={{ position: 'absolute', left: L, top: H * 0.05, width: colW, display: 'flex', justifyContent: 'center' }}><Title s={u * (wide ? 0.9 : 0.74)} /></div>
      <div style={{ position: 'absolute', left: L, top: H * (wide ? 0.52 : 0.47), width: colW, display: 'flex', justifyContent: 'center' }}><Compare s={u * (wide ? 0.82 : 0.76)} /></div>
      <div style={{ position: 'absolute', left: L + 10 * u, bottom: H * 0.03, filter: 'drop-shadow(0 10px 0 rgba(90,74,66,0.15))' }}>
        <CheeseArt mouth={8} blink={false} ph={{ badge: true }} size={280 * u} />
      </div>
      <div style={{ position: 'absolute', left: L + 320 * u, bottom: H * 0.03 + 150 * u }}><Bubble s={u * (wide ? 0.9 : 0.66)} tail="left" /></div>
      <div style={{ position: 'absolute', right: (wide ? -20 : -110) * u, bottom: -70 * u, width: (wide ? 900 : 800) * u * 470 / 660, height: (wide ? 900 : 800) * u }}>
        <TeacherArt expr="pointLeft" mouth={3} blink={false} />
      </div>
    </AbsoluteFill>
  );
};
