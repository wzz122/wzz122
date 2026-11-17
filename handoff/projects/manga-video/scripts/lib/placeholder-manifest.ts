// assets/.placeholders.json：记录哪些图片是 placeholders 脚本画的占位图。
// 每个文件同时记下内容哈希。用户把真图放到同名位置后哈希对不上，就自动从记录里移除，
// 这样真图既不会被 --force 覆盖，也不会被当成占位图跳过。
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ASSETS } from "./paths.ts";

const FILE = path.join(ASSETS, ".placeholders.json");

/** files：相对 assets/ 的路径列表（旧格式也只有这一项）；hashes：路径 → sha256 */
type Manifest = { files: string[]; hashes: Record<string, string> };

export const fileHash = (abs: string) => createHash("sha256").update(readFileSync(abs)).digest("hex");

export function loadPlaceholderManifest(): Manifest {
  const raw = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {};
  const files: string[] = Array.isArray(raw.files) ? raw.files : [];
  const hashes: Record<string, string> = raw.hashes ?? {};
  const kept: Manifest = { files: [], hashes: {} };
  let changed = !raw.hashes && files.length > 0;
  for (const rel of files) {
    const abs = path.join(ASSETS, rel);
    if (!existsSync(abs)) {
      changed = true;
      continue;
    }
    const now = fileHash(abs);
    // 旧格式没有哈希：当作仍是占位图，补上哈希
    if (hashes[rel] && hashes[rel] !== now) {
      changed = true;
      continue;
    }
    kept.files.push(rel);
    kept.hashes[rel] = now;
  }
  if (changed) savePlaceholderManifest(kept);
  return kept;
}

export function savePlaceholderManifest(m: Manifest): void {
  const files = [...new Set(m.files)].sort();
  const hashes: Record<string, string> = {};
  for (const f of files) if (m.hashes[f]) hashes[f] = m.hashes[f];
  writeFileSync(FILE, JSON.stringify({ files, hashes }, null, 2));
}

/** rel：相对 assets/ 的路径（带扩展名）。读的时候会顺便清掉已被真图替换的记录。 */
export function isPlaceholder(rel: string, manifest = loadPlaceholderManifest()): boolean {
  return manifest.files.includes(rel.split(path.sep).join("/"));
}
