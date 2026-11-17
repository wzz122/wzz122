#!/usr/bin/env node
/*
 * render_shot.mjs — 把一个组件逐帧截图，合成无声 MP4
 *
 * 用法：
 *   node scripts/render_shot.mjs components/terrain-orbit --out episodes/test/renders/TEST-S01.mp4
 *   可选：--fps 30  --from 0 --to 12（秒）  --config '{"exaggeration":6}'  --stills 0,3,6,12（只出这几秒的 PNG，不出视频）
 *
 * 做法：本地起静态服务器 → 无头 Chromium 打开 index.html?render → await __ready →
 *       每帧 await __seek(帧/fps)（组件内部会等地图瓦片加载完、画完）→ 截 PNG → 管道送 ffmpeg。
 * 一次只跑一个渲染，不和达芬奇渲染同时跑（16 GB Mac）。
 */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, readdir, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { extname, join, resolve, dirname, relative } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const a = { fps: 30, config: null, out: null, from: 0, to: null, stills: null };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--fps') a.fps = Number(argv[++i]);
    else if (k === '--out') a.out = argv[++i];
    else if (k === '--config') a.config = argv[++i];
    else if (k === '--from') a.from = Number(argv[++i]);
    else if (k === '--to') a.to = Number(argv[++i]);
    else if (k === '--stills') a.stills = argv[++i].split(',').map(Number);
    else rest.push(k);
  }
  a.component = rest[0];
  return a;
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.geojson': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.otf': 'font/otf', '.ttf': 'font/ttf' };

function serve(root) {
  const server = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p === '/__secret/google-maps-key') {
        // 只给本机渲染页用；密钥文件不进仓库
        const key = await readFile(join(homedir(), '.config/google-maps/api_key.txt'), 'utf8');
        res.writeHead(200, { 'content-type': 'text/plain' }); res.end(key.trim()); return;
      }
      if (p.endsWith('/')) p += 'index.html';
      const file = join(root, p);
      if (!file.startsWith(root)) throw new Error('outside root');
      const data = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404); res.end();
    }
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}

async function findChromium() {
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  const dirs = (await readdir(cache)).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse();
  for (const d of dirs) {
    const exe = join(cache, d, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
    try { await access(exe); return exe; } catch {}
  }
  throw new Error('找不到 Playwright 的 Chromium，先运行 npx playwright install chromium');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.component || (!args.out && !args.stills)) {
    console.error('用法：node scripts/render_shot.mjs <组件目录> --out <文件.mp4> [--fps 30] [--config JSON] [--stills 0,3,6]');
    process.exit(2);
  }
  const server = await serve(ROOT);
  const port = server.address().port;
  const compRel = relative(ROOT, resolve(args.component)).split('\\').join('/');
  let url = `http://127.0.0.1:${port}/${compRel}/index.html?render`;
  if (args.config) url += '&config=' + encodeURIComponent(args.config);

  const browser = await chromium.launch({
    executablePath: await findChromium(),
    headless: true,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars'],
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.evaluate(() => window.__ready);
  const duration = await page.evaluate(() => window.__duration);
  const t1 = args.to ?? duration;
  const t0 = Math.max(0, args.from);

  const shot = async (t) => {
    await page.evaluate((tt) => window.__seek(tt), t);
    return page.screenshot({ type: 'png' });
  };

  if (args.stills) {
    const outDir = args.out ? dirname(resolve(args.out)) : resolve(args.component, 'stills');
    await mkdir(outDir, { recursive: true });
    for (const t of args.stills) {
      const buf = await shot(t);
      const f = join(outDir, `still-${String(t).replace('.', '_')}s.png`);
      await writeFile(f, buf);
      console.log('静帧', f);
    }
  } else {
    const out = resolve(args.out);
    await mkdir(dirname(out), { recursive: true });
    const n = Math.round((t1 - t0) * args.fps);
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(args.fps), '-c:v', 'png', '-i', '-',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(args.fps), '-movflags', '+faststart', out],
      { stdio: ['pipe', 'inherit', 'inherit'] });
    const started = Date.now();
    for (let i = 0; i < n; i++) {
      const buf = await shot(t0 + i / args.fps);
      if (!ff.stdin.write(buf)) await new Promise((ok) => ff.stdin.once('drain', ok));
      if (i % 30 === 0) console.log(`帧 ${i}/${n}  ${((Date.now() - started) / 1000).toFixed(0)}s`);
    }
    ff.stdin.end();
    const code = await new Promise((ok) => ff.on('close', ok));
    if (code !== 0) throw new Error('ffmpeg 退出码 ' + code);
    console.log('完成', out, `${n} 帧，用时 ${((Date.now() - started) / 1000).toFixed(0)}s`);
  }

  const uniq = [...new Set(errors)];
  if (uniq.length) console.log(`浏览器提示 ${uniq.length} 条（前 10 条）：\n` + uniq.slice(0, 10).join('\n'));
  await browser.close();
  server.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
