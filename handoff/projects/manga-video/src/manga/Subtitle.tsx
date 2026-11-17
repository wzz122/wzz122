import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { fontStack } from "./fonts";
import type { PlanCharacterDef, PlanLine } from "./types";

const stroke = (px: number, color = "#2A211B"): React.CSSProperties => ({
  WebkitTextStroke: `${px}px ${color}`,
  paintOrder: "stroke fill",
});

/** 底部大字幕：前面用角色颜色的名牌标出说话人；日语台词下面加中文字幕 */
export const Subtitle: React.FC<{ lines: PlanLine[]; characters: Record<string, PlanCharacterDef> }> = ({
  lines,
  characters,
}) => {
  const frame = useCurrentFrame();
  let line: PlanLine | undefined;
  let chunk: PlanLine["chunks"][number] | undefined;
  for (const l of lines) {
    const c = l.chunks.find((k) => frame >= k.startFrame && frame < k.endFrame);
    if (c) {
      line = l;
      chunk = c;
    }
  }
  if (!line || !chunk) return null;
  const def = characters[line.speaker];
  const since = frame - chunk.startFrame;
  const appear = interpolate(since, [0, 4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const thought = line.kind === "thought";
  const text = thought ? `（${chunk.text}）` : chunk.text;
  const zh = line.lang === "ja" ? line.subtitleZh : null;

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: 330,
        background: "linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,0.38))",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: zh ? 34 : 54,
        opacity: appear,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 22, maxWidth: 1760, translate: `0 ${(1 - appear) * 10}px` }}>
        <div
          style={{
            flexShrink: 0,
            fontFamily: fontStack("zh"),
            fontWeight: 900,
            fontSize: 38,
            color: "#FFFFFF",
            background: def.color,
            border: `5px ${thought ? "dashed" : "solid"} #2A211B`,
            borderRadius: 999,
            padding: "6px 26px 8px",
            ...stroke(6),
          }}
        >
          {def.name}
          {thought ? "（心声）" : ""}
        </div>
        <div
          style={{
            fontFamily: fontStack(line.lang),
            fontWeight: 900,
            fontSize: line.lang === "ja" ? 60 : 66,
            lineHeight: 1.25,
            color: thought ? "#D9ECFF" : "#FFFFFF",
            letterSpacing: 1,
            ...stroke(14),
          }}
        >
          {text}
        </div>
      </div>
      {zh ? (
        <div
          style={{
            marginTop: 8,
            fontFamily: fontStack("zh"),
            fontWeight: 800,
            fontSize: 50,
            color: "#FFE36E",
            ...stroke(12),
          }}
        >
          {zh}
        </div>
      ) : null}
    </div>
  );
};
