// 分镜（人写的 storyboard.json）和渲染计划（analyze 生成的 timeline.json）的类型。
// scripts/ 和 src/ 共用这一份。字段含义见 docs/storyboard-schema.md。

export type Lang = "zh" | "ja";
export type Position = "left" | "center" | "right";
export type CameraType = "static" | "zoomIn" | "zoomOut" | "panLeft" | "panRight";
export type EnterType = "none" | "slideIn" | "pop";
export type AppearType = "none" | "pop" | "fade" | "slideUp";
export type FxType = "sweat" | "exclaim" | "question" | "angry" | "sparkle" | "shake";
export type TransitionType = "cut" | "fade" | "slide";
export type Shot = "wide" | "closeUp";

// ---------- storyboard.json ----------

/** 出现时机：at = 本镜头开始后第几秒；atLine = 本镜头第几句台词开始时（从 0 数）；
 *  atText = 台词里出现这几个字时（按字数比例估算）；offset = 再往后挪几秒。 */
export type Timing = {
  at?: number;
  atLine?: number;
  atText?: string;
  offset?: number;
};

export type StoryLine = {
  speaker: string;
  text: string;
  ttsText?: string;
  lang?: Lang;
  subtitleZh?: string;
  kind?: "say" | "thought";
  fx?: FxType | FxType[];
  expression?: string;
  emotion?: string;
  pauseAfter?: number;
};

export type StoryCharacter = {
  id: string;
  expression?: string;
  position?: Position;
  x?: number;
  enter?: EnterType;
  flip?: boolean;
} & Timing;

export type StoryProp = {
  image: string;
  position?: Position;
  x?: number;
  y?: number;
  size?: number;
  appear?: AppearType;
} & Timing;

export type StorySfx = {
  file: string;
  volume?: number;
} & Timing;

export type StoryCut = {
  id: string;
  note?: string;
  background?: string;
  shot?: Shot;
  camera?: { type?: CameraType; strength?: number; focus?: Position };
  characters?: StoryCharacter[];
  props?: StoryProp[];
  lines?: StoryLine[];
  sfx?: StorySfx[];
  transition?: TransitionType | { type: TransitionType; duration?: number };
  titleCard?: { text: string; sub?: string; animation?: "pop" | "none"; color?: string };
  duration?: number;
  leadIn?: number;
  tail?: number;
};

export type StoryBgm = {
  file: string;
  fromCut?: string;
  toCut?: string;
  volume?: number;
  duckVolume?: number;
};

export type Storyboard = {
  schemaVersion?: number;
  episode: {
    id: string;
    title: string;
    width?: number;
    height?: number;
    fps?: number;
    defaultPause?: number;
    bgm?: StoryBgm[];
  };
  cuts: StoryCut[];
};

// ---------- timeline.json（渲染计划，全部用帧） ----------

export type FrameRange = [number, number];

export type CharacterImages = {
  closed: string;
  open: string | null;
  blink: string | null;
};

export type PlanCharacterDef = {
  id: string;
  name: string;
  color: string;
  images: Record<string, CharacterImages>;
};

export type PlanSubtitleChunk = {
  text: string;
  zh: string | null;
  startFrame: number;
  endFrame: number;
};

export type PlanLine = {
  id: string;
  cutId: string;
  speaker: string;
  kind: "say" | "thought";
  lang: Lang;
  text: string;
  subtitleZh: string | null;
  /** 绝对帧（整期从 0 开始） */
  startFrame: number;
  endFrame: number;
  /** 字幕显示到哪一帧（可能比音频长一点） */
  displayEndFrame: number;
  audio: string;
  durationSec: number;
  /** 张嘴区间，相对这一句开头的帧，左闭右开 */
  mouth: FrameRange[];
  chunks: PlanSubtitleChunk[];
};

export type PlanCutCharacter = {
  id: string;
  x: number;
  flip: boolean;
  enter: EnterType;
  /** 以下帧都相对本镜头开头 */
  enterFrame: number;
  expressions: { frame: number; expression: string }[];
};

export type PlanProp = {
  image: string;
  x: number;
  y: number;
  size: number;
  appear: AppearType;
  frame: number;
};

export type PlanFx = {
  type: FxType;
  frame: number;
  /** 持续几帧 */
  duration: number;
  target: string | null;
};

export type PlanCut = {
  id: string;
  index: number;
  startFrame: number;
  endFrame: number;
  background: string | null;
  shot: Shot;
  camera: { type: CameraType; strength: number; focus: Position };
  transitionIn: { type: TransitionType; frames: number };
  characters: PlanCutCharacter[];
  props: PlanProp[];
  fx: PlanFx[];
  lineIds: string[];
  titleCard: { text: string; sub: string | null; animation: "pop" | "none"; color: string } | null;
};

export type PlanSfx = { src: string; frame: number; volume: number; reason: string };

export type PlanBgm = {
  src: string;
  startFrame: number;
  endFrame: number;
  /** 音乐文件本身有几帧长；不够长时按这个长度一段接一段铺满 */
  loopFrames: number;
  volume: number;
  duckVolume: number;
};

export type Plan = {
  version: 1;
  generatedAt: string;
  episode: { id: string; title: string; width: number; height: number; fps: number; durationInFrames: number };
  characters: Record<string, PlanCharacterDef>;
  cuts: PlanCut[];
  lines: PlanLine[];
  sfx: PlanSfx[];
  bgm: PlanBgm[];
  /** 有人说话的区间（绝对帧），给背景音乐压低用 */
  speech: FrameRange[];
};
