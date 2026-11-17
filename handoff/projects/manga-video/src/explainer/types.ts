// 图解模板的时间轴（由 pipeline/build-explainer.mjs 生成，单位：帧）
export type Run = { t: string; em: boolean };

export type VisualTL = {
  id: string;
  type: string;
  data: any;
  overlay: boolean;
  from: number;
  to: number;
  steps: number[];
};

export type LineTL = {
  speaker: string;
  expression: string;
  from: number;
  to: number;
  mouth: string; // 每帧一个 0–9
  pointAt: number[];
};

export type CharacterInfo = { name: string; color: string; placeholder: Record<string, any> };

export type Timeline = {
  id: string;
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  title: string;
  audio: string | null;
  assets: string[];
  characters: Record<string, CharacterInfo>;
  segments: { chapter: string; label: string | null; from: number; to: number }[];
  visuals: VisualTL[];
  lines: LineTL[];
  subtitles: { speaker: string; from: number; to: number; runs: Run[] }[];
};

export type DiagramProps = { v: VisualTL; frame: number; assets: string[]; lines: LineTL[]; characters: Record<string, CharacterInfo> };
