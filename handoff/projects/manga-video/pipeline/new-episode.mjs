/* 新建一期。把模板复制成 episodes/<期名>/，已经存在就不动。
   用法：node pipeline/new-episode.mjs <期名>（税务图解）；node pipeline/new-episode.mjs <期名> --line fudosan（不动产讲解：住宅街背景 + 西装）
   模板里已经打开新期的默认：关键词按停顿对齐（cueAlign: phrase）、音效只响写明的（sfxPolicy: explicit）、
   场景按理解状态写（states）、前提卡 40 号字、版面位置；老师和芝士从头到尾都在画面上。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const name = process.argv[2];
const lineArg = process.argv.indexOf('--line');
const line = lineArg > 0 ? process.argv[lineArg + 1] : 'tax';
if (!name || name.startsWith('--') || /[\\/]/.test(name)) throw new Error('用法：node pipeline/new-episode.mjs <期名> [--line fudosan]（只写名字，不带路径）');
const template = path.join(ROOT, `templates/${line}-episode`);
if (!fs.existsSync(template)) throw new Error(`没有这条线的模板：${template}`);
const dst = path.join(ROOT, 'episodes', name);
if (fs.existsSync(dst)) throw new Error(`已经有这一期了，不覆盖：${dst}`);
fs.cpSync(template, dst, { recursive: true });
// 官方截图的路径里填上期名
const sc = path.join(dst, 'scenes.mjs');
fs.writeFileSync(sc, fs.readFileSync(sc, 'utf8').replaceAll('episodes/<期名>/m/', `episodes/${name}/m/`));
console.log(`新建：${dst}
下一步：
  1. 写 facts.md（每个上屏数字的官方出处）
  2. 写 lines.txt，再写 states.md 的理解链
  3. 按 states.md 改 scenes.mjs 和 visuals.json
  4. node pipeline/tts-episode.mjs episodes/${name} --dry   （只生成 script.json、报字数，不花钱）`);
