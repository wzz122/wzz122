// LLM 输出的服务端兜底归一化：保证返回给 iOS 的 JSON 一定能被 Codable 解码。
import type { DebateMode, TurnAnalysis, VerdictReport } from "./types";
import { DISCLAIMER, RADAR_DIMENSIONS } from "./types";

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function strArray(v: unknown, max = 6): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === "string").slice(0, max);
}

function score(v: unknown, fallback = 50): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, n));
}

function side(v: unknown): "A" | "B" {
  return v === "B" ? "B" : "A";
}

export function normalizeTurn(raw: any, fallbackTranscript: string): TurnAnalysis {
  return {
    transcript: str(raw?.transcript, fallbackTranscript),
    stance: str(raw?.stance),
    claims: strArray(raw?.claims, 3),
    evidenceQuotes: strArray(raw?.evidenceQuotes, 2),
    emotionalCues: strArray(raw?.emotionalCues, 2),
    fallacies: strArray(raw?.fallacies, 2),
    compactSummary: str(raw?.compactSummary, fallbackTranscript.slice(0, 60)),
    roundTake: str(raw?.roundTake),
  };
}

export function normalizeVerdict(raw: any, mode: DebateMode): VerdictReport {
  const sidesRaw = Array.isArray(raw?.sides) ? raw.sides : [];
  const sides = (["A", "B"] as const).map((id) => {
    const found = sidesRaw.find((s: any) => side(s?.participant) === id) ?? {};
    return {
      participant: id,
      bestPoint: str(found?.bestPoint, "（未提炼出明确论点）"),
      blindSpot: str(found?.blindSpot, "（无明显盲区）"),
      expressionScore: score(found?.expressionScore),
    };
  });

  const radarRaw = Array.isArray(raw?.radar) ? raw.radar : [];
  const radar = RADAR_DIMENSIONS.map((dimension) => {
    const found = radarRaw.find((r: any) => str(r?.dimension) === dimension);
    return { dimension, score: score(found?.score) };
  });

  const notesRaw = Array.isArray(raw?.roundNotes) ? raw.roundNotes : [];
  const roundNotes = notesRaw
    .map((n: any) => ({
      roundIndex: Number.isFinite(Number(n?.roundIndex)) ? Number(n.roundIndex) : 0,
      phase: str(n?.phase, "opening"),
      note: str(n?.note),
      sharperSide: n?.sharperSide === "A" || n?.sharperSide === "B" ? n.sharperSide : undefined,
    }))
    .filter((n: { note: string }) => n.note.length > 0)
    .slice(0, 12);

  const quotesRaw = Array.isArray(raw?.evidenceQuotes) ? raw.evidenceQuotes : [];
  const evidenceQuotes = quotesRaw
    .map((q: any) => ({
      participant: side(q?.participant),
      quote: str(q?.quote),
      context: str(q?.context) || undefined,
    }))
    .filter((q: { quote: string }) => q.quote.length > 0)
    .slice(0, 4);

  return {
    mode,
    coreIssue: str(raw?.coreIssue, "双方对同一件事的期待没有对齐"),
    overallScore: score(raw?.overallScore, 60),
    responsibility: {
      aShare: score(raw?.responsibility?.aShare, 50),
      note: str(raw?.responsibility?.note),
    },
    sides,
    mvp: { participant: side(raw?.mvp?.participant), reason: str(raw?.mvp?.reason) },
    goldenQuote: str(raw?.goldenQuote),
    evidenceQuotes,
    radar,
    roundNotes,
    repairActions: strArray(raw?.repairActions, 4),
    missingSentence: str(raw?.missingSentence),
    finalRemark: str(raw?.finalRemark),
    disclaimer: DISCLAIMER,
  };
}
