/* 税务图解整期视频：老师（右下）+ 芝士（左下，戴眼镜的学生头像）+ 中间图解 / 全屏动画场景 + 底部字幕。画面角落不放任何小字。 */
import React from 'react';
import { Audio } from '@remotion/media';
import { AbsoluteFill, staticFile, useCurrentFrame } from 'remotion';
import { C, FONT, ease, loadFonts } from '../explainer/theme';
import { DIAGRAMS } from '../explainer/diagrams';
import { CheeseArt, TeacherArt } from '../explainer/CharacterArt';
import { Scene } from './Scene';
import { Backdrop, cheesePh, outfitOf, type Look } from './looks';
import { blinking } from '../explainer/Characters';
import { OneMoneyTwoTimes } from '../explainer-v2/OneMoneyTwoTimes';

loadFonts();

type V = { id: string; type: string; data: any; from: number; to: number; steps: number[] };
type L = { speaker: string; from: number; to: number; mouth: string; mood: string | null; expression: string; pointAt: number[] };
export type EpisodeTL = {
  id: string; durationInFrames: number; audio: string; title: string; look?: Look;
  segments: { chapter: string; from: number; to: number }[];
  visuals: V[]; lines: L[];
  subtitles: { speaker: string; from: number; to: number; runs: { t: string; em: boolean }[] }[];
  // 角色轨（可选）：老师和芝士全程在画面上（不能离场，build-episode 会拒绝 'out'）；cast 用来切老师手势。没有 cast 的旧时间轴照旧
  cast?: { f: number; teacher?: 'in' | 'out'; cheese?: 'in' | 'out'; pose?: string | null }[];
};

// 某帧的角色状态：visible 是 0..1 的出场进度（10 帧滑入/滑出），pose 是老师当前手势
const castAt = (cast: EpisodeTL['cast'], f: number) => {
  const st = { teacher: 'in', cheese: 'in', tT: -99, tC: -99, pose: null as string | null };
  for (const e of cast ?? []) {
    if (e.f > f) break;
    if (e.teacher && e.teacher !== st.teacher) { st.teacher = e.teacher; st.tT = e.f; }
    if (e.cheese && e.cheese !== st.cheese) { st.cheese = e.cheese; st.tC = e.f; }
    if (e.pose !== undefined) st.pose = e.pose;
  }
  const vis = (on: string, at: number) => { const p = ease(f, at, 10); return on === 'in' ? (at < 0 ? 1 : p) : 1 - p; };
  return { teacher: vis(st.teacher, st.tT), cheese: vis(st.cheese, st.tC), pose: st.pose };
};

const mouthOf = (lines: L[], who: string, f: number) => {
  const ln = lines.find(l => l.speaker === who && f >= l.from && f < l.to);
  return { level: ln ? Number(ln.mouth[f - ln.from] ?? '0') : 0, line: ln };
};

// 嵌入的「一笔钱」场景：每个关键点之后按正常速度播放，播到下一个关键点的状态就停住，等台词跟上
const sceneFrame = (v: V, f: number) => {
  const keys: number[] = v.data.keys.map((k: [number, unknown]) => k[0]);
  let local = 0;
  for (let i = 0; i < keys.length; i++) {
    if (f >= v.steps[i]) {
      const cap = i + 1 < keys.length ? keys[i + 1] - keys[i] : 449 - keys[i];
      local = keys[i] + Math.min(f - v.steps[i], cap);
    }
  }
  return local;
};

// 全屏层：动画场景、「一笔钱」场景
const FULL = new Set(['scene', 'moneyScene']);
const FullStage: React.FC<{ v: V; f: number }> = ({ v, f }) => {
  if (v.type === 'scene') return <Scene data={v.data} frame={f} />;
  return (
    <div style={{ position: 'absolute', left: 0, top: -20, width: 1920, height: 1080, scale: '0.9', transformOrigin: '880px 0px' }}>
      <OneMoneyTwoTimes frame={sceneFrame(v, f)} embed />
    </div>
  );
};

const Stage: React.FC<{ v: V; f: number }> = ({ v, f }) => {
  const Comp = DIAGRAMS[v.type];
  if (!Comp) return null;
  return <Comp v={{ ...v, overlay: false }} frame={f} assets={[]} lines={[]} characters={{}} />;
};

