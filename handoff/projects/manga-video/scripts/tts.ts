// npm run tts [-- --episode pilot] [--force] [--only c03-L1,c05-L1] [--dry-run]
// 逐句合成配音：发音词典 → MiniMax（或 Mac 自带语音占位）→ audio/{hash}.mp3
// 写出 build/<episode>/tts.json，记录每句用的是哪个音频文件。
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { applyPronunciation, loadPronunciation } from "./lib/pronunciation.ts";
import { BUILD, episodeArg, ROOT } from "./lib/paths.ts";
import { lineId, loadCharacters, loadStoryboard, reportValidation, validateStoryboard } from "./lib/storyboard.ts";
import { chooseProvider, MINIMAX_MODEL_DEFAULT, synthLine, ttsHash } from "./lib/tts.ts";
import { env } from "./lib/env.ts";

const argv = process.argv.slice(2);
const episode = episodeArg(argv);
const force = argv.includes("--force");
const dryRun = argv.includes("--dry-run");
const onlyArg = argv[argv.indexOf("--only") + 1];
const only = argv.includes("--only") && onlyArg ? new Set(onlyArg.split(",")) : null;

const sb = loadStoryboard(episode);
const chars = loadCharacters();
reportValidation(validateStoryboard(sb, chars));
const dict = loadPronunciation();
const provider = chooseProvider();

console.log(`配音：${episode}，引擎 ${provider === "minimax" ? `MiniMax ${env("MINIMAX_TTS_MODEL", MINIMAX_MODEL_DEFAULT)}` : "Mac 自带语音（占位，没有 MINIMAX_API_KEY）"}`);

type Entry = { file: string; hash: string; provider: string; voiceId: string; speaker: string; lang: string; text: string; ttsText: string };
const manifest: Record<string, Entry> = {};
let made = 0;
let reused = 0;
let chars2 = 0;
const failures: string[] = [];

for (const cut of sb.cuts) {
  for (const [i, line] of (cut.lines ?? []).entries()) {
    const id = lineId(cut, i);
    const ch = chars[line.speaker];
    const lang = line.lang ?? "zh";
    const ttsText = applyPronunciation((line.ttsText ?? line.text).trim(), dict);
    const req = { label: id, text: ttsText, lang, voice: ch.voice, emotion: line.emotion };
    chars2 += [...ttsText].length;
    const placeholderVoice = provider === "minimax" && (ch.voice.minimax as any)?.voiceIdIsPlaceholder;
    if (dryRun || (only && !only.has(id))) {
      const hash = ttsHash(provider, req);
      manifest[id] = { file: `audio/${hash}.mp3`, hash, provider, voiceId: "", speaker: line.speaker, lang, text: line.text, ttsText };
      if (dryRun) console.log(`  ${id}  ${ch.name}  [${lang}]  ${ttsText}`);
      continue;
    }
    try {
      const r = await synthLine(req, provider, force);
      manifest[id] = {
        file: path.relative(ROOT, r.file),
        hash: r.hash,
        provider: r.provider,
        voiceId: r.voiceId,
        speaker: line.speaker,
        lang,
        text: line.text,
        ttsText,
      };
      if (r.cached) reused++;
      else made++;
      console.log(`  ${r.cached ? "沿用" : "新配"}  ${id}  ${ch.name}${placeholderVoice ? "（系统音色占位）" : ""}  ${ttsText}`);
    } catch (e) {
      failures.push(id);
      console.error(`  失败  ${id}  ${ch.name}：「${ttsText}」\n        ${(e as Error).message}`);
    }
  }
}

if (dryRun) {
  console.log(`\n共 ${Object.keys(manifest).length} 句、${chars2} 个字。--dry-run 不合成。`);
  process.exit(0);
}

const outDir = path.join(BUILD, episode);
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, "tts.json"), JSON.stringify({ episode, provider, lines: manifest }, null, 2));
console.log(`\n新配 ${made} 句，沿用缓存 ${reused} 句，共 ${chars2} 字 → build/${episode}/tts.json`);
if (failures.length) {
  console.error(`有 ${failures.length} 句失败：${failures.join(", ")}。修好后再跑 npm run tts（成功的句子会沿用缓存）。`);
  process.exit(1);
}
