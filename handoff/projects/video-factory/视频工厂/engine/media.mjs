/* =========================================================================
   素材处理：扫描「1-我的文案/素材/」里的图片和视频
     · 自动「做旧」（去饱和 + 米黄调 + 提对比），让素材融进纸面风格
     · 生成缩略图，给校对页挑选用
     · 按文件指纹缓存，改过才重做
   ========================================================================= */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const IMG = /\.(jpe?g|png|webp|gif|heic)$/i;
const VID = /\.(mp4|mov|m4v|webm|mkv|avi)$/i;

/* 做旧滤镜：强度 0(不处理) ~ 1(最狠) */
function gradeFilter(k = 0.75) {
  const sat = 1 - 0.78 * k;
  return `hue=s=${sat.toFixed(2)},` +
    `colorbalance=rs=${(0.12 * k).toFixed(3)}:gs=${(0.05 * k).toFixed(3)}:bs=${(-0.12 * k).toFixed(3)}` +
    `:rm=${(0.08 * k).toFixed(3)}:bm=${(-0.09 * k).toFixed(3)},` +
    `eq=contrast=${(1 + 0.12 * k).toFixed(3)}:brightness=${(-0.02 * k).toFixed(3)}`;
}

/* 读图片宽高（PNG / JPEG 文件头），竖屏版式按图片真实比例排版用 */
function imgSize(f) {
  try {
    const b = fs.readFileSync(f);
    if (b[0] === 0x89 && b[1] === 0x50) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xFF) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xC0 && m <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(m)) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
      i += 2 + b.readUInt16BE(i + 2);
    }
  } catch (e) { }
  return {};
}

function fingerprint(f) {
  const st = fs.statSync(f);
  return `${st.size}-${Math.round(st.mtimeMs)}`;
}

// 视频宽高：让版式按真实比例摆放（拿不到时由版式按 1.6:1 兜底）
function videoSize(file, ffmpeg) {
  try { execFileSync(ffmpeg, ['-i', file], { stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) {
    const m = String(e.stderr || '').match(/Video:.*?(\d{2,5})x(\d{2,5})/);
    if (m) return { w: +m[1], h: +m[2] };
  }
  return {};
}

function videoDuration(file, ffmpeg) {
  try { execFileSync(ffmpeg, ['-i', file], { stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) {
    const m = String(e.stderr || '').match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
    if (m) return (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]);
  }
  return 5;
}

/**
 * 扫描素材目录，产出可用素材清单
 * @returns [{name, kind:'image'|'video', src(做旧后的绝对路径), w, h(图片宽高), thumb(base64), dur}]
 */
export function scanMedia({ dir, cacheDir, ffmpeg, grade = 0.75, quiet = false }) {
  if (!fs.existsSync(dir)) return [];
  fs.mkdirSync(cacheDir, { recursive: true });
  const idxFile = path.join(cacheDir, 'index.json');
  let idx = {};
  try { idx = JSON.parse(fs.readFileSync(idxFile, 'utf8')); } catch (e) { }

  const out = [];
  for (const name of fs.readdirSync(dir).sort()) {
    const f = path.join(dir, name);
    if (!fs.statSync(f).isFile()) continue;
    const isImg = IMG.test(name), isVid = VID.test(name);
    if (!isImg && !isVid) continue;

    const fp = fingerprint(f);
    const base = name.replace(/\.[^.]+$/, '').replace(/[^\w一-鿿-]/g, '_');
    const outFile = path.join(cacheDir, base + (isVid ? '.mp4' : '.jpg'));
    const thumbFile = path.join(cacheDir, base + '.thumb.jpg');
    const hit = idx[name] && idx[name].fp === fp && fs.existsSync(outFile) && fs.existsSync(thumbFile);

    if (!hit) {
      if (!quiet) process.stdout.write(`\r   处理素材：${name}                    `);
      // 文件名带「-原色」的素材不做旧（如产品截图、录屏，要保留原本的颜色）
      const g = /-原色$/.test(name.replace(/\.[^.]+$/, '')) ? 0 : grade;
      const vf = g > 0.02 ? gradeFilter(g) : 'null';
      try {
        if (isVid) {
          execFileSync(ffmpeg, ['-y', '-v', 'error', '-i', f,
            '-vf', `${vf},scale='min(1600,iw)':-2`, '-an',
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart', outFile]);
          execFileSync(ffmpeg, ['-y', '-v', 'error', '-ss', '0.5', '-i', outFile,
            '-frames:v', '1', '-vf', 'scale=420:-1', '-q:v', '6', thumbFile]);
        } else {
          execFileSync(ffmpeg, ['-y', '-v', 'error', '-i', f,
            '-vf', `${vf},scale='min(1800,iw)':-2`, '-q:v', '3', outFile]);
          execFileSync(ffmpeg, ['-y', '-v', 'error', '-i', outFile,
            '-vf', 'scale=420:-1', '-q:v', '6', thumbFile]);
        }
      } catch (e) { continue; }
      idx[name] = { fp, kind: isVid ? 'video' : 'image' };
    }

    out.push({
      name, kind: isVid ? 'video' : 'image',
      src: outFile, ...(isImg ? imgSize(outFile) : videoSize(outFile, ffmpeg)),
      thumb: fs.existsSync(thumbFile) ? fs.readFileSync(thumbFile).toString('base64') : null,
      dur: isVid ? videoDuration(outFile, ffmpeg) : null
    });
  }
  fs.writeFileSync(idxFile, JSON.stringify(idx, null, 1), 'utf8');
  if (!quiet && out.length) process.stdout.write(`\r   素材就绪：${out.length} 个           \n`);
  return out;
}

/** 文案里写的名字 → 做旧后的实际文件（允许不写扩展名） */
export function resolveMedia(list, name) {
  if (!name) return null;
  const n = String(name).trim();
  return list.find(m => m.name === n)
    || list.find(m => m.name.replace(/\.[^.]+$/, '') === n.replace(/\.[^.]+$/, ''))
    || null;
}
