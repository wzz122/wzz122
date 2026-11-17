/* 税务图解：配音评审标出毛病的句子，重配几版备选 → 评审 → 挑干净的换上。
   MiniMax 同一句每次合成结果不一样，词中间的停顿、吞字是随机出现的，重配基本能挑到干净的一版。
   用法：
     1) node pipeline/tts-reroll.mjs episodes/<期名> s01_l02,s04_l18 [每句几版=2]
          备选存到 episodes/<期名>/lines/.takes/<句号>_t<n>.wav，并拼成一个临时期 .takes/_ep
     2) /usr/bin/python3 ~/.local/bin/mac-heavy-job.py -- python3 pipeline/voice-review.py episodes/<期名>/lines/.takes/_ep
     3) node pipeline/tts-reroll.mjs episodes/<期名> --report        逐版列出评审标记
     4) node pipeline/tts-reroll.mjs episodes/<期名> --use s01_l02_t0,s04_l18_t1
          把挑好的放进 lines/ 和缓存（哈希和 tts-episode.mjs 一样，重跑配音脚本不会被换掉），然后重新 build
   音色、语速、模型、读音指定都和 tts-episode.mjs 一致（那边改了这里要跟着改）。每次调用记进 tts-log.tsv。 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const epDir = path.resolve(ROOT, process.argv[2]);
const VOICES = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/minimax-voices.json'), 'utf8'));
const CAST = { gyudon: { voice: VOICES.gou, speed: 1.15 }, cheese: { voice: VOICES['芝士机器人'], speed: 1.1 } };
const MODEL = 'speech-2.8-hd';
const script = JSON.parse(fs.readFileSync(path.join(epDir, 'script.json'), 'utf8'));
const pronFile = path.join(epDir, 'pron.json');
const PRON = fs.existsSync(pronFile) ? JSON.parse(fs.readFileSync(pronFile, 'utf8')) : {};
const linesDir = path.join(epDir, 'lines'), takesDir = path.join(linesDir, '.takes'), fakeEp = path.join(takesDir, '_ep');
const lineOf = id => { const [si, li] = id.match(/\d+/g).map(Number); const l = script[si]?.lines[li]; if (!l) throw new Error(`没有这一句：${id}`); return { ...l, tone: PRON[id] ?? [] }; };
const takes = () => fs.existsSync(takesDir) ? fs.readdirSync(takesDir).filter(f => /^s\d+_l\d+_t\d+\.wav$/.test(f)).map(f => f.slice(0, -4)).sort() : [];

if (process.argv[3] === '--report') {
  const rows = JSON.parse(fs.readFileSync(path.join(fakeEp, 'voice-review.json'), 'utf8')), names = JSON.parse(fs.readFileSync(path.join(fakeEp, 'takes.json'), 'utf8'));
  for (const r of rows) {
    const flags = [...r.diffs.map(d => `读音 ${d.kind} ${d.want}→${d.heard}`), ...r.pauses.map(p => `停顿 ${p.where} ${p.len} 秒`), ...r.flags.filter(x => x.includes('语速'))];
    console.log(names[Number(r.id.slice(-2))], `${r.rate} 字/秒`, flags.length ? flags.join('；') : '干净');
  }
} else if (process.argv[3] === '--use') {
  for (const t of process.argv[4].split(',')) {
    const id = t.replace(/_t\d+$/, ''), l = lineOf(id), c = CAST[l.speaker];
    const hash = crypto.createHash('sha1').update(JSON.stringify(l.tone.length ? [l.tts, c.voice, c.speed, MODEL, l.tone] : [l.tts, c.voice, c.speed, MODEL])).digest('hex').slice(0, 12);
    const src = path.join(takesDir, `${t}.wav`);
    fs.copyFileSync(src, path.join(linesDir, '.cache', `${hash}.wav`)); fs.copyFileSync(src, path.join(linesDir, `${id}.wav`));
    console.log(`换上 ${t} → lines/${id}.wav`);
  }
  console.log('换完重新跑 build-episode.mjs，再跑一遍 voice-review.py。');
} else {
  const ids = process.argv[3].split(','), K = Number(process.argv[4] ?? 2);
  const key = fs.readFileSync(path.join(ROOT, '.env'), 'utf8').match(/^MINIMAX_API_KEY=(.+)$/m)?.[1]?.trim();
  if (!key) throw new Error('.env 里没有 MINIMAX_API_KEY');
  fs.mkdirSync(takesDir, { recursive: true });
  const jobs = [];
  for (const id of ids) { lineOf(id); const have = takes().filter(t => t.startsWith(id + '_t')).length; for (let n = have; n < have + K; n++) jobs.push([id, n]); }
  let chars = 0;
  const run = async () => {
    while (jobs.length) {
      const [id, n] = jobs.shift(), l = lineOf(id), c = CAST[l.speaker];
      const body = { model: MODEL, text: l.tts, stream: false, language_boost: 'Chinese', voice_setting: { voice_id: c.voice, speed: c.speed, pitch: 0, vol: 1 }, audio_setting: { format: 'mp3', sample_rate: 44100, bitrate: 128000, channel: 1 }, ...(l.tone.length ? { pronunciation_dict: { tone: l.tone } } : {}) };
      let d;
      for (let a = 0; a < 4; a++) {
        const res = await fetch('https://api.minimax.io/v1/t2a_v2', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(90000) }).catch(e => ({ ok: false, status: 0, text: async () => String(e) }));
        d = res.ok ? await res.json() : { base_resp: { status_code: -res.status } };
        if (d.base_resp?.status_code === 0) break;
        await new Promise(r => setTimeout(r, 3000 * (a + 1)));
      }
      if (d.base_resp?.status_code !== 0) { console.log(`${id} 第 ${n} 版失败：${JSON.stringify(d.base_resp)}`); continue; }
      const mp3 = path.join(takesDir, `${id}_t${n}.mp3`);
      fs.writeFileSync(mp3, Buffer.from(d.data.audio, 'hex'));
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp3, '-ar', '44100', '-ac', '1', '-c:a', 'pcm_s16le', mp3.replace(/\.mp3$/, '.wav')]);
      fs.unlinkSync(mp3);
      chars += d.extra_info?.usage_characters ?? 0;
      fs.appendFileSync(path.join(epDir, 'tts-log.tsv'), `${new Date().toISOString()}\t${id}_t${n}（备选）\t${d.extra_info?.usage_characters ?? ''}\t${l.tts}\n`);
    }
  };
  await Promise.all([0, 1, 2].map(run));
  // 所有备选拼成一个临时期，给 voice-review.py 查
  const all = takes();
  fs.rmSync(fakeEp, { recursive: true, force: true }); fs.mkdirSync(path.join(fakeEp, 'lines'), { recursive: true });
  fs.writeFileSync(path.join(fakeEp, 'script.json'), JSON.stringify([{ chapter: '备选', lines: all.map(t => { const { tone, ...l } = lineOf(t.replace(/_t\d+$/, '')); return l; }) }]));
  fs.writeFileSync(path.join(fakeEp, 'takes.json'), JSON.stringify(all));
  all.forEach((t, n) => fs.copyFileSync(path.join(takesDir, `${t}.wav`), path.join(fakeEp, 'lines', `s00_l${String(n).padStart(2, '0')}.wav`)));
  console.log(`配了 ${ids.length} 句、各 ${K} 版（${chars} 计费字符），现在共有 ${all.length} 个备选。`);
  console.log(`下一步：/usr/bin/python3 ~/.local/bin/mac-heavy-job.py -- python3 pipeline/voice-review.py ${path.relative(ROOT, fakeEp)}`);
  console.log(`然后：  node pipeline/tts-reroll.mjs ${process.argv[2]} --report`);
}
