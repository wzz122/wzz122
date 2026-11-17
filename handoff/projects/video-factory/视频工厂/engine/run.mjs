/* =========================================================================
   总指挥：一条命令，从文案到成片
   用法: node engine/run.mjs [文案文件.md]
   ========================================================================= */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { execFileSync } from 'node:child_process';
import { parseScript, setMedia, setSvgDir } from './parse.mjs';
import { scanMedia } from './media.mjs';
import { buildAudio, buildAudioExternal } from './tts.mjs';
import { renderVideo } from './render.mjs';
import { mux, measureLoudness } from './mux.mjs';
import { fakeTiming, makePreview } from './preview.mjs';
import { rewriteScript, generateAll, quote } from './seedance.mjs';
import readline from 'node:readline/promises';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const WORK = path.join(ROOT, '.work');
const OUTD = path.join(ROOT, '2-成片');
const SCRD = path.join(ROOT, '1-我的文案');

const cfg = JSON.parse(fs.readFileSync(path.join(HERE, 'config.json'), 'utf8'));

/* ---- 找 ffmpeg ---- */
function findFFmpeg() {
  try {
    const p = execFileSync('python3', ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())'],
      { encoding: 'utf8' }).trim();
    if (p && fs.existsSync(p)) return p;
  } catch (e) { }
  for (const p of ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', 'ffmpeg']) {
    try { execFileSync(p, ['-version'], { stdio: 'ignore' }); return p; } catch (e) { }
  }
  throw new Error('找不到 ffmpeg');
}

const log = (s) => console.log(s);
const bar = (n, total) => {
  const w = 30, f = Math.round(w * n / total);
  process.stdout.write(`\r   [${'█'.repeat(f)}${'░'.repeat(w - f)}] ${String(Math.round(100 * n / total)).padStart(3)}%  ${n}/${total} 帧`);
  if (n === total) process.stdout.write('\n');
};

