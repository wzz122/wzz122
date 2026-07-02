import type { Env } from "./types";

const OPENAI_DEFAULT_BASE = "https://api.openai.com/v1/";
const GEMINI_DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta/openai/";

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface JSONCompletion {
  value: any;
  usage: LLMUsage;
}

export interface TranscriptionResult {
  text: string;
  segments: Array<{ speaker?: string; text: string }>;
  seconds: number;
}

function joinURL(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function resolveAnalysis(env: Env): { baseURL: string; apiKey: string; model: string } {
  const provider = (env.AI_PROVIDER ?? "openai").toLowerCase();
  if (provider === "gemini") {
    if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");
    return {
      baseURL: env.GEMINI_PROXY_BASE_URL || GEMINI_DEFAULT_BASE,
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_ANALYSIS_MODEL || "gemini-3.5-flash",
    };
  }
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");
  return {
    baseURL: env.OPENAI_PROXY_BASE_URL || OPENAI_DEFAULT_BASE,
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_ANALYSIS_MODEL || "gpt-5-mini",
  };
}

// 分析层：OpenAI-compatible chat/completions，OpenAI 和 Gemini 一份实现通吃。
export async function completeJSON(
  env: Env,
  opts: { system: string; user: string; maxTokens?: number },
): Promise<JSONCompletion> {
  const { baseURL, apiKey, model } = resolveAnalysis(env);
  const resp = await fetch(joinURL(baseURL, "chat/completions"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      response_format: { type: "json_object" },
      max_tokens: opts.maxTokens ?? 3000,
    }),
  });
  if (!resp.ok) {
    const detail = await resp.text();
    throw new Error(`analysis upstream ${resp.status}: ${detail.slice(0, 300)}`);
  }
  const data: any = await resp.json();
  const content: string = data?.choices?.[0]?.message?.content ?? "";
  const usage: LLMUsage = {
    promptTokens: Number(data?.usage?.prompt_tokens ?? Math.ceil((opts.system.length + opts.user.length) / 3)),
    completionTokens: Number(data?.usage?.completion_tokens ?? Math.ceil(content.length / 3)),
  };
  return { value: parseJSONContent(content), usage };
}

function parseJSONContent(content: string): any {
  const stripped = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(stripped);
  } catch {
    // 宽容解析：截取第一个 { 到最后一个 }
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(stripped.slice(start, end + 1));
    throw new Error("model did not return valid JSON");
  }
}

// 转写层：始终走 OpenAI（diarization 是产品可信度核心）。
// 回合制模式发言人已知 → diarize=false 走便宜档，这是全项目最大的省钱开关。
export async function transcribe(
  env: Env,
  audio: File,
  diarize: boolean,
): Promise<TranscriptionResult> {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");
  const baseURL = env.OPENAI_PROXY_BASE_URL || OPENAI_DEFAULT_BASE;
  const model = diarize
    ? env.OPENAI_TRANSCRIPTION_DIARIZE_MODEL || "gpt-4o-transcribe-diarize"
    : env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe";

  const form = new FormData();
  form.append("file", audio, audio.name || "audio.m4a");
  form.append("model", model);
  form.append("response_format", "json");

  const resp = await fetch(joinURL(baseURL, "audio/transcriptions"), {
    method: "POST",
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: form,
  });
  if (!resp.ok) {
    const detail = await resp.text();
    throw new Error(`transcription upstream ${resp.status}: ${detail.slice(0, 300)}`);
  }
  const data: any = await resp.json();
  const segments = Array.isArray(data?.segments)
    ? data.segments.map((s: any) => ({
        speaker: typeof s?.speaker === "string" ? s.speaker : undefined,
        text: String(s?.text ?? ""),
      }))
    : [];
  const text: string =
    typeof data?.text === "string" && data.text.length > 0
      ? data.text
      : segments.map((s: { text: string }) => s.text).join(" ");
  // 计费秒数：优先上游 duration，缺失时按 32kbps AAC ≈ 4000 B/s 估算
  const seconds =
    Number.isFinite(Number(data?.duration)) && Number(data?.duration) > 0
      ? Number(data.duration)
      : audio.size / 4000;
  return { text, segments, seconds };
}
