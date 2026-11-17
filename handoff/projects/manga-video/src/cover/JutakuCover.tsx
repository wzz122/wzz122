/* 住宅贷款减税（episodes/jutaku-loan-2026）封面：和银行那期同一套版式。
   「住宅ローン控除」+「减税拿不满」+「贷款买房前必看」+ 三个数 + 芝士问「贷得越多越赚？」+ 老师指向。
   竖版（视频号 3:4、9:16）上字下人；横版（4:3、16:9）左字右人。不放频道标志、不放角落小字。 */
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { C, FONT, loadFonts } from '../explainer/theme';
import { CheeseArt, TeacherArt } from '../explainer/CharacterArt';

loadFonts();
const INK = '#1F2A44', OL = '#5A4A42';

const Title: React.FC<{ s: number }> = ({ s }) => (
  <div style={{ fontFamily: FONT, textAlign: 'center', lineHeight: 1 }}>
    <div style={{ fontFamily: '"Noto Sans JP", "Noto Sans SC", sans-serif', fontSize: 74 * s, fontWeight: 900, color: C.accent, letterSpacing: 8 * s, marginBottom: 20 * s, whiteSpace: 'nowrap' }}>住宅ローン控除</div>
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <div style={{ position: 'absolute', left: -14 * s, right: -14 * s, bottom: 14 * s, height: 58 * s, background: C.yellow, borderRadius: 16 * s }} />
      <div style={{ position: 'relative', fontSize: 136 * s, fontWeight: 900, color: INK, letterSpacing: 2 * s, whiteSpace: 'nowrap' }}>住宅贷款减税</div>
    </div>
    <div style={{ marginTop: 26 * s, display: 'inline-block', background: '#E04F4F', color: '#fff', fontSize: 62 * s, fontWeight: 900, padding: `${10 * s}px ${44 * s}px ${16 * s}px`, borderRadius: 26 * s, border: `${7 * s}px solid ${OL}`, boxShadow: `0 ${10 * s}px 0 rgba(90,74,66,0.18)`, whiteSpace: 'nowrap' }}>贷3500万 为什么拿不满？</div>
  </div>
);

const Chip: React.FC<{ s: number; label: string; value: string; color?: string }> = ({ s, label, value, color = '#2E8B62' }) => (
  <div style={{ background: '#fff', border: `${6 * s}px solid ${OL}`, borderRadius: 24 * s, padding: `${8 * s}px ${24 * s}px ${12 * s}px`, textAlign: 'center', boxShadow: `0 ${8 * s}px 0 rgba(90,74,66,0.16)` }}>
    <div style={{ fontSize: 34 * s, fontWeight: 900, color: '#7D8596', lineHeight: 1.2 }}>{label}</div>
    <div style={{ fontSize: 62 * s, fontWeight: 900, color, lineHeight: 1.05 }}>{value}</div>
  </div>
);
const Numbers: React.FC<{ s: number }> = ({ s }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 22 * s, fontFamily: FONT, whiteSpace: 'nowrap' }}>
    <Chip s={s} label="贷 3500 万" value="额度24.5万" color="#7D8596" />
    <Chip s={s} label="年收 500 万" value="实际约18万" color="#2E8B62" />
    <Chip s={s} label="差的" value="6万多" color="#E04F4F" />
  </div>
);

const Bubble: React.FC<{ s: number; tail: 'left' | 'down' }> = ({ s, tail }) => (
  <div style={{ position: 'relative', fontFamily: FONT, background: '#fff', border: `${6 * s}px solid ${OL}`, borderRadius: 34 * s, padding: `${14 * s}px ${34 * s}px ${18 * s}px`, fontSize: 60 * s, fontWeight: 900, color: INK, whiteSpace: 'nowrap', boxShadow: `0 ${8 * s}px 0 rgba(90,74,66,0.14)` }}>
    贷得越多<span style={{ color: '#E04F4F' }}>越赚</span>？
    <div style={{ position: 'absolute', ...(tail === 'down' ? { left: 70 * s, bottom: -30 * s } : { left: -30 * s, bottom: 30 * s }), width: 44 * s, height: 44 * s, background: '#fff', borderRight: `${6 * s}px solid ${OL}`, borderBottom: `${6 * s}px solid ${OL}`, rotate: tail === 'down' ? '45deg' : '135deg' }} />
  </div>
);

export const JutakuCover: React.FC<{ W: number; H: number }> = ({ W, H }) => {
  const portrait = H > W;
  const u = portrait ? W / 1080 : H / 1080;
  const bg = (
    <>
      <AbsoluteFill style={{ background: '#FBEFC8' }} />
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 65% 55% at 50% 42%, rgba(255,250,232,0.95) 0%, rgba(255,250,232,0) 100%)' }} />
      <div style={{ position: 'absolute', left: -220 * u, bottom: -240 * u, width: 760 * u, height: 760 * u, borderRadius: '50%', background: 'rgba(255,190,120,0.25)' }} />
      <div style={{ position: 'absolute', right: -200 * u, top: -120 * u, width: 640 * u, height: 640 * u, borderRadius: '50%', background: 'rgba(140,210,170,0.22)' }} />
    </>
  );
  if (portrait) {
    const tall = H / W > 1.6;
    const peopleH = (tall ? 820 : 640) * u;
    return (
      <AbsoluteFill style={{ overflow: 'hidden' }}>
        {bg}
        <div style={{ position: 'absolute', left: 0, right: 0, top: H * (tall ? 0.15 : 0.07), display: 'flex', justifyContent: 'center' }}><Title s={u * 0.94} /></div>
        <div style={{ position: 'absolute', left: 0, right: 0, top: H * (tall ? 0.44 : 0.42), display: 'flex', justifyContent: 'center' }}><Numbers s={u * (tall ? 0.92 : 0.88)} /></div>
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
  const wide = W / H > 1.6;
  const L = W * (wide ? 0.05 : 0.04), colW = W * (wide ? 0.58 : 0.62);
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      {bg}
      <div style={{ position: 'absolute', left: L, top: H * 0.05, width: colW, display: 'flex', justifyContent: 'center' }}><Title s={u * (wide ? 0.9 : 0.74)} /></div>
      <div style={{ position: 'absolute', left: L, top: H * (wide ? 0.45 : 0.45), width: colW, display: 'flex', justifyContent: 'center' }}><Numbers s={u * (wide ? 1.06 : 0.84)} /></div>
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
