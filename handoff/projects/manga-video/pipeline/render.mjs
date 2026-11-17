/* 渲染图解模板：node pipeline/render.mjs <episode> [--stills]
   输出 out/<episode>.mp4（字幕 .srt 由 build-explainer.mjs 生成）；--stills 只截关键帧到 out/<episode>-frames/ */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ep = process.argv[2] ?? 'pilot-explainer';
const stillsOnly = process.argv.includes('--stills');
const entry = 'src/explainer/index.ts';
const props = JSON.stringify({ episode: ep });
const remotion = path.join(ROOT, 'node_modules/.bin/remotion');
const run = args => execFileSync(remotion, args, { cwd: ROOT, stdio: 'inherit' });

// 关键帧：每个图解组件全部步骤出完之后 0.6 秒
const tl = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/episodes', ep, 'timeline.json'), 'utf8'));
const dir = path.join(ROOT, 'out', `${ep}-frames`);
fs.mkdirSync(dir, { recursive: true });

if (!stillsOnly) {
  run(['render', entry, 'ExplainerVideo', `out/${ep}.mp4`, `--props=${props}`, '--concurrency=4', '--crf=18']);
}
tl.visuals.forEach((v, i) => {
  const f = Math.min(v.to - 8, Math.max(...v.steps, v.from) + 18);
  run(['still', entry, 'ExplainerVideo', path.join('out', `${ep}-frames`, `${String(i + 1).padStart(2, '0')}-${v.type}.png`), `--frame=${f}`, `--props=${props}`, '--log=error']);
});
console.log(`完成：out/${ep}.mp4、out/${ep}.srt、关键帧 out/${ep}-frames/`);
