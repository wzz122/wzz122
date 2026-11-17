// 让 Remotion 能读到根目录的 assets/、audio/、build/：在 public/manga/ 里放三个符号链接。
// Remotion 打包时会把符号链接原样带过去（见 @remotion/bundler 的 copyDir），所以不用复制文件。
import { existsSync, lstatSync, mkdirSync, readlinkSync, symlinkSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/paths.ts";

export function linkPublic(): void {
  const dir = path.join(ROOT, "public", "manga");
  mkdirSync(dir, { recursive: true });
  for (const name of ["assets", "audio", "build"]) {
    mkdirSync(path.join(ROOT, name), { recursive: true });
    const link = path.join(dir, name);
    const target = path.join("..", "..", name);
    if (existsSync(link) || isBrokenLink(link)) {
      if (!lstatSync(link).isSymbolicLink()) throw new Error(`${link} 应该是符号链接，但现在是普通文件夹，请检查`);
      if (readlinkSync(link) === target) continue;
      throw new Error(`${link} 指向 ${readlinkSync(link)}，应该指向 ${target}`);
    }
    symlinkSync(target, link);
  }
}

function isBrokenLink(p: string): boolean {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  linkPublic();
  console.log("public/manga/ → assets、audio、build 链接就绪");
}
