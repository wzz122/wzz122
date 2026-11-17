/* v6 · Seedance 寓意小动画（BytePlus ModelArk，默认 2.0 迷你版 480p 16:9）——模板版，2026-10-07 从大阪 USJ v6 固化
   照 explainer-video-workflow reference 03「B. 镜头表」写法：沿用 engine/seedance.mjs 的接口、密钥文件和估价（只读引用，不改引擎），另加风格参考图。
   用法：node 生成.mjs 镜头.json A B C …   （最多 3 段同时跑；平台并发上限 3）。镜头.json 格式见 镜头-示例-USJ.json。
   ★ 花钱：每期先写「清单与报价」给用户看，用户点头的上限写进 镜头.json 顶层 "_本期上限美元"（没写就不跑）。
   · 本期总花费上限（含重做）：已花（按本目录账本的实际 token）+ 在跑的预估 + 这段预估 > 上限 就不再开新任务
   · 同一镜头已生成过就不再调用（不重复扣费）
   · 任务一建好就写进 任务.jsonl（断了也能凭任务 ID 找回）
   · 首尾帧（2026-11-06）：镜头里写 "first":"首帧.png"、"last":"尾帧.png"（last 可省），Seedance 从首帧走到尾帧；图自带画风，所以不能再写 ref
   · 记账：本目录 生成记录.csv + 共用账本 视频工厂/1-我的文案/素材/生成记录.csv；每段另写 AI-X.json */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
const { estimate } = await import(pathToFileURL(path.join(os.homedir(), 'Desktop/视频工厂/engine/seedance.mjs')).href);

const BASE = 'https://ark.ap-southeast.bytepluses.com/api/v3';
const MODELS = { mini: { id: 'dreamina-seedance-2-0-mini-260615', price: 0.0035 }, full: { id: 'dreamina-seedance-2-0-260128', price: 0.0070 } };
const KEY = fs.readFileSync(path.join(os.homedir(), '.config', 'seedance', 'api_key.txt'), 'utf8').trim();
const HERE = path.dirname(fileURLToPath(import.meta.url));
const LOCAL = path.join(HERE, '生成记录.csv');
const SHARED = path.join(os.homedir(), 'Desktop/视频工厂/1-我的文案/素材/生成记录.csv');
const TASKS = path.join(HERE, '任务.jsonl');
const HEAD = '﻿时间,文件,秒数,分辨率,实际token,任务ID,描述\n';

const [specF, ...ids] = process.argv.slice(2);
const shots = JSON.parse(fs.readFileSync(path.resolve(HERE, specF), 'utf8'));
const CAP = +shots._本期上限美元;
if (!(CAP > 0)) { console.log('⛔ 镜头.json 里没写 "_本期上限美元"：先报价、问用户批准的本期上限，写进去再跑（不花未经同意的钱）'); process.exit(2); }
if (!ids.length || ids.some(i => i.startsWith('_'))) { console.log('用法：node 生成.mjs 镜头.json A B C …'); process.exit(2); }
let PROJ = '本期';                                   // 账本里的期名：画面v6/项目.json「期名」
try { PROJ = JSON.parse(fs.readFileSync(path.join(HERE, '..', '..', '项目.json'), 'utf8')).期名 || PROJ; } catch { }

function spent() {               // 本期已花：本目录账本里每行 token × 单价
  if (!fs.existsSync(LOCAL)) return 0;
  let usd = 0;
  for (const line of fs.readFileSync(LOCAL, 'utf8').split('\n').slice(1)) {
    const c = line.split(',');
    if (c.length < 6 || !c[4]) continue;
    usd += (+c[4]) / 1000 * (c[3].includes('迷你') ? MODELS.mini.price : MODELS.full.price);
  }
  return usd;
}

