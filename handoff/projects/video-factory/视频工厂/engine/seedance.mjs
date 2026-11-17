/* =========================================================================
   Seedance 2.0（BytePlus ModelArk）：按文字描述生成一段视频，存进「素材」
     · 文案里写  [生成] 描述 | 8秒 | 720p         → 满屏视频（默认：迷你版 5 秒 480p）
               [生成] 描述 | 2.0                   → 改用画质最好的 2.0（1080p 会自动用 2.0）
               [生成画中画] 描述 | 说明条 …        → 画中画
     · 同一句描述只生成一次（文件名 = 描述的指纹），重渲不重复扣费
     · 「看版面」只显示占位，不花钱；「开始做视频」先报价，你按 y 才生成
     · 单独试一段：node engine/seedance.mjs "描述" [8秒] [720p] [2.0]
   API Key 放在 ~/.config/seedance/api_key.txt（只放 Key 本身）
   ========================================================================= */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';
import crypto from 'node:crypto';

const BASE = 'https://ark.ap-southeast.bytepluses.com/api/v3';
// 迷你版只支持 480p / 720p；价格（美元/千 token）：2.0 按账单实测，迷你版按控制台标价
const MODELS = {
  mini: { id: 'dreamina-seedance-2-0-mini-260615', label: '2.0迷你版', price: 0.0035 },
  full: { id: 'dreamina-seedance-2-0-260128', label: '2.0', price: 0.0070 },
};
const KEY_FILE = path.join(os.homedir(), '.config', 'seedance', 'api_key.txt');
const SIZE = { '480p': [864, 480], '720p': [1280, 720], '1080p': [1920, 1080] };   // 16:9

export const GEN_RE = /^\[生成(画中画)?\]\s*(.+)$/;

/** 解析一行 [生成] → {pip, prompt, dur, res, extra(画中画说明条), name} */
export function parseGen(line) {
  const m = line.trim().match(GEN_RE);
  if (!m) return null;
  const parts = m[2].split('|').map(s => s.trim()).filter(Boolean);
  const spec = { pip: !!m[1], prompt: parts.shift() || '', dur: 5, res: '480p', model: 'mini', extra: [] };
  for (const p of parts) {
    const d = p.match(/^(\d{1,2})\s*秒$/), r = p.match(/^(480|720|1080)p$/i);
    if (d) spec.dur = Math.min(15, Math.max(4, +d[1]));
    else if (r) spec.res = r[1].toLowerCase() + 'p';
    else if (/^(2\.0|高清|精细)$/.test(p)) spec.model = 'full';
    else if (/^迷你$/.test(p)) spec.model = 'mini';
    else spec.extra.push(p);
  }
  if (spec.res === '1080p') spec.model = 'full';
  const fp = crypto.createHash('sha1').update([MODELS[spec.model].id, spec.prompt, spec.dur, spec.res].join('\n')).digest('hex');
  spec.name = `生成-${fp.slice(0, 8)}.mp4`;
  return spec;
}

/** 估价：token ≈ 宽×高×24帧×秒数 / 1024 */
export function estimate(spec) {
  const [w, h] = SIZE[spec.res];
  const tokens = Math.round(w * h * 24 * spec.dur / 1024);
  return { tokens, usd: tokens / 1000 * MODELS[spec.model].price };
}

/**
 * 把文案里的 [生成] 行换成普通版式（逐行替换，行号不变，校对页对得上）
 *   已生成 → [满屏] 生成-xxxx.mp4 / [画中画] 生成-xxxx.mp4 | 说明条
 *   未生成 → [引用] 占位
 */
export function rewriteScript(text, mediaDir) {
  const pending = [];
  // <!-- … --> 注释里的 [生成] 不报价、不生成（和 parse.mjs 一样换成等量换行，行号不变）（2026-10-07）
  text = String(text).replace(/<!--[\s\S]*?-->/g, m => '\n'.repeat((m.match(/\n/g) || []).length));
  const out = text.split('\n').map(line => {
    const s = parseGen(line);
    if (!s) return line;
    if (fs.existsSync(path.join(mediaDir, s.name))) {
      return s.pip ? `[画中画] ${[s.name, ...s.extra].join(' | ')}` : `[满屏] ${s.name}`;
    }
    if (!pending.some(p => p.name === s.name)) pending.push(s);
    return `[引用] 待生成视频（${MODELS[s.model].label} ${s.dur}秒 ${s.res}） | ${s.prompt.slice(0, 40)}`;
  });
  return { text: out.join('\n'), pending };
}

function apiKey() {
  const k = fs.existsSync(KEY_FILE) ? fs.readFileSync(KEY_FILE, 'utf8').trim() : '';
  if (!k) throw new Error(`没有找到 API Key：请把 Key 粘贴进 ${KEY_FILE}`);
  return k;
}

