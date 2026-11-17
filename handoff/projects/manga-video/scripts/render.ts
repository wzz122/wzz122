// npm run render [-- --episode pilot]            → out/<episode>.mp4（字幕 out/<episode>.srt 由 analyze 生成）
// npm run frames [-- --episode pilot] 30,200,600 → out/frames/<episode>-<帧号>.png（截几帧看效果）
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { linkPublic } from "./link-public.ts";
import { BUILD, OUT, ROOT, episodeArg, storyboardPath } from "./lib/paths.ts";

const argv = process.argv.slice(2);
const framesMode = argv.includes("--frames");
const episode = episodeArg(argv.filter((a) => !/^\d+(,\d+)*$/.test(a)));
const frameList = argv.find((a) => /^\d+(,\d+)*$/.test(a));
const concurrency = process.env.RENDER_CONCURRENCY ?? "4";

linkPublic();

const timeline = path.join(BUILD, episode, "timeline.json");
const tts = path.join(BUILD, episode, "tts.json");
if (!existsSync(timeline)) {
  console.error(`没有 build/${episode}/timeline.json，先跑 npm run tts 和 npm run analyze`);
  process.exit(1);
}
const mtime = (f: string) => (existsSync(f) ? statSync(f).mtimeMs : 0);
if (mtime(storyboardPath(episode)) > mtime(timeline) || mtime(tts) > mtime(timeline)) {
  console.error("分镜或配音比时间线新：先跑 npm run tts 和 npm run analyze，再渲染。");
  process.exit(1);
}

const props = JSON.stringify({ episode, plan: null });
const run = (args: string[]) => {
  const r = spawnSync("npx", ["remotion", ...args], { cwd: ROOT, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

mkdirSync(OUT, { recursive: true });
if (framesMode) {
  const frames = (frameList ?? "15,200,500").split(",");
  const dir = path.join(OUT, "frames");
  mkdirSync(dir, { recursive: true });
  for (const f of frames) {
    run(["still", "MangaEpisode", path.join(dir, `${episode}-${f.padStart(4, "0")}.png`), `--props=${props}`, `--frame=${f}`]);
  }
} else {
  const out = path.join(OUT, `${episode}.mp4`);
  run(["render", "MangaEpisode", out, `--props=${props}`, `--concurrency=${concurrency}`]);
  const srt = path.join(BUILD, episode, `${episode}.srt`);
  if (existsSync(srt)) copyFileSync(srt, path.join(OUT, `${episode}.srt`));
  console.log(`完成：${path.relative(ROOT, out)}、out/${episode}.srt`);
}
