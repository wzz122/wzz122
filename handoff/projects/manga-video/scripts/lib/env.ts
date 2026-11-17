import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./paths.ts";

let loaded = false;

/** 读项目根目录的 .env。已经存在的环境变量优先，不覆盖。不打印任何值。 */
export function loadEnv(): void {
  if (loaded) return;
  loaded = true;
  const file = path.join(ROOT, ".env");
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    let line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    if (line.startsWith("export ")) line = line.slice(7);
    const eq = line.indexOf("=");
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (value.length >= 2 && value[0] === value[value.length - 1] && (value[0] === '"' || value[0] === "'")) {
      value = value.slice(1, -1);
    }
    if (value && process.env[key] === undefined) process.env[key] = value;
  }
}

export function env(name: string, fallback?: string): string | undefined {
  loadEnv();
  const v = process.env[name]?.trim();
  return v ? v : fallback;
}
