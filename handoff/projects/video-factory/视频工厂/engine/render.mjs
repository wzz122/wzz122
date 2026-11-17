/* =========================================================================
   3) 渲染：把动画一帧一帧“定格截图”，直接喂给 ffmpeg 压成视频
      —— 不是录屏，所以机器再慢画面也不会卡
   ========================================================================= */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { launch, CDP, openPage, evalJS, shot } from './cdp.mjs';

export async function renderVideo({ stageUrl, duration, fps, out, ffmpeg, onProgress, W = 1920, H = 1080 }) {
  const total = Math.ceil(duration * fps);

  const br = await launch(9422 + (process.pid % 300));
  const cdp = await CDP.connect(br.wsUrl);
  const S = await openPage(cdp, stageUrl, W, H);

  // 等舞台就绪 + 字体加载完
  for (let i = 0; i < 100; i++) {
    const ok = await evalJS(cdp, S, 'window.__ready===true && !!window.__DATA');
    if (ok) break;
    await new Promise(r => setTimeout(r, 100));
  }
  await evalJS(cdp, S, 'document.fonts ? document.fonts.ready.then(()=>1) : 1');
  await evalJS(cdp, S, 'window.__load(window.__DATA)');

  const ff = spawn(ffmpeg, [
    '-y', '-v', 'error',
    '-f', 'image2pipe', '-framerate', String(fps), '-i', 'pipe:0',
    '-an',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
    // 浏览器截图是全范围 JPEG（bt601）：转成标准范围 bt709，并写明色彩标记，平台转码后不发灰、不过曝
    '-vf', 'scale=in_range=full:in_color_matrix=bt601:out_range=tv:out_color_matrix=bt709,format=yuv420p',
    '-x264-params', 'colorprim=bt709:transfer=bt709:colormatrix=bt709:range=tv',
    '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-r', String(fps),
    '-movflags', '+faststart', out
  ], { stdio: ['pipe', 'ignore', 'inherit'] });

  let ffErr = null;
  ff.stdin.on('error', e => { ffErr = e; });
  const write = buf => new Promise((res, rej) => {
    if (ffErr) return rej(ffErr);
    if (ff.stdin.write(buf)) return res();
    ff.stdin.once('drain', res);
  });

  for (let f = 0; f < total; f++) {
    const t = f / fps;
    await evalJS(cdp, S, `window.__seek(${t.toFixed(4)})`);
    const buf = await shot(cdp, S, W, H, 94);
    await write(buf);
    if (onProgress && (f % 15 === 0 || f === total - 1)) onProgress(f + 1, total);
  }

  ff.stdin.end();
  await new Promise((res, rej) => { ff.on('close', c => c === 0 ? res() : rej(new Error('ffmpeg 退出码 ' + c))); });

  cdp.close();
  try { br.proc.kill('SIGKILL'); } catch (e) { }
  await new Promise(r => setTimeout(r, 600));
  try { fs.rmSync(br.profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 300 }); }
  catch (e) { /* 临时目录残留无所谓，系统会清 */ }
  return out;
}
