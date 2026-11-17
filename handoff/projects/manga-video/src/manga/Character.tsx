import React from "react";
import { Img, interpolate, random, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { activeSpeakerAt, characterGeometry } from "./layout";
import type { PlanCharacterDef, PlanCut, PlanCutCharacter, PlanLine } from "./types";

const BLINK_FRAMES = 4;

/** 眨眼时间表：第一次在 1~3 秒，之后每隔 3~6 秒一次（按镜头和角色固定随机，渲染多少次都一样） */
const blinkStarts = (seed: string, duration: number, fps: number): number[] => {
  const out: number[] = [];
  let t = Math.round((1 + random(`${seed}-0`) * 2) * fps);
  let i = 1;
  while (t < duration) {
    out.push(t);
    t += Math.round((3 + random(`${seed}-${i++}`) * 3) * fps);
  }
  return out;
};

export const Character: React.FC<{
  cut: PlanCut;
  lines: PlanLine[];
  ch: PlanCutCharacter;
  def: PlanCharacterDef;
}> = ({ cut, lines, ch, def }) => {
  const frame = useCurrentFrame();
  const { fps, width: W, height: H } = useVideoConfig();
  const g = characterGeometry(cut.shot, ch.x, W, H);
  const duration = cut.endFrame - cut.startFrame;

  // 表情：取最后一个已经生效的
  let expression = ch.expressions[0].expression;
  for (const e of ch.expressions) if (e.frame <= frame) expression = e.expression;
  const images = def.images[expression] ?? Object.values(def.images)[0];
  if (!images) return null;

  // 说话：这一帧落在自己的哪句台词里
  const myLine = lines.find(
    (l) => l.speaker === ch.id && frame >= l.startFrame - cut.startFrame && frame < l.endFrame - cut.startFrame,
  );
  const lineFrame = myLine ? frame - (myLine.startFrame - cut.startFrame) : -1;
  const mouthOpen = myLine ? myLine.mouth.some(([a, b]) => lineFrame >= a && lineFrame < b) : false;

  // 眨眼
  const blinking =
    images.blink !== null &&
    blinkStarts(`${cut.id}-${ch.id}`, duration, fps).some((s) => frame >= s && frame < s + BLINK_FRAMES);

  const src = blinking && !mouthOpen ? images.blink! : mouthOpen && images.open ? images.open : images.closed;

  // 不说话的人稍微调暗：用最近 6 帧的状态求平均，切换时有个过渡
  let dimSum = 0;
  for (let k = 0; k < 6; k++) {
    const s = activeSpeakerAt(cut, lines, frame - k);
    dimSum += cut.characters.length > 1 && s !== null && s !== ch.id ? 1 : 0;
  }
  const dim = dimSum / 6;

  // 说话时上下弹动
  const bounceAmp = cut.shot === "closeUp" ? 14 : 9;
  const bounce = myLine ? -Math.abs(Math.sin((lineFrame / fps) * Math.PI * 2.6)) * bounceAmp : 0;

  // 进场
  const sinceEnter = frame - ch.enterFrame;
  if (ch.enter !== "none" && sinceEnter < 0) return null;
  const enterSpring =
    ch.enter === "none" ? 1 : spring({ frame: sinceEnter, fps, config: { damping: 13, mass: 0.7, stiffness: 120 } });
  const fromRight = ch.x >= 0.5;
  const slideX = ch.enter === "slideIn" ? interpolate(enterSpring, [0, 1], [fromRight ? W * 0.7 : -W * 0.7, 0]) : 0;
  const popScale = ch.enter === "pop" ? interpolate(enterSpring, [0, 1], [0.2, 1]) : 1;

  return (
    <div
      style={{
        position: "absolute",
        left: g.left,
        top: g.top,
        width: g.width,
        height: g.height,
        translate: `${slideX}px ${bounce}px`,
        scale: `${ch.flip ? -popScale : popScale} ${popScale}`,
        transformOrigin: "50% 100%",
        filter: dim > 0 ? `brightness(${1 - 0.28 * dim}) saturate(${1 - 0.2 * dim})` : undefined,
      }}
    >
      {/* 三张图叠在一起只切换显示，避免切图时闪一下 */}
      {[images.closed, images.open, images.blink].map((s, i) =>
        s ? (
          <Img
            key={i}
            src={staticFile(s)}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "contain",
              objectPosition: "50% 100%",
              opacity: s === src ? 1 : 0,
            }}
          />
        ) : null,
      )}
    </div>
  );
};
