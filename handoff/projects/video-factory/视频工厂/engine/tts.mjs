/* =========================================================================
   2) 配音 + 对时间轴
   用 macOS 自带的中文语音（免费、离线），一句一条音频，
   再用每句的真实时长，把画面动画对齐到旁白上。
   ========================================================================= */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function aiffDuration(file, ffmpeg) {
  try {
    const out = execFileSync('/usr/bin/afinfo', [file], { encoding: 'utf8' });
    const m = out.match(/estimated duration:\s*([\d.]+)/);
    if (m) return parseFloat(m[1]);
  } catch (e) { /* 继续用 ffmpeg 兜底 */ }
  try {
    const out = execFileSync(ffmpeg, ['-i', file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return 0;
  } catch (e) {
    const m = String(e.stderr || '').match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
    if (m) return (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]);
  }
  return 2.0;
}

/* 外部旁白：已经录好/配好的整条音频（如 MiniMax 网页配音）。
   不再逐句 say，而是用 whisper 把每句字幕对到录音上，画面跟着真实语音走。 */
export function buildAudioExternal(board, work, cfg, ffmpeg, voiceFile) {
  const dir = path.join(work, 'audio');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const COVER = cfg.coverHold ?? 3.2;
  const TAIL = cfg.tail ?? 1.2;
  const said = board.beats.filter(b => b.say);

  const sentsF = path.join(dir, 'sents.json'), outF = path.join(dir, 'aligned.json');
  fs.writeFileSync(sentsF, JSON.stringify(said.map(b => b.say)), 'utf8');
  // 换屏停顿：每屏第一句（第一屏除外）前，原停顿不足 sceneGap 秒的补齐（整条配音一口气念下来时需要「喘口气」）
  const sceneF = path.join(dir, 'scene_starts.json');
  fs.writeFileSync(sceneF, JSON.stringify(said.map((b, k) => k > 0 && b.scene !== said[k - 1].scene ? k : -1).filter(k => k > 0)));
  const py = path.join(path.dirname(fileURLToPath(import.meta.url)), 'align_ext.py');
  const msg = execFileSync('python3', [py, voiceFile, sentsF, outF, sceneF, String(cfg.sceneGap ?? 0.8)], { encoding: 'utf8' });
  msg.trim().split('\n').forEach(l => console.log('   ' + l));
  const { duration: vDur, lines, voice } = JSON.parse(fs.readFileSync(outF, 'utf8'));

  // 片头停 COVER 秒，旁白从 COVER 开始；每句持续到下一句开口
  said.forEach((b, k) => { b.t0 = COVER + (k === 0 ? 0 : lines[k].t0); });
  let t = 0;
  board.beats.forEach((b, i) => {
    if (!b.say) {
      b.t0 = t;
      const nxt = board.beats.slice(i + 1).find(x => x.say);
      b.t1 = nxt ? nxt.t0 : t + 0.8;
    } else {
      const k = said.indexOf(b);
      b.t1 = k + 1 < said.length ? said[k + 1].t0 : COVER + vDur + TAIL;
    }
    t = b.t1;
  });
  const total = COVER + vDur + TAIL;

  // 片头静音 + 原录音 + 片尾静音，统一成 48k 单声道
  const narration = path.join(work, 'narration.wav');
  execFileSync(ffmpeg, ['-y', '-v', 'error', '-i', voice || voiceFile,
    '-af', `adelay=${Math.round(COVER * 1000)},apad=pad_dur=${TAIL}`,
    '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', narration]);

  board.scenes.forEach((s, i) => {
    const bs = board.beats.filter(b => b.scene === i);
    s.t0 = bs.length ? bs[0].t0 : 0;
    s.t1 = bs.length ? bs[bs.length - 1].t1 : 0;
  });
  board.meta.duration = total;
  return { narration, duration: total };
}

export function buildAudio(board, work, cfg, ffmpeg) {
  const dir = path.join(work, 'audio');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  const SR = 24000;
  const GAP = cfg.gap ?? 0.30;         // 句间停顿
  const COVER = cfg.coverHold ?? 3.2;  // 片头停留
  const TAIL = cfg.tail ?? 1.2;        // 片尾留白

  const parts = [];      // 拼接用的 wav 列表
  let t = 0;

  const silence = (sec, tag) => {
    const f = path.join(dir, `sil_${tag}.wav`);
    execFileSync(ffmpeg, ['-y', '-v', 'error', '-f', 'lavfi',
      '-i', `anullsrc=r=${SR}:cl=mono`, '-t', String(sec.toFixed(3)),
      '-c:a', 'pcm_s16le', f]);
    parts.push(f);
  };

  board.beats.forEach((b, i) => {
    b.t0 = t;
    if (!b.say) {                                  // 没有旁白（片头等）
      const hold = i === 0 ? COVER : 0.8;
      silence(hold, 'b' + i);
      t += hold;
    } else {
      const txtf = path.join(dir, `l${i}.txt`);
      fs.writeFileSync(txtf, b.tts || b.say, 'utf8');
      const aiff = path.join(dir, `l${i}.aiff`);
      execFileSync('/usr/bin/say', ['-v', cfg.voice || 'Tingting', '-r', String(cfg.rate || 168),
        '-f', txtf, '-o', aiff, '--data-format=BEI16@24000']);
      const d = aiffDuration(aiff, ffmpeg);
      const wav = path.join(dir, `l${i}.wav`);
      execFileSync(ffmpeg, ['-y', '-v', 'error', '-i', aiff, '-ar', String(SR), '-ac', '1',
        '-c:a', 'pcm_s16le', wav]);
      parts.push(wav);
      silence(GAP, 'g' + i);
      t += d + GAP;
    }
    b.t1 = t;
  });

  silence(TAIL, 'tail');
  t += TAIL;

  // 拼成一条完整旁白
  const list = path.join(dir, 'list.txt');
  fs.writeFileSync(list, parts.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'), 'utf8');
  const narration = path.join(work, 'narration.wav');
  execFileSync(ffmpeg, ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list,
    '-c', 'copy', narration]);

  // 幕的时间范围
  board.scenes.forEach((s, i) => {
    const bs = board.beats.filter(b => b.scene === i);
    s.t0 = bs.length ? bs[0].t0 : 0;
    s.t1 = bs.length ? bs[bs.length - 1].t1 : 0;
  });
  board.meta.duration = t;
  return { narration, duration: t };
}
