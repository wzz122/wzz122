/* 税务图解外语配音：dub/<语言>.tsv → MiniMax 逐句配音 → 按原片每句的起点排好 → 混上原片的配乐和音效 → 外语音轨
   用法：node pipeline/dub-episode.mjs episodes/<期名> ko|vi [--voices T=音色,C=音色] [--test 1,5,9] [--tts-only]
   - dub/<语言>.tsv（序号 角色 字幕 配音）由翻译生成，行数、顺序和原片台词一一对应。
   - 每句最多能占「这句起点 → 下一句起点 − 0.12 秒」；配出来超长就提高语速重配（最多到 2 倍），还超就在混音时 atempo 压到能放下。
   - 配乐、音效直接用原片构建留下的 build/bgm.wav、build/fx.f32，压低方式和原片一样，再整体拉到约 −15 LUFS。
   - --test 只配指定的几句到 dub/<语言>/test/，用来试音色。
   产物：dub/<语言>/lines/NNN.wav、dub/<语言>/report.tsv；out/dub/<期名>-<语言>.m4a（和视频等长，约 8.6 MB，Chrome 扩展一次最多传 10 MB）、.srt */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const epDir = path.resolve(ROOT, process.argv[2]);
const id = path.basename(epDir);
const lang = process.argv[3];
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const MODEL = 'speech-2.8-hd', SR = 48000, FPS = 30;
const VOICES = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/minimax-voices.json'), 'utf8'));
// 老师、芝士用和中文版同一个音色说外语（language_boost 指定语言），频道人物声音不变
const LANGS = {
  ko: { boost: 'Korean', T: { voice: VOICES.gou, speed: 1.1 }, C: { voice: VOICES['芝士机器人'], speed: 1.05 } },
  vi: { boost: 'Vietnamese', T: { voice: VOICES.gou, speed: 1.1 }, C: { voice: VOICES['芝士机器人'], speed: 1.05 } },
};
const L = LANGS[lang];
if (!L) throw new Error('语言只能是 ko 或 vi');
for (const kv of (arg('--voices') ?? '').split(',').filter(Boolean)) { const [k, v] = kv.split('='); L[k] = { ...L[k], voice: VOICES[v] ?? v }; }

const key = fs.readFileSync(path.join(ROOT, '.env'), 'utf8').match(/^MINIMAX_API_KEY=(.+)$/m)?.[1]?.trim();
if (!key) throw new Error('.env 里没有 MINIMAX_API_KEY');

// 1. 台词和每句的时间窗
const tl = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/episodes', id, 'timeline.json'), 'utf8'));
const total = tl.durationInFrames / FPS;
const rows = fs.readFileSync(path.join(epDir, 'dub', `${lang}.tsv`), 'utf8').trim().split('\n').slice(1).map(r => r.split('\t'));
if (rows.length !== tl.lines.length) throw new Error(`${lang}.tsv 有 ${rows.length} 句，原片 ${tl.lines.length} 句`);
const lines = rows.map(([n, cast, sub, tts], i) => {
  const want = tl.lines[i].speaker === 'gyudon' ? 'T' : 'C';
  if (cast !== want) throw new Error(`第 ${n} 句角色是 ${cast}，原片是 ${want}`);
  const start = tl.lines[i].from / FPS, next = i + 1 < tl.lines.length ? tl.lines[i + 1].from / FPS : total;
  return { n: +n, cast, sub: sub.trim(), tts: (tts || sub).trim(), start, max: next - start - 0.12, end: tl.lines[i].to / FPS };
});

const only = arg('--test')?.split(',').map(Number);
// 读音核查不过的句子：dub/<语言>-takes.json 写 {"句号": 第几遍}，换一遍重新生成（MiniMax 每遍读法略有不同）
const takesFile = path.join(epDir, 'dub', `${lang}-takes.json`);
const takes = fs.existsSync(takesFile) ? JSON.parse(fs.readFileSync(takesFile, 'utf8')) : {};
const outDir = path.join(epDir, 'dub', lang, only ? 'test' : 'lines'), cacheDir = path.join(epDir, 'dub', lang, '.cache');
fs.mkdirSync(outDir, { recursive: true }); fs.mkdirSync(cacheDir, { recursive: true });
const logFile = path.join(epDir, 'dub', lang, 'tts-log.tsv');
if (!fs.existsSync(logFile)) fs.writeFileSync(logFile, '时间\t句\t语速\t计费字符\t文本\n');

