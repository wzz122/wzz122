/* =========================================================================
   预览模式：不配音、不渲染视频，只出「每一屏长什么样」+ 一个校对页
   为的是让你在 30 秒内看到版面，而不是等 5 分钟
   ========================================================================= */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { execFileSync } from 'node:child_process';
import { launch, CDP, openPage, evalJS, shot } from './cdp.mjs';

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* 估算时长（不真配音，按中文语速 4.6 字/秒 估） */
export function fakeTiming(board, cfg) {
  let t = 0;
  board.beats.forEach((b, i) => {
    b.t0 = t;
    const d = b.say ? Math.max(1.1, (b.tts || b.say).length / 4.6) : (i === 0 ? (cfg.coverHold || 3.2) : 0.8);
    t += d + (b.say ? (cfg.gap || 0.3) : 0);
    b.t1 = t;
  });
  t += cfg.tail || 1.2;
  board.scenes.forEach((s, i) => {
    const bs = board.beats.filter(b => b.scene === i);
    s.t0 = bs.length ? bs[0].t0 : 0;
    s.t1 = bs.length ? bs[bs.length - 1].t1 : 0;
  });
  board.meta.duration = t;
  return t;
}

export async function makePreview({ board, work, outDir, stageHtml, scriptName, scriptFile, ffmpeg, media = [], onProgress }) {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(path.join(outDir, '屏'), { recursive: true });

  const br = await launch(9700 + (process.pid % 200));
  const cdp = await CDP.connect(br.wsUrl);
  const PW = board.meta.vw || 1920, PH = board.meta.vh || 1080;      // 竖屏时 1080×1920
  const S = await openPage(cdp, url.pathToFileURL(stageHtml).href, PW, PH);
  for (let i = 0; i < 100; i++) {
    if (await evalJS(cdp, S, 'window.__ready===true && !!window.__DATA')) break;
    await new Promise(r => setTimeout(r, 100));
  }
  await evalJS(cdp, S, 'document.fonts ? document.fonts.ready.then(()=>1) : 1');
  await evalJS(cdp, S, 'window.__load(window.__DATA)');
  // 预览不要字幕挡住版面
  await evalJS(cdp, S, "document.getElementById('sub').style.display='none'");

  const shots = [], inline = [];
  for (let i = 0; i < board.scenes.length; i++) {
    const sc = board.scenes[i];
    const t = Math.max(sc.t0 + 0.1, sc.t1 - 0.25);      // 该屏元素全部就位的那一刻
    await evalJS(cdp, S, `window.__seek(${t.toFixed(3)})`);
    const buf = await shot(cdp, S, PW, PH, 90);
    const f = `屏/${String(i).padStart(2, '0')}.jpg`;
    const full = path.join(outDir, f);
    fs.writeFileSync(full, buf);
    shots.push(f);
    // 缩一份嵌进网页，这样校对页是单文件，发到哪都能看
    let b64 = null;
    if (ffmpeg) {
      try {
        const small = path.join(outDir, '屏', '_s.jpg');
        execFileSync(ffmpeg, ['-y', '-v', 'error', '-i', full, '-vf', 'scale=1200:-1', '-q:v', '5', small]);
        b64 = fs.readFileSync(small).toString('base64');
        fs.rmSync(small, { force: true });
      } catch (e) { }
    }
    inline.push(b64);
    if (onProgress) onProgress(i + 1, board.scenes.length);
  }
  cdp.close();
  try { br.proc.kill('SIGKILL'); } catch (e) { }
  await new Promise(r => setTimeout(r, 500));
  try { fs.rmSync(br.profile, { recursive: true, force: true, maxRetries: 3 }); } catch (e) { }

  /* ---------------- 校对页 ---------------- */
  const srcLines = fs.readFileSync(scriptFile, 'utf8').split(/\r?\n/);
  const cards = board.scenes.map((sc, i) => {
    const says = board.beats.filter(b => b.scene === i).map(b => b.say).filter(Boolean);
    const src = sc.src || {};
    const raw = src.l0 ? srcLines.slice(src.l0 - 1, src.l1).filter(x => x.trim()).join('\n') : '';
    const mins = Math.floor(sc.t0 / 60), secs = Math.round(sc.t0 % 60);
    return `<section class="card" id="s${i}">
      <div class="shot"><img src="${inline[i] ? 'data:image/jpeg;base64,' + inline[i] : shots[i]}" loading="lazy" alt="第${i}屏"><span class="no">${String(i).padStart(2, '0')}</span></div>
      <div class="meta">
        <div class="hd"><b>${esc(sc.chapter || '片头')}</b>
          <span class="tag">${src.layout && src.layout !== 'title' ? '[' + esc(src.layout) + ']' : '默认版式'}</span>
          <span class="tm">约 ${mins}:${String(secs).padStart(2, '0')}</span></div>
        ${src.l0 ? `<div class="ln">文案第 <b>${src.l0}–${src.l1}</b> 行</div>` : ''}
        ${raw ? `<pre class="src">${esc(raw)}</pre>` : ''}
        <div class="lab">旁白（${says.length} 句）</div>
        <ul class="says">${says.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
        <div class="lab">素材</div>
        <div class="mrow"><div class="mslot" data-i="${i}"></div>
          <button class="mbtn" data-i="${i}">＋ 加图/视频</button></div>
        <div class="lab">这一屏的修改意见</div>
        <textarea data-i="${i}" placeholder="例如：标题太长换成「…」／折线图挪到左边／这屏删掉"></textarea>
      </div></section>`;
  }).join('\n');

  const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>校对 · ${esc(scriptName)}</title><style>
:root{--bg:#f6f3ec;--fg:#1e1b17;--mut:#7d7566;--line:#dcd5c6;--red:#b23a25;--card:#fffdf8}
@media(prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#171613;--fg:#ece7dc;--mut:#8d8676;--line:#2f2c26;--card:#201e1a}}
:root[data-theme="dark"]{--bg:#171613;--fg:#ece7dc;--mut:#8d8676;--line:#2f2c26;--card:#201e1a}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--fg);font:16px/1.7 "PingFang SC","Hiragino Sans GB",system-ui,sans-serif;padding:0 16px 80px}
header{position:sticky;top:0;z-index:9;background:var(--bg);border-bottom:1px solid var(--line);
  padding:18px 0 14px;display:flex;flex-wrap:wrap;gap:12px;align-items:baseline}
h1{font-size:21px;font-weight:700}
.sub{color:var(--mut);font-size:14px}
.bar{margin-left:auto;display:flex;gap:10px}
button{font:inherit;font-size:14px;padding:8px 16px;border:1px solid var(--line);border-radius:8px;
  background:var(--card);color:var(--fg);cursor:pointer}
button.pri{background:var(--red);color:#fff;border-color:var(--red)}
.wrap{max-width:1180px;margin:0 auto}
.card{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:22px;
  padding:26px 0;border-bottom:1px solid var(--line)}
.shot{position:relative}
.shot img{width:100%;display:block;border:1px solid var(--line);border-radius:6px;background:#eee}
.no{position:absolute;left:10px;top:10px;background:rgba(20,18,15,.72);color:#fff;
  font-size:12px;padding:3px 9px;border-radius:5px;letter-spacing:.08em}
.hd{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;margin-bottom:8px}
.tag{font-size:12px;color:var(--red);border:1px solid var(--red);border-radius:5px;padding:1px 8px}
.tm{font-size:12px;color:var(--mut);margin-left:auto}
.ln{font-size:13px;color:var(--mut);margin-bottom:10px}
.src{font:13px/1.65 ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--card);
  border:1px solid var(--line);border-radius:6px;padding:10px 12px;white-space:pre-wrap;
  color:var(--mut);margin-bottom:12px;overflow-x:auto}
.lab{font-size:12px;color:var(--mut);letter-spacing:.1em;margin:12px 0 6px}
.says{list-style:none;font-size:14px}
.says li{padding:3px 0 3px 14px;position:relative;color:var(--fg)}
.says li::before{content:"";position:absolute;left:0;top:13px;width:6px;height:1px;background:var(--mut)}
textarea{width:100%;min-height:74px;font:inherit;font-size:14px;padding:10px 12px;border-radius:6px;
  border:1px solid var(--line);background:var(--card);color:var(--fg);resize:vertical}
textarea:focus{outline:2px solid var(--red);outline-offset:-1px}
.mrow{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.mbtn{font-size:13px;padding:6px 12px}
.mslot{display:flex;gap:8px;align-items:center;font-size:13px;color:var(--mut)}
.mslot img{width:74px;height:42px;object-fit:cover;border-radius:4px;border:1px solid var(--line)}
.mslot b{color:var(--fg);font-weight:600}
.mslot select{font:inherit;font-size:12px;padding:3px 6px;border-radius:5px;border:1px solid var(--line);
  background:var(--card);color:var(--fg)}
.mslot .x{cursor:pointer;color:var(--red);font-size:16px;padding:0 4px}
#pk{position:fixed;inset:0;background:rgba(15,13,11,.62);display:none;z-index:50;
  align-items:center;justify-content:center;padding:24px}
#pk.on{display:flex}
#pkbox{background:var(--bg);border-radius:12px;max-width:940px;width:100%;max-height:82vh;
  overflow:auto;padding:22px}
#pkg{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-top:14px}
#pkg .it{cursor:pointer;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--card)}
#pkg .it:hover{border-color:var(--red)}
#pkg .it img{width:100%;height:104px;object-fit:cover;display:block}
#pkg .it span{display:block;font-size:12px;padding:6px 8px;color:var(--mut);word-break:break-all}
#pkg .it b{color:var(--red);font-size:11px}
.empty{color:var(--mut);font-size:14px;line-height:1.9;background:var(--card);
  border:1px dashed var(--line);border-radius:8px;padding:16px}
@media(max-width:860px){.card{grid-template-columns:1fr}}
</style></head><body><div class="wrap">
<header><div><h1>校对 · ${esc(scriptName)}</h1>
<div class="sub">${board.scenes.length} 屏 · ${board.beats.length} 句旁白 · 估算 ${Math.floor(board.meta.duration / 60)} 分 ${Math.round(board.meta.duration % 60)} 秒（真配音后会变）</div></div>
<div class="bar"><button id="cp" class="pri">复制全部意见</button><button id="cl">清空</button></div></header>
${cards}
</div>
<div id="pk"><div id="pkbox">
  <div style="display:flex;align-items:baseline;gap:12px">
    <b style="font-size:17px">选一个素材</b>
    <span style="font-size:13px;color:var(--mut)">来自 1-我的文案/素材/（已自动做旧）</span>
    <button id="pkx" style="margin-left:auto">关闭</button></div>
  ${media.length ? `<div id="pkg">${media.map(m => `<div class="it" data-n="${esc(m.name)}" data-k="${m.kind}">
    ${m.thumb ? `<img src="data:image/jpeg;base64,${m.thumb}" alt="">` : '<div style="height:104px"></div>'}
    <span><b>${m.kind === 'video' ? '视频 ' + (m.dur ? m.dur.toFixed(1) + 's' : '') : '图片'}</b><br>${esc(m.name)}</span></div>`).join('')}</div>`
    : `<div class="empty" style="margin-top:14px">素材文件夹还是空的。<br>
       把图片或视频拖进 <b>1-我的文案/素材/</b>，再双击一次「看版面.command」，这里就会出现可选的素材。</div>`}
</div></div>
<script>
const K='vf-notes-${esc(scriptName)}';
const MK='vf-media-${esc(scriptName)}';
const MEDIA=${JSON.stringify(media.map(m => ({ n: m.name, k: m.kind, t: m.thumb ? 1 : 0 })))};
const PLACE={image:['整张图','满屏背景','画中画'],video:['画中画','满屏背景']};
let picks={}; try{picks=JSON.parse(localStorage.getItem(MK)||'{}')}catch(e){}
const thumbOf=n=>{const el=document.querySelector('#pkg .it[data-n="'+CSS.escape(n)+'"] img');return el?el.src:''};
function drawSlot(i){
  const slot=document.querySelector('.mslot[data-i="'+i+'"]'); if(!slot)return;
  const p=picks[i];
  if(!p){slot.innerHTML='<span style="opacity:.65">未选</span>';return}
  const opts=(PLACE[p.k]||['整张图']).map(o=>'<option'+(o===p.place?' selected':'')+'>'+o+'</option>').join('');
  slot.innerHTML='<img src="'+thumbOf(p.n)+'" alt=""><b>'+p.n+'</b><select>'+opts+'</select><span class="x" title="移除">×</span>';
  slot.querySelector('select').onchange=e=>{picks[i].place=e.target.value;saveM()};
  slot.querySelector('.x').onclick=()=>{delete picks[i];saveM();drawSlot(i)};
}
function saveM(){try{localStorage.setItem(MK,JSON.stringify(picks))}catch(e){}}
let pkTarget=null;
document.querySelectorAll('.mbtn').forEach(b=>b.onclick=()=>{
  if(!MEDIA.length){alert('素材文件夹是空的。把图片或视频放进 1-我的文案/素材/ 再跑一次「看版面」。');return}
  pkTarget=b.dataset.i;document.getElementById('pk').classList.add('on');
});
document.getElementById('pkx').onclick=()=>document.getElementById('pk').classList.remove('on');
document.getElementById('pk').onclick=e=>{if(e.target.id==='pk')e.currentTarget.classList.remove('on')};
document.querySelectorAll('#pkg .it').forEach(it=>it.onclick=()=>{
  const k=it.dataset.k;
  picks[pkTarget]={n:it.dataset.n,k:k,place:(PLACE[k]||['整张图'])[0]};
  saveM();drawSlot(pkTarget);document.getElementById('pk').classList.remove('on');
});
Object.keys(picks).forEach(drawSlot);
document.querySelectorAll('.mslot').forEach(s=>{if(!picks[s.dataset.i])drawSlot(s.dataset.i)});
const tas=[...document.querySelectorAll('textarea')];
try{const d=JSON.parse(localStorage.getItem(K)||'{}');tas.forEach(t=>{if(d[t.dataset.i])t.value=d[t.dataset.i]})}catch(e){}
const save=()=>{try{const d={};tas.forEach(t=>{if(t.value.trim())d[t.dataset.i]=t.value.trim()});
  localStorage.setItem(K,JSON.stringify(d))}catch(e){}};
tas.forEach(t=>t.addEventListener('input',save));
document.getElementById('cp').onclick=()=>{
  const idxs=[...new Set(tas.filter(t=>t.value.trim()).map(t=>t.dataset.i).concat(Object.keys(picks)))]
    .sort((a,b)=>a-b);
  const out=idxs.map(i=>{
    const c=document.getElementById('s'+i); if(!c)return '';
    const ln=c.querySelector('.ln'); const hd=c.querySelector('.hd b');
    const ta=document.querySelector('textarea[data-i="'+i+'"]');
    const p=picks[i];
    let body='';
    if(p) body+='[加素材] '+p.n+' → '+p.place+'\\n';
    if(ta&&ta.value.trim()) body+=ta.value.trim();
    return '第'+String(i).padStart(2,'0')+'屏（'+(hd?hd.textContent:'')+(ln?'，'+ln.textContent.trim():'')+'）：\\n'+body.trim();
  }).filter(Boolean).join('\\n\\n');
  const txt = out || '（还没写任何意见）';
  navigator.clipboard.writeText(txt).then(()=>{
    const b=document.getElementById('cp'); const o=b.textContent; b.textContent='已复制 ✓';
    setTimeout(()=>b.textContent=o,1600);
  }).catch(()=>{ prompt('手动复制：', txt); });
};
document.getElementById('cl').onclick=()=>{ if(confirm('清空所有意见和素材选择？')){tas.forEach(t=>t.value='');save();picks={};saveM();document.querySelectorAll('.mslot').forEach(s=>drawSlot(s.dataset.i));} };
</script></body></html>`;

  const page = path.join(outDir, '校对页.html');
  fs.writeFileSync(page, html, 'utf8');
  return { page, count: board.scenes.length };
}
