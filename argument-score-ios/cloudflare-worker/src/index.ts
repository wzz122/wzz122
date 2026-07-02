import type {
  DebateMode,
  DebatePhase,
  Env,
  SessionConfig,
  Tone,
  TranscriptLine,
  TurnDigest,
} from "./types";
import {
  addDailySpend,
  asrCostJpy,
  dailyBudgetExceeded,
  llmCostJpy,
  loadPriceTable,
  round1,
  sessionBudgetJpy,
} from "./cost";
import { completeJSON, transcribe } from "./providers";
import {
  judgeSystem,
  judgeUser,
  phaseLabel,
  postmortemUser,
  truncateTranscript,
  turnExtractSystem,
  turnExtractUser,
} from "./prompts";
import { normalizeTurn, normalizeVerdict } from "./normalize";

const MAX_POSTMORTEM_SECONDS = 75 * 60;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (request.method === "GET" && url.pathname === "/health") {
        return json({ ok: true, provider: env.AI_PROVIDER ?? "openai", version: "2.0.0" });
      }
      if (!authorized(request, env)) return jsonError(401, "unauthorized");
      if (await dailyBudgetExceeded(env)) {
        return jsonError(503, "今日预算已用完，休战一天，明天再评");
      }

      if (request.method === "POST" && url.pathname === "/sessions") {
        return handleCreateSession(request);
      }
      const turnMatch = url.pathname.match(/^\/sessions\/([\w-]+)\/turns$/);
      if (request.method === "POST" && turnMatch) {
        return handleTurn(request, env);
      }
      const finalizeMatch = url.pathname.match(/^\/sessions\/([\w-]+)\/finalize$/);
      if (request.method === "POST" && finalizeMatch) {
        return handleFinalize(request, env);
      }
      if (request.method === "POST" && url.pathname === "/analyze") {
        return handleAnalyze(request, env);
      }
      return jsonError(404, "not found");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return jsonError(500, message);
    }
  },
} satisfies ExportedHandler<Env>;

function authorized(request: Request, env: Env): boolean {
  if (!env.ARGUMENT_API_TOKEN) return true; // 未配置令牌时视为开发环境
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${env.ARGUMENT_API_TOKEN}`;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function jsonError(status: number, message: string): Response {
  return json({ error: message }, status);
}

// —— POST /sessions ——
async function handleCreateSession(request: Request): Promise<Response> {
  const body: any = await request.json();
  const config = body?.config;
  if (!config?.mode || !Array.isArray(config?.participants)) {
    return jsonError(400, "invalid session config");
  }
  // v1 无状态：sessionId 仅用于日志聚合，状态由 iOS 持有
  return json({ sessionId: crypto.randomUUID() });
}

// —— POST /sessions/:id/turns ——
async function handleTurn(request: Request, env: Env): Promise<Response> {
  const form = await request.formData();
  const audio = form.get("audio") as unknown;
  const metaRaw = form.get("meta");
  if (!(audio instanceof File) || typeof metaRaw !== "string") {
    return jsonError(400, "audio file and meta field are required");
  }
  const meta: {
    speaker: string;
    phase: DebatePhase;
    roundIndex: number;
    speakerName: string;
    otherName: string;
    topic?: string;
    sessionCostJpy?: number;
  } = JSON.parse(metaRaw);

  const prices = loadPriceTable(env);
  const budget = sessionBudgetJpy(env);
  const spentSoFar = Number(meta.sessionCostJpy ?? 0);
  if (spentSoFar >= budget) {
    return jsonError(402, `本场预算 ¥${budget} 已用完，请直接生成终评`);
  }

  // 回合制核心省钱点：发言人已知，diarize=false 走便宜档转写
  const tr = await transcribe(env, audio, false);
  if (!tr.text.trim()) {
    return jsonError(422, "没听清这一段，请重新录一次");
  }

  const extraction = await completeJSON(env, {
    system: turnExtractSystem(),
    user: turnExtractUser({
      speakerName: meta.speakerName,
      otherName: meta.otherName,
      phase: meta.phase,
      roundIndex: meta.roundIndex,
      topic: meta.topic,
      transcript: tr.text,
    }),
    maxTokens: 1200,
  });

  const thisCall = round1(
    asrCostJpy(prices, tr.seconds, false) + llmCostJpy(prices, extraction.usage),
  );
  const sessionTotal = round1(spentSoFar + thisCall);
  await addDailySpend(env, thisCall);

  return json({
    analysis: normalizeTurn(extraction.value, tr.text),
    costMeter: {
      thisCallJpy: thisCall,
      sessionTotalJpy: sessionTotal,
      budgetWarning: sessionTotal >= budget * 0.8,
    },
  });
}

// —— POST /sessions/:id/finalize ——
async function handleFinalize(request: Request, env: Env): Promise<Response> {
  const body: any = await request.json();
  const config: SessionConfig | undefined = body?.config;
  const turns: TurnDigest[] = Array.isArray(body?.turns) ? body.turns : [];
  if (!config || turns.length === 0) {
    return jsonError(400, "config and non-empty turns are required");
  }

  const prices = loadPriceTable(env);
  const budget = sessionBudgetJpy(env);
  const spentSoFar = Number(body?.sessionCostJpy ?? 0);
  const aName = nameOf(config, "A");
  const bName = nameOf(config, "B");

  const turnsBlock = turns
    .map((t, i) => {
      const who = t.speaker === "A" ? `A(${aName})` : `B(${bName})`;
      const lines = [
        `#${i + 1} [${phaseLabel(t.phase)} 第${t.roundIndex + 1}轮] ${who}`,
        `摘要：${t.compactSummary}`,
      ];
      if (t.claims?.length) lines.push(`论点：${t.claims.join("；")}`);
      if (t.evidenceQuotes?.length) lines.push(`原话：${t.evidenceQuotes.join(" / ")}`);
      if (t.fallacies?.length) lines.push(`逻辑问题：${t.fallacies.join("；")}`);
      return lines.join("\n");
    })
    .join("\n\n");

  const judged = await completeJSON(env, {
    system: judgeSystem((config.tone ?? "gentle") as Tone),
    user: judgeUser({ mode: config.mode, topic: config.topic, aName, bName, turnsBlock }),
    maxTokens: 3000,
  });

  const thisCall = round1(llmCostJpy(prices, judged.usage));
  const sessionTotal = round1(spentSoFar + thisCall);
  await addDailySpend(env, thisCall);

  const report = normalizeVerdict(judged.value, config.mode as DebateMode);
  report.costMeter = {
    thisCallJpy: thisCall,
    sessionTotalJpy: sessionTotal,
    budgetWarning: sessionTotal >= budget * 0.8,
  };
  return json(report);
}

