import type { PlanCut, PlanLine, Shot } from "./types";

/** 角色图按 4:5（宽:高）的半身构图摆放，底边贴着画面下沿 */
export const CHAR_ASPECT = 0.8;

export type CharGeometry = { left: number; top: number; width: number; height: number; centerX: number };

export const characterGeometry = (shot: Shot, x: number, W: number, H: number): CharGeometry => {
  const height = shot === "closeUp" ? H * 1.5 : H * 0.86;
  const width = height * CHAR_ASPECT;
  const top = shot === "closeUp" ? H * 0.03 : H - height;
  const centerX = x * W;
  return { left: centerX - width / 2, top, width, height, centerX };
};

/** 头顶效果图标的位置（相对角色图） */
export const headAnchor = (g: CharGeometry) => ({
  x: g.centerX + g.width * 0.24,
  y: g.top + g.height * 0.1,
});

/** 本镜头里，当前帧（相对镜头开头）正在说话或刚说过话的人 */
export const activeSpeakerAt = (cut: PlanCut, lines: PlanLine[], relFrame: number): string | null => {
  let speaker: string | null = null;
  for (const l of lines) {
    if (l.startFrame - cut.startFrame <= relFrame) speaker = l.speaker;
  }
  return speaker;
};
