/* AI 查税封面（和工资里的税、确定申告封面同一套：同样的底色、角色、标题版式）。
   v2（2026-11-03 用户要求突出 KSK2 和 AI 查税介绍）：「国税新系统 KSK2 上线 / AI查税时代 / AI怎么挑人？新系统查什么？/ 一次讲清」
   + 三步流程「KSK2 数据合一 → AI 风险分 高·中·低 → 最后 职员判断」+ 芝士问「AI 在给我打分？」+ 老师指向。
   依据 episodes/ai-chosa-2026/facts.md F7、F11（KSK2 是通称，国税厅写「国税システムの更改」，9/24 上线）。颜色：KSK2 = 紫，AI = 青。
   v1（三个数版）的成图留在 out/cover/aichosa/*-v1-*.jpg。
   竖版（视频号 3:4、9:16）上字下人；横版（4:3、16:9）左字右人。不放频道标志、不放角落小字。 */
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { C, FONT, loadFonts } from '../explainer/theme';
import { CheeseArt, TeacherArt } from '../explainer/CharacterArt';

loadFonts();
const INK = '#1F2A44', OL = '#5A4A42', PURPLE = '#7B5CC4', TEAL = '#1E95AA';

const Title: React.FC<{ s: number }> = ({ s }) => (
  <div style={{ fontFamily: FONT, textAlign: 'center', lineHeight: 1 }}>
    <div style={{ fontFamily: '"Noto Sans JP", "Noto Sans SC", sans-serif', fontSize: 64 * s, fontWeight: 900, color: C.accent, letterSpacing: 4 * s, marginBottom: 18 * s, whiteSpace: 'nowrap' }}>国税新系统 <span style={{ color: PURPLE }}>KSK2</span> 上线</div>
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <div style={{ position: 'absolute', left: -14 * s, right: -14 * s, bottom: 14 * s, height: 58 * s, background: C.yellow, borderRadius: 16 * s }} />
      <div style={{ position: 'relative', fontSize: 132 * s, fontWeight: 900, color: INK, letterSpacing: 2 * s, whiteSpace: 'nowrap' }}>AI查税时代</div>
    </div>
    <div style={{ marginTop: 14 * s, fontSize: 78 * s, fontWeight: 900, color: INK, whiteSpace: 'nowrap' }}>AI怎么挑人？新系统查什么？</div>
    <div style={{ marginTop: 22 * s, display: 'inline-block', background: '#E04F4F', color: '#fff', fontSize: 72 * s, fontWeight: 900, padding: `${8 * s}px ${44 * s}px ${14 * s}px`, borderRadius: 26 * s, border: `${7 * s}px solid ${OL}`, boxShadow: `0 ${10 * s}px 0 rgba(90,74,66,0.18)`, whiteSpace: 'nowrap' }}>一次讲清</div>
  </div>
);

// 三步：KSK2 把数据合到一起（紫）→ AI 给每个人打风险分（青）→ 最后由职员判断（藏青）
const Step: React.FC<{ s: number; label: string; children: React.ReactNode }> = ({ s, label, children }) => (
  <div style={{ background: '#fff', border: `${6 * s}px solid ${OL}`, borderRadius: 24 * s, padding: `${8 * s}px ${24 * s}px ${12 * s}px`, textAlign: 'center', boxShadow: `0 ${8 * s}px 0 rgba(90,74,66,0.16)` }}>
    <div style={{ fontSize: 34 * s, fontWeight: 900, color: '#7D8596', lineHeight: 1.2 }}>{label}</div>
    <div style={{ fontSize: 80 * s, fontWeight: 900, lineHeight: 1.05 }}>{children}</div>
  </div>
);
const Arrow: React.FC<{ s: number }> = ({ s }) => <div style={{ fontSize: 64 * s, fontWeight: 900, color: OL }}>→</div>;
const Numbers: React.FC<{ s: number }> = ({ s }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12 * s, fontFamily: FONT, whiteSpace: 'nowrap' }}>
    <Step s={s} label="新系统 KSK2"><span style={{ color: PURPLE }}>数据合一</span></Step>
    <Arrow s={s} />
    <Step s={s} label="🤖 AI 风险分"><span style={{ color: '#E04F4F' }}>高</span><span style={{ color: '#B8BEC9' }}>·</span><span style={{ color: '#E8853D' }}>中</span><span style={{ color: '#B8BEC9' }}>·</span><span style={{ color: TEAL }}>低</span></Step>
    <Arrow s={s} />
    <Step s={s} label="最后谁判断"><span style={{ color: INK }}>职员</span></Step>
  </div>
);

const Bubble: React.FC<{ s: number; tail: 'left' | 'down' }> = ({ s, tail }) => (
  <div style={{ position: 'relative', fontFamily: FONT, background: '#fff', border: `${6 * s}px solid ${OL}`, borderRadius: 34 * s, padding: `${14 * s}px ${34 * s}px ${18 * s}px`, fontSize: 60 * s, fontWeight: 900, color: INK, whiteSpace: 'nowrap', boxShadow: `0 ${8 * s}px 0 rgba(90,74,66,0.14)` }}>
    <span style={{ color: TEAL }}>AI</span> 在给我<span style={{ color: C.accent }}>打分</span>？
    <div style={{ position: 'absolute', ...(tail === 'down' ? { left: 70 * s, bottom: -30 * s } : { left: -30 * s, bottom: 30 * s }), width: 44 * s, height: 44 * s, background: '#fff', borderRight: `${6 * s}px solid ${OL}`, borderBottom: `${6 * s}px solid ${OL}`, rotate: tail === 'down' ? '45deg' : '135deg' }} />
  </div>
);

export const AichosaCover: React.FC<{ W: number; H: number }> = ({ W, H }) => {
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
        <div style={{ position: 'absolute', left: 0, right: 0, top: H * (tall ? 0.44 : 0.42), display: 'flex', justifyContent: 'center' }}><Numbers s={u * 0.78} /></div>
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
  // 横版：左边标题 + 三个数 + 芝士和气泡（左下），右边老师
  const wide = W / H > 1.6;
  const L = W * (wide ? 0.05 : 0.04), colW = W * (wide ? 0.58 : 0.62);
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      {bg}
      <div style={{ position: 'absolute', left: L, top: H * 0.05, width: colW, display: 'flex', justifyContent: 'center' }}><Title s={u * (wide ? 0.9 : 0.74)} /></div>
      <div style={{ position: 'absolute', left: L, top: H * (wide ? 0.52 : 0.47), width: colW, display: 'flex', justifyContent: 'center' }}><Numbers s={u * (wide ? 0.82 : 0.72)} /></div>
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
