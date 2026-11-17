import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { fontStack } from "./fonts";

/** 大字标题卡：方格纸背景 + 主标题弹出 + 副标题随后滑入 */
export const TitleCard: React.FC<{ text: string; sub: string | null; color: string; animation: "pop" | "none" }> = ({
  text,
  sub,
  color,
  animation,
}) => {
  const frame = useCurrentFrame();
  const { fps, width: W, height: H } = useVideoConfig();
  const pop = animation === "pop" ? spring({ frame: frame - 2, fps, config: { damping: 8, stiffness: 160, mass: 0.7 } }) : 1;
  const subIn = animation === "pop" ? spring({ frame: frame - 12, fps, config: { damping: 14, stiffness: 140 } }) : 1;
  // 浅方格纸 + 中间一团柔光；格子缓慢平移一点，画面不死板。
  // 不用从中心往外的放射线（频道面向中国观众，避免联想到旭日旗）
  const grid = 64;
  const drift = (frame * 0.4) % grid;

  return (
    <AbsoluteFill style={{ background: "#FFF8E7", overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          backgroundImage:
            "linear-gradient(rgba(176,140,96,0.22) 2px, transparent 2px), linear-gradient(90deg, rgba(176,140,96,0.22) 2px, transparent 2px)",
          backgroundSize: `${grid}px ${grid}px`,
          backgroundPosition: `${drift}px ${drift}px`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse ${W * 0.45}px ${H * 0.4}px at 50% 50%, rgba(255,255,255,0.95), rgba(255,248,231,0))`,
        }}
      />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", gap: 10 }}>
        <div
          style={{
            fontFamily: fontStack("zh"),
            fontWeight: 900,
            fontSize: 230,
            color,
            WebkitTextStroke: "26px #FFFFFF",
            paintOrder: "stroke fill",
            filter: "drop-shadow(0 12px 0 rgba(74,52,38,0.35))",
            scale: String(interpolate(pop, [0, 1], [0.25, 1])),
            rotate: `${interpolate(pop, [0, 1], [-8, -3])}deg`,
            opacity: interpolate(frame, [0, 3], [0, 1], { extrapolateRight: "clamp" }),
            lineHeight: 1.1,
          }}
        >
          {text}
        </div>
        {sub ? (
          <div
            style={{
              fontFamily: fontStack("zh"),
              fontWeight: 900,
              fontSize: 104,
              color: "#3A2A1E",
              WebkitTextStroke: "18px #FFFFFF",
              paintOrder: "stroke fill",
              translate: `0 ${interpolate(subIn, [0, 1], [80, 0])}px`,
              opacity: subIn,
            }}
          >
            {sub}
          </div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
