/* 单人主讲 + 图解 模板（1920×1080） */
import React from 'react';
import { Audio } from '@remotion/media';
import { AbsoluteFill, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, FONT, ease, loadFonts, pop } from './theme';
import { Teacher } from './Characters';
import { DIAGRAMS } from './diagrams';
import type { Timeline } from './types';

loadFonts();

const STAGE = { left: 50, top: 124, width: 1400, height: 706 };

export const ExplainerVideo: React.FC<{ episode: string; timeline?: Timeline }> = ({ timeline }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!timeline) return <AbsoluteFill style={{ background: C.bg }} />;
  const tl = timeline;
  const seg = tl.segments.find(s => frame >= s.from && frame < s.to) ?? tl.segments[tl.segments.length - 1];
  const segIdx = tl.segments.indexOf(seg);
  const mains = tl.visuals.filter(v => !v.overlay && frame >= v.from - 2 && frame < v.to + 10);
  const overlays = tl.visuals.filter(v => v.overlay && frame >= v.from && frame < v.to);
  const cameoOn = overlays.some(v => v.type === 'cheeseCameo');
  const sub = tl.subtitles.find(s => frame >= s.from && frame < s.to);

  return (
    <AbsoluteFill style={{ background: C.bg, fontFamily: FONT, overflow: 'hidden' }}>
      {/* 点阵底纹 */}
      <AbsoluteFill style={{ backgroundImage: `radial-gradient(${C.dot} 3px, transparent 3px)`, backgroundSize: '36px 36px', opacity: 0.9 }} />
      {tl.audio ? <Audio src={staticFile(tl.audio)} /> : null}

      <ChapterBar chapter={seg.chapter} label={seg.label} labelFrom={seg.from} frame={frame} index={segIdx} total={tl.segments.length} />

      <div style={{ position: 'absolute', ...STAGE }}>
        {mains.map(v => {
          const Comp = DIAGRAMS[v.type];
          if (!Comp) return null;
          const out = ease(frame, v.to - 6, 10);
          return (
            <div key={v.id} style={{ position: 'absolute', inset: 0, opacity: 1 - out, scale: `${1 - 0.04 * out}` }}>
              <Comp v={v} frame={frame} assets={tl.assets} lines={tl.lines} characters={tl.characters} />
            </div>
          );
        })}
      </div>

      <Teacher frame={frame} lines={tl.lines} assets={tl.assets} />

      {overlays.map(v => {
        const Comp = DIAGRAMS[v.type];
        return Comp ? <Comp key={v.id} v={v} frame={frame} assets={tl.assets} lines={tl.lines} characters={tl.characters} /> : null;
      })}

      {sub && !(cameoOn && sub.speaker === 'cheese') ? <Subtitle sub={sub} frame={frame} fps={fps} name={sub.speaker !== 'gyudon' ? tl.characters[sub.speaker] : undefined} /> : null}
    </AbsoluteFill>
  );
};

const ChapterBar: React.FC<{ chapter: string; label: string | null; labelFrom: number; frame: number; index: number; total: number }> = ({ chapter, label, labelFrom, frame, index, total }) => (
  <div style={{ position: 'absolute', left: 50, right: 50, top: 26, height: 76, display: 'flex', alignItems: 'center', gap: 18 }}>
    <div style={{ height: 76, padding: '0 34px', borderRadius: 38, background: C.ink, color: '#fff', fontSize: 36, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 16 }}>
      <span style={{ width: 16, height: 16, borderRadius: 8, background: C.accent }} />
      {chapter}
    </div>
    {label ? (
      <div key={label} style={{ height: 64, padding: '0 28px', borderRadius: 32, background: C.accent, color: '#fff', fontSize: 34, fontWeight: 900, display: 'flex', alignItems: 'center', scale: `${pop(frame, labelFrom)}` }}>{label}</div>
    ) : null}
    <div style={{ flex: 1 }} />
    <div style={{ display: 'flex', gap: 10 }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={{ width: i === index ? 40 : 14, height: 14, borderRadius: 7, background: i <= index ? C.accent : '#E3DACA' }} />
      ))}
    </div>
  </div>
);

const Subtitle: React.FC<{ sub: Timeline['subtitles'][number]; frame: number; fps: number; name?: { name: string; color: string } }> = ({ sub, frame, name }) => {
  const p = ease(frame, sub.from, 5);
  return (
    <div style={{ position: 'absolute', left: 50, width: 1400, bottom: 54, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 18, opacity: p, translate: `0px ${(1 - p) * 10}px` }}>
      {name ? <span style={{ background: name.color, color: '#fff', fontSize: 34, fontWeight: 900, padding: '6px 20px', borderRadius: 18 }}>{name.name}</span> : null}
      <div style={{ fontSize: 66, fontWeight: 900, letterSpacing: 1, lineHeight: 1.2, textAlign: 'center' }}>
        {sub.runs.map((r, i) => (
          <span key={i} style={{ color: r.em ? C.yellow : '#FFFFFF', WebkitTextStroke: `14px ${r.em ? '#7A2E0E' : C.ink}`, paintOrder: 'stroke fill', fontSize: r.em ? 74 : 66 }}>{r.t}</span>
        ))}
      </div>
    </div>
  );
};
