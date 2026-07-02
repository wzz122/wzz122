export type ParticipantID = "A" | "B";
export type DebateMode = "quick" | "rounds" | "postmortem";
export type DebatePhase = "context" | "opening" | "rebuttal" | "summary";
export type Tone = "roast" | "gentle";

export interface Env {
  ARGUMENT_API_TOKEN?: string;
  AI_PROVIDER?: string;

  OPENAI_API_KEY?: string;
  OPENAI_ANALYSIS_MODEL?: string;
  OPENAI_TRANSCRIPTION_MODEL?: string;
  OPENAI_TRANSCRIPTION_DIARIZE_MODEL?: string;
  OPENAI_PROXY_BASE_URL?: string;

  GEMINI_API_KEY?: string;
  GEMINI_ANALYSIS_MODEL?: string;
  GEMINI_PROXY_BASE_URL?: string;

  PRICE_TABLE_JSON?: string;
  SESSION_BUDGET_JPY?: string;
  DAILY_BUDGET_JPY?: string;
  BUDGET_KV?: KVNamespace;
}

export interface Participant {
  id: ParticipantID;
  displayName: string;
}

export interface SessionConfig {
  mode: DebateMode;
  topic?: string;
  tone?: Tone;
  participants: Participant[];
}

export interface TurnAnalysis {
  transcript: string;
  stance: string;
  claims: string[];
  evidenceQuotes: string[];
  emotionalCues: string[];
  fallacies: string[];
  compactSummary: string;
  roundTake: string;
}

export interface TurnDigest extends TurnAnalysis {
  speaker: ParticipantID;
  phase: DebatePhase;
  roundIndex: number;
}

export interface CostMeter {
  thisCallJpy: number;
  sessionTotalJpy: number;
  budgetWarning: boolean;
}

export interface TranscriptLine {
  speaker: string;
  text: string;
}

export interface VerdictReport {
  mode: DebateMode;
  coreIssue: string;
  overallScore: number;
  responsibility: { aShare: number; note: string };
  sides: Array<{
    participant: string;
    bestPoint: string;
    blindSpot: string;
    expressionScore: number;
  }>;
  mvp: { participant: string; reason: string };
  goldenQuote: string;
  evidenceQuotes: Array<{ participant: string; quote: string; context?: string }>;
  radar: Array<{ dimension: string; score: number }>;
  roundNotes?: Array<{
    roundIndex: number;
    phase: string;
    note: string;
    sharperSide?: string;
  }>;
  repairActions: string[];
  missingSentence: string;
  finalRemark: string;
  disclaimer: string;
  transcriptLines?: TranscriptLine[];
  costMeter?: CostMeter;
}

export const DISCLAIMER =
  "沟通责任估计，不代表事实裁决 · 评分用于复盘和娱乐 · AI 仅基于双方陈述，不代表全部事实";

export const RADAR_DIMENSIONS = [
  "争点清晰度",
  "证据密度",
  "倾听程度",
  "情绪热度",
  "逻辑漏洞",
  "修复空间",
];
