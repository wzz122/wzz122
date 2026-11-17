import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { CONFIG } from "./paths.ts";

export type PronunciationDict = { from: string; to: string }[];

/** 读 config/pronunciation.yaml：一层「词: 读法」映射。按词长从长到短排好，避免短词先替换把长词拆坏。 */
export function loadPronunciation(file = path.join(CONFIG, "pronunciation.yaml")): PronunciationDict {
  if (!existsSync(file)) return [];
  const data = YAML.parse(readFileSync(file, "utf8")) ?? {};
  if (typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`${file} 格式不对：应该是「词: 读法」一行一个`);
  }
  return Object.entries(data as Record<string, unknown>)
    .filter(([from, to]) => from && typeof to === "string" && to.trim())
    .map(([from, to]) => ({ from, to: (to as string).trim() }))
    .sort((a, b) => b.from.length - a.from.length);
}

/** 只替换配音文本，字幕不受影响 */
export function applyPronunciation(text: string, dict: PronunciationDict): string {
  let out = text;
  for (const { from, to } of dict) {
    if (out.includes(from)) out = out.split(from).join(to);
  }
  return out;
}