// 2. 配音：去掉首尾静音后量长度，超出时间窗就提速重配
const trimmedDur = wav => +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav], { encoding: 'utf8' }).trim();
async function synth(l, speed) {
  const c = L[l.cast];
  const take = takes[l.n] ?? 0;
  const hash = crypto.createHash('sha1').update(JSON.stringify([l.tts, c.voice, +speed.toFixed(2), MODEL, L.boost, ...(take ? [take] : [])])).digest('hex').slice(0, 12);
  const wav = path.join(cacheDir, `${hash}.wav`);
  if (!fs.existsSync(wav)) {
    const body = { model: MODEL, text: l.tts, stream: false, language_boost: L.boost, voice_setting: { voice_id: c.voice, speed: +speed.toFixed(2), pitch: 0, vol: 1 }, audio_setting: { format: 'mp3', sample_rate: 44100, bitrate: 128000, channel: 1 } };
    let d;
    // 1002 = 每分钟请求数超限（几期同时跑时常见），多等一会儿再试
    for (let a = 0; a < 8; a++) {
      const res = await fetch('https://api.minimax.io/v1/t2a_v2', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(90000) }).catch(e => ({ ok: false, status: 0, text: async () => String(e) }));
      d = res.ok ? await res.json() : { base_resp: { status_code: -res.status, status_msg: await res.text() } };
      if (d.base_resp?.status_code === 0) break;
      if (![1000, 1001, 1002, 1039, -429, -500, -502, -503, -504, 0].includes(d.base_resp?.status_code)) break;
      await new Promise(r => setTimeout(r, (d.base_resp?.status_code === 1002 ? 15000 : 3000) * (a + 1)));
    }
    if (d.base_resp?.status_code !== 0) throw new Error(`第 ${l.n} 句失败：${JSON.stringify(d.base_resp)}`);
    const mp3 = path.join(cacheDir, `${hash}.mp3`);
    fs.writeFileSync(mp3, Buffer.from(d.data.audio, 'hex'));
    const strip = 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03';
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp3, '-af', `${strip},areverse,${strip},areverse`, '-ar', String(SR), '-ac', '1', '-c:a', 'pcm_s16le', wav]);
    fs.unlinkSync(mp3);
    fs.appendFileSync(logFile, `${new Date().toISOString()}\t${l.n}\t${speed.toFixed(2)}\t${d.extra_info?.usage_characters ?? ''}\t${l.tts}\n`);
  }
  return wav;
}
async function fit(l) {
  const base = L[l.cast].speed;
  let speed = base, wav = await synth(l, speed), dur = trimmedDur(wav);
  for (let k = 0; k < 2 && dur > l.max && speed < 2; k++) {
    speed = Math.min(2, speed * (dur / l.max) * 1.04);
    wav = await synth(l, speed); dur = trimmedDur(wav);
  }
  l.speed = speed; l.dur = dur; l.wav = path.join(outDir, `${String(l.n).padStart(3, '0')}.wav`);
  fs.copyFileSync(wav, l.wav);
  process.stdout.write(`${l.n}\t${l.cast}\t语速 ${speed.toFixed(2)}\t${dur.toFixed(2)}/${l.max.toFixed(2)} 秒${dur > l.max ? '  超出' : ''}\n`);
}
const todo = only ? lines.filter(l => only.includes(l.n)) : lines;
const queue = [...todo];
await Promise.all([0, 1, 2].map(async () => { while (queue.length) await fit(queue.shift()); }));
if (only || process.argv.includes('--tts-only')) process.exit(0);

fs.writeFileSync(path.join(epDir, 'dub', lang, 'report.tsv'), '序号\t角色\t语速\t秒数\t上限\t余量\t字幕\n' +
  lines.map(l => [l.n, l.cast, l.speed.toFixed(2), l.dur.toFixed(2), l.max.toFixed(2), (l.max - l.dur).toFixed(2), l.sub].join('\t')).join('\n') + '\n');

// 3. 配音轨：和原片一样，每句「说话部分」统一到 -20 dBFS 放到原句起点；超长的句子 atempo 压进时间窗
const pcm = (file, af) => { const b = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', file, ...(af ? ['-af', af] : []), '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 }); return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); };
const N = Math.round(total * SR);
const voice = new Float32Array(N);
let squeezed = 0;
for (const l of lines) {
  const over = l.dur / l.max;
  if (over > 1) squeezed++;
  const x = pcm(l.wav, over > 1 ? `atempo=${over.toFixed(4)}` : null);
  const fr = Math.round(0.02 * SR);
  const e = []; for (let i = 0; i + fr < x.length; i += fr) { let s = 0; for (let j = i; j < i + fr; j++) s += x[j] * x[j]; e.push(Math.sqrt(s / fr)); }
  const mx = Math.max(...e); const act = e.filter(v => v > mx * 10 ** (-30 / 20)); const rms = Math.sqrt(act.reduce((a, v) => a + v * v, 0) / act.length);
  const g = 10 ** (-20 / 20) / rms, o = Math.round(l.start * SR), fade = Math.round(0.012 * SR);
  for (let i = 0; i < x.length && o + i < N; i++) { let w = 1; if (i < fade) w = i / fade; else if (i > x.length - fade) w = (x.length - i) / fade; voice[o + i] += x[i] * g * w; }
}
const work = path.join(epDir, 'dub', lang);
const vRaw = path.join(work, 'voice.f32');
fs.writeFileSync(vRaw, Buffer.from(voice.buffer));
const fxRaw = path.join(epDir, 'build/fx.f32'), bgmWav = path.join(epDir, 'build/bgm.wav');
if (Math.abs(fs.statSync(fxRaw).size / 4 / SR - total) > 0.05) throw new Error('build/fx.f32 和时间轴长度对不上，先重新构建原片');

