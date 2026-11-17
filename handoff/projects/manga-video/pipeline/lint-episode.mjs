/* 税务图解整期自检（不渲染）：读 build-episode 生成的时间轴和报告，列出需要人看的地方。
   用法：node pipeline/lint-episode.mjs episodes/<期名>
   产物：episodes/<期名>/build/lint.md（同时打印摘要）
   检查：章节卡标题长度、引用卡、场景状态（理由、焦点、停留）、安全区、颜色语义、角色不能离场、新期默认开关和前提卡字号、音效密度、字幕速度、自动补的步骤、关键词触发是怎么定的时间。
   结果分 FAIL（一定要改）/ WARN（要人看一眼）/ INFO（知道就行）。这只是机器能查的部分，不代替看样片。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const epDir = path.resolve(ROOT, process.argv[2] ?? 'episodes/furusato');
const id = path.basename(epDir);
const tl = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/episodes', id, 'timeline.json'), 'utf8'));
const readJson = p => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null);
const cues = readJson(path.join(epDir, 'build/cue-report.json')) ?? [];
const sfx = readJson(path.join(epDir, 'build/sfx.json')) ?? [];
const FPS = 30;
const sec = f => (f / FPS).toFixed(2);
const out = { FAIL: [], WARN: [], INFO: [] };
const note = (lvl, msg) => out[lvl].push(msg);

// 颜色语义（全片固定）：橙 = 付出去的钱，绿 = 以后抵扣，黄 = 自己负担
const ROLE_COLOR = { paid: 'orange', credit: 'green', self: 'yellow' };
const SEMANTIC = new Set(Object.values(ROLE_COLOR));
const SAFE = { x0: 300, x1: 1580, y0: 70, y1: 870 };
const name = o => o.id ?? `${o.kind}「${String(o.label ?? o.value ?? o.text ?? '').split('\n')[0].slice(0, 12)}」`;

for (const v of tl.visuals) {
  if (v.type !== 'scene') {
    // 章节卡、片头卡：标题不换行，一行超过卡片内宽（1020）就会出框。一行不超过 12 个字，长标题用 \n 分行
    if (v.type === 'chapterTitle') {
      const ls = String(v.data.title).split('\n');
      ls.forEach((l, i) => {
        const w = [...l].reduce((n, ch) => n + (/[\x00-\xff]/.test(ch) ? 0.55 : 1), 0) * (ls.length > 1 ? (i === 0 ? 92 : 72) : 84);
        if (w > 1020) note('FAIL', `${v.id}（${sec(v.from)}s）标题「${l}」太长，会超出白卡：用 \\n 分行`);
      });
    }
    if (v.auto) note('INFO', `${v.id}（${v.type}，${sec(v.from)}s）有 ${v.auto} 个步骤是自动按 0.4–0.9 秒补的；必读的表格、列表请在 visuals.json 写明 steps`);
    continue;
  }
  const objs = v.data.objects, states = v.data.states ?? [];
  const byId = Object.fromEntries(objs.filter(o => o.id).map(o => [o.id, o]));
  const born = o => o.keys[0].f;
  const goneAt = o => o.keys.find(k => k.o === 0)?.f ?? Infinity;

  // 1. 状态：理由、焦点是否在画面上、焦点稳定多久
  states.forEach((s, i) => {
    const next = states[i + 1]?.f ?? v.to;
    if (!s.why) note('WARN', `${v.id} 状态 ${s.id}：没写 why（这一步观众要看懂什么）`);
    for (const ref of [s.focus, s.point].filter(Boolean)) {
      const o = byId[ref];
      if (born(o) > next) note('FAIL', `${v.id} 状态 ${s.id}（${sec(s.f)}s）：焦点 ${ref} 到下一个状态都还没出现`);
      if (goneAt(o) <= s.f) note('FAIL', `${v.id} 状态 ${s.id}（${sec(s.f)}s）：焦点 ${ref} 已经退场`);
    }
    if (s.hold && s.focus) {
      // 焦点对象在这个状态里动完（最后一个关键帧 + 过渡时长）以后，到它下一次被改动、退场或视线移到别的对象为止
      const o = byId[s.focus];
      const inState = o.keys.filter(k => k.f >= s.f - 1 && k.f < next && k.o !== 0);
      const settle = Math.max(s.f, ...inState.map(k => k.f + (k.dur ?? 16)));
      const change = o.keys.find(k => k.f >= next || (k.o === 0 && k.f >= s.f))?.f ?? Infinity;
      const focusMoves = states.slice(i + 1).find(t => t.focus !== s.focus)?.f ?? v.to;
      const stable = Math.min(change, focusMoves, v.to) - settle;
      if (stable / FPS < s.hold) note('WARN', `${v.id} 状态 ${s.id}（${sec(s.f)}s）：焦点 ${s.focus} 只稳定 ${sec(stable)}s，少于要求的 ${s.hold}s`);
    }
  });

  // 1b. 引用卡：来源标签放在卡片上方，不压内容
  for (const o of objs) if (o.kind === 'image' && !o.labelAbove) note('WARN', `${v.id} ${name(o)}：来源标签压在图片上，用模板的 doc()（labelAbove、留白）`);

  // 2. 安全区（只查中心点和长条的左右端；文字宽度要靠截图看）
  for (const o of objs) {
    if (o.kind === 'arrow' || o.kind === 'rule') continue;
    for (const k of o.keys) {
      if (k.x == null && k.y == null) continue;
      const st = { ...o.keys[0], ...k };
      const x1 = o.kind === 'bar' ? st.x + (st.w ?? o.w ?? 0) : st.x;
      if (st.x < SAFE.x0 || x1 > SAFE.x1 || st.y < SAFE.y0 || st.y > SAFE.y1) note('WARN', `${v.id} ${name(o)} 在 ${sec(k.f)}s 的位置 (${Math.round(st.x)}, ${Math.round(st.y)}) 超出安全区 x ${SAFE.x0}–${SAFE.x1}、y ${SAFE.y0}–${SAFE.y1}`);
    }
  }

  // 3. 颜色语义
  for (const o of objs) {
    const colors = new Set([o.color, ...o.keys.map(k => k.color)].filter(Boolean));
    if (o.role && ROLE_COLOR[o.role] && ![...colors].every(c => c === ROLE_COLOR[o.role])) note('FAIL', `${v.id} ${name(o)}：role=${o.role} 应该是 ${ROLE_COLOR[o.role]}，实际用了 ${[...colors].join('/')}`);
    if (!o.role && o.kind !== 'text' && [...colors].some(c => SEMANTIC.has(c))) note('INFO', `${v.id} ${name(o)}：用了语义色 ${[...colors].join('/')} 但没标 role（paid/credit/self），确认它确实表示付出/抵扣/自付`);
  }
}

// 4. 角色：老师和芝士从头到尾都在画面上，不能离场（用户 2026-10-29 定）；老师做指向手势时，目标要在画面上
for (const e of tl.cast ?? []) for (const [k, who] of [['teacher', '老师'], ['cheese', '芝士']]) if (e[k] === 'out') note('FAIL', `${sec(e.f)}s ${who}离场了：老师和芝士从头到尾都要在画面上`);
for (const e of tl.cast ?? []) if (e.pose === 'pointLeft') {
  const sc = tl.visuals.find(v => v.type === 'scene' && e.f >= v.from && e.f < v.to);
  const s = sc?.data.states?.find(t => t.f === e.f);
  if (!s?.point) note('WARN', `${sec(e.f)}s 老师在指，但当时的场景状态没写 point 目标`);
}

// 4b. 新期默认（写了 states 的期）：关键词按停顿对齐、音效只响写明的；算例前提卡不小于 40
const vis = readJson(path.join(epDir, 'visuals.json')) ?? {};
const scenes = tl.visuals.filter(v => v.type === 'scene');
if (scenes.some(v => v.data.states?.length)) {
  if (vis.cueAlign !== 'phrase') note('WARN', 'visuals.json 顶层没写 "cueAlign": "phrase"（关键词还在按字数估时间）');
  if (vis.sfxPolicy !== 'explicit' && scenes.some(v => v.data.sfxPolicy !== 'explicit')) note('WARN', 'visuals.json 顶层没写 "sfxPolicy": "explicit"（每个对象出现都会响）');
}
for (const v of scenes) for (const o of v.data.objects) if (o.id === 'premise' && (o.size ?? 54) < 40) note('WARN', `${v.id} 前提卡字号 ${o.size}，要 ≥ 40`);

// 5. 音效密度
if (sfx.length) {
  const mins = tl.durationInFrames / FPS / 60;
  note('INFO', `音效 ${sfx.length} 个，平均每分钟 ${(sfx.length / mins).toFixed(1)} 个`);
  const s = [...sfx].sort((a, b) => a.at - b.at);
  for (let i = 1; i < s.length; i++) if (s[i].at - s[i - 1].at < 0.15) note('WARN', `音效叠在一起：${s[i - 1].name}@${s[i - 1].at}s 和 ${s[i].name}@${s[i].at}s`);
}

// 6. 字幕速度：一屏停留太短或每秒字数太多
const cps = [];
for (const sub of tl.subtitles) {
  const n = sub.runs.map(r => r.t).join('').replace(/\s/g, '').length, d = (sub.to - sub.from) / FPS;
  if (d < 0.8 || n / d > 7.5) cps.push(`${sec(sub.from)}s「${sub.runs.map(r => r.t).join('')}」${n} 字 / ${d.toFixed(2)}s`);
}
if (cps.length) note('WARN', `字幕停留太短或太快（< 0.8 秒或 > 7.5 字/秒）${cps.length} 条：\n    - ${cps.join('\n    - ')}`);

// 7. 关键词触发时间是怎么定的
const by = cues.reduce((a, c) => ((a[c.method] = (a[c.method] ?? 0) + 1), a), {});
note('INFO', `关键词触发 ${cues.length} 个：${Object.entries(by).map(([k, n]) => `${k} ${n}`).join('，') || '无'}（manual = 人工听过；phrase = 按停顿对齐到短语；char = 按字数估）`);
const rough = cues.filter(c => c.method === 'char');
if (rough.length) note('WARN', `这些触发仍按字数估，配音定稿后听一下，必要时写进 cue-fixes.json：\n    - ${rough.map(c => `${c.line}:${c.word}（${c.used}s）`).join('\n    - ')}`);

const md = [`# ${id} 自检`, '', `时间轴：${(tl.durationInFrames / FPS).toFixed(1)} 秒；生成：${new Date().toISOString()}`, '',
  ...['FAIL', 'WARN', 'INFO'].flatMap(l => [`## ${l}（${out[l].length}）`, '', ...(out[l].length ? out[l].map(m => `- ${m}`) : ['- 无']), ''])].join('\n');
fs.mkdirSync(path.join(epDir, 'build'), { recursive: true });
fs.writeFileSync(path.join(epDir, 'build/lint.md'), md);
console.log(`FAIL ${out.FAIL.length} · WARN ${out.WARN.length} · INFO ${out.INFO.length} → ${path.relative(ROOT, path.join(epDir, 'build/lint.md'))}`);
for (const m of out.FAIL) console.log('FAIL', m);
