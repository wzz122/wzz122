/* 税务图解：lines.txt → script.json → MiniMax API 逐句配音 → lines/sXX_lYY.wav
   用法：node pipeline/tts-episode.mjs episodes/<期名> [--dry]
   - 音色编号在 config/minimax-voices.json；老师 gou 语速 1.15，芝士「芝士机器人」语速 1.1（skill 定的）。
   - 每句按「配音文本 + 音色 + 语速 + 模型」算哈希缓存在 lines/.cache/，改一个字只重配那一句。
   - 每次实际调用都记进 tts-log.tsv（计费字符数）。--dry 只生成 script.json、报字数，不调接口。 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const epDir = path.resolve(ROOT, process.argv[2]);
const dry = process.argv.includes('--dry');
const VOICES = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/minimax-voices.json'), 'utf8'));
const CAST = {
  T: { speaker: 'gyudon', voice: VOICES.gou, speed: 1.15 },
  C: { speaker: 'cheese', voice: VOICES['芝士机器人'], speed: 1.1 },
};
const MODEL = 'speech-2.8-hd';

// 1. lines.txt → script.json
const script = [];
for (const raw of fs.readFileSync(path.join(epDir, 'lines.txt'), 'utf8').split('\n')) {
  const line = raw.trim();
  if (!line || line.startsWith('#') && !line.startsWith('##')) continue;
  if (line.startsWith('##')) { script.push({ chapter: line.slice(2).trim(), lines: [] }); continue; }
  const m = line.match(/^([TC]):\s*(.*?)(?:\{tts:(.*)\})?$/);
  if (!m) throw new Error(`看不懂的行：${line}`);
  const text = m[2].trim();
  const tts = (m[3] ?? text).trim();
  if (/[ぁ-ゟ゠-ヿ]/.test(tts)) throw new Error(`配音文本里有假名（会读成日语腔），请加 {tts:...}：${line}`);
  if (/[（(]/.test(tts)) throw new Error(`配音文本里有括号（括号里的日语汉字会被再念一遍，2026-11-16 出过这个错），请加 {tts:...} 把括号去掉：${line}`);
  script.at(-1).lines.push({ speaker: CAST[m[1]].speaker, cast: m[1], text, tts });
}
fs.writeFileSync(path.join(epDir, 'script.json'), JSON.stringify(script.map(s => ({ chapter: s.chapter, lines: s.lines.map(({ cast, ...l }) => l) })), null, 1));
// 稿子里有引号，配音文本里把引号删掉或换成逗号，句子会被切碎（2026-11-16 量过：同一句停顿 8 次，保留引号只停 3 次）。配音文本里要留着引号（「」或“”都行）。
const noQuote = script.flatMap((s, si) => s.lines.map((l, li) => ({ l, k: `s${String(si).padStart(2, '0')}_l${String(li).padStart(2, '0')}` }))).filter(({ l }) => /[「“]/.test(l.text) && !/[「“]/.test(l.tts));
if (noQuote.length) console.log(`注意：${noQuote.length} 句稿子里有引号、配音文本里没有（引号删掉或换成逗号会把句子切碎，请在 {tts:} 里补上）：${noQuote.map(x => x.k).join(' ')}`);
// 读音指定（pipeline/pron.py 生成的 pron.json：每句要带的「词/(拼音)」），没有这个文件就不带
const pronFile = path.join(epDir, 'pron.json');
const PRON = fs.existsSync(pronFile) ? JSON.parse(fs.readFileSync(pronFile, 'utf8')) : {};
const all = script.flatMap((s, si) => s.lines.map((l, li) => ({ ...l, si, li, tone: PRON[`s${String(si).padStart(2, '0')}_l${String(li).padStart(2, '0')}`] ?? [] })));
if (!fs.existsSync(pronFile)) console.log('注意：没有 pron.json（多音字没指定读音）。先跑 python3 pipeline/pron.py ' + process.argv[2]);
const billed = t => [...t].reduce((n, ch) => n + (/[一-鿿]/.test(ch) ? 2 : 1), 0);
console.log(`script.json：${script.length} 段、${all.length} 句，配音约 ${all.reduce((n, l) => n + billed(l.tts), 0)} 计费字符`);
if (dry) process.exit(0);

// 2. 逐句配音（有缓存就跳过）
const key = fs.readFileSync(path.join(ROOT, '.env'), 'utf8').match(/^MINIMAX_API_KEY=(.+)$/m)?.[1]?.trim();
if (!key) throw new Error('.env 里没有 MINIMAX_API_KEY');
const linesDir = path.join(epDir, 'lines'), cacheDir = path.join(linesDir, '.cache');
fs.mkdirSync(cacheDir, { recursive: true });
const logFile = path.join(epDir, 'tts-log.tsv');
if (!fs.existsSync(logFile)) fs.writeFileSync(logFile, '时间\t句\t计费字符\t文本\n');

async function synth(l) {
  const c = CAST[l.cast];
  const hash = crypto.createHash('sha1').update(JSON.stringify(l.tone.length ? [l.tts, c.voice, c.speed, MODEL, l.tone] : [l.tts, c.voice, c.speed, MODEL])).digest('hex').slice(0, 12);
  const cached = path.join(cacheDir, `${hash}.wav`);
  const out = path.join(linesDir, `s${String(l.si).padStart(2, '0')}_l${String(l.li).padStart(2, '0')}.wav`);
  if (!fs.existsSync(cached)) {
    const body = { model: MODEL, text: l.tts, stream: false, language_boost: 'Chinese', voice_setting: { voice_id: c.voice, speed: c.speed, pitch: 0, vol: 1 }, audio_setting: { format: 'mp3', sample_rate: 44100, bitrate: 128000, channel: 1 }, ...(l.tone.length ? { pronunciation_dict: { tone: l.tone } } : {}) };
    let d;
    for (let a = 0; a < 4; a++) {
      const res = await fetch('https://api.minimax.io/v1/t2a_v2', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(90000) }).catch(e => ({ ok: false, status: 0, text: async () => String(e) }));
      d = res.ok ? await res.json() : { base_resp: { status_code: -res.status, status_msg: await res.text() } };
      if (d.base_resp?.status_code === 0) break;
      if (![1000, 1001, 1002, 1039, -429, -500, -502, -503, -504, 0].includes(d.base_resp?.status_code)) break;
      await new Promise(r => setTimeout(r, 3000 * (a + 1)));
    }
    if (d.base_resp?.status_code !== 0) throw new Error(`第 ${l.si}-${l.li} 句失败：${JSON.stringify(d.base_resp)}`);
    const mp3 = path.join(cacheDir, `${hash}.mp3`);
    fs.writeFileSync(mp3, Buffer.from(d.data.audio, 'hex'));
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp3, '-ar', '44100', '-ac', '1', '-c:a', 'pcm_s16le', cached]);
    fs.unlinkSync(mp3);
    fs.appendFileSync(logFile, `${new Date().toISOString()}\ts${l.si}_l${l.li}\t${d.extra_info?.usage_characters ?? ''}\t${l.tts}\n`);
    process.stdout.write(`配好 s${l.si}_l${l.li}（${d.extra_info?.usage_characters} 字符）\n`);
  }
  fs.copyFileSync(cached, out);
}

// 同时最多 3 个请求（网络调用，不占本机算力）
const queue = [...all];
await Promise.all([0, 1, 2].map(async () => { while (queue.length) await synth(queue.shift()); }));
// 清掉多出来的旧句子文件
const want = new Set(all.map(l => `s${String(l.si).padStart(2, '0')}_l${String(l.li).padStart(2, '0')}.wav`));
for (const f of fs.readdirSync(linesDir)) if (f.endsWith('.wav') && !want.has(f)) fs.unlinkSync(path.join(linesDir, f));
console.log(`完成：${all.length} 句在 ${path.relative(ROOT, linesDir)}/`);
