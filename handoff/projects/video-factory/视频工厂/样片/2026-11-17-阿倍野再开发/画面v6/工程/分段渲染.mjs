/* =========================================================================
   v6 分段渲染（通用模板版，2026-10-07 从 T009 大阪USJ v6 固化）：按镜头逐帧截图 → 每镜头一个 mp4（按指纹缓存，没变的镜头秒级复用）
   在 画面v6/工程/ 目录里运行（相对路径读 engine/ 与 .work/）；平时用 v6lib.render() 调它，不必手敲：
     node 分段渲染.mjs .work/storyboard.json ../镜头                       全部（没变的复用，写 manifest.json）
     node 分段渲染.mjs .work/storyboard.json ../镜头 --only=S19,S20         只渲这几个（写 manifest-only.json，不动 manifest.json）
     node 分段渲染.mjs .work/storyboard.json ../自测 --stills --only=S19 --at=0.5,3,6.2   只出静帧（含浏览器字幕）
     附加：--force 不复用缓存；--fonts 打印字体是否真的可用
   重任务：一律用 /usr/bin/python3 ~/.local/bin/mac-heavy-job.py -- node 分段渲染.mjs …（退出码 75 = 别的重任务在跑，等 1–2 分钟重试）
   v6 相对 v5 的改动（2026-10-07）：
     1. 指纹 deps 加 fx.js、cdp.mjs、engine/assets/ 下全部文件（纸纹 PNG）；
     2. 分镜里任何位置的 file:// 字符串都把文件内容哈希进缓存键（不止元素的 src）；
     3. 动画窗口：浏览器 __windows()（各组件自报）∪ 本脚本规则：motion:'continuous'、CHARTS 全时长、hideAt 退场、镜头 motion:'full'；
     4. 载入后等图片解码并检查坏图，坏图直接报错；记录每镜头耗时；--only 不覆盖 manifest.json。
   ========================================================================= */
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process'; import { pathToFileURL, fileURLToPath } from 'node:url';
import { launch, CDP, openPage, evalJS, shot, shotPNG } from './engine/cdp.mjs';   // 模板·实拍底片

const argv = process.argv.slice(2), flag = n => argv.includes(n), opt = n => (argv.find(x => x.startsWith(n + '=')) || '').slice(n.length + 1);
const pos = argv.filter(x => !x.startsWith('--'));
const input = pos[0] || '.work/storyboard.json', out = path.resolve(pos[1] || '../镜头');
const stills = flag('--stills'), force = flag('--force'), only = opt('--only').split(',').filter(Boolean);
const atList = opt('--at').split(',').filter(Boolean).map(Number);
fs.mkdirSync(out, { recursive: true });
const b = JSON.parse(fs.readFileSync(input)), F = 30, VW = 1920, VH = 1008;
const FF = execFileSync('python3', ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())'], { encoding: 'utf8' }).trim();
const sha = x => crypto.createHash('sha256').update(x).digest('hex');

// ---- 指纹：舞台代码 + 纸纹等资源 + 渲染器自身 ----
const depFiles = ['stage.js', 'stage.css', 'stage.html', 'charts.js', 'fx.js', 'fxmap.js', 'cdp.mjs']
  .concat(fs.existsSync('engine/assets') ? fs.readdirSync('engine/assets').filter(f => !f.startsWith('.')).sort().map(f => 'assets/' + f) : []);
const deps = depFiles.map(x => [x, sha(fs.readFileSync('engine/' + x))]);
const renderer = sha(fs.readFileSync(fileURLToPath(import.meta.url)));
const ah = new Map();
const hashAsset = u => { const p = fileURLToPath(u); if (!ah.has(p)) { if (!fs.existsSync(p)) throw new Error('素材不存在：' + p); ah.set(p, sha(fs.readFileSync(p))); } return ah.get(p); };
// 分镜里任何位置的 file:// 都算（layers[].src、fg.src、lens 的 src …）
const allFileUrls = (o, acc = new Set()) => { if (typeof o === 'string') { if (o.startsWith('file://')) acc.add(o); }
  else if (Array.isArray(o)) o.forEach(x => allFileUrls(x, acc)); else if (o && typeof o === 'object') Object.values(o).forEach(x => allFileUrls(x, acc)); return acc; };

// 缓存键与电脑无关（2026-10-08 起两台电脑共用云盘）：分镜里的 file:// 路径先换成文件内容哈希再算键，
// 所以用户名、云盘文件夹名（我的云端硬盘 / My Drive）不同，也能复用另一台电脑渲好的镜头。
const cacheKey = (local, assets) => { const m = new Map(assets);
  const norm = JSON.parse(JSON.stringify(local, (k, v) => typeof v === 'string' && m.has(v) ? 'sha256:' + m.get(v) : v));
  return sha(JSON.stringify({ v: 2, local: norm, assets: assets.map(a => a[1]).sort(), deps, renderer, fps: F })); };

