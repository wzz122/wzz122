import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

let cached: string | null = null;

/** 找 ffmpeg：FFMPEG_PATH → PATH 里的 ffmpeg → ~/bin/ffmpeg → Python 的 imageio_ffmpeg */
export function ffmpegPath(): string {
  if (cached) return cached;
  const candidates = [process.env.FFMPEG_PATH, "ffmpeg", path.join(os.homedir(), "bin", "ffmpeg")].filter(Boolean) as string[];
  for (const c of candidates) {
    const r = spawnSync(c, ["-version"], { stdio: "ignore" });
    if (r.status === 0) return (cached = c);
  }
  try {
    const p = execFileSync("python3", ["-c", "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"], { encoding: "utf8" }).trim();
    if (p && existsSync(p)) return (cached = p);
  } catch {
    // 没装 imageio_ffmpeg
  }
  throw new Error("找不到 ffmpeg。装一个 ffmpeg，或者设置环境变量 FFMPEG_PATH。");
}

export function runFfmpeg(args: string[]): void {
  const r = spawnSync(ffmpegPath(), ["-hide_banner", "-loglevel", "error", "-y", ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffmpeg 失败：${r.stderr || r.stdout}`);
}

/** 解码成单声道 float32 PCM */
export function decodeMono(file: string, sampleRate = 16000): Float32Array {
  const r = spawnSync(
    ffmpegPath(),
    ["-hide_banner", "-loglevel", "error", "-i", file, "-ac", "1", "-ar", String(sampleRate), "-f", "f32le", "-"],
    { maxBuffer: 1024 * 1024 * 512 },
  );
  if (r.status !== 0) throw new Error(`解码失败 ${file}：${r.stderr?.toString()}`);
  const buf = r.stdout as Buffer;
  const copy = new ArrayBuffer(buf.byteLength);
  new Uint8Array(copy).set(buf);
  return new Float32Array(copy);
}
