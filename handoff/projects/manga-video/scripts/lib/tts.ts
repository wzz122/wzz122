import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Lang } from "../../src/manga/types.ts";
import { runFfmpeg } from "./audio.ts";
import { env } from "./env.ts";
import { apiKey, post } from "./minimax.ts";
import { AUDIO } from "./paths.ts";

export type MiniMaxVoice = { voiceId: string; speed?: number; pitch?: number; vol?: number; emotion?: string };
export type SayVoice = { voice: string; rate?: number; pitchShift?: number };
export type VoiceConfig = { minimax?: MiniMaxVoice; say?: SayVoice };

export type Provider = "minimax" | "say";

export type TtsRequest = {
  /** 用来报错，例如 c03-L1 */
  label: string;
  /** 已经过发音词典处理的最终文本 */
  text: string;
  lang: Lang;
  voice: VoiceConfig;
  emotion?: string;
};

export type TtsResult = { file: string; hash: string; provider: Provider; cached: boolean; voiceId: string };

export const MINIMAX_MODEL_DEFAULT = "speech-2.8-hd";

/** TTS_PROVIDER=minimax|say|auto（默认 auto：有 MINIMAX_API_KEY 就用 MiniMax，没有就用 Mac 自带语音占位） */
export function chooseProvider(): Provider {
  const p = (env("TTS_PROVIDER", "auto") ?? "auto").toLowerCase();
  if (p === "minimax" || p === "say") return p;
  if (p !== "auto") throw new Error(`TTS_PROVIDER 只能是 minimax / say / auto，现在是 ${p}`);
  return apiKey() ? "minimax" : "say";
}

const KANA = /[぀-ヿ]/;

function minimaxBody(req: TtsRequest) {
  const v = req.voice.minimax;
  if (!v?.voiceId) throw new Error(`${req.label}：这个角色没有填 voice.minimax.voiceId（config/characters.json）`);
  // 中文台词里夹了假名（发音词典替换出来的日语词）时，让模型自己判断语言
  const languageBoost = req.lang === "ja" ? "Japanese" : KANA.test(req.text) ? "auto" : "Chinese";
  const voiceSetting: Record<string, unknown> = {
    voice_id: v.voiceId,
    speed: v.speed ?? 1,
    vol: v.vol ?? 1,
    pitch: Math.round(v.pitch ?? 0),
  };
  const emotion = req.emotion ?? v.emotion;
  if (emotion) voiceSetting.emotion = emotion;
  return {
    model: env("MINIMAX_TTS_MODEL", MINIMAX_MODEL_DEFAULT),
    text: req.text,
    stream: false,
    language_boost: languageBoost,
    output_format: "hex",
    voice_setting: voiceSetting,
    audio_setting: { sample_rate: 32000, bitrate: 128000, format: "mp3", channel: 1 },
  };
}

function sayParams(req: TtsRequest) {
  const s = req.voice.say ?? { voice: req.lang === "ja" ? "Kyoko" : "Tingting" };
  return { voice: s.voice, rate: s.rate ?? 190, pitchShift: s.pitchShift ?? 1, text: req.text };
}

/** 缓存键：文本 + 音色 + 模型 + 所有参数。改了哪句就只有哪句的 hash 变。 */
export function ttsHash(provider: Provider, req: TtsRequest): string {
  const params = provider === "minimax" ? minimaxBody(req) : sayParams(req);
  return createHash("sha256").update(JSON.stringify({ v: 1, provider, params })).digest("hex").slice(0, 16);
}

export async function synthLine(req: TtsRequest, provider = chooseProvider(), force = false): Promise<TtsResult> {
  mkdirSync(AUDIO, { recursive: true });
  const hash = ttsHash(provider, req);
  const file = path.join(AUDIO, `${hash}.mp3`);
  const voiceId = provider === "minimax" ? req.voice.minimax?.voiceId ?? "" : `say:${sayParams(req).voice}`;
  if (!force && existsSync(file)) return { file, hash, provider, cached: true, voiceId };

  const tmp = `${file}.part`;
  if (provider === "minimax") {
    const resp = await post("/v1/t2a_v2", minimaxBody(req), { label: req.label });
    const hex: string | undefined = resp?.data?.audio;
    if (!hex) throw new Error(`${req.label}：返回里没有音频（trace_id=${resp?.trace_id ?? "-"}）`);
    writeFileSync(tmp, Buffer.from(hex, "hex"));
  } else {
    const p = sayParams(req);
    const aiff = path.join(os.tmpdir(), `manga-say-${hash}.aiff`);
    // say -o 只写文件，不会从扬声器出声
    const r = spawnSync("say", ["-v", p.voice, "-r", String(p.rate), "-o", aiff, p.text], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(`${req.label}：say 失败 ${r.stderr}`);
    // 变调不变速：把声音压低一点，区分角色
    const f = p.pitchShift;
    const filter = f === 1 ? "anull" : `asetrate=22050*${f},aresample=44100,atempo=${(1 / f).toFixed(5)}`;
    runFfmpeg(["-i", aiff, "-af", filter, "-ar", "44100", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "128k", "-f", "mp3", tmp]);
    rmSync(aiff, { force: true });
  }
  renameSync(tmp, file);
  return { file, hash, provider, cached: false, voiceId };
}