async function call(method, p, body) {
  const r = await fetch(BASE + p, {
    method,
    headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) {
    const e = j.error || {};
    throw new Error(`Seedance 接口报错 ${r.status} ${e.code || ''}：${e.message || JSON.stringify(j).slice(0, 300)}`);
  }
  return j;
}

/** 生成一段并下载到 mediaDir/spec.name，返回 {file, tokens} */
export async function generate(spec, mediaDir, log = console.log) {
  fs.mkdirSync(mediaDir, { recursive: true });
  const task = await call('POST', '/contents/generations/tasks', {
    model: MODELS[spec.model].id,
    content: [{ type: 'text', text: spec.prompt }],
    resolution: spec.res, ratio: '16:9', duration: spec.dur,
    generate_audio: false,     // 旁白和配乐由视频工厂自己合成
    watermark: false
  });
  const t0 = Date.now();
  let res, last;
  for (;;) {
    await new Promise(r => setTimeout(r, 10000));
    res = await call('GET', `/contents/generations/tasks/${task.id}`);
    const sec = Math.round((Date.now() - t0) / 1000);
    if (res.status !== last) { log(`   ${spec.name}：${res.status}（${sec} 秒）`); last = res.status; }
    if (res.status === 'succeeded') break;
    if (['failed', 'cancelled', 'expired'].includes(res.status)) {
      throw new Error(`生成失败（${res.status}）：${res.error?.message || res.error?.code || '无详细原因'}`);
    }
    if (sec > 1200) { throw new Error(`等了 20 分钟还没好，任务 ID：${task.id}`); }
  }
  const videoUrl = res.content?.video_url;
  if (!videoUrl) throw new Error('任务成功但没有返回视频地址：' + JSON.stringify(res).slice(0, 300));
  const r = await fetch(videoUrl);
  if (!r.ok) throw new Error(`下载视频失败 ${r.status}`);
  const file = path.join(mediaDir, spec.name);
  fs.writeFileSync(file + '.part', Buffer.from(await r.arrayBuffer()));
  fs.renameSync(file + '.part', file);

  // 记账：实际 token 用量写进「生成记录.csv」，方便对账
  const tokens = res.usage?.total_tokens ?? res.usage?.completion_tokens ?? '';
  const rec = path.join(mediaDir, '生成记录.csv');
  if (!fs.existsSync(rec)) fs.writeFileSync(rec, '﻿时间,文件,秒数,分辨率,实际token,任务ID,描述\n');
  const resCol = spec.model === 'full' ? spec.res : `${spec.res} ${MODELS[spec.model].label}`;
  const q = s => `"${String(s).replace(/"/g, '""')}"`;
  fs.appendFileSync(rec, [new Date().toLocaleString('zh-CN'), spec.name, spec.dur, resCol, tokens, task.id, q(spec.prompt)].join(',') + '\n');
  log(`   ✓ 已保存 ${spec.name}${tokens ? `（实际用量 ${tokens} token）` : ''}`);
  return { file, tokens };
}

/** 报价单文字 */
export function quote(pending) {
  let usd = 0;
  const lines = pending.map((s, i) => {
    const e = estimate(s); usd += e.usd;
    return `   ${i + 1}. ${MODELS[s.model].label} ${s.dur}秒 ${s.res}  约 $${e.usd.toFixed(2)}  ${s.prompt.slice(0, 36)}`;
  });
  return { text: lines.join('\n'), usd };
}

/** 最多 3 段同时生成（平台对个人用户的并发上限是 3） */
export async function generateAll(pending, mediaDir, log = console.log) {
  const queue = [...pending];
  const worker = async () => {
    for (let s; (s = queue.shift());) {
      try { await generate(s, mediaDir, log); }
      catch (e) { log(`   ⚠️ ${s.name}：${e.message}（这一段先用占位）`); }
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, pending.length) }, worker));
}

/* ---- 单独运行：node engine/seedance.mjs "描述" [8秒] [1080p] ---- */
if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (!args.length) { console.log('用法：node engine/seedance.mjs "画面描述" [8秒] [720p] [2.0]'); process.exit(0); }
  const spec = parseGen(`[生成] ${args.join(' | ')}`);
  const dir = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..', '1-我的文案', '素材');
  const e = estimate(spec);
  console.log(`🎥 Seedance ${MODELS[spec.model].label}：${spec.dur}秒 ${spec.res}，预计 ${e.tokens} token ≈ $${e.usd.toFixed(2)}`);
  if (fs.existsSync(path.join(dir, spec.name))) { console.log(`   已经生成过：${spec.name}，不重复扣费`); process.exit(0); }
  generate(spec, dir).then(({ file }) => console.log(`✅ ${file}`))
    .catch(err => { console.error('❌', err.message); process.exit(1); });
}