// —— POST /analyze（事后复盘：整段录音，需要 diarization） ——
async function handleAnalyze(request: Request, env: Env): Promise<Response> {
  const form = await request.formData();
  const audio = form.get("audio") as unknown;
  const metaRaw = form.get("meta");
  if (!(audio instanceof File)) return jsonError(400, "audio file is required");
  const meta: { aName?: string; bName?: string; tone?: Tone; topic?: string } =
    typeof metaRaw === "string" ? JSON.parse(metaRaw) : {};

  const estimatedSeconds = audio.size / 4000;
  if (estimatedSeconds > MAX_POSTMORTEM_SECONDS) {
    return jsonError(413, "录音太长（上限 75 分钟），请剪辑后再导入");
  }

  const prices = loadPriceTable(env);
  const budget = sessionBudgetJpy(env);
  const tr = await transcribe(env, audio, true);
  if (!tr.text.trim()) return jsonError(422, "没有识别到有效对话内容");

  // speaker 按首次出现顺序映射为 A/B；App 端有确认/互换页兜底
  const speakerMap = new Map<string, "A" | "B">();
  const transcriptLines: TranscriptLine[] = tr.segments.map((seg) => {
    const key = seg.speaker ?? "S1";
    if (!speakerMap.has(key)) {
      speakerMap.set(key, speakerMap.size === 0 ? "A" : "B");
    }
    return { speaker: speakerMap.get(key) ?? "A", text: seg.text.trim() };
  });
  const transcriptBlock = truncateTranscript(
    transcriptLines.length > 0
      ? transcriptLines.map((l) => `${l.speaker}: ${l.text}`).join("\n")
      : tr.text,
  );

  const aName = meta.aName || "男方";
  const bName = meta.bName || "女方";
  const judged = await completeJSON(env, {
    system: judgeSystem(meta.tone ?? "gentle"),
    user: postmortemUser({ topic: meta.topic, aName, bName, transcriptBlock }),
    maxTokens: 3000,
  });

  const thisCall = round1(
    asrCostJpy(prices, tr.seconds, true) + llmCostJpy(prices, judged.usage),
  );
  await addDailySpend(env, thisCall);

  const report = normalizeVerdict(judged.value, "postmortem");
  report.transcriptLines = transcriptLines.filter((l) => l.text.length > 0);
  report.costMeter = {
    thisCallJpy: thisCall,
    sessionTotalJpy: thisCall,
    budgetWarning: thisCall >= budget * 0.8,
  };
  return json(report);
}

function nameOf(config: SessionConfig, id: "A" | "B"): string {
  return (
    config.participants.find((p) => p.id === id)?.displayName ??
    (id === "A" ? "男方" : "女方")
  );
}
