import { existsSync } from "node:fs";
import path from "node:path";
import type { StoryCut, StoryLine, Storyboard } from "../../src/manga/types.ts";
import { CONFIG, readJson, storyboardPath } from "./paths.ts";
import type { VoiceConfig } from "./tts.ts";

export type CharacterConfig = {
  name: string;
  color: string;
  defaultExpression: string;
  expressions: Record<string, string>;
  voice: VoiceConfig;
  placeholder?: Record<string, unknown>;
};

export function loadCharacters(): Record<string, CharacterConfig> {
  const data = readJson<{ characters: Record<string, CharacterConfig> }>(path.join(CONFIG, "characters.json"));
  return data.characters;
}

export function loadStoryboard(episode: string): Storyboard {
  const file = storyboardPath(episode);
  if (!existsSync(file)) throw new Error(`找不到分镜：${file}`);
  return readJson<Storyboard>(file);
}

export const lineId = (cut: StoryCut, i: number) => `${cut.id}-L${i + 1}`;

const ENUMS = {
  position: ["left", "center", "right"],
  camera: ["static", "zoomIn", "zoomOut", "panLeft", "panRight"],
  enter: ["none", "slideIn", "pop"],
  appear: ["none", "pop", "fade", "slideUp"],
  fx: ["sweat", "exclaim", "question", "angry", "sparkle", "shake"],
  transition: ["cut", "fade", "slide"],
  shot: ["wide", "closeUp"],
  lang: ["zh", "ja"],
  kind: ["say", "thought"],
};

/** 检查分镜，返回 { errors, warnings }。errors 非空时流水线停下。 */
export function validateStoryboard(sb: Storyboard, chars: Record<string, CharacterConfig>) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const bad = (where: string, msg: string) => errors.push(`${where}：${msg}`);
  const oneOf = (where: string, value: unknown, list: string[]) => {
    if (value !== undefined && !list.includes(value as string)) bad(where, `「${value}」不认识，只能是 ${list.join(" / ")}`);
  };

  if (!sb.episode?.id) bad("episode.id", "必填");
  if (!Array.isArray(sb.cuts) || sb.cuts.length === 0) bad("cuts", "至少要有一个镜头");
  const seen = new Set<string>();

  (sb.cuts ?? []).forEach((cut, ci) => {
    const at = `cuts[${ci}]（${cut.id ?? "?"}）`;
    if (!cut.id) bad(at, "缺少 id");
    else if (seen.has(cut.id)) bad(at, `id「${cut.id}」重复`);
    seen.add(cut.id);
    oneOf(`${at}.shot`, cut.shot, ENUMS.shot);
    oneOf(`${at}.camera.type`, cut.camera?.type, ENUMS.camera);
    oneOf(`${at}.camera.focus`, cut.camera?.focus, ENUMS.position);
    const tr = typeof cut.transition === "string" ? cut.transition : cut.transition?.type;
    oneOf(`${at}.transition`, tr, ENUMS.transition);
    if (!cut.lines?.length && !cut.titleCard && !cut.duration) {
      warnings.push(`${at}：没有台词也没写 duration，默认停 2 秒`);
    }
    const onStage = new Set((cut.characters ?? []).map((c) => c.id));
    (cut.characters ?? []).forEach((c, i) => {
      const w = `${at}.characters[${i}]`;
      if (!chars[c.id]) bad(w, `角色「${c.id}」不在 config/characters.json 里`);
      else if (c.expression && !chars[c.id].expressions[c.expression]) {
        warnings.push(`${w}：表情「${c.expression}」没在 characters.json 的 expressions 里登记`);
      }
      oneOf(`${w}.position`, c.position, ENUMS.position);
      oneOf(`${w}.enter`, c.enter, ENUMS.enter);
      checkTiming(w, c, cut, bad);
    });
    (cut.props ?? []).forEach((p, i) => {
      const w = `${at}.props[${i}]`;
      if (!p.image) bad(w, "缺少 image");
      oneOf(`${w}.position`, p.position, ENUMS.position);
      oneOf(`${w}.appear`, p.appear, ENUMS.appear);
      checkTiming(w, p, cut, bad);
    });
    (cut.sfx ?? []).forEach((s, i) => {
      if (!s.file) bad(`${at}.sfx[${i}]`, "缺少 file");
      checkTiming(`${at}.sfx[${i}]`, s, cut, bad);
    });
    (cut.lines ?? []).forEach((l: StoryLine, i) => {
      const w = `${at}.lines[${i}]`;
      if (!l.text?.trim()) bad(w, "text 不能为空");
      if (!chars[l.speaker]) bad(w, `说话人「${l.speaker}」不在 config/characters.json 里`);
      else {
        if (!onStage.has(l.speaker)) warnings.push(`${w}：${chars[l.speaker].name} 在说话，但不在这个镜头的 characters 里（画外音）`);
        if (l.expression && !chars[l.speaker].expressions[l.expression]) {
          warnings.push(`${w}：表情「${l.expression}」没在 characters.json 的 expressions 里登记`);
        }
      }
      oneOf(`${w}.lang`, l.lang, ENUMS.lang);
      oneOf(`${w}.kind`, l.kind, ENUMS.kind);
      for (const fx of l.fx === undefined ? [] : Array.isArray(l.fx) ? l.fx : [l.fx]) oneOf(`${w}.fx`, fx, ENUMS.fx);
      if (l.lang === "ja" && !l.subtitleZh) warnings.push(`${w}：日语台词没有 subtitleZh（中文字幕）`);
    });
  });
  return { errors, warnings };
}

function checkTiming(where: string, t: { atLine?: number; atText?: string }, cut: StoryCut, bad: (w: string, m: string) => void) {
  const n = cut.lines?.length ?? 0;
  if (t.atLine !== undefined && (t.atLine < 0 || t.atLine >= n)) bad(where, `atLine=${t.atLine} 超出范围（这个镜头只有 ${n} 句）`);
  if (t.atText && !(cut.lines ?? []).some((l) => l.text.includes(t.atText!))) bad(where, `atText「${t.atText}」在本镜头台词里找不到`);
}

export function reportValidation(result: { errors: string[]; warnings: string[] }): void {
  for (const w of result.warnings) console.warn(`  提醒  ${w}`);
  if (result.errors.length) {
    for (const e of result.errors) console.error(`  错误  ${e}`);
    throw new Error(`分镜有 ${result.errors.length} 处错误，先改好再跑`);
  }
}
