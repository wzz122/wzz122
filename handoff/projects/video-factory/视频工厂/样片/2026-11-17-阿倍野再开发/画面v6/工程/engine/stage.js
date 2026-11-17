/* =========================================================================
   舞台引擎：把「分镜 JSON + 时间轴」变成可以按秒定格的画面
   核心：window.__seek(t) —— 给任意时间 t，画面就是确定的那一帧
   （不用录屏，所以永远不卡、不掉帧）
   T009 v6 快照改动（2026-10-07）：hideAt 秒数退场、stamp2/drop 入场、statbar 数字滚动、
   eyebrow 两行章名、source 短横、场景级暗角、fx.js 组件上下文、__windows() 动画窗口、
   __assetsReady() 等图片解码。只改本期快照，不改主引擎。
   ========================================================================= */
(function () {
  let VW = 1920, VH = 1080;          // 画布尺寸：由分镜 meta.vw/vh 决定（竖屏 1080×1920）
  const TRANS = 0.72;      // 换场镜头移动时长（秒）
  const EL_IN = 0.52;      // 元素入场时长（秒）

  let DATA = null, wall = null, subEl = null, vhdr = null, vhdrSi = -1, vig = null;
  const NOSUB = new URLSearchParams(location.search).has('nosub');
  let pendingVideos = [];
  const elNodes = new Map();   // id -> {node, spec, sceneIdx, appearT}
  const sceneNodes = [];

  /* ---------------- 缓动 ---------------- */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const easeOutCubic = p => 1 - Math.pow(1 - p, 3);
  const easeOutQuint = p => 1 - Math.pow(1 - p, 5);
  const easeInOut = p => p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  const lerp = (a, b, p) => a + (b - a) * p;
  const easeOutBack = p => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };

  /* ---------------- 构建 DOM ---------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  }
  // 文案里写 ==高亮== 变荧光笔，**红**变红字
  function rich(s) {
    return esc(s)
      .replace(/==(.+?)==/g, '<span class="hl">$1</span>')
      .replace(/\*\*(.+?)\*\*/g, '<span class="red">$1</span>')
      .replace(/\n/g, '<br>');
  }

  function buildElement(spec) {
    const d = document.createElement('div');
    const isChart = window.CHARTS && window.CHARTS[spec.type];
    d.className = 'el ' + (isChart ? 'chartel ' : '') + (spec.type || 'sub') + (spec.cls ? ' ' + spec.cls : '');
    d.style.left = (spec.x || 0) + 'px';
    d.style.top = (spec.y || 0) + 'px';
    if (spec.w) d.style.width = spec.w + 'px';
    if (spec.h) d.style.height = spec.h + 'px';
    if (spec.size) d.style.fontSize = spec.size + 'px';
    if (spec.color) d.style.color = spec.color;
    if (spec.align) d.style.textAlign = spec.align;
    if (spec.z != null) d.style.zIndex = spec.z;
    if (spec.css) d.style.cssText += ';' + spec.css;          // v6：额外内联样式 / CSS 变量（如 statbar 的 --lw --tw）

    if (isChart) { d.innerHTML = window.CHARTS[spec.type].build(spec); return d; }

    switch (spec.type) {
      case 'evidence': {
        d.innerHTML = `<img class="evblur" src="${esc(spec.src)}"><div class="evwindow"><img class="evimage" src="${esc(spec.src)}"></div>`;
        break;
      }
      case 'statbar': {
        d.innerHTML = `<div class="statlabel">${rich(spec.text)}</div><div class="stattrack"><div class="statfill" style="background:${spec.fill||'#326c59'}"></div></div><div class="statvalue" style="color:${spec.valueColor||spec.fill||'#326c59'}">${esc(spec.valueText||spec.value)}</div>`;
        break;
      }
      case 'eyebrow':                                          // v6：右上角两行章标（小字章号 + 章名）
        d.innerHTML = (spec.kicker ? `<div class="ebk">${esc(spec.kicker)}</div>` : '') + `<div class="ebt">${rich(spec.text || '')}</div>`;
        break;
      case 'source':                                           // v6：左下出处，前面一根灰色短横
        d.innerHTML = `<i class="srcbar"></i><span>${rich(spec.text || '')}</span>`;
        break;
      case 'metric': {
        d.innerHTML = `<div class="metricvalue">${esc(spec.value)}</div><div class="metriclabel">${rich(spec.text)}</div>`;
        break;
      }
      case 'card': {
        const lines = spec.lines == null ? 4 : spec.lines;
        let h = spec.text ? `<div class="ct">${rich(spec.text)}</div>` : '';
        for (let i = 0; i < lines; i++) h += `<div class="ln" style="width:${70 + (i * 37) % 30}%"></div>`;
        if (spec.stamp) h += `<div class="stamp">${esc(spec.stamp)}</div>`;
        d.innerHTML = h; break;
      }
      case 'note': d.innerHTML = rich(spec.text); break;
      case 'pin':
        d.innerHTML = `<div class="bead">${esc(spec.icon || '◉')}</div><div class="lb">${rich(spec.text)}</div>`;
        break;
      case 'panel':
        d.innerHTML = (spec.kicker ? `<div class="pk">${esc(spec.kicker)}</div>` : '') +
          `<div class="pt">${rich(spec.text || '')}</div>` +
          (spec.body ? `<div class="pb">${rich(spec.body)}</div>` : '');
        break;
      case 'bar':
        d.innerHTML = `<div class="bl">${rich(spec.text || '')}</div>` +
          `<div class="bt" style="width:${spec.pct || 50}%"></div>` +
          `<div class="bv">${esc(spec.value || '')}</div>`;
        break;
      case 'img':
        d.innerHTML = `<img src="${esc(spec.src)}" alt="">`; break;
      case 'media':
        d.innerHTML = spec.kind === 'video'
          ? `<video src="${esc(spec.src)}" muted preload="auto" playsinline></video>`
          : `<img src="${esc(spec.src)}" alt="">`;
        if (spec.frame !== false) d.classList.add('framed');
        break;
      case 'seal': {                                          // 印章：四个字排成 2×2，三个字以内排一行
        const ch = [...String(spec.text || '')];
        d.style.setProperty('--c', ch.length <= 3 ? ch.length : Math.ceil(ch.length / 2));
        d.innerHTML = ch.map(c => `<span>${esc(c)}</span>`).join(''); break;
      }
      case 'scrim': break;
      case 'rule': break;
      case 'title':
        d.innerHTML = rich(spec.text || '');
        if (VH > VW) d.innerHTML = d.innerHTML.replace(/([，：、；])(?!<br>|$)/g, '<span class="pc">$1</span>');
        break;
      default: d.innerHTML = rich(spec.text || '');
    }
    return d;
  }

  function hdrHTML(sc, si) {
    // 频道名留空时（> | 系列名），系列名直接跟在红点后面，不当副标题
    const ch = DATA.meta.channel || '', se = DATA.meta.series || '';
    return `<div><span class="dot"></span>${ch ? esc(ch) + `<span class="series">${esc(se)}</span>` : esc(se)}</div>` +
      `<div><span class="no">#${sc.no == null ? si + 1 : sc.no}</span>${esc(sc.chapter || '')}</div>`;
  }

  function build(data) {
    DATA = data;
    VW = (data.meta && data.meta.vw) || 1920; VH = (data.meta && data.meta.vh) || 1080;
    document.documentElement.style.setProperty('--W', VW + 'px');
    document.documentElement.style.setProperty('--H', VH + 'px');
    document.body.classList.toggle('portrait', VH > VW);
    // 模板·实拍底片：满屏实拍镜头舞台透明，由渲染器叠到实拍片段上
    document.documentElement.classList.toggle('onvideo', !!(data.scenes.length === 1 && data.scenes[0].bgvideo));
    wall = document.getElementById('wall');
    subEl = document.getElementById('sub');
    wall.innerHTML = '';
    elNodes.clear(); sceneNodes.length = 0;
    if (vhdr) { vhdr.remove(); vhdr = null; } vhdrSi = -1;
    if (VH > VW) {
      vhdr = document.createElement('div');
      vhdr.className = 'hdr fixed';
      document.getElementById('viewport').appendChild(vhdr);
    }

    // 每个元素第一次出现的时间 = 它所属 beat 的 t0
    const appear = new Map();
    data.beats.forEach(b => (b.show || []).forEach(id => {
      if (!appear.has(id)) appear.set(id, b.t0);
    }));

    // 整面墙先铺一张连续的纸，这样镜头平移时两屏之间不会露出空白
    const maxX = Math.max(...data.scenes.map(s => (s.x || 0))) + VW;
    const maxY = Math.max(...data.scenes.map(s => (s.y || 0))) + VH;
    const base = document.createElement('div');
    base.className = 'wall-base';
    base.style.width = (maxX + 600) + 'px';
    base.style.height = (maxY + 600) + 'px';
    base.style.left = '-300px'; base.style.top = '-300px';
    wall.appendChild(base);

    data.scenes.forEach((sc, si) => {
      const s = document.createElement('div');
      s.className = 'scene' + (sc.cls ? ' ' + sc.cls : '');
      s.style.left = (sc.x || 0) + 'px';
      s.style.top = (sc.y || 0) + 'px';

      const bg = document.createElement('div');
      bg.className = 'paper-bg';
      bg.style.width = VW + 'px'; bg.style.height = VH + 'px';
      s.appendChild(bg);

      // 页眉：横屏跟着每一屏走；竖屏固定在取景框上（不随推镜缩放，换屏时不跳）
      if (sc.chapter !== false && VW >= VH) {
        const h = document.createElement('div');
        h.className = 'hdr';
        h.innerHTML = hdrHTML(sc, si);
        s.appendChild(h);
      }

      (sc.elements || []).forEach(spec => {
        if (window.FX) window.FX.register(spec, sc);
        const node = buildElement(spec);
        s.appendChild(node);
        const aT = (appear.has(spec.id) ? appear.get(spec.id) : (sc.t0 || 0)) + (spec.delay || 0);   // delay：同一句里错开出现
        elNodes.set(spec.id, {
          node, spec, sceneIdx: si, appearT: aT, sceneT0: sc.t0 || 0,
          // v6：hideAt = 镜头内秒数，到点退场（hideDur 秒，hideAnim: fade/up/down/shrink）
          hideT: spec.hideAt != null ? (sc.t0 || 0) + spec.hideAt : undefined, hideDur: spec.hideDur || 0.3,
          // span:'scene' 的元素（图表）一路画到本幕结束
          // maxDur：本屏很长时，图表最多画这么久就画完，剩下的时间留给观众看
          endT: spec.span === 'scene' ? Math.max(aT + 1.2, Math.min((sc.t1 || aT + 3) - 0.25, spec.maxDur ? aT + spec.maxDur : Infinity))
                                      : aT + (spec.dur || EL_IN)
        });
      });

      wall.appendChild(s);
      sceneNodes.push(s);
    });
    // 弹字：本屏下一组弹字/盖章出现、或下一次推近开始时淡出
    elNodes.forEach(r => { if (r.hideT == null && r.spec.hideBeat != null && data.beats[r.spec.hideBeat]) r.hideT = data.beats[r.spec.hideBeat].t0; });
    vig = document.getElementById('vignette');
  }

  /* ---------------- 摄像机 ---------------- */
  function camOf(si, p) {                     // p = 该幕内进度 0..1（做缓慢推镜）
    const sc = DATA.scenes[si];
    const a = sc.camera || { cx: VW / 2, cy: VH / 2, zoom: 1 };
    const b = sc.camEnd || a;
    const e = easeInOut(clamp(p, 0, 1));
    return {
      cx: (sc.x || 0) + lerp(a.cx, b.cx, e),
      cy: (sc.y || 0) + lerp(a.cy, b.cy, e),
      zoom: lerp(a.zoom || 1, b.zoom || 1, e)
    };
  }

  function beatAt(t) {
    const bs = DATA.beats;
    for (let i = 0; i < bs.length; i++) if (t < bs[i].t1) return i;
    return bs.length - 1;
  }

  /* ---------------- 核心：定格到时间 t ---------------- */
  function seek(t) {
    if (!DATA) return;
    pendingVideos = [];
    const bi = beatAt(t);
    const beat = DATA.beats[bi];
    const si = beat.scene;

    // 该幕的时间范围
    const scT0 = DATA.scenes[si].t0, scT1 = DATA.scenes[si].t1;
    const p = (t - scT0) / Math.max(0.001, scT1 - scT0);
    let cam = camOf(si, p);
    let blur = 0, focusAmt = 0;                 // focusAmt：图内推镜的程度（0 全景 ~ 1 推到位），推近时标题淡出

    // 图内推镜：beat 上带 focus 时，镜头移到该位置并放大
    const FOCUS_T = 0.95;
    const cur = DATA.beats[bi], prevB = bi > 0 ? DATA.beats[bi - 1] : null;
    const fcamOf = (s, f) => {
      const z = f.zoom || 1.6, hw = VW / 2 / z, hh = VH / 2 / z;
      return { cx: (DATA.scenes[s].x || 0) + clamp(f.x, hw, VW - hw),
               cy: (DATA.scenes[s].y || 0) + clamp(f.y, hh, VH - hh), zoom: z };
    };
    const fcam = f => fcamOf(si, f);
    const prevSame = prevB && prevB.scene === si;
    if (cur.focus || (prevSame && prevB.focus)) {
      const from = (prevSame && prevB.focus) ? fcam(prevB.focus) : camOf(si, clamp((cur.t0 - scT0) / Math.max(.001, scT1 - scT0), 0, 1));
      const to = cur.focus ? fcam(cur.focus) : cam;
      const q = easeInOut(clamp((t - cur.t0) / FOCUS_T, 0, 1));
      cam = { cx: lerp(from.cx, to.cx, q), cy: lerp(from.cy, to.cy, q), zoom: lerp(from.zoom, to.zoom, q) };
      const fromF = !!(prevSame && prevB.focus), toF = !!cur.focus;
      focusAmt = fromF && toF ? 1 : (toF ? q : 1 - q);
    }

    // 换场：从上一幕的终点镜头，移动到本幕起点镜头
    if (si > 0 && t < scT0 + TRANS) {
      const q = easeInOut(clamp((t - scT0) / TRANS, 0, 1));
      // 上一幕最后一句还停在推近上：从推近的位置出发，不先跳回全景
      let lastPrev = null;
      for (let k = bi - 1; k >= 0; k--) if (DATA.beats[k].scene === si - 1) { lastPrev = DATA.beats[k]; break; }
      const prev = lastPrev && lastPrev.focus ? fcamOf(si - 1, lastPrev.focus) : camOf(si - 1, 1);
      cam = { cx: lerp(prev.cx, cam.cx, q), cy: lerp(prev.cy, cam.cy, q), zoom: lerp(prev.zoom, cam.zoom, q) };
      blur = Math.sin(q * Math.PI) * 5.0;        // 转场运动模糊
    }

    wall.style.transform =
      `translate(${VW / 2}px, ${VH / 2}px) scale(${cam.zoom}) translate(${-cam.cx}px, ${-cam.cy}px)`;
    wall.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : 'none';

    // v6：暗角层固定在最上面、不跟镜头动；满屏照片的镜头可设 scene.vig（0–1）减弱
    if (vig) { const sv = DATA.scenes[si].vig; vig.style.opacity = sv == null ? '' : `calc(var(--vig-strength) * ${+sv})`; }

    // 幕的整体淡入淡出（只显示前后相邻，省性能）
    sceneNodes.forEach((n, i) => {
      n.style.opacity = (i === si || (si > 0 && i === si - 1 && t < scT0 + TRANS)) ? 1 : 0;
      n.style.display = Math.abs(i - si) <= 1 ? '' : 'none';
    });

    // 元素逐个入场
    elNodes.forEach(({ node, spec, sceneIdx, appearT, endT, hideT, hideDur, sceneT0 }) => {
      if (sceneIdx !== si && sceneIdx !== si - 1) return;

      // 视频素材：跟主时间轴逐帧同步（不是让它自己播，否则渲染出来会错位）
      if (spec.type === 'media' && spec.kind === 'video') {
        const v = node.querySelector('video');
        if (v && v.readyState >= 1) {
          const D = spec.dur || v.duration || 5;
          const want = Math.max(0, Math.min(D - 0.05, (t - appearT) % D));
          if (t >= appearT && Math.abs(v.currentTime - want) > 0.012) {
            pendingVideos.push(new Promise(r => {
              let done = false;
              const fin = () => { if (!done) { done = true; v.removeEventListener('seeked', fin); r(); } };
              v.addEventListener('seeked', fin);
              setTimeout(fin, 900);
              try { v.currentTime = want; } catch (e) { fin(); }
            }));
          }
        }
      }

      // 图表：交给 charts.js 按 0~1 的进度自己画（逐段画线 / 逐格填色 / 圆环扩散…）
      if (window.CHARTS && window.CHARTS[spec.type]) {
        const pp = clamp((t - appearT) / Math.max(0.3, endT - appearT), 0, 1);
        let op = t < appearT ? 0 : 1, exitP = 0;
        if (hideT != null && t > hideT) { exitP = clamp((t - hideT) / hideDur, 0, 1); op *= 1 - exitP; }
        node.style.opacity = op;
        node.style.visibility = op <= 0 ? 'hidden' : '';
        node.style.transform = `rotate(${spec.rot || 0}deg)`;
        // 第 4 个参数：出现后过了几秒；第 5 个（v6 fx.js 用）：镜头内时间 lt、退场进度 exitP、本镜头时长
        // wait(promise)：组件换了图（如 videocard 逐帧换 JPG）时把 decode() 交给舞台，__seek 等它完成才截图
        const ctx = { lt: t - sceneT0, exitP, sceneDur: (DATA.scenes[sceneIdx].t1 - DATA.scenes[sceneIdx].t0), t, wait: p => pendingVideos.push(p) };
        if (op > 0) { try { window.CHARTS[spec.type].update(node, spec, pp, Math.max(0, t - appearT), ctx); } catch (e) { console.error('fx', spec.id, e); } }
        return;
      }

      if (spec.type === 'evidence') {
        const img=node.querySelector('.evimage');
        const iw=img.naturalWidth||1920, ih=img.naturalHeight||1080;
        const ks=spec.views||[{at:0,view:[0,0,iw,ih]}];
        const now=t-(DATA.scenes[sceneIdx].t0||0);
        let ki=0;for(let k=1;k<ks.length;k++)if(now>=ks[k].at)ki=k;
        const prev=ks[Math.max(0,ki-1)].view, cur=ks[ki].view;
        const q=ki?easeInOut(clamp((now-ks[ki].at)/(ks[ki].dur||.95),0,1)):1;
        const v=cur.map((x,k)=>lerp(prev[k],x,q));
        const z=Math.min(spec.w/v[2],spec.h/v[3]);
        const xx=(spec.w-v[2]*z)/2-v[0]*z, yy=(spec.h-v[3]*z)/2-v[1]*z;
        const px=Math.max(0,(spec.w-v[2]*z)/2),py=Math.max(0,(spec.h-v[3]*z)/2);
        node.querySelector('.evwindow').style.clipPath=`inset(${py}px ${px}px ${py}px ${px}px)`;
        img.style.width=iw+'px';img.style.height=ih+'px';img.style.transform=`translate(${xx}px,${yy}px) scale(${z})`;
      }
      if (spec.type === 'statbar') {
        const g0 = spec.growAt != null ? sceneT0 + spec.growAt : appearT;      // v6：growAt = 标签先出、条子念到数字时才长
        const q=spec.staticBar?1:easeOutCubic(clamp((t-g0)/(spec.growDur||.65),0,1));
        const sf = node.querySelector('.statfill'); sf.style.width=((spec.pct||0)*q)+'%'; sf.style.visibility = q > 0 ? '' : 'hidden';   // 0 宽时连侧面也藏掉
        // v6：count:true 时数值跟着条一起滚动（只给第一次出现的数字用）
        if (spec.count && !spec.staticBar) {
          const v = (spec.countFrom || 0) + ((+spec.value) - (spec.countFrom || 0)) * q, dec = spec.decimals || 0;
          const txt = q >= 1 ? (spec.valueText || String(spec.value)) : q <= 0 ? '' : (spec.prefix || '') + v.toFixed(dec) + (spec.suffix || '');
          const vn = node.querySelector('.statvalue'); if (vn.textContent !== txt) vn.textContent = txt;
        }
      }
      let raw = (t - appearT) / ((spec.type === 'media' && spec.kind === 'video') ? EL_IN : (spec.dur || EL_IN));
      if (spec.dur != null && spec.dur <= .03 && t >= appearT - 1e-6) raw = 1;   // v7b：硬切元素第 0 帧就在最终位置
      const pr = clamp(raw, 0, 1);
      const e = easeOutQuint(pr);
      const rot = spec.rot || 0;
      let tr = '', op = (spec.dur != null && spec.dur <= .03) ? (t >= appearT - 1e-6 ? 1 : 0) : pr <= 0 ? 0 : easeOutCubic(clamp(raw * 1.6, 0, 1));   // v7b：镜头开头硬切的元素第 0 帧就完整显示
      switch (spec.anim || 'up') {
        case 'up':    tr = `translateY(${(1 - e) * 46}px)`; break;
        case 'down':  tr = `translateY(${(e - 1) * 46}px)`; break;
        case 'left':  tr = `translateX(${(1 - e) * -70}px)`; break;
        case 'right': tr = `translateX(${(1 - e) * 70}px)`; break;
        case 'pop':   tr = `scale(${lerp(0.84, 1, e)})`; break;
        case 'stamp': tr = `scale(${lerp(1.45, 1, easeOutQuint(clamp(raw / 0.6, 0, 1)))})`; break;
        case 'bounce': tr = `scale(${lerp(0.6, 1, easeOutBack(pr))})`; break;   // 弹字：放大略过头再落定
        case 'stamp2': {                                   // v6 印章砸入：160%、40% 不透明 → 0.15 秒落到 100%，落定后自身抖 3px、0.1 秒回位
          const a = t - appearT, q = clamp(a / 0.15, 0, 1);
          const sh = a > 0.15 && a < 0.25 ? 3 * Math.sin((a - 0.15) / 0.1 * Math.PI * 3) * (1 - (a - 0.15) / 0.1) : 0;
          tr = `translate(${sh.toFixed(2)}px,${(-sh * 0.6).toFixed(2)}px) scale(${lerp(1.6, 1, q * q)})`;
          op = a < 0 ? 0 : lerp(0.4, 1, q); break;
        }
        case 'drop': {                                     // v6 卡片落下：从上方 dropY、倾斜 dropRot 落到原位，轻微过头
          const q = easeOutBack(pr), dy = spec.dropY == null ? -70 : spec.dropY, dr = spec.dropRot == null ? -5 : spec.dropRot;
          tr = `translateY(${lerp(dy, 0, q).toFixed(2)}px) rotate(${lerp(dr, 0, q).toFixed(3)}deg)`; break;
        }
        case 'fade':  tr = ''; break;
        case 'draw':
          tr = ''; node.style.clipPath = `inset(0 ${(1 - e) * 100}% 0 0)`; break;
        default: tr = `translateY(${(1 - e) * 46}px)`;
      }
      if (spec.fixed && t >= appearT) { op=1;tr=''; }
      if (hideT != null && t > hideT) {
        const xq = clamp((t - hideT) / (hideDur || 0.25), 0, 1);
        op *= 1 - xq;
        if (spec.hideAnim === 'up') tr += ` translateY(${(-40 * easeOutCubic(xq)).toFixed(2)}px)`;
        else if (spec.hideAnim === 'down') tr += ` translateY(${(40 * easeOutCubic(xq)).toFixed(2)}px)`;
        else if (spec.hideAnim === 'shrink') tr += ` scale(${lerp(1, 0.9, easeOutCubic(xq)).toFixed(4)})`;
      }
      if (focusAmt > 0 && sceneIdx === si && (spec.type === 'title' || spec.type === 'kicker')) op *= 1 - 0.92 * focusAmt;   // 横屏图在上、来源标签在下，推近时标签会被放大到字幕区，一并淡出
      node.style.opacity = op;
      node.style.transform = `${spec.center ? 'translate(-50%,-50%) ' : ''}${tr} rotate(${rot}deg)`;   // center：x,y 是中心点（弹字、盖章）
    });

    // 竖屏固定页眉：换屏镜头走到一半时换成新一屏的章节名
    if (vhdr) {
      const hs = (si > 0 && t < scT0 + TRANS / 2) ? si - 1 : si;
      if (hs !== vhdrSi) {
        vhdrSi = hs;
        const sc = DATA.scenes[hs];
        vhdr.style.display = sc.chapter === false ? 'none' : '';
        if (sc.chapter !== false) vhdr.innerHTML = hdrHTML(sc, hs);
      }
    }

    // 字幕（?nosub=1 时不烧字幕：竖屏版等另行排字幕的场合用）
    const showSub = beat.say && !NOSUB;
    subEl.innerHTML = showSub ? `<span>${esc(beat.sub || beat.say).replace(/\n/g, '<br>')}</span>` : '';   // 竖屏用预先断好的两行
    subEl.style.opacity = showSub ? 1 : 0;
  }

  /* ---------------- 对外接口 ---------------- */
  window.__load = function (data) { build(data); seek(0); return DATA.meta.duration; };
  window.__seek = function (t) {
    seek(t);
    return pendingVideos.length ? Promise.all(pendingVideos).then(() => true) : true;
  };
  // v6：本时间轴里每个元素「画面会变」的时间段（秒，全片时间）。分段渲染.mjs 用它决定哪些帧必须真截图，
  // 其余帧复用上一张（阅读定格）。fx.js 组件各自报自己的窗口（FX.windows）。
  window.__windows = function () {
    const out = [], add = (a, b, why) => { if (b > a) out.push([Math.max(0, a), b, why]); };
    elNodes.forEach(({ spec, sceneIdx, appearT, endT, hideT, hideDur, sceneT0 }) => {
      const sc = DATA.scenes[sceneIdx], end = sc.t1;
      const isFX = window.FX && window.FX.types[spec.type], isChart = window.CHARTS && window.CHARTS[spec.type];
      if (isFX) {
        const ws = window.FX.windows(spec, sc.t1 - sc.t0);
        if (ws) ws.forEach(([a, b]) => add(sceneT0 + a - 0.04, sceneT0 + b + 0.07, spec.id));
        else add(appearT - 0.04, end, spec.id);
      } else if (isChart) add(appearT - 0.04, endT + 0.07, spec.id);
      else {
        const d = spec.type === 'statbar' ? Math.max(spec.growDur || .65, .9) : Math.max(spec.dur || EL_IN, .56);
        add(appearT - 0.04, appearT + d + 0.07, spec.id);
        if (spec.type === 'statbar' && spec.growAt != null) add(sceneT0 + spec.growAt - 0.04, sceneT0 + spec.growAt + Math.max(spec.growDur || .65, .9) + 0.07, spec.id + ':grow');
        if (spec.anim === 'stamp2') add(appearT - 0.04, appearT + 0.45, spec.id + ':stamp');
        (spec.views || []).slice(1).forEach(v => add(sceneT0 + v.at - 0.04, sceneT0 + v.at + (v.dur || .95) + 0.07, spec.id + ':view'));
        if (spec.type === 'media' && spec.kind === 'video') add(appearT, end, spec.id + ':video');
      }
      if (hideT != null) add(hideT - 0.04, hideT + (hideDur || .3) + 0.07, spec.id + ':hide');
      if (spec.motion === 'continuous') add(appearT, end, spec.id + ':continuous');
    });
    DATA.scenes.forEach(sc => {
      if (sc.motion === 'full' || JSON.stringify(sc.camera) !== JSON.stringify(sc.camEnd)) add(sc.t0, sc.t1, 'scene');
    });
    DATA.beats.forEach(b => { if (b.focus) add(DATA.scenes[b.scene].t0, DATA.scenes[b.scene].t1, 'focus'); });
    return out;
  };
  // v6：等所有图片解码（含 fx 组件在 build 时放进去的 <img>），返回解码失败的列表
  window.__assetsReady = function () {
    const imgs = [...document.images];
    return Promise.all(imgs.map(i => i.decode().catch(() => null))).then(() => {
      const bad = imgs.filter(i => !(i.naturalWidth > 0)).map(i => i.getAttribute('src'));
      return { images: imgs.length, bad };
    });
  };
  // v6：本机字体是否真的被浏览器用上（避免悄悄回退）：比较目标字体和回退字体的字宽
  window.__fontCheck = function (fams) {
    const c = document.createElement('canvas').getContext('2d'), s = '永和九年岁在癸丑ドドド継続企業0123';
    return fams.map(f => {
      const r = {};
      for (const fb of ['monospace', 'serif']) { c.font = `48px ${fb}`; const w0 = c.measureText(s).width; c.font = `48px "${f}", ${fb}`; r[fb] = Math.abs(c.measureText(s).width - w0) > 0.5; }
      return { family: f, available: r.monospace || r.serif };
    });
  };
  window.__ready = true;

  // 本地预览：直接在浏览器打开 stage.html 会自动播放
  window.__preview = function () {
    const t0 = performance.now();
    (function loop() {
      const t = (performance.now() - t0) / 1000;
      if (t > DATA.meta.duration) return;
      seek(t); requestAnimationFrame(loop);
    })();
  };
})();