async function main() {
  fs.mkdirSync(WORK, { recursive: true });

  // .work 是共用的中间文件目录：两次出片同时跑会互相覆盖，所以同一时间只许一个
  const LOCK = path.join(WORK, '.lock');
  try {
    const pid = +fs.readFileSync(LOCK, 'utf8');
    if (pid && pid !== process.pid) {
      process.kill(pid, 0);   // 进程还活着才算占用
      console.error(`❌ 另一个出片任务（进程 ${pid}）正在用 .work，等它结束再来`);
      process.exit(75);
    }
  } catch (e) { }
  fs.writeFileSync(LOCK, String(process.pid));
  process.on('exit', () => { try { if (+fs.readFileSync(LOCK, 'utf8') === process.pid) fs.unlinkSync(LOCK); } catch (e) { } });
  fs.mkdirSync(OUTD, { recursive: true });

  // 预览模式：只出版面，不配音、不渲染视频
  const args = process.argv.slice(2);
  const PREVIEW = args.some(a => /^(--预览|--preview|-p)$/.test(a));
  // 不烧字幕：输出「文案名-无字幕.mp4」，给竖屏版等另行排字幕用
  const NOSUB = args.some(a => /^(--无字幕|--no-sub)$/.test(a));
  // 竖屏：原生 1080×1920 版式（小红书 / 视频号），输出「文案名-竖屏.mp4」
  const VERT = args.some(a => /^(--竖屏|--vertical)$/.test(a));

  // 1. 找文案
  let file = args.find(a => !a.startsWith('-'));
  if (!file) {
    const cands = fs.readdirSync(SCRD).filter(f => f.endsWith('.md')).sort();
    if (!cands.length) { console.error('❌ 在「1-我的文案」里没找到 .md 文案'); process.exit(1); }
    file = path.join(SCRD, cands[0]);
  }
  if (!path.isAbsolute(file)) file = path.resolve(process.cwd(), file);
  const name = path.basename(file).replace(/\.md$/, '');
  log(`\n📄 文案：${path.basename(file)}`);

  const ffmpeg = findFFmpeg();

  // 1.2 Seedance：文案里的 [生成] 行。看版面只放占位；出片前报价，按 y 才生成（花钱）
  const mediaDir = path.join(SCRD, '素材');
  let scriptText = fs.readFileSync(file, 'utf8');
  let gen = rewriteScript(scriptText, mediaDir);
  if (gen.pending.length && !PREVIEW) {
    const q = quote(gen.pending);
    log(`\n🎥 有 ${gen.pending.length} 段视频要用 Seedance 生成（会从 BytePlus 余额扣钱）：\n${q.text}`);
    log(`   合计约 $${q.usd.toFixed(2)}（最多 3 段同时生成）`);
    let ok = args.includes('--确认生成');
    if (!ok && process.stdin.isTTY) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      ok = /^y(es)?$/i.test((await rl.question('   输入 y 回车开始生成；直接回车 = 不生成，用占位继续出片：')).trim());
      rl.close();
    }
    if (ok) {
      await generateAll(gen.pending, mediaDir, log);
      gen = rewriteScript(scriptText, mediaDir);
    } else log('   已跳过生成，这几屏先用占位。');
  } else if (gen.pending.length) {
    log(`🎥 有 ${gen.pending.length} 段 [生成] 视频还没生成，版面上先显示占位（看版面不花钱）`);
  }
  scriptText = gen.text;

  // 1.5 素材：扫描 + 做旧 + 缩略图
  const media = scanMedia({
    dir: path.join(SCRD, '素材'), cacheDir: path.join(WORK, '素材做旧'),
    ffmpeg, grade: cfg.mediaGrade ?? 0.75
  });
  setMedia(media);
  setSvgDir(path.join(SCRD, '素材'));        // [线描] 的 SVG 线稿也放在素材文件夹

  // 2. 拆稿（有手工分镜就优先用）
  const boardFile = file.replace(/\.md$/, '.分镜.json');
  let board;
  if (fs.existsSync(boardFile)) {
    board = JSON.parse(fs.readFileSync(boardFile, 'utf8'));
    log(`🎬 用你的手工分镜：${path.basename(boardFile)}`);
  } else {
    // 竖屏可选「文案名.竖屏断行.json」：{原句: "上半|下半"}，指定字幕两行的断点
    const brF = file.replace(/\.md$/, '.竖屏断行.json');
    const breaks = VERT && fs.existsSync(brF) ? JSON.parse(fs.readFileSync(brF, 'utf8')) : {};
    // 横屏可选「文案名.横屏断行.json」：标题、对比面板正文的手动断行（窄标题栏里避免词中间断、单字成行）
    const hbF = file.replace(/\.md$/, '.横屏断行.json');
    const hbreaks = !VERT && fs.existsSync(hbF) ? JSON.parse(fs.readFileSync(hbF, 'utf8')) : {};
    board = parseScript(scriptText, { vertical: VERT, breaks, hbreaks });
    log(`🎬 自动拆稿完成：${board.scenes.length} 个画面，${board.beats.length} 句旁白`);
  }
  board.meta.fps = cfg.fps;

  // ===== 预览模式 =====
  if (PREVIEW) {
    const dur = fakeTiming(board, cfg);
    fs.writeFileSync(path.join(WORK, 'timeline.js'), 'window.__DATA = ' + JSON.stringify(board) + ';', 'utf8');
    fs.writeFileSync(path.join(WORK, 'storyboard.json'), JSON.stringify(board, null, 2), 'utf8');
    const outDir = path.join(ROOT, '3-校对', name + (VERT ? '-竖屏' : ''));
    log(`🖼  正在出版面预览（${board.scenes.length} 屏，不配音）…`);
    const { page } = await makePreview({
      board, work: WORK, outDir, stageHtml: path.join(HERE, 'stage.html'),
      scriptName: name, scriptFile: file, ffmpeg, media,
      onProgress: (n, t) => process.stdout.write(`\r   ${n}/${t} 屏`)
    });
    process.stdout.write('\n');
    log(`\n✅ 校对页：${page}`);
    log(`   估算时长 ${Math.floor(dur / 60)} 分 ${Math.round(dur % 60)} 秒（真配音后会变）\n`);
    try { execFileSync('/usr/bin/open', [page]); } catch (e) { }
    return;
  }

  // 3. 配音 + 对时间轴
  // 有「文案名.旁白.wav/mp3」就用这条现成配音，否则用 macOS 自带语音
  const voiceFile = ['wav', 'mp3', 'm4a'].map(e => file.replace(/\.md$/, `.旁白.${e}`)).find(f => fs.existsSync(f));
  let narration, duration;
  if (voiceFile) {
    log(`🎙  使用外部配音：${path.basename(voiceFile)}，正在对齐字幕…`);
    ({ narration, duration } = buildAudioExternal(board, WORK, cfg, ffmpeg, voiceFile));
  } else {
    log(`🎙  正在配音（${cfg.voice}，语速 ${cfg.rate}）…`);
    ({ narration, duration } = buildAudio(board, WORK, cfg, ffmpeg));
  }
  log(`   时长 ${Math.floor(duration / 60)} 分 ${Math.round(duration % 60)} 秒`);

  fs.writeFileSync(path.join(WORK, 'timeline.js'),
    'window.__DATA = ' + JSON.stringify(board) + ';', 'utf8');
  fs.writeFileSync(path.join(WORK, 'storyboard.json'), JSON.stringify(board, null, 2), 'utf8');

  // 4. 逐帧渲染
  log(`🖼  正在渲染画面（${cfg.fps}fps / 1920×1080）…`);
  const silent = path.join(WORK, 'silent.mp4');
  await renderVideo({
    stageUrl: url.pathToFileURL(path.join(HERE, 'stage.html')).href + (NOSUB ? '?nosub=1' : ''),
    duration, fps: cfg.fps, out: silent, ffmpeg, onProgress: bar,
    W: board.meta.vw || 1920, H: board.meta.vh || 1080
  });

  // 5. 合成
  log(`🔊 合成声音…`);
  const out = path.join(OUTD, `${name}${VERT ? '-竖屏' : ''}${NOSUB ? '-无字幕' : ''}.mp4`);
  // 优先用「文案名.bgm.mp3」，没有再用通用的 bgm.mp3
  const ownBgm = file.replace(/\.md$/, '.bgm.mp3');
  const bgm = fs.existsSync(ownBgm) ? ownBgm : path.join(ROOT, '1-我的文案', 'bgm.mp3');
  mux({ video: silent, narration, bgm, out, ffmpeg, cfg, duration });
  const L = measureLoudness(out, ffmpeg);
  if (L && L.I) log(`   响度 ${L.I} LUFS（目标 ${cfg.loudness ?? -14}）· 峰值 ${L.TP} dBFS${fs.existsSync(bgm) ? ' · 背景音乐已闪避' : ''}`);

  const mb = (fs.statSync(out).size / 1048576).toFixed(1);
  log(`\n✅ 成片：${out}  (${mb} MB)\n`);
  try { execFileSync('/usr/bin/open', ['-R', out]); } catch (e) { }
}

main().catch(e => { console.error('\n❌ 出错：', e.message); process.exit(1); });
