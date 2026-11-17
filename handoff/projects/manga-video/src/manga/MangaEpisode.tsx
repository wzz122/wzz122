import { Audio } from "@remotion/media";
import React from "react";
import {
  AbsoluteFill,
  type CalculateMetadataFunction,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { CutView } from "./Cut";
import { ensureFonts } from "./fonts";
import { Subtitle } from "./Subtitle";
import type { FrameRange, Plan, PlanBgm, PlanCut } from "./types";

ensureFonts();

export type MangaEpisodeProps = {
  /** episodes/ 下的文件夹名，例如 pilot */
  episode: string;
  /** 由 calculateMetadata 从 build/<episode>/timeline.json 读进来，不用手填 */
  plan?: Plan | null;
};

export const calculateMangaMetadata: CalculateMetadataFunction<MangaEpisodeProps> = async ({ props, abortSignal }) => {
  const url = staticFile(`manga/build/${props.episode}/timeline.json`);
  const res = await fetch(url, { signal: abortSignal });
  if (!res.ok) {
    throw new Error(`读不到 build/${props.episode}/timeline.json。先跑 npm run tts 和 npm run analyze。`);
  }
  const plan = (await res.json()) as Plan;
  return {
    durationInFrames: plan.episode.durationInFrames,
    fps: plan.episode.fps,
    width: plan.episode.width,
    height: plan.episode.height,
    props: { ...props, plan },
  };
};

/** 切镜头：本镜头怎么出现（transitionIn），以及下一个镜头用 slide 进来时本镜头往左让开 */
const CutLayer: React.FC<{ plan: Plan; cut: PlanCut; next: PlanCut | undefined }> = ({ plan, cut, next }) => {
  const frame = useCurrentFrame();
  const { width: W } = useVideoConfig();
  const own = cut.endFrame - cut.startFrame;
  const tin = cut.transitionIn;
  let opacity = 1;
  let x = 0;
  if (tin.frames > 0 && tin.type === "fade") {
    opacity = interpolate(frame, [0, tin.frames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  }
  if (tin.frames > 0 && tin.type === "slide") {
    x = interpolate(frame, [0, tin.frames], [W, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  }
  if (next && next.transitionIn.type === "slide" && frame >= own) {
    x = interpolate(frame, [own, own + next.transitionIn.frames], [0, -W * 0.35], { extrapolateRight: "clamp" });
  }
  return (
    <AbsoluteFill style={{ opacity, translate: `${x}px 0px` }}>
      <CutView plan={plan} cut={cut} />
    </AbsoluteFill>
  );
};

/** 背景音乐的音量：有人说话时压低（ducking），前后各留一点过渡；整段头尾淡入淡出 */
const bgmVolume = (bgm: PlanBgm, speech: FrameRange[], frame: number, fps: number) => {
  const ramp = Math.round(0.25 * fps);
  let duck = 0;
  for (const [a, b] of speech) {
    if (frame >= a - ramp && frame < b + ramp) {
      const inRamp = interpolate(frame, [a - ramp, a], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
      const outRamp = interpolate(frame, [b, b + ramp], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
      duck = Math.max(duck, Math.min(inRamp, outRamp));
    }
  }
  const fade = Math.round(0.6 * fps);
  const edge = Math.min(
    interpolate(frame, [bgm.startFrame, bgm.startFrame + fade], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    interpolate(frame, [bgm.endFrame - fade, bgm.endFrame], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
  );
  return edge * (bgm.volume + (bgm.duckVolume - bgm.volume) * duck);
};

export const MangaEpisode: React.FC<MangaEpisodeProps> = ({ plan }) => {
  const { fps } = useVideoConfig();
  if (!plan) return null;
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {/* 画面：每个镜头一个 Sequence；下一个镜头有转场时，本镜头多留几帧垫在下面 */}
      {plan.cuts.map((cut, i) => {
        const next = plan.cuts[i + 1];
        const overlap = next ? next.transitionIn.frames : 0;
        return (
          <Sequence
            key={cut.id}
            name={`镜头 ${cut.id}`}
            from={cut.startFrame}
            durationInFrames={cut.endFrame - cut.startFrame + overlap}
            premountFor={fps}
          >
            <CutLayer plan={plan} cut={cut} next={next} />
          </Sequence>
        );
      })}

      <Subtitle lines={plan.lines} characters={plan.characters} />

      {/* 声音第一层：配音 */}
      {plan.lines.map((l) => (
        <Audio key={l.id} name={`配音 ${l.id}`} src={staticFile(l.audio)} from={l.startFrame} premountFor={fps} />
      ))}
      {/* 第二层：效果音 */}
      {plan.sfx.map((s, i) => (
        <Audio key={`sfx-${i}`} name={`音效 ${s.reason}`} src={staticFile(s.src)} from={s.frame} volume={s.volume} premountFor={fps} />
      ))}
      {/* 第三层：背景音乐（有人说话时自动压低）。音乐比区间短时，一段接一段铺满 */}
      {plan.bgm.flatMap((b, i) => {
        const pieces = Math.ceil((b.endFrame - b.startFrame) / b.loopFrames);
        return Array.from({ length: pieces }, (_, k) => {
          const start = b.startFrame + k * b.loopFrames;
          return (
            <Audio
              key={`bgm-${i}-${k}`}
              name={`背景音乐 ${i + 1}${pieces > 1 ? `（第 ${k + 1} 遍）` : ""}`}
              src={staticFile(b.src)}
              from={start}
              durationInFrames={Math.min(b.loopFrames, b.endFrame - start)}
              volume={(f) => bgmVolume(b, plan.speech, start + f, fps)}
              premountFor={fps}
            />
          );
        });
      })}
    </AbsoluteFill>
  );
};