export const EpisodeVideo: React.FC<{ episode: string; timeline?: EpisodeTL }> = ({ timeline }) => {
  const f = useCurrentFrame();
  if (!timeline) return <AbsoluteFill style={{ background: '#FBEFC8' }} />;
  const tl = timeline;
  const mains = tl.visuals.filter(v => f >= v.from - 2 && f < v.to + 10);
  const sub = tl.subtitles.find(s => f >= s.from && f < s.to);
  const t = mouthOf(tl.lines, 'gyudon', f);
  const r = mouthOf(tl.lines, 'cheese', f);
  const warn = mains.some(v => v.type === 'warningBox');
  const tBob = t.level > 0 ? Math.sin(f / 3.4) * 2 : Math.sin(f / 24) * 2;
  const rBob = r.level > 0 ? Math.abs(Math.sin(f / 4)) * -8 : Math.sin(f / 22) * 2;
  const cast = castAt(tl.cast, f);

  return (
    <AbsoluteFill style={{ background: '#FBEFC8', fontFamily: FONT, color: C.ink, overflow: 'hidden' }}>
      {/* 底纹按 look 换，不写就是税务线的暖色底 */}
      <Backdrop look={tl.look} />
      {tl.audio ? <Audio src={staticFile(tl.audio)} /> : null}

      {/* 全屏动画场景 */}
      {mains.filter(v => FULL.has(v.type)).map(v => {
        const out = ease(f, v.to - 6, 10);
        return (
          <AbsoluteFill key={v.id} style={{ opacity: 1 - out, scale: `${1 - 0.03 * out}` }}>
            <FullStage v={v} f={f} />
          </AbsoluteFill>
        );
      })}
      {/* 中间图解 */}
      <div style={{ position: 'absolute', left: 250, top: 30, width: 1420, height: 820 }}>
        {mains.filter(v => !FULL.has(v.type)).map(v => {
          const out = ease(f, v.to - 6, 10);
          return (
            <div key={v.id} style={{ position: 'absolute', inset: 0, opacity: 1 - out, scale: `${1 - 0.04 * out}` }}>
              <Stage v={v} f={f} />
            </div>
          );
        })}
      </div>

      {/* 芝士（左下）：戴粗框眼镜的学生头像 */}
      {cast.cheese > 0.001 ? (
        <div style={{ position: 'absolute', left: 30, bottom: 30, width: 236, height: 236, translate: `${(cast.cheese - 1) * 300}px ${rBob}px`, opacity: Math.min(1, cast.cheese * 2), scale: r.level > 0 ? '1.04' : '1', filter: 'drop-shadow(0 8px 0 rgba(90,74,66,0.15))' }}>
          <CheeseArt mouth={r.level} blink={blinking(f, 2)} ph={cheesePh(tl.look)} size={236} />
        </div>
      ) : null}
      {/* 牛丼老师（右下）；cast 里写了 pose 时用那个手势（pointLeft = 指向左边的图解） */}
      {cast.teacher > 0.001 ? (
        <div style={{ position: 'absolute', right: 6, bottom: -30, width: 320, height: 450, translate: `${(1 - cast.teacher) * 380}px ${tBob}px`, opacity: Math.min(1, cast.teacher * 2) }}>
          <TeacherArt expr={cast.pose ?? (warn ? 'serious' : t.level > 0 ? 'normal' : 'smile')} mouth={t.level} blink={blinking(f, 1)} outfit={outfitOf(tl.look)} />
        </div>
      ) : null}

      {/* 字幕：老师白字，芝士浅蓝字，重点词黄字 */}
      {sub ? (
        <div style={{ position: 'absolute', left: 300, right: 330, bottom: 40, textAlign: 'center', opacity: ease(f, sub.from, 4) }}>
          <span style={{ fontSize: 58, fontWeight: 900, lineHeight: 1.25, letterSpacing: 1 }}>
            {sub.runs.map((run, i) => (
              <span key={i} style={{ color: run.em ? C.yellow : sub.speaker === 'cheese' ? '#9BEBFF' : '#FFFFFF', WebkitTextStroke: `12px ${C.ink}`, paintOrder: 'stroke fill', fontSize: run.em ? 64 : 58 }}>{run.t}</span>
            ))}
          </span>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
