import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Character } from "./Character";
import { FxIcon, shakeOffset } from "./Fx";
import { characterGeometry, headAnchor } from "./layout";
import { TitleCard } from "./TitleCard";
import type { Plan, PlanCut, PlanProp } from "./types";

const FOCUS_X = { left: 0.27, center: 0.5, right: 0.73 } as const;

/** 镜头运动（Ken Burns）：背景和角色整体缓慢推拉或平移 */
const cameraTransform = (cut: PlanCut, frame: number, W: number) => {
  const duration = Math.max(1, cut.endFrame - cut.startFrame);
  const p = interpolate(frame, [0, duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.sin),
  });
  const s = cut.camera.strength;
  switch (cut.camera.type) {
    case "zoomIn":
      return { scale: 1 + s * p, x: 0 };
    case "zoomOut":
      return { scale: 1 + s * (1 - p), x: 0 };
    case "panLeft": // 镜头往左移 = 画面内容往右走
      return { scale: 1 + s, x: interpolate(p, [0, 1], [-1, 1]) * (s * W) * 0.45 };
    case "panRight":
      return { scale: 1 + s, x: interpolate(p, [0, 1], [1, -1]) * (s * W) * 0.45 };
    default:
      return { scale: 1, x: 0 };
  }
};

const Prop: React.FC<{ prop: PlanProp }> = ({ prop }) => {
  const frame = useCurrentFrame() - prop.frame;
  const { fps, width: W, height: H } = useVideoConfig();
  if (frame < 0) return null;
  const sp = spring({ frame, fps, config: { damping: 10, stiffness: 170, mass: 0.6 } });
  const fade = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: "clamp" });
  const scale = prop.appear === "pop" ? sp : 1;
  const opacity = prop.appear === "fade" || prop.appear === "slideUp" ? fade : 1;
  const dy = prop.appear === "slideUp" ? interpolate(sp, [0, 1], [90, 0]) : 0;
  const size = prop.size * W;
  return (
    <Img
      src={staticFile(prop.image)}
      style={{
        position: "absolute",
        left: prop.x * W - size / 2,
        top: prop.y * H - size / 2,
        width: size,
        height: size,
        objectFit: "contain",
        scale: String(scale),
        translate: `0 ${dy}px`,
        opacity,
      }}
    />
  );
};

export const CutView: React.FC<{ plan: Plan; cut: PlanCut }> = ({ plan, cut }) => {
  const frame = useCurrentFrame();
  const { fps, width: W, height: H } = useVideoConfig();
  const lines = plan.lines.filter((l) => l.cutId === cut.id);

  if (cut.titleCard) {
    return <TitleCard {...cut.titleCard} />;
  }

  const cam = cameraTransform(cut, frame, W);
  const shake = shakeOffset(
    frame,
    cut.fx.filter((f) => f.type === "shake").map((f) => f.frame),
    fps,
  );
  const shaking = shake.x !== 0 || shake.y !== 0;

  return (
    <AbsoluteFill style={{ overflow: "hidden", background: "#EFE6D6" }}>
      <AbsoluteFill
        style={{
          scale: String(cam.scale * (shaking ? 1.05 : 1)),
          translate: `${cam.x + shake.x}px ${shake.y}px`,
          transformOrigin: `${FOCUS_X[cut.camera.focus] * 100}% 45%`,
        }}
      >
        {cut.background ? (
          <Img src={staticFile(cut.background)} style={{ position: "absolute", inset: 0, width: W, height: H, objectFit: "cover" }} />
        ) : null}
        {cut.characters.map((ch) => (
          <Character key={ch.id} cut={cut} lines={lines} ch={ch} def={plan.characters[ch.id]} />
        ))}
        {cut.props.map((p, i) => (
          <Prop key={i} prop={p} />
        ))}
        {cut.fx
          .filter((f) => f.type !== "shake")
          .map((f, i) => {
            const ch = cut.characters.find((c) => c.id === f.target);
            const anchor = ch ? headAnchor(characterGeometry(cut.shot, ch.x, W, H)) : { x: W * 0.5, y: H * 0.22 };
            const sparkleAtHead = f.type === "sparkle" && ch ? { x: anchor.x - W * 0.04, y: anchor.y + H * 0.05 } : anchor;
            return (
              <FxIcon
                key={i}
                type={f.type as Exclude<typeof f.type, "shake">}
                x={sparkleAtHead.x}
                y={sparkleAtHead.y}
                startFrame={f.frame}
                duration={f.duration}
                seed={`${cut.id}-${i}`}
              />
            );
          })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