// ---- 本脚本自己的窗口规则（与浏览器 __windows() 取并集） ----
const LEGACY_CHARTS = new Set(['line', 'waffle', 'bars', 'flow', 'target', 'converge', 'drop', 'trend', 'doc', 'crowd', 'enso', 'mic', 'lineart']);
function nodeWindows(sc, duration, fxTypes) {
  const w = [];
  for (const e of sc.elements) {
    const a = e.delay || 0;
    if (fxTypes.has(e.type)) { /* fx 组件的窗口由浏览器报；报不上来时下面兜底 */ }
    else if (LEGACY_CHARTS.has(e.type) || e.span === 'scene') w.push([a, Math.min(duration, a + (e.maxDur || duration))]);   // CHARTS 全时长
    else w.push([Math.max(0, a - .04), a + Math.max(e.dur || .52, e.type === 'statbar' ? Math.max(e.growDur || .65, .9) : .56) + .07]);
    for (const v of (e.views || []).slice(1)) w.push([Math.max(0, v.at - .04), v.at + (v.dur || .95) + .07]);
    if (e.motion === 'continuous') w.push([a, duration]);
    if (e.hideAt != null) w.push([Math.max(0, e.hideAt - .04), e.hideAt + (e.hideDur || .3) + .07]);
    if (e.growAt != null) w.push([Math.max(0, e.growAt - .04), e.growAt + Math.max(e.growDur || .65, .9) + .07]);
    if (e.kind === 'video') w.push([0, duration]);
  }
  if (sc.motion === 'full' || JSON.stringify(sc.camera) !== JSON.stringify(sc.camEnd)) w.push([0, duration]);
  return w;
}

let br, cdp, S, fxTypes = null; const records = [];
async function start() {
  if (cdp) return;
  br = await launch(9422 + (process.pid % 300)); cdp = await CDP.connect(br.wsUrl);
  S = await openPage(cdp, pathToFileURL(path.resolve('engine/stage.html')).href + (stills ? '' : '?nosub=1'), VW, VH);
  await evalJS(cdp, S, 'document.fonts.ready.then(()=>1)');
  fxTypes = new Set(await evalJS(cdp, S, 'Object.keys(window.FX ? window.FX.types : {})'));
  if (flag('--fonts')) console.log(JSON.stringify(await evalJS(cdp, S, `window.__fontCheck(["Songti SC","PingFang SC","Hiragino Mincho ProN","Hiragino Sans","Hannotate SC","Yuanti SC","HanziPen SC","Kaiti SC","Xingkai SC","Weibei SC","Helvetica Neue","Menlo","Bodoni 72"])`)));
}

