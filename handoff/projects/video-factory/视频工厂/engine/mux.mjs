/* =========================================================================
   4) 合成：画面 + 旁白 (+ 背景音乐) = 成片
      关键处理两件事：
        · 闪避(ducking)：你一开口音乐自动压下去，你一停音乐浮上来
        · 响度标准化：把成片拉到 -14 LUFS（YouTube / B站 的标准）
   ========================================================================= */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';

export function mux({ video, narration, bgm, out, ffmpeg, cfg = {}, duration = 0 }) {
  const {
    bgmLoudness = -33,    // 音乐在没人说话时的响度(LUFS)。换任何一首歌都会自动对齐到这个值
    bgmVolume = 1,        // 额外微调系数，一般不用动
    duck = true,          // 是否开启闪避
    duckRatio = 8,        // 压得多狠：越大压得越死
    duckRelease = 500,    // 说完多久音乐浮回来（毫秒）
    loudness = -14,       // 成片目标响度 LUFS
    bgmFade = 2.5,        // 音乐开头淡入（秒）
    bgmFadeOut = 5        // 音乐在片尾淡出（秒）：按成片时长自动定位，音乐文件多长都行
  } = cfg;

  const hasBgm = bgm && fs.existsSync(bgm);
  const args = ['-y', '-v', 'error', '-i', video, '-i', narration];
  const chain = [];

  if (hasBgm) {
    // 先量一下这首歌本身多响，再算出要推/拉多少 dB —— 这样换歌不用重调参数
    const m = measureLoudness(bgm, ffmpeg);
    const srcI = m && m.I != null ? parseFloat(m.I) : -20;
    const gainDb = (bgmLoudness - srcI) + 20 * Math.log10(Math.max(0.01, bgmVolume));
    args.push('-stream_loop', '-1', '-i', bgm);
    // 人声分两路：一路进混音，一路当闪避的「触发信号」
    chain.push('[1:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,asplit=2[v1][vkey]');
    chain.push(`[2:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,` +
      `volume=${gainDb.toFixed(2)}dB[bg0]`);
    if (duck) {
      // 人声一来就把音乐压下去
      chain.push(`[bg0][vkey]sidechaincompress=threshold=0.03:ratio=${duckRatio}:attack=12:release=${duckRelease}:makeup=1[bg1]`);
    } else {
      chain.push('[bg0]anull[bg1]');
      chain.push('[vkey]anull[vnull]');
    }
    const fadeOut = duration > bgmFadeOut ? `,afade=t=out:st=${(duration - bgmFadeOut).toFixed(2)}:d=${bgmFadeOut}` : '';
    chain.push(`[bg1]afade=t=in:st=0:d=${bgmFade}${fadeOut}[bg]`);
    chain.push('[v1][bg]amix=inputs=2:duration=first:dropout_transition=0,' +
      `loudnorm=I=${loudness}:TP=-1.5:LRA=11[a]`);
  } else {
    chain.push(`[1:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,` +
      `loudnorm=I=${loudness}:TP=-1.5:LRA=11[a]`);
  }

  args.push('-filter_complex', chain.join(';'), '-map', '0:v', '-map', '[a]',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', out);
  execFileSync(ffmpeg, args, { stdio: 'inherit' });
  return out;
}

/** 量一下成片的响度，确认标准化生效 */
export function measureLoudness(file, ffmpeg) {
  const r = spawnSync(ffmpeg, ['-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'],
    { encoding: 'utf8', maxBuffer: 1 << 24 });
  const t = (r.stderr || '') + (r.stdout || '');
  const last = (re) => { const m = t.match(re); return m ? m[m.length - 1].match(/(-?[\d.]+)/)[1] : null; };
  const I = last(/I:\s*(-?[\d.]+)\s*LUFS/g);
  if (!I) return null;
  return { I, LRA: last(/LRA:\s*(-?[\d.]+)\s*LU/g), TP: last(/Peak:\s*(-?[\d.]+)\s*dBFS/g) };
}
