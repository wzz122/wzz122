import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const ASSETS = path.join(ROOT, "assets");
export const AUDIO = path.join(ROOT, "audio");
export const BUILD = path.join(ROOT, "build");
export const OUT = path.join(ROOT, "out");
export const CONFIG = path.join(ROOT, "config");
export const EPISODES = path.join(ROOT, "episodes");

/** Remotion 读文件用的前缀：public/manga/{assets,audio,build} 是指向根目录的符号链接 */
export const PUBLIC_PREFIX = "manga";

export const AUDIO_EXTS = [".mp3", ".wav", ".m4a", ".ogg", ".aac"];
export const IMAGE_EXTS = [".png", ".webp", ".jpg", ".jpeg"];

export function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

/** 在 assets/ 下找文件。name 可以带扩展名，也可以不带（按 exts 顺序找）。
 *  返回相对 assets/ 的路径；找不到返回 null。 */
export function findAsset(name: string, exts: string[]): string | null {
  const clean = name.replace(/^\/+/, "");
  if (path.extname(clean) && existsSync(path.join(ASSETS, clean))) return clean;
  for (const ext of exts) {
    const candidate = clean + ext;
    if (existsSync(path.join(ASSETS, candidate))) return candidate;
  }
  return null;
}

/** assets/ 下的相对路径 → staticFile() 用的路径 */
export function assetSrc(rel: string): string {
  return `${PUBLIC_PREFIX}/assets/${rel.split(path.sep).join("/")}`;
}

export function audioSrc(file: string): string {
  return `${PUBLIC_PREFIX}/audio/${path.basename(file)}`;
}

/** 命令行里取 --episode xxx（或第一个不带 -- 的参数），默认 pilot */
export function episodeArg(argv = process.argv.slice(2)): string {
  const i = argv.indexOf("--episode");
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  const bare = argv.find((a) => !a.startsWith("-"));
  return bare ?? "pilot";
}

export function storyboardPath(episode: string): string {
  return path.join(EPISODES, episode, "storyboard.json");
}