// 4. 混音（和 build-episode.mjs 同一条滤镜），再整体拉到约 −15 LUFS
const mixWav = path.join(work, 'mix.wav');
const fc = `[0:a]asplit=2[v1][vkey];[2:a]volume=-21dB[bg];[bg][vkey]sidechaincompress=threshold=0.02:ratio=6:attack=30:release=400[bgd];[v1][1:a][bgd]amix=inputs=3:normalize=0[m];[m]alimiter=limit=0.89:level=false[o]`;
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'f32le', '-ar', String(SR), '-ac', '1', '-i', vRaw, '-f', 'f32le', '-ar', String(SR), '-ac', '1', '-i', fxRaw, '-i', bgmWav, '-filter_complex', fc, '-map', '[o]', '-t', total.toFixed(3), '-ar', String(SR), '-ac', '1', '-c:a', 'pcm_s16le', mixWav]);
const I0 = +execFileSync('sh', ['-c', `ffmpeg -hide_banner -i "${mixWav}" -af ebur128 -f null - 2>&1 | awk '/Summary/{s=1} s&&/I:/{print $2; exit}'`], { encoding: 'utf8' }).trim();
const outBase = path.join(ROOT, 'out/dub', `${id}-${lang}`);
fs.mkdirSync(path.dirname(outBase), { recursive: true });
// 限幅会吃掉约 1 dB：先按 −15 算增益，量一次，差多少再补一次
const kbps = Math.min(96, Math.floor(8.6e6 * 8 / total / 1000));
const measure = f => +execFileSync('sh', ['-c', `ffmpeg -hide_banner -i "${f}" -af ebur128 -f null - 2>&1 | awk '/Summary/{s=1} s&&/I:/{print $2; exit}'`], { encoding: 'utf8' }).trim();
let gain = -15 - I0;
for (let k = 0; k < 2; k++) {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mixWav, '-af', `volume=${gain.toFixed(2)}dB,alimiter=limit=0.89:level=false`, '-ac', '1', '-ar', String(SR), '-c:a', 'aac', '-b:a', `${kbps}k`, '-movflags', '+faststart', `${outBase}.m4a`]);
  const got = measure(`${outBase}.m4a`);
  if (Math.abs(got + 15) < 0.4) break;
  gain += -15 - got;
}
const I1 = execFileSync('sh', ['-c', `ffmpeg -hide_banner -i "${outBase}.m4a" -af ebur128=peak=true -f null - 2>&1 | awk '/Summary/{s=1} s&&/(I:|Peak:)/{printf "%s %s  ", $1, $2}'`], { encoding: 'utf8' }).trim();

// 5. 字幕：一句一条，长句按标点从中间拆成两条，时间按字数分
const ts = t => { const ms = Math.round(t * 1000); const p = (v, n = 2) => String(v).padStart(n, '0'); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };
const subs = [];
for (const l of lines) {
  const end = Math.max(l.end, l.start + Math.min(l.dur, l.max));
  let parts = [l.sub];
  if (l.sub.length > 42) {
    // 西文标点后面要有空格才算断句，免得把 2.000、3,4 这种数字拆开
    const cuts = [...l.sub.matchAll(/[，。？！]|[,.?!;:]\s+/g)].map(m => m.index + m[0].length).filter(i => i > 8 && i < l.sub.length - 8);
    const mid = l.sub.length / 2, c = cuts.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid))[0];
    if (c) parts = [l.sub.slice(0, c).trim(), l.sub.slice(c).trim()];
  }
  let t = l.start; const totalLen = parts.reduce((a, p) => a + p.length, 0);
  for (const p of parts) { const d = (p.length / totalLen) * (end - l.start); subs.push([t, t + d, p]); t += d; }
}
fs.writeFileSync(`${outBase}.srt`, subs.map(([a, b, s], i) => `${i + 1}\n${ts(a)} --> ${ts(b)}\n${s}\n`).join('\n'));

const tooLong = lines.filter(l => l.dur / l.max > 1.12).map(l => l.n);
console.log(`完成 ${id} ${lang}：${lines.length} 句，提速后仍超长 ${squeezed} 句（压缩超过 12% 的：${tooLong.join(',') || '无'}）`);
console.log(`混音原响度 ${I0} LUFS → ${I1}，${kbps} kbps，${path.relative(ROOT, outBase)}.m4a / .srt`);