async function call(method, p, body) {
  const r = await fetch(BASE + p, { method, headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) { const e = j.error || {}; throw new Error(`接口报错 ${r.status} ${e.code || ''}：${e.message || JSON.stringify(j).slice(0, 300)}`); }
  return j;
}

const imgPart = (f, role) => {
  const p = path.join(HERE, f);
  if (!fs.existsSync(p)) throw new Error(`找不到图片 ${f}`);
  const mime = /\.jpe?g$/i.test(f) ? 'jpeg' : 'png';
  return { type: 'image_url', image_url: { url: `data:image/${mime};base64,${fs.readFileSync(p).toString('base64')}` }, role };
};

let reserved = 0;
async function one(id) {
  const s = shots[id];
  if (!s) { console.log(`[${id}] 没有这个镜头`); return; }
  const out = path.join(HERE, s.out);
  if (fs.existsSync(out)) { console.log(`[${id}] 已生成过，不重复调用：${s.out}`); return; }
  const m = MODELS[s.model || 'mini'];
  const est = estimate({ res: s.res, dur: s.dur, model: s.model === 'full' ? 'full' : 'mini' }).usd;
  const now = spent();
  if (now + reserved + est > CAP + 1e-9) {
    console.log(`[${id}] ⛔ 超出本期上限 $${CAP}：已花 $${now.toFixed(3)} + 在跑 $${reserved.toFixed(3)} + 本段 $${est.toFixed(3)}，停`);
    return;
  }
  reserved += est;
  try {
    const content = [{ type: 'text', text: s.prompt }];
    if ((s.first || s.last) && s.ref) throw new Error('first/last 和 ref 不能同时写：首尾帧本身就定了画风');
    if (s.last && !s.first) throw new Error('写了 last 就要写 first');
    if (s.first) content.push(imgPart(s.first, 'first_frame'));
    if (s.last) content.push(imgPart(s.last, 'last_frame'));
    if (s.ref) content.push(imgPart(s.ref, 'reference_image'));
    const task = await call('POST', '/contents/generations/tasks', {
      model: m.id, content, resolution: s.res, ratio: s.ratio, duration: s.dur, generate_audio: false, watermark: false
    });
    fs.appendFileSync(TASKS, JSON.stringify({ id, task: task.id, out: s.out, at: new Date().toISOString() }) + '\n');
    console.log(`[${id}] 任务已建：${task.id}（预估 $${est.toFixed(3)}）`);
    const t0 = Date.now();
    let res, last;
    for (;;) {
      await new Promise(r => setTimeout(r, 10000));
      res = await call('GET', `/contents/generations/tasks/${task.id}`);
      const sec = Math.round((Date.now() - t0) / 1000);
      if (res.status !== last) { console.log(`[${id}]   ${res.status}（${sec} 秒）`); last = res.status; }
      if (res.status === 'succeeded') break;
      if (['failed', 'cancelled', 'expired'].includes(res.status)) {
        fs.appendFileSync(TASKS, JSON.stringify({ id, task: task.id, status: res.status, error: res.error || null, usage: res.usage || null }) + '\n');
        throw new Error(`生成失败（${res.status}）：${res.error?.message || res.error?.code || ''}`);
      }
      if (sec > 1200) throw new Error('超过 20 分钟未完成，任务 ID：' + task.id);
    }
    const url = res.content?.video_url;
    if (!url) throw new Error('任务成功但没有视频地址');
    const r = await fetch(url);
    if (!r.ok) throw new Error('下载失败 ' + r.status);
    fs.writeFileSync(out + '.part', Buffer.from(await r.arrayBuffer()));
    fs.renameSync(out + '.part', out);
    const tokens = res.usage?.total_tokens ?? res.usage?.completion_tokens ?? '';
    const q = x => `"${String(x).replace(/"/g, '""')}"`;
    const row = [new Date().toLocaleString('zh-CN'), PROJ + '/' + s.out, s.dur, `${s.res} ${s.ratio} ${s.model === 'full' ? '2.0' : '迷你版'}`, tokens, task.id, q(s.prompt)].join(',') + '\n';
    for (const f of [LOCAL, SHARED]) { if (!fs.existsSync(f)) fs.writeFileSync(f, HEAD); fs.appendFileSync(f, row); }
    fs.writeFileSync(out.replace(/\.mp4$/, '.json'), JSON.stringify({ id, task: task.id, model: m.id, tokens,
      usd: tokens ? +(tokens / 1000 * m.price).toFixed(4) : null, spec: s, usage: res.usage || null }, null, 1));
    console.log(`[${id}] ✓ ${s.out}  实际 ${tokens} token ≈ $${tokens ? (tokens / 1000 * m.price).toFixed(3) : '?'}`);
  } catch (e) {
    console.log(`[${id}] ⚠️ ${e.message}`);
  } finally {
    reserved -= est;
  }
}

const queue = [...ids];
const worker = async () => { for (let id; (id = queue.shift());) await one(id); };
await Promise.all(Array.from({ length: Math.min(3, ids.length) }, worker));
console.log(`本期累计实际花费 ≈ $${spent().toFixed(3)}（上限 $${CAP}）`);
