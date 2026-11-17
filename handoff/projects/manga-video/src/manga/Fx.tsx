import React from "react";
import { Easing, interpolate, random, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { FxType } from "./types";

// 头顶的小图标，全部用 SVG 自己画（不用 emoji，避免字体差异）
const OUTLINE = "#4A3426";

const Sweat: React.FC<{ t: number }> = ({ t }) => (
  <svg width={150} height={190} viewBox="0 0 150 190" style={{ overflow: "visible" }}>
    {[0, 1].map((i) => {
      const drop = ((t * 0.9 + i * 0.45) % 1) * 30;
      return (
        <path
          key={i}
          transform={`translate(${i * 62 + 10}, ${i * 34 + drop}) scale(${i ? 0.7 : 1})`}
          d="M40 0 C55 30 80 55 80 85 C80 108 62 125 40 125 C18 125 0 108 0 85 C0 55 25 30 40 0 Z"
          fill="#8FD3FF"
          stroke={OUTLINE}
          strokeWidth={6}
          strokeLinejoin="round"
        />
      );
    })}
    <path d="M24 70 C22 85 26 96 34 102" stroke="#FFFFFF" strokeWidth={7} fill="none" strokeLinecap="round" />
  </svg>
);

const Exclaim: React.FC = () => (
  <svg width={200} height={200} viewBox="-100 -100 200 200" style={{ overflow: "visible" }}>
    {Array.from({ length: 8 }).map((_, i) => {
      const a = (i / 8) * Math.PI * 2;
      return (
        <line
          key={i}
          x1={Math.cos(a) * 62}
          y1={Math.sin(a) * 62}
          x2={Math.cos(a) * 92}
          y2={Math.sin(a) * 92}
          stroke="#FF5A4E"
          strokeWidth={9}
          strokeLinecap="round"
        />
      );
    })}
    <path d="M-16 -58 L16 -58 L9 16 L-9 16 Z" fill="#FF5A4E" stroke={OUTLINE} strokeWidth={6} strokeLinejoin="round" />
    <circle cx={0} cy={40} r={13} fill="#FF5A4E" stroke={OUTLINE} strokeWidth={6} />
  </svg>
);

const Question: React.FC = () => (
  <svg width={160} height={200} viewBox="-80 -100 160 200" style={{ overflow: "visible" }}>
    <path
      d="M-38 -38 C-38 -78 38 -82 40 -40 C42 -8 6 -4 4 26"
      stroke={OUTLINE}
      strokeWidth={34}
      fill="none"
      strokeLinecap="round"
    />
    <path d="M-38 -38 C-38 -78 38 -82 40 -40 C42 -8 6 -4 4 26" stroke="#5BA8FF" strokeWidth={20} fill="none" strokeLinecap="round" />
    <circle cx={4} cy={66} r={17} fill="#5BA8FF" stroke={OUTLINE} strokeWidth={7} />
  </svg>
);

const Angry: React.FC = () => (
  <svg width={160} height={160} viewBox="-80 -80 160 160" style={{ overflow: "visible" }}>
    {[0, 90, 180, 270].map((r) => (
      <path
        key={r}
        transform={`rotate(${r})`}
        d="M-14 -62 C-14 -30 -30 -14 -62 -14"
        stroke="#FF4D4D"
        strokeWidth={18}
        fill="none"
        strokeLinecap="round"
      />
    ))}
  </svg>
);

const Star: React.FC<{ size: number; color: string }> = ({ size, color }) => (
  <svg width={size} height={size} viewBox="-50 -50 100 100" style={{ overflow: "visible" }}>
    <path
      d="M0 -48 C6 -12 12 -6 48 0 C12 6 6 12 0 48 C-6 12 -12 6 -48 0 C-12 -6 -6 -12 0 -48 Z"
      fill={color}
      stroke={OUTLINE}
      strokeWidth={5}
      strokeLinejoin="round"
    />
  </svg>
);

const Sparkle: React.FC<{ frame: number; seed: string }> = ({ frame, seed }) => {
  const stars = [
    { x: -150, y: -40, s: 90, d: 0 },
    { x: 40, y: -120, s: 70, d: 5 },
    { x: 130, y: 20, s: 100, d: 9 },
    { x: -60, y: 90, s: 60, d: 13 },
  ];
  return (
    <div style={{ position: "relative" }}>
      {stars.map((st, i) => {
        const tw = Math.max(0, Math.sin(((frame - st.d) / 30) * Math.PI * 2.2 + random(`${seed}-${i}`) * 6));
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: st.x - st.s / 2,
              top: st.y - st.s / 2,
              scale: String(frame < st.d ? 0 : 0.4 + 0.6 * tw),
              rotate: `${frame * 2}deg`,
            }}
          >
            <Star size={st.s} color={i % 2 ? "#FFF3A8" : "#FFD84A"} />
          </div>
        );
      })}
    </div>
  );
};

export const FxIcon: React.FC<{
  type: Exclude<FxType, "shake">;
  x: number;
  y: number;
  startFrame: number;
  duration: number;
  seed: string;
}> = ({ type, x, y, startFrame, duration, seed }) => {
  const frame = useCurrentFrame() - startFrame;
  const { fps } = useVideoConfig();
  if (frame < 0 || frame >= duration) return null;
  const pop = spring({ frame, fps, config: { damping: 9, stiffness: 180, mass: 0.6 } });
  const fadeOut = interpolate(frame, [duration - 8, duration], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const float = interpolate(frame, [0, 45], [0, -18], { extrapolateRight: "clamp", easing: Easing.out(Easing.quad) });
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        translate: `-50% calc(-50% + ${float}px)`,
        scale: String(type === "sparkle" ? 1 : pop),
        opacity: fadeOut,
      }}
    >
      {type === "sweat" ? <Sweat t={frame / fps} /> : null}
      {type === "exclaim" ? <Exclaim /> : null}
      {type === "question" ? <Question /> : null}
      {type === "angry" ? <Angry /> : null}
      {type === "sparkle" ? <Sparkle frame={frame} seed={seed} /> : null}
    </div>
  );
};

/** 画面抖动：返回这一帧的位移（0.3 秒，越来越小） */
export const shakeOffset = (frame: number, shakeFrames: number[], fps: number): { x: number; y: number } => {
  const len = Math.round(0.3 * fps);
  for (const s of shakeFrames) {
    const t = frame - s;
    if (t >= 0 && t < len) {
      const amp = 26 * (1 - t / len);
      return { x: (random(`sx-${s}-${t}`) - 0.5) * 2 * amp, y: (random(`sy-${s}-${t}`) - 0.5) * 2 * amp };
    }
  }
  return { x: 0, y: 0 };
};