try {
  const t00 = Date.now();
  for (let i = 0; i < b.scenes.length; i++) {
    const sc = b.scenes[i], id = sc.stable_id; if (only.length && !only.includes(id)) continue;
    const frames = Math.round(sc.t1 * F) - Math.round(sc.t0 * F), duration = frames / F;
    const localSc = structuredClone(sc); localSc.x = 0; localSc.y = 0; localSc.t0 = 0; localSc.t1 = duration; delete localSc.src;
    const localBeats = b.beats.filter(x => x.scene === i).map(x => ({ ...x, scene: 0, t0: Math.max(0, x.t0 - sc.t0), t1: Math.min(duration, x.t1 - sc.t0) }));
    const local = { meta: { ...b.meta, duration }, scenes: [localSc], beats: localBeats };
    const assets = [...allFileUrls(local)].sort().map(u => [u, hashAsset(u)]);
    const key = cacheKey(local, assets);
    const file = path.join(out, `${id}-${key.slice(0, 12)}.mp4`), jf = file.replace('.mp4', '.json');
    let reuse = false; try { reuse = !force && fs.existsSync(file) && JSON.parse(fs.readFileSync(jf)).key === key; } catch { }
    const t0 = Date.now(); let captures = 0, wins = [];
    if (!reuse || stills) {
      await start();
      const bgv = localSc.bgvideo ? fileURLToPath(localSc.bgvideo) : null;
      await cdp.send('Emulation.setDefaultBackgroundColorOverride', bgv ? { color: { r: 0, g: 0, b: 0, a: 0 } } : {}, S);
      await evalJS(cdp, S, 'window.__load(' + JSON.stringify(local) + ')');
      const ar = await evalJS(cdp, S, 'window.__assetsReady()');
      if (ar.bad.length) throw new Error(`${id} 图片解码失败：` + ar.bad.join(' | '));
      await evalJS(cdp, S, 'document.fonts.ready.then(()=>1)');
      const bw = (await evalJS(cdp, S, 'window.__windows()')) || [];
      wins = nodeWindows(localSc, duration, fxTypes).concat(bw.map(([a, z]) => [a, z]));
      // fx 组件没报窗口的兜底：从出现到镜头末
      const reported = new Set(bw.map(x => String(x[2]).split(':')[0]));
      for (const e of localSc.elements) if (fxTypes.has(e.type) && !reported.has(e.id)) wins.push([e.delay || 0, duration]);
      wins = wins.map(([a, z]) => [Math.max(0, +a.toFixed(4)), Math.min(duration, +z.toFixed(4))]).filter(([a, z]) => z > a);
      if (stills) {
        const ts = atList.length ? atList : [Math.min(duration - .1, Math.max(1.2, duration * .5)), Math.max(0, duration - .55)];
        for (const t of ts) {
          await evalJS(cdp, S, `window.__seek(${t})`);
          const sj = path.join(out, `${id}-t${t.toFixed(2)}.jpg`);
          if (bgv) { const pp = sj.replace('.jpg', '.png'); fs.writeFileSync(pp, await shotPNG(cdp, S, VW, VH));
            execFileSync(FF, ['-y', '-v', 'error', '-ss', t.toFixed(3), '-i', bgv, '-i', pp, '-filter_complex', '[0:v][1:v]overlay=0:0', '-frames:v', '1', '-q:v', '2', sj]); fs.unlinkSync(pp); }
          else fs.writeFileSync(sj, await shot(cdp, S, VW, VH, 94));
        }
        const bounds = await evalJS(cdp, S, `[...document.querySelectorAll('.el')].filter(e=>+getComputedStyle(e).opacity>.1).map(e=>({id:e.className,text:e.innerText.slice(0,80),rect:(r=>({x:r.x,y:r.y,w:r.width,h:r.height}))(e.getBoundingClientRect()),scroll:[e.scrollWidth,e.scrollHeight]}))`);
        fs.writeFileSync(path.join(out, id + '-bounds.json'), JSON.stringify({ windows: wins, bounds }, null, 2));
        console.log(id + ' 静帧 ' + ts.map(t => t.toFixed(2)).join(',')); continue;
      }
      const vin = bgv ? ['-i', bgv, '-f', 'image2pipe', '-framerate', '30', '-i', 'pipe:0', '-an', '-filter_complex',
          `[0:v]setpts=PTS-STARTPTS,scale=${VW}:${VH}:in_range=tv:in_color_matrix=bt709,format=rgba[b];[1:v]format=rgba[o];[b][o]overlay=0:0:eof_action=repeat,scale=in_range=full:out_range=tv:out_color_matrix=bt709,format=yuv420p`]
        : ['-f', 'image2pipe', '-framerate', '30', '-i', 'pipe:0', '-an', '-vf', `scale=in_range=full:in_color_matrix=bt601:out_range=tv:out_color_matrix=bt709,format=yuv420p`];
      const ff = spawn(FF, ['-y', '-v', 'error', ...vin, '-frames:v', String(frames), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-x264-params', 'keyint=15:min-keyint=15:scenecut=0:bframes=0:open-gop=0', '-threads', '3', '-r', '30', '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-video_track_timescale', '30000', '-movflags', '+faststart', file], { stdio: ['pipe', 'ignore', 'inherit'] });
      let ferr; ff.stdin.on('error', e => ferr = e); const done = new Promise((res, rej) => ff.on('close', c => c === 0 ? res() : rej(new Error('ffmpeg ' + c))));
      let buf, wasActive = false;
      for (let f = 0; f < frames; f++) {
        const t = f / F, active = wins.some(([a, z]) => t >= a && t <= z);
        if (!buf || active || wasActive) { await evalJS(cdp, S, `window.__seek(${t.toFixed(5)})`); buf = bgv ? await shotPNG(cdp, S, VW, VH) : await shot(cdp, S, VW, VH, 94); captures++; }
        wasActive = active; if (ferr) throw ferr; if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      }
      ff.stdin.end(); await done;
      const secs = (Date.now() - t0) / 1000;
      fs.writeFileSync(jf, JSON.stringify({ key, frames, duration, local, assets, deps, captured_frames: captures, reading_hold_frames: frames - captures, animation_windows: wins, render_seconds: secs, ms_per_capture: captures ? Math.round(secs * 1000 / captures) : 0, sha256: sha(fs.readFileSync(file)) }, null, 2));
    }
    const secs = (Date.now() - t0) / 1000;
    records.push({ id, scene: i, file, key, frames, duration, reused: reuse, global_start_frame: Math.round(sc.t0 * F) });
    console.log(`${id} ${reuse ? '复用' : '生成'} ${duration.toFixed(2)}s` + (reuse ? '' : `  用时 ${secs.toFixed(1)}s，真截 ${captures}/${frames} 帧`));
    fs.writeFileSync(path.join(out, 'manifest-progress.json'), JSON.stringify(records, null, 2));
  }
  if (!stills) fs.writeFileSync(path.join(out, only.length ? 'manifest-only.json' : 'manifest.json'), JSON.stringify(records, null, 2));
  console.log(JSON.stringify({ rendered: records.filter(x => !x.reused).length, reused: records.filter(x => x.reused).length, seconds: Math.round((Date.now() - t00) / 100) / 10 }));
} finally { if (cdp) cdp.close(); if (br) br.proc.kill(); }
process.exit(0);
