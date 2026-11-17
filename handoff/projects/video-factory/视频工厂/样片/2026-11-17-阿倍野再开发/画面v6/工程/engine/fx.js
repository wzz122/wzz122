/* =========================================================================
   T009 v6 特效组件（2026-10-07）—— 注册进 window.CHARTS，舞台每帧自动调用
   规矩（逐帧确定）：
     1. 唯一时钟是 t：update 只由「镜头内秒数 lt」算出每个属性，不读系统时间、不用 CSS 动画/过渡；
     2. 每帧无状态：每次把要变的属性完整写一遍，不在上一帧基础上累加（可缓存只跟几何有关的量）；
     3. 随机数一律 rng(种子)，种子 = spec.seed 或元素 id 的哈希；
     4. 图片在 build 时就放进 DOM（<img>），__load 后统一 decode，update 里不新建图片；
     5. 所有时间参数（delay/at/hideAt/…）都是「镜头内秒数」，坐标是 1920×1008 画布像素；
        引用原图的组件（lens/highlighter/circle/maphl 的 ref+target）用原图像素，自动换算到画面。
   每个组件 = { build(spec) → HTML, update(node, spec, p, tau, ctx), win(spec, sceneDur) → [[a,b],…] }
   ctx = { lt: 镜头内秒数, exitP: 退场进度 0–1, sceneDur, wait(promise)：换图后把 decode 交给舞台等（videocard 用） }
   ========================================================================= */
(function () {
  const FX = window.FX = { specs: {}, types: {} };
  const CH = window.CHARTS = window.CHARTS || {};

  /* ---------------- 工具 ---------------- */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, p) => a + (b - a) * p;
  const eOutCubic = p => 1 - Math.pow(1 - p, 3);
  const eOutQuint = p => 1 - Math.pow(1 - p, 5);
  const eInOut = p => p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  const eOutBack = (p, s = 1.70158) => 1 + (s + 1) * Math.pow(p - 1, 3) + s * Math.pow(p - 1, 2);
  const prog = (lt, a, d) => clamp((lt - a) / Math.max(1e-3, d), 0, 1);
  const rng = seed => () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const hashStr = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const seedOf = s => (s.seed != null ? s.seed : hashStr(s.id || 'fx')) | 0;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rich = s => esc(s).replace(/==(.+?)==/g, '<span class="hl">$1</span>').replace(/\*\*(.+?)\*\*/g, '<span class="red">$1</span>').replace(/\n/g, '<br>');
  const f2 = v => (+v).toFixed(2);
  const delayOf = s => s.delay || 0;
  const set = (el, k, v) => { if (el && el.style[k] !== v) el.style[k] = v; };      // 只在变化时写，省重排
  FX.util = { clamp, lerp, eOutCubic, eInOut, eOutBack, rng, hashStr };

  FX.register = function (spec) { if (spec && spec.id) FX.specs[spec.id] = spec; };
  // 组件自报「画面会变」的时间段（镜头内秒数），给分段渲染决定哪些帧必须真截图
  FX.windows = function (spec, sceneDur) {
    const t = CH[spec.type];
    if (!t || !t.win) return null;
    const ws = t.win(spec, sceneDur) || [];
    return spec.motion === 'continuous' ? ws.concat([[delayOf(spec), sceneDur]]) : ws;
  };

  /* ---------------- 原图取景：views 关键帧（与 v5 evidence 同一套数学） ----------------
     view = [x,y,w,h] 原图像素；views = [{at, dur, view}]，at 为镜头内秒数，easeInOut 插值 */
  function viewAt(s, lt) {
    const ks = s.views && s.views.length ? s.views : [{ at: 0, view: s.view || [0, 0, s.iw || 1920, s.ih || 1080] }];
    let ki = 0; for (let k = 1; k < ks.length; k++) if (lt >= ks[k].at) ki = k;
    const a = ks[Math.max(0, ki - 1)].view, b = ks[ki].view;
    const q = ki ? eInOut(prog(lt, ks[ki].at, ks[ki].dur || .95)) : 1;
    return b.map((x, k) => lerp(a[k], x, q));
  }
  // 原图在画面里的「窗口」矩形（不含旋转）与适配方式
  function boxOf(s) {
    if (s.type === 'docpage') { const p = s.pad == null ? 26 : s.pad; return { x: s.x + p, y: s.y + p, w: s.w - 2 * p, h: s.h - 2 * p, fit: 'contain' }; }
    if (s.type === 'photocard' || s.type === 'videocard') { const b = s.border == null ? 14 : s.border, bb = s.bottom == null ? b : s.bottom;
      return { x: s.x + b, y: s.y + b, w: s.w - 2 * b, h: s.h - b - bb, fit: 'cover' }; }
    return { x: s.x, y: s.y, w: s.w, h: s.h, fit: 'contain' };            // evidence / 其他
  }
  function fitOf(box, v) {
    const z = box.fit === 'cover' ? Math.max(box.w / v[2], box.h / v[3]) : Math.min(box.w / v[2], box.h / v[3]);
    return { z, ox: (box.w - v[2] * z) / 2 - v[0] * z, oy: (box.h - v[3] * z) / 2 - v[1] * z };
  }
  // 原图像素点 → 画布坐标（含元素旋转，绕元素中心）
  FX.map = function (ref, lt, pt) {
    const box = boxOf(ref), v = viewAt(ref, lt), f = fitOf(box, v);
    let X = box.x + f.ox + pt[0] * f.z, Y = box.y + f.oy + pt[1] * f.z;
    const r = (ref.rot || 0) * Math.PI / 180;
    if (r) { const cx = ref.x + ref.w / 2, cy = ref.y + ref.h / 2, dx = X - cx, dy = Y - cy;
      X = cx + dx * Math.cos(r) - dy * Math.sin(r); Y = cy + dx * Math.sin(r) + dy * Math.cos(r); }
    return [X, Y];
  };
  FX.scaleOf = (ref, lt) => fitOf(boxOf(ref), viewAt(ref, lt)).z;
  FX.unmap = function (ref, lt, P) {                         // 画布坐标 → 原图像素（放大镜用：镜片里永远是它压着的那块）
    const box = boxOf(ref), v = viewAt(ref, lt), f = fitOf(box, v);
    let X = P[0], Y = P[1]; const r = -(ref.rot || 0) * Math.PI / 180;
    if (r) { const cx = ref.x + ref.w / 2, cy = ref.y + ref.h / 2, dx = X - cx, dy = Y - cy;
      X = cx + dx * Math.cos(r) - dy * Math.sin(r); Y = cy + dx * Math.sin(r) + dy * Math.cos(r); }
    return [(X - box.x - f.ox) / f.z, (Y - box.y - f.oy) / f.z];
  };
  // 目标（原图像素矩形或画布矩形）→ 画布四角与中心
  function targetQuad(s, lt) {
    if (s.ref && FX.specs[s.ref]) {
      const ref = FX.specs[s.ref], [x, y, w, h] = s.target;
      const P = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(p => FX.map(ref, lt, p));
      return { P, c: FX.map(ref, lt, [x + w / 2, y + h / 2]), rot: ref.rot || 0, z: FX.scaleOf(ref, lt) };
    }
    const [x, y, w, h] = s.rect || s.target || [s.x, s.y, s.w, s.h];
    return { P: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], c: [x + w / 2, y + h / 2], rot: 0, z: 1 };
  }
  // 图片按取景铺进窗口：img 用原图尺寸 + transform
  function placeImg(img, box, v) {
    const f = fitOf(box, v);
    set(img, 'width', (v.iw || img.naturalWidth || 1920) + 'px');
    img.style.transform = `translate(${f2(f.ox)}px,${f2(f.oy)}px) scale(${f.z.toFixed(5)})`;
  }
  // 锯齿胶带（固定种子），pos: tl/tr/bl/br/top/left/right
  function tapeHTML(seed, pos, W = 112, H = 34) {
    const R = rng(seed), pts = [];
    const n = 9;
    for (let i = 0; i <= n; i++) pts.push(`${f2(i / n * 100)}% ${f2(R() * 9)}%`);
    for (let i = n; i >= 0; i--) pts.push(`${f2(i / n * 100)}% ${f2(91 + R() * 9)}%`);
    const place = { tl: `left:-34px;top:-10px;transform:rotate(-36deg)`, tr: `right:-34px;top:-10px;transform:rotate(38deg)`,
      bl: `left:-34px;bottom:-10px;transform:rotate(36deg)`, br: `right:-34px;bottom:-10px;transform:rotate(-38deg)`,
      top: `left:50%;top:-16px;transform:translateX(-50%) rotate(${f2(R() * 6 - 3)}deg)`,
      left: `left:-22px;top:42%;transform:rotate(${f2(80 + R() * 10)}deg)`, right: `right:-22px;top:42%;transform:rotate(${f2(-80 - R() * 10)}deg)` }[pos] || '';
    return `<i class="fx-tape" style="width:${W}px;height:${H}px;${place};clip-path:polygon(${pts.join(',')})"></i>`;
  }
  const tapes = (s, def) => { const t = s.tape == null ? def : s.tape; const arr = !t ? [] : Array.isArray(t) ? t : [t];
    return arr.map((p, i) => tapeHTML(seedOf(s) + i * 17, p)).join(''); };
  const clipHTML = s => s.clip ? `<i class="fx-clip" style="${s.clip === 'right' ? 'right:30px' : 'left:30px'}"></i>` : '';
  // 卡片入场（落下 / 滑入 / 淡入 / 弹出），返回 {tr, op, land}；land = 落地程度 0–1（给投影用）
  function enterOf(s, lt, def = 'drop') {
    const kind = s.enter || def, d = s.enterDur || .55, q = prog(lt, delayOf(s), d);
    if (lt < delayOf(s)) return { tr: '', op: 0, land: 0 };
    const dr = s.dropRot == null ? -6 : s.dropRot;
    if (kind === 'drop') { const e = eOutBack(q, 1.25), dy = s.dropY == null ? -90 : s.dropY;
      return { tr: `translate(0px,${f2(lerp(dy, 0, e))}px) rotate(${f2(lerp(dr, 0, e))}deg) scale(${(1 + (1 - eOutCubic(q)) * .04).toFixed(4)})`, op: clamp(q * 4, 0, 1), land: eOutCubic(q) }; }
    if (kind === 'slide') { const e = eOutCubic(q), dx = s.fromX == null ? 140 : s.fromX, dy = s.fromY == null ? 30 : s.fromY;
      return { tr: `translate(${f2((1 - e) * dx)}px,${f2((1 - e) * dy)}px) rotate(${f2((1 - e) * dr * .5)}deg)`, op: clamp(q * 3, 0, 1), land: e }; }
    if (kind === 'pop') { const e = eOutBack(q, 1.6);
      return { tr: `scale(${lerp(.82, 1, e).toFixed(4)})`, op: clamp(q * 3, 0, 1), land: e }; }
    if (kind === 'none') return { tr: '', op: 1, land: 1 };
    return { tr: '', op: eOutCubic(q), land: 1 };                                  // fade
  }
  // 浮起事件（讲到哪张哪张浮起）：lift:[{at,dur,scale,to:0 回落}]
  function liftOf(s, lt) {
    let v = 0;
    (s.lift || []).forEach(L => { const q = eInOut(prog(lt, L.at, L.dur || .35)); v = lerp(v, L.to == null ? 1 : L.to, q); });
    return v;
  }
  function dimOf(s, lt) {
    let v = 0;
    (s.dim || []).forEach(L => { const q = eInOut(prog(lt, L.at, L.dur || .35)); v = lerp(v, L.to == null ? .35 : L.to, q); });
    return v;
  }
  const viewWins = s => (s.views || []).slice(1).map(v => [v.at, v.at + (v.dur || .95)]);
  const eventWins = arr => (arr || []).map(L => [L.at, L.at + (L.dur || .35)]);
  // 引用别的元素取景的组件：被引用元素推近时它也得跟着重画
  const refWins = s => { const r = s.ref && FX.specs[s.ref]; return r ? viewWins(r).concat(['docpage', 'photocard', 'videocard'].includes(r.type) ? [[delayOf(r), delayOf(r) + (r.enterDur || .55)]] : []) : []; };

  /* =====================================================================
     docpage —— 原件纸页：白纸 + 投影 + 轻微倾斜（可 3D 透视）+ 胶带/回形针/折角，可按 views 推近
     spec: src, iw, ih, view|views, x,y,w,h, pad=26, rot, tilt:{rx,ry,persp}, enter('drop'|'slide'|'fade'|'pop'),
           enterDur, tape, clip, fold, label（页脚小字）
     ===================================================================== */
  CH.docpage = FX.types.docpage = {
    build(s) {
      return `<div class="fx-in fx-doc${s.fold ? ' fold' : ''}"><div class="dp-shadow"></div><div class="dp-paper">` +
        `<div class="dp-win" style="left:${s.pad == null ? 26 : s.pad}px;top:${s.pad == null ? 26 : s.pad}px;right:${s.pad == null ? 26 : s.pad}px;bottom:${s.pad == null ? 26 : s.pad}px">` +
        `<img class="dp-img" src="${esc(s.src)}" alt=""></div>` + (s.label ? `<div class="dp-label">${rich(s.label)}</div>` : '') +
        `</div>${tapes(s, null)}${clipHTML(s)}</div>`;
    },
    update(n, s, p, tau, c) {
      const lt = c.lt, en = enterOf(s, lt, 'drop'), inn = n.firstChild;
      const tl = s.tilt ? `perspective(${s.tilt.persp || 1800}px) rotateX(${s.tilt.rx || 0}deg) rotateY(${s.tilt.ry || 0}deg) ` : '';
      const lift = liftOf(s, lt);
      inn.style.transform = `${tl}${en.tr} scale(${(1 + lift * (s.liftScale || .03)).toFixed(4)})`;
      inn.style.opacity = en.op;
      const sh = n.querySelector('.dp-shadow');
      sh.style.transform = `translate(${f2((1 - en.land) * 26 + lift * 8)}px,${f2((1 - en.land) * 34 + lift * 12)}px)`;
      sh.style.opacity = f2(lerp(.45, 1, en.land));
      const box = boxOf(s), v = viewAt(s, lt); v.iw = s.iw;
      placeImg(n.querySelector('.dp-img'), { ...box, x: 0, y: 0 }, v);
    },
    win: s => [[delayOf(s), delayOf(s) + (s.enterDur || .55)]].concat(viewWins(s), eventWins(s.lift))
  };

  /* =====================================================================
     photocard —— 白边照片卡（或电视框 style:'tv'）：投影 + 胶带 + 从上方落下，可多张叠放
     spec: src, iw, ih, view|views, x,y,w,h, rot, border=14, bottom(下边宽，写 caption 时自动加宽), caption,
           style:'photo'|'tv'|'plain', tvLabel, tape(['tl','tr']), clip, enter, dropY, dropRot, enterDur,
           lift:[{at,dur,to}] 浮起, dim:[{at,dur,to}] 压暗
     ===================================================================== */
  CH.photocard = FX.types.photocard = {
    build(s) {
      const b = s.border == null ? 14 : s.border, bb = s.bottom == null ? b : s.bottom, st = s.style || 'photo';
      return `<div class="fx-in fx-card st-${st}"><div class="pc-shadow"></div><div class="pc-frame">` +
        `<div class="pc-win" style="left:${b}px;top:${b}px;right:${b}px;bottom:${bb}px"><img class="pc-img" src="${esc(s.src)}" alt=""><div class="pc-dim"></div></div>` +
        (s.caption ? `<div class="pc-cap" style="height:${bb}px">${rich(s.caption)}</div>` : '') +
        (st === 'tv' && s.tvLabel ? `<div class="pc-tvlabel" style="height:${bb}px">${rich(s.tvLabel)}</div>` : '') +
        `</div>${tapes(s, st === 'photo' ? ['tl', 'tr'] : null)}${clipHTML(s)}</div>`;
    },
    update(n, s, p, tau, c) {
      const lt = c.lt, en = enterOf(s, lt, 'drop'), inn = n.firstChild, lift = liftOf(s, lt);
      inn.style.transform = `${en.tr} scale(${(1 + lift * (s.liftScale || .04)).toFixed(4)})`;
      inn.style.opacity = en.op;
      const sh = n.querySelector('.pc-shadow');
      sh.style.transform = `translate(${f2((1 - en.land) * 30 + lift * 10)}px,${f2((1 - en.land) * 40 + lift * 14)}px)`;
      sh.style.opacity = f2(lerp(.4, 1, en.land) * (1 + lift * .25));
      const box = boxOf(s), v = viewAt(s, lt); v.iw = s.iw;
      placeImg(n.querySelector('.pc-img'), { ...box, x: 0, y: 0 }, v);
      set(n.querySelector('.pc-dim'), 'opacity', f2(dimOf(s, lt)));
    },
    win: s => [[delayOf(s), delayOf(s) + (s.enterDur || .55)]].concat(viewWins(s), eventWins(s.lift), eventWins(s.dim))
  };

  /* =====================================================================
     videocard —— 相片卡里放一段短视频（Seedance 寓意小动画 / 新闻实拍片段）。外观与 photocard 相同
     （白边、投影、胶带、轻倾斜、落下入场；style:'tv' 电视框），左上可加小标（badge，如「AI 示意」）。
     画面 = 预先用 ffmpeg 抽好的 30fps JPG 序列（v6lib.vseq，按 in/out 截取，缓存在 素材/序列/）：
       帧号 k = floor((lt − playAt) × fps × speed)，夹在 0…n−1；reverse 时取 n−1−k。不循环，播完停在最后一帧。
       换图后 img.decode() 交给舞台（ctx.wait → pendingVideos），__seek 等解码完成才截图；解码失败直接报错，不截半帧。
     spec: frames:[file://…]（全部帧的地址，渲染缓存键按每帧内容哈希）, fps=30, iw, ih, view|views, x,y,w,h, rot,
           border=14, bottom, caption, style:'photo'|'tv'|'plain', tvLabel, tape, clip, enter, enterDur, dropY, dropRot,
           lift, dim, playAt（开始播放，镜头内秒数，默认 = 出现时刻）, speed=1, reverse=false,
           badge（左上小标）, scan（横向扫描线，style:'tv' 默认开）
     窗口：入场段 + 整段播放 [playAt, playAt + n/(fps·speed)]（逐帧真截），其余时间阅读定格。
     ===================================================================== */
  const vcPlay = s => { const pa = s.playAt == null ? delayOf(s) : s.playAt, n = s.frames.length, fps = s.fps || 30, sp = s.speed || 1;
    return { pa, n, fps, sp, end: pa + n / (fps * sp) }; };
  const vcIndex = (s, lt) => { const P = vcPlay(s); const k = clamp(Math.floor((lt - P.pa) * P.fps * P.sp + 1e-3), 0, P.n - 1);
    return s.reverse ? P.n - 1 - k : k; };
  FX.vcIndex = vcIndex;
  CH.videocard = FX.types.videocard = {
    build(s) {
      const b = s.border == null ? 14 : s.border, bb = s.bottom == null ? b : s.bottom, st = s.style || 'photo';
      const scan = s.scan == null ? st === 'tv' : s.scan, f0 = s.frames[vcIndex(s, delayOf(s))];
      return `<div class="fx-in fx-card fx-vcard st-${st}"><div class="pc-shadow"></div><div class="pc-frame">` +
        `<div class="pc-win" style="left:${b}px;top:${b}px;right:${b}px;bottom:${bb}px"><img class="pc-img vc-img" src="${esc(f0)}" alt="">` +
        (scan ? `<div class="vc-scan"></div>` : '') + (s.badge ? `<div class="vc-badge">${rich(s.badge)}</div>` : '') + `<div class="pc-dim"></div></div>` +
        (s.caption ? `<div class="pc-cap" style="height:${bb}px">${rich(s.caption)}</div>` : '') +
        (st === 'tv' && s.tvLabel ? `<div class="pc-tvlabel" style="height:${bb}px">${rich(s.tvLabel)}</div>` : '') +
        `</div>${tapes(s, st === 'photo' ? ['tl', 'tr'] : null)}${clipHTML(s)}</div>`;
    },
    update(n, s, p, tau, c) {
      const lt = c.lt, en = enterOf(s, lt, 'drop'), inn = n.firstChild, lift = liftOf(s, lt);
      inn.style.transform = `${en.tr} scale(${(1 + lift * (s.liftScale || .04)).toFixed(4)})`;
      inn.style.opacity = en.op;
      const sh = n.querySelector('.pc-shadow');
      sh.style.transform = `translate(${f2((1 - en.land) * 30 + lift * 10)}px,${f2((1 - en.land) * 40 + lift * 14)}px)`;
      sh.style.opacity = f2(lerp(.4, 1, en.land) * (1 + lift * .25));
      // 选帧：只由 lt 算；换了地址就等它解码（缓存的只是「img 现在挂着哪张」，不是动画状态）
      const img = n.querySelector('.vc-img'), url = s.frames[vcIndex(s, lt)];
      if (img.getAttribute('src') !== url) {
        img.setAttribute('src', url);
        const d = { url, done: false };
        d.p = img.decode().then(() => { if (!(img.naturalWidth > 0)) throw new Error('empty'); d.done = true; })
          .catch(e => { throw new Error('videocard 帧解码失败：' + decodeURIComponent(url) + '（' + e + '）'); });
        n._vcDec = d;
      }
      if (n._vcDec && n._vcDec.url === url && !n._vcDec.done && c.wait) c.wait(n._vcDec.p);
      const box = boxOf(s), v = viewAt(s, lt); v.iw = s.iw;
      placeImg(img, { ...box, x: 0, y: 0 }, v);
      set(n.querySelector('.pc-dim'), 'opacity', f2(dimOf(s, lt)));
    },
    win: s => { const P = vcPlay(s);
      return [[delayOf(s), delayOf(s) + (s.enterDur || .55)], [P.pa, P.end]].concat(viewWins(s), eventWins(s.lift), eventWins(s.dim)); }
  };

  /* =====================================================================
     parallax —— 2–3 层视差：同图模糊放大底层 + 主体层（可内缩成浮起的照片）+ 前景装饰
     幅度 amp = 总位移占框宽的比例（≤0.03），一次性从起点漂到终点，不循环
     spec: src, iw, ih, view, x,y,w,h, amp=.024, dir:[1,-.35], zoom:[1,1.03], start(默认=delay), end(默认镜头末),
           inset=.06（主体层内缩比例；0 = 满框，底层看不见）, blur=26, frame(主体层白边 px，默认 inset>0 时 12),
           fg:{src, iw, ih, x,y,w,h(框内坐标), depth=1.7}, deco:'bokeh'|'none', enter:'fade'|'none'
     ===================================================================== */
  CH.parallax = FX.types.parallax = {
    build(s) {
      const R = rng(seedOf(s)), inset = s.inset == null ? .06 : s.inset, fr = s.frame == null ? (inset > 0 ? 12 : 0) : s.frame;
      let deco = '';
      if ((s.deco || 'bokeh') === 'bokeh') {
        for (let i = 0; i < (s.decoN || 7); i++) {
          const r = 40 + R() * 110, x = R() * s.w, y = R() < .5 ? R() * s.h * .3 : s.h * (.7 + R() * .3);
          deco += `<i style="left:${f2(x - r)}px;top:${f2(y - r)}px;width:${f2(2 * r)}px;height:${f2(2 * r)}px;opacity:${f2(.10 + R() * .16)}"></i>`;
        }
      }
      return `<div class="fx-in fx-par"><div class="px-back"><img class="px-bimg" src="${esc(s.src)}" alt=""></div>` +
        `<div class="px-main${fr ? ' framed' : ''}" style="--fr:${fr}px"><div class="px-mwin"><img class="px-img" src="${esc(s.src)}" alt=""></div></div>` +
        (s.fg ? `<img class="px-fg" src="${esc(s.fg.src)}" alt="">` : '') + `<div class="px-deco">${deco}</div></div>`;
    },
    update(n, s, p, tau, c) {
      const lt = c.lt, a = s.start == null ? delayOf(s) : s.start, b = s.end == null ? c.sceneDur : s.end;
      const q = eInOut(prog(lt, a, b - a)), amp = Math.min(s.amp == null ? .024 : s.amp, .03), dir = s.dir || [1, -.35];
      const dl = Math.hypot(dir[0], dir[1]) || 1, ux = dir[0] / dl, uy = dir[1] / dl, z0 = (s.zoom || [1, 1.03])[0], z1 = (s.zoom || [1, 1.03])[1];
      const off = (dep) => [(q - .5) * amp * s.w * ux * dep, (q - .5) * amp * s.w * uy * dep];
      const zz = dep => 1 + (lerp(z0, z1, q) - 1) * dep;
      const inn = n.firstChild, en = enterOf(s, lt, 'fade');
      inn.style.opacity = en.op;
      const inset = s.inset == null ? .06 : s.inset, fr = s.frame == null ? (inset > 0 ? 12 : 0) : s.frame;
      const v = (s.view || [0, 0, s.iw, s.ih]).slice(); v.iw = s.iw;
      // 底层：同图铺满 + 模糊 + 放大，动得最少
      const bk = n.querySelector('.px-back'); const [bx, by] = off(.35);
      bk.style.transform = `translate(${f2(bx)}px,${f2(by)}px) scale(${(1.14 * zz(.35)).toFixed(4)})`;
      set(bk, 'filter', `blur(${s.blur == null ? 26 : s.blur}px) brightness(${s.backBright == null ? .72 : s.backBright}) saturate(1.05)`);
      placeImg(n.querySelector('.px-bimg'), { x: 0, y: 0, w: s.w, h: s.h, fit: 'cover' }, v);
      // 主体层
      const mw = s.w * (1 - 2 * inset), mh = s.h * (1 - 2 * inset), m = n.querySelector('.px-main'); const [mx, my] = off(1);
      m.style.left = f2(s.w * inset) + 'px'; m.style.top = f2(s.h * inset) + 'px'; m.style.width = f2(mw) + 'px'; m.style.height = f2(mh) + 'px';
      m.style.transform = `translate(${f2(mx)}px,${f2(my)}px) scale(${zz(1).toFixed(4)})`;
      placeImg(n.querySelector('.px-img'), { x: 0, y: 0, w: mw - 2 * fr, h: mh - 2 * fr, fit: 'cover' }, v);
      // 前景：抠图或装饰，动得最多
      const fg = n.querySelector('.px-fg');
      if (fg) { const F = s.fg, [fx, fy] = off(F.depth || 1.7); fg.style.left = F.x + 'px'; fg.style.top = F.y + 'px'; fg.style.width = F.w + 'px'; fg.style.height = F.h + 'px';
        fg.style.transform = `translate(${f2(fx)}px,${f2(fy)}px) scale(${zz(F.depth || 1.7).toFixed(4)})`; }
      const [dx, dy] = off(1.9); n.querySelector('.px-deco').style.transform = `translate(${f2(dx)}px,${f2(dy)}px)`;
    },
    win: (s, D) => [[delayOf(s), s.end == null ? D : s.end]]
  };

  /* =====================================================================
     lens —— 放大镜：镜片里是它压着的原件（真放大，不是另一张图）+ 引线 + 中文译文卡
     spec: ref（docpage/evidence/photocard 的 id）, target:[x,y,w,h]（原图像素，要放大的那句）,
           delay（镜子开始出现）, travel=.7（飞到位）, zoom=2（相对原件当前显示倍率）, shape:'bar'|'circle',
           r=150（圆镜半径）, pad=[30,22]（条镜比目标多出的边距，画面像素）, from:[x,y]（飞入起点，默认右下）,
           sweep=0（圆镜到位后沿句子从左扫到右的秒数）, dim=.28（原件其余部分压暗）,
           ja（日文原句，小字在上）, zh（中文译文，大字在下）, note（译文卡底部出处小字）,
           card:{x,y,w}（译文卡位置；默认在目标下方）, cardAt（默认 到位后 +0.15）, lensOutAt（镜子先撤，卡留下）,
           hideAt（全部退场）
     ===================================================================== */
  function lensTimes(s) {
    const a = delayOf(s), tr = s.travel == null ? .7 : s.travel, sw = s.sweep || 0;
    const arrive = a + tr, swept = arrive + sw, cardAt = s.cardAt == null ? swept + .15 : s.cardAt;
    return { a, tr, sw, arrive, swept, cardAt, out: s.lensOutAt };
  }
  CH.lens = FX.types.lens = {
    build(s) {
      const ref = FX.specs[s.ref] || {}, src = s.src || ref.src, circle = s.shape === 'circle';
      const card = s.zh ? `<div class="ln-card">${tapeHTML(seedOf(s) + 5, 'top', 96, 30)}` +
        (s.ja ? `<div class="ln-ja">${rich(s.ja)}</div>` : '') + `<div class="ln-zh">${rich(s.zh)}</div>` +
        (s.note ? `<div class="ln-note">${rich(s.note)}</div>` : '') + `</div>` : '';
      return `<div class="ln-dimclip"><div class="ln-dimhole"></div></div><div class="ln-tbox"></div>` +
        `<svg class="ln-lead" width="1920" height="1008"><path class="ln-path" d=""/><circle class="ln-d0" r="5"/><circle class="ln-d1" r="5"/></svg>` +
        `<div class="ln-body ${circle ? 'circle' : 'bar'}"><div class="ln-shadow"></div><div class="ln-handle"></div>` +
        `<div class="ln-glass"><img class="ln-img" src="${esc(src)}" alt=""><div class="ln-shine"></div></div><div class="ln-rim"></div></div>` + card;
    },
    update(n, s, p, tau, c) {
      const lt = c.lt, T = lensTimes(s), ref = FX.specs[s.ref];
      if (!ref) return;
      n.style.width = '1920px'; n.style.height = '1008px'; n.style.left = '0px'; n.style.top = '0px';
      const zDoc = FX.scaleOf(ref, lt), Z = zDoc * (s.zoom || 2), [tx, ty, tw, th] = s.target;
      const circle = s.shape === 'circle';
      // 镜子尺寸
      const pad = s.pad || [30, 22];
      const LW = circle ? 2 * (s.r || 150) : tw * Z + 2 * pad[0], LH = circle ? 2 * (s.r || 150) : th * Z + 2 * pad[1];
      // 镜子中心：飞入 → 到位（目标中心或圆镜扫到句首）→ 扫过句子
      const tgtL = FX.map(ref, lt, [tx + Math.min(tw, th * 1.2) / 2, ty + th / 2]), tgtR = FX.map(ref, lt, [tx + tw - Math.min(tw, th * 1.2) / 2, ty + th / 2]);
      const tgtC = FX.map(ref, lt, [tx + tw / 2, ty + th / 2]);
      const rest = circle && T.sw > 0 ? tgtL : tgtC;
      const from = s.from || [rest[0] + 520, rest[1] + 420];
      let C;
      if (lt < T.arrive) { const e = eOutCubic(prog(lt, T.a, T.tr)); C = [lerp(from[0], rest[0], e), lerp(from[1], rest[1], e)]; }
      else if (circle && T.sw > 0) { const e = eInOut(prog(lt, T.arrive, T.sw)); C = [lerp(tgtL[0], tgtR[0], e), lerp(tgtL[1], tgtR[1], e)]; }
      else C = rest;
      if (s.lift) C = [C[0] + s.lift[0] * eOutCubic(prog(lt, T.a, T.tr)), C[1] + s.lift[1] * eOutCubic(prog(lt, T.a, T.tr))];
      // 镜子出现 / 撤走
      let lop = clamp((lt - T.a) / .2, 0, 1), outQ = T.out != null ? eOutCubic(prog(lt, T.out, .35)) : 0;
      lop *= 1 - outQ;
      const body = n.querySelector('.ln-body');
      body.style.width = f2(LW) + 'px'; body.style.height = f2(LH) + 'px';
      body.style.transform = `translate(${f2(C[0] - LW / 2)}px,${f2(C[1] - LH / 2 + outQ * 60)}px) scale(${lerp(.92, 1, eOutCubic(prog(lt, T.a, .35))).toFixed(4)})`;
      body.style.opacity = f2(lop); body.style.visibility = lop <= 0 ? 'hidden' : '';
      // 镜片内容：它下面那块原件 × zoom（中心对准镜子中心压着的原图点）
      const P = FX.unmap(ref, lt, C);
      const img = n.querySelector('.ln-img');
      set(img, 'width', ref.iw + 'px');
      img.style.transform = `translate(${f2(LW / 2 - P[0] * Z)}px,${f2(LH / 2 - P[1] * Z)}px) scale(${Z.toFixed(5)})`;
      // 原件其余部分压暗（只压原件框内，洞跟着镜子）
      const dc = n.querySelector('.ln-dimclip'), box = boxOf(ref), dim = (s.dim == null ? .28 : s.dim) * lop;
      dc.style.left = ref.x + 'px'; dc.style.top = ref.y + 'px'; dc.style.width = ref.w + 'px'; dc.style.height = ref.h + 'px';
      dc.style.transform = `rotate(${ref.rot || 0}deg)`; dc.style.opacity = f2(dim > 0.002 ? 1 : 0);
      const hole = n.querySelector('.ln-dimhole');
      const r = -(ref.rot || 0) * Math.PI / 180, cx = ref.x + ref.w / 2, cy = ref.y + ref.h / 2, dx = C[0] - cx, dy = C[1] - cy;
      const lx = cx + dx * Math.cos(r) - dy * Math.sin(r) - ref.x, ly = cy + dx * Math.sin(r) + dy * Math.cos(r) - ref.y;
      hole.style.width = f2(LW) + 'px'; hole.style.height = f2(LH) + 'px'; hole.style.borderRadius = circle ? '50%' : '22px';
      hole.style.transform = `translate(${f2(lx - LW / 2)}px,${f2(ly - LH / 2)}px)`;
      hole.style.boxShadow = `0 0 0 3000px rgba(18,16,12,${f2(dim)})`;
      // 目标框（原位置细红框，镜子挪开后看得见对应关系）
      const tb = n.querySelector('.ln-tbox'), q4 = targetQuad(s, lt);
      const tbw = Math.hypot(q4.P[1][0] - q4.P[0][0], q4.P[1][1] - q4.P[0][1]), tbh = Math.hypot(q4.P[3][0] - q4.P[0][0], q4.P[3][1] - q4.P[0][1]);
      tb.style.width = f2(tbw + 10) + 'px'; tb.style.height = f2(tbh + 8) + 'px';
      tb.style.transform = `translate(${f2(q4.c[0] - tbw / 2 - 5)}px,${f2(q4.c[1] - tbh / 2 - 4)}px) rotate(${q4.rot}deg)`;
      tb.style.opacity = f2(s.box === false ? 0 : clamp((lt - T.arrive) / .25, 0, 1));
      // 译文卡 + 引线
      const card = n.querySelector('.ln-card');
      if (card) {
        const cd = s.card || {}, cw = cd.w || 760, cxp = cd.x == null ? clamp(tgtC[0] - cw / 2, 150, 1770 - cw) : cd.x;
        const cyp = cd.y == null ? Math.min(tgtC[1] + LH / 2 + 60, 620) : cd.y;
        const cq = prog(lt, T.cardAt, .38), ce = eOutBack(cq, 1.4);
        card.style.left = f2(cxp) + 'px'; card.style.top = f2(cyp) + 'px'; card.style.width = cw + 'px';
        card.style.opacity = f2(clamp(cq * 3, 0, 1));
        card.style.transform = `translateY(${f2((1 - ce) * 26)}px) rotate(${f2(lerp(-3, cd.rot == null ? -.8 : cd.rot, ce))}deg)`;
        // 引线：镜子（或镜子撤走后的目标框）边缘 → 卡片最近的一边（卡在右/左边走水平 S 形，在上下走竖直 S 形）
        const anchor = outQ > .5 ? q4.c : C, ah = outQ > .5 ? tbh / 2 + 4 : LH / 2, aw = outQ > .5 ? tbw / 2 + 5 : LW / 2;
        const ch = card.offsetHeight || 200;
        let sx, sy, ex, ey, d;
        if (cxp > anchor[0] + aw + 20 || cxp + cw < anchor[0] - aw - 20) {
          const right = cxp > anchor[0]; sx = anchor[0] + (right ? aw : -aw); sy = anchor[1];
          ex = right ? cxp - 6 : cxp + cw + 6; ey = clamp(anchor[1], cyp + 36, cyp + ch - 36);
          d = `M${f2(sx)},${f2(sy)} C${f2((sx + ex) / 2)},${f2(sy)} ${f2((sx + ex) / 2)},${f2(ey)} ${f2(ex)},${f2(ey)}`;
        } else {
          ex = clamp(anchor[0], cxp + 40, cxp + cw - 40); const below = cyp > anchor[1]; ey = below ? cyp - 6 : cyp + ch + 6;
          sx = anchor[0]; sy = anchor[1] + (below ? ah : -ah);
          d = `M${f2(sx)},${f2(sy)} C${f2(sx)},${f2((sy + ey) / 2)} ${f2(ex)},${f2((sy + ey) / 2)} ${f2(ex)},${f2(ey)}`;
        }
        const lq = prog(lt, T.cardAt - .12, .3);
        const path = n.querySelector('.ln-path');
        if (path.getAttribute('d') !== d) path.setAttribute('d', d);
        const L = path.getTotalLength();
        path.style.strokeDasharray = f2(L); path.style.strokeDashoffset = f2(L * (1 - lq));
        const d0 = n.querySelector('.ln-d0'), d1 = n.querySelector('.ln-d1');
        d0.setAttribute('cx', f2(sx)); d0.setAttribute('cy', f2(sy)); d1.setAttribute('cx', f2(ex)); d1.setAttribute('cy', f2(ey));
        d0.style.opacity = lq > 0 ? 1 : 0; d1.style.opacity = lq >= 1 ? 1 : 0;
        n.querySelector('.ln-lead').style.opacity = lq > 0 ? 1 : 0;
      }
    },
    win: s => { const T = lensTimes(s); const w = [[T.a, T.cardAt + .45]].concat(refWins(s)); if (T.out != null) w.push([T.out, T.out + .4]); return w; }
  };

  /* =====================================================================
     highlighter —— 荧光笔：从左往右逐字划过（两端斜、边缘微毛，正片叠底）
     spec: ref+target:[x,y,w,h]（原图像素）或 rect:[x,y,w,h]（画布像素）；多行用 targets:[[…],[…]] / rects
           delay（第一行开始）, dur=.45（每行）, gap=.08, color='#f2d84a', alpha=.62, pad=[6,4]
     ===================================================================== */
  const hlLines = s => s.targets || s.rects || [s.target || s.rect];
  CH.highlighter = FX.types.highlighter = {
    build(s) {
      const R = rng(seedOf(s)), id = 'hl' + (hashStr(s.id) % 1e7);
      let shapes = '';
      hlLines(s).forEach((_, i) => {
        // 归一化外形：上下边各 9 个抖动点，两端斜切
        const top = [], bot = [];
        for (let k = 0; k <= 8; k++) { top.push([k / 8, R() * .12]); bot.push([k / 8, .88 + R() * .12]); }
        shapes += `<path class="hl-shape" data-k="${i}" data-g='${JSON.stringify({ top, bot })}' clip-path="url(#${id}c${i})"/>` +
          `<clipPath id="${id}c${i}"><rect class="hl-clip" x="0" y="0" width="0" height="1008"/></clipPath>`;
      });
      return `<svg class="fx-hl" width="1920" height="1008" style="mix-blend-mode:multiply"><g class="hl-g">${shapes}</g></svg>`;
    },
    update(n, s, p, tau, c) {
      const lt = c.lt; n.style.left = '0px'; n.style.top = '0px'; n.style.width = '1920px'; n.style.height = '1008px';
      const lines = hlLines(s), pad = s.pad || [6, 4], dur = s.dur || .45, gap = s.gap == null ? .08 : s.gap;
      const col = s.color || '#f2d84a', al = s.alpha == null ? .62 : s.alpha;
      const shapes = n.querySelectorAll('.hl-shape'), clips = n.querySelectorAll('.hl-clip');
      lines.forEach((tg, i) => {
        const q = eOutCubic(prog(lt, delayOf(s) + i * (dur + gap), dur));
        const sub = { ...s, target: tg, rect: tg }; const Q = targetQuad(sub, lt);
        const ang = Math.atan2(Q.P[1][1] - Q.P[0][1], Q.P[1][0] - Q.P[0][0]);
        const W = Math.hypot(Q.P[1][0] - Q.P[0][0], Q.P[1][1] - Q.P[0][1]) + 2 * pad[0], H = Math.hypot(Q.P[3][0] - Q.P[0][0], Q.P[3][1] - Q.P[0][1]) + 2 * pad[1];
        const g = JSON.parse(shapes[i].getAttribute('data-g')), sl = Math.min(10, H * .3);
        const pt = (u, v) => [u * W + (v < .5 ? sl * .5 : -sl * .5) * (u === 0 ? 1 : u === 1 ? 1 : 0), v * H];
        const ptsArr = g.top.map(([u, v]) => pt(u, v)).concat(g.bot.slice().reverse().map(([u, v]) => pt(u, v)));
        const ox = Q.c[0], oy = Q.c[1];
        const d = 'M' + ptsArr.map(([x, y]) => `${f2(x - W / 2)},${f2(y - H / 2)}`).join('L') + 'Z';
        shapes[i].setAttribute('d', d);
        shapes[i].setAttribute('transform', `translate(${f2(ox)},${f2(oy)}) rotate(${f2(ang * 180 / Math.PI)})`);
        shapes[i].setAttribute('fill', col); shapes[i].setAttribute('fill-opacity', al);
        const cr = clips[i]; cr.setAttribute('x', f2(-W / 2 - 2)); cr.setAttribute('y', f2(-H)); cr.setAttribute('height', f2(2 * H));
        cr.setAttribute('width', f2((W + 4) * q));
        shapes[i].style.visibility = q > 0 ? '' : 'hidden';
      });
    },
    win: s => { const n = hlLines(s).length, d = s.dur || .45, g = s.gap == null ? .08 : s.gap; return [[delayOf(s), delayOf(s) + n * (d + g)]].concat(refWins(s)); }
  };

  /* =====================================================================
     circle —— 红笔圈注（手绘抖动椭圆，略多绕一点）/ 下划线 / 方框
     spec: ref+target（原图像素）或 rect（画布像素）, shape:'ellipse'|'underline'|'box', delay, dur=.6,
           color='#c0392b', width=5, pad=14, loops=1.12, seed
     ===================================================================== */
  CH.circle = FX.types.circle = {
    build(s) { return `<svg class="fx-circ" width="1920" height="1008"><path class="ci-path" fill="none"/></svg>`; },
    update(n, s, p, tau, c) {
      const lt = c.lt; n.style.left = '0px'; n.style.top = '0px'; n.style.width = '1920px'; n.style.height = '1008px';
      const Q = targetQuad(s, lt), pad = s.pad == null ? 14 : s.pad, R = rng(seedOf(s));
      const W = Math.hypot(Q.P[1][0] - Q.P[0][0], Q.P[1][1] - Q.P[0][1]), H = Math.hypot(Q.P[3][0] - Q.P[0][0], Q.P[3][1] - Q.P[0][1]);
      const ang = Math.atan2(Q.P[1][1] - Q.P[0][1], Q.P[1][0] - Q.P[0][0]), ca = Math.cos(ang), sa = Math.sin(ang);
      const tp = (x, y) => [Q.c[0] + x * ca - y * sa, Q.c[1] + x * sa + y * ca];
      const pts = [], shape = s.shape || 'ellipse';
      if (shape === 'ellipse') {
        const rx = W / 2 + pad * 1.6, ry = H / 2 + pad, loops = s.loops || 1.12, th0 = Math.PI * (1.05 + R() * .2), N = 72;
        const ph = [R() * 6, R() * 6], amp = [.035 + R() * .02, .02];
        for (let i = 0; i <= N; i++) {
          const u = i / N, th = th0 + u * Math.PI * 2 * loops, k = 1 + amp[0] * Math.sin(th * 2 + ph[0]) + amp[1] * Math.sin(th * 5 + ph[1]) + .06 * u;
          pts.push(tp(Math.cos(th) * rx * k, Math.sin(th) * ry * k - u * 4));
        }
      } else if (shape === 'strike') {
        // 中线横划，第二笔反向轻斜；种子固定，不读上一帧。
        const N = 32, strokes = s.strokes || 1;
        for (let j = 0; j < strokes; j++) {
          for (let i = 0; i <= N; i++) {
            const u = i / N, v = j ? 1 - u : u;
            pts.push(tp(-W / 2 + 6 + v * (W - 12), (j ? H * .10 - v * H * .18 : -H * .06 + v * H * .08) + Math.sin(u * 13 + j) * 1.8));
          }
        }
      } else if (shape === 'underline') {
        const N = 24, y0 = H / 2 + pad * .6;
        for (let i = 0; i <= N; i++) { const u = i / N; pts.push(tp(-W / 2 - 8 + u * (W + 16), y0 + Math.sin(u * 9 + R()) * 1.6 - u * 3)); }
      } else {
        const x0 = -W / 2 - pad, x1 = W / 2 + pad, y0 = -H / 2 - pad * .7, y1 = H / 2 + pad * .7, j = () => (R() - .5) * 4;
        [[x0, y0], [x1, y0 + j()], [x1 + j(), y1], [x0 + j(), y1 + j()], [x0 + j(), y0 - 6]].forEach(q => pts.push(tp(q[0], q[1])));
      }
      // Catmull-Rom → 贝塞尔，笔画顺滑
      let d = `M${f2(pts[0][0])},${f2(pts[0][1])}`;
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
        d += `C${f2(p1[0] + (p2[0] - p0[0]) / 6)},${f2(p1[1] + (p2[1] - p0[1]) / 6)} ${f2(p2[0] - (p3[0] - p1[0]) / 6)},${f2(p2[1] - (p3[1] - p1[1]) / 6)} ${f2(p2[0])},${f2(p2[1])}`;
      }
      const path = n.querySelector('.ci-path');
      if (path.getAttribute('d') !== d) { path.setAttribute('d', d); n._len = path.getTotalLength(); }
      const L = n._len || path.getTotalLength(), q = eOutCubic(prog(lt, delayOf(s), s.dur || .6));
      path.setAttribute('stroke', s.color || '#c0392b'); path.setAttribute('stroke-width', s.width || 5);
      path.style.strokeDasharray = f2(L + 2); path.style.strokeDashoffset = f2((L + 2) * (1 - q));
      path.style.visibility = q > 0 ? '' : 'hidden';
    },
    win: s => [[delayOf(s), delayOf(s) + (s.dur || .6)]].concat(refWins(s))
  };

  /* =====================================================================
     counter —— 数字滚动（机械计数器式逐位滚），落定时轻轻一顿；只给第一次出现的数字用
     spec: x,y,w,h, value, from=0, decimals=0, group=false（千分位逗号）, prefix, suffix, unit（小一号）,
           delay, dur=.9, size=140, color, font, align:'left'|'center'|'right', label（下方说明）, static（直接显示终值）
     ===================================================================== */
  function fmtNum(v, s) {
    let t = Math.abs(v).toFixed(s.decimals || 0);
    if (s.group) { const [i, f] = t.split('.'); t = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f ? '.' + f : ''); }
    return (v < 0 ? '−' : '') + t;
  }
  CH.counter = FX.types.counter = {
    build(s) {
      const str = fmtNum(s.value, s); let cols = '';
      const strip = '0<br>1<br>2<br>3<br>4<br>5<br>6<br>7<br>8<br>9<br>0';
      [...str].forEach(ch => { cols += /\d/.test(ch) ? `<span class="ct-dg"><span class="ct-strip">${strip}</span></span>` : `<span class="ct-st">${esc(ch)}</span>`; });
      return `<div class="fx-in fx-ctr" style="font-size:${s.size || 140}px;${s.color ? 'color:' + s.color + ';' : ''}${s.font ? 'font-family:' + s.font + ';' : ''}text-align:${s.align || 'left'}">` +
        `<div class="ct-num">${s.prefix ? `<span class="ct-pre">${esc(s.prefix)}</span>` : ''}${cols}${s.suffix ? `<span class="ct-suf">${esc(s.suffix)}</span>` : ''}${s.unit ? `<span class="ct-unit">${esc(s.unit)}</span>` : ''}</div>` +
        (s.label ? `<div class="ct-label">${rich(s.label)}</div>` : '') + `</div>`;
    },
    update(n, s, p, tau, c) {
      const lt = c.lt, d = s.dur || .9, q = s.static ? 1 : prog(lt, delayOf(s), d), e = eOutCubic(q);
      const from = s.from || 0, v = q >= 1 ? +s.value : from + (s.value - from) * e;
      const dec = s.decimals || 0, scaled = Math.abs(v) * Math.pow(10, dec);
      const digits = n.querySelectorAll('.ct-dg'), nd = digits.length;
      digits.forEach((dg, i) => {
        const k = nd - 1 - i, base = Math.pow(10, k);                    // 第 k 位（从个位数起）
        let pos = Math.floor(scaled / base) % 10;
        const lower = (scaled % base) / base;                             // 低位进度：低位从 9 滚到 0 时本位跟着进
        if (k === 0) pos = scaled % 10; else if (lower > .9) pos += (lower - .9) * 10;
        if (q >= 1) pos = Math.round(pos) % 10;
        dg.firstChild.style.transform = `translateY(${(-pos * 1.12).toFixed(4)}em)`;
        dg.style.opacity = (q < 1 && k > 0 && scaled < base * .999) ? .28 : 1;   // 还没轮到的高位：淡显的 0
      });
      const inn = n.firstChild, a = lt - delayOf(s);
      const settle = s.static ? 0 : (a > d && a < d + .22 ? Math.sin((a - d) / .22 * Math.PI) * .045 : 0);
      inn.style.transform = `scale(${(1 + settle).toFixed(4)})`;
      inn.style.opacity = f2(s.static ? 1 : clamp(a / .15, 0, 1));
      inn.style.transformOrigin = (s.align || 'left') === 'left' ? '0% 60%' : (s.align === 'right' ? '100% 60%' : '50% 60%');
    },
    win: s => s.static ? [[delayOf(s), delayOf(s) + .05]] : [[delayOf(s), delayOf(s) + (s.dur || .9) + .25]]
  };

  /* =====================================================================
     focuslines —— 漫画集中线：从画面四周射向中心，中间椭圆留空给主体；12fps 抖动（日本动画式）
     spec: cx,cy, rx=300, ry=190, n=110, delay, hold=1.0, fps=12, color='#1E1C18', alpha=.85,
           wmin=2, wmax=8, inner=[1,1.35]（内端离椭圆的倍数）, exit=.3, x/y/w/h（默认整幅内容区）,
           clip:[x,y,w,h]（只在这块区域画，上下羽化 feather=50px；v6lib 默认让开标题和出处）
     ===================================================================== */
  CH.focuslines = FX.types.focuslines = {
    build(s) { return `<svg class="fx-focus" width="${s.w || 1920}" height="${s.h || 1008}"><path class="fl-path"/></svg>`; },
    update(n, s, p, tau, c) {
      const lt = c.lt, a = delayOf(s), hold = s.hold == null ? 1 : s.hold, ex = s.exit == null ? .3 : s.exit, fps = s.fps || 12;
      const W = s.w || 1920, H = s.h || 1008, cx = s.cx - (s.x || 0), cy = s.cy - (s.y || 0), rx = s.rx || 300, ry = s.ry || 190;
      const t = lt - a, step = Math.max(0, Math.floor(t * fps));
      const conv = lerp(1.7, 1, eOutCubic(prog(t, 0, .2)));                // 0.2 秒内收拢
      const op = (s.alpha == null ? .85 : s.alpha) * clamp(t / .08, 0, 1) * (1 - prog(t, .2 + hold, ex));
      const base = rng(seedOf(s)), jit = rng(seedOf(s) * 31 + step * 7919), N = s.n || 110, Rout = Math.hypot(W, H);
      const inner = s.inner || [1, 1.35];
      let d = '';
      for (let i = 0; i < N; i++) {
        const th0 = (i + base() * .8) / N * Math.PI * 2, th = th0 + (jit() - .5) * .012;
        const ri = (inner[0] + jit() * (inner[1] - inner[0])) * conv, wd = (s.wmin || 2) + jit() * ((s.wmax || 8) - (s.wmin || 2));
        const ex0 = cx + Math.cos(th) * rx * ri, ey0 = cy + Math.sin(th) * ry * ri;           // 内端尖
        const nx = -Math.sin(th), ny = Math.cos(th), ox = cx + Math.cos(th) * Rout, oy = cy + Math.sin(th) * Rout;
        const hw = wd / 2 * (Rout / 600);
        d += `M${f2(ex0)},${f2(ey0)}L${f2(ox + nx * hw)},${f2(oy + ny * hw)}L${f2(ox - nx * hw)},${f2(oy - ny * hw)}Z`;
      }
      const path = n.querySelector('.fl-path');
      if (n._step !== step + ':' + conv.toFixed(3)) { path.setAttribute('d', d); n._step = step + ':' + conv.toFixed(3); }
      path.setAttribute('fill', s.color || '#1E1C18');
      n.firstChild.style.opacity = f2(op);
      if (s.clip) {                                   // 只在 clip 区域里画（默认让开标题和出处），上下边羽化
        const [kx, ky, kw, kh] = s.clip, fe = s.feather == null ? 50 : s.feather, sv = n.firstChild;
        set(sv, 'clipPath', `inset(${ky}px ${W - kx - kw}px ${H - ky - kh}px ${kx}px)`);
        set(sv, 'webkitMaskImage', `linear-gradient(180deg,transparent ${ky}px,#000 ${ky + fe}px,#000 ${ky + kh - fe}px,transparent ${ky + kh}px)`);
      }
    },
    win: s => [[delayOf(s), delayOf(s) + .2 + (s.hold == null ? 1 : s.hold) + (s.exit == null ? .3 : s.exit)]]
  };

  /* =====================================================================
     speedlines —— 速度线：一组平行细线持续流过；可在 reverseAt 平滑减速、停住、反向（闭式积分，可任意跳帧）
     spec: x,y,w,h（区域）, angle=0（运动方向，度；0=向右）, n=36, speed=1800（px/s）, len=[140,460], thick=[2,6],
           color='#1E1C18', alpha=.45, delay, dur（持续秒数，默认到镜头末）, reverseAt, reverseDur=.7, fade=.2
     ===================================================================== */
  function slPos(s, t) {                                         // 出现后 t 秒累计位移（单位：速度 1）
    const ra = s.reverseAt == null ? Infinity : s.reverseAt - delayOf(s), rd = s.reverseDur || .7;
    if (t <= ra) return t;
    const q = Math.min(1, (t - ra) / rd), mid = ra + rd / Math.PI * Math.sin(Math.PI * q);
    return t <= ra + rd ? mid : mid - (t - ra - rd);
  }
  CH.speedlines = FX.types.speedlines = {
    build(s) {
      const R = rng(seedOf(s)), N = s.n || 36, W = s.w || 1920, H = s.h || 1008, L0 = (s.len || [140, 460]), T0 = (s.thick || [2, 6]);
      const ang = (s.angle || 0) * Math.PI / 180, span = Math.abs(W * Math.cos(ang)) + Math.abs(H * Math.sin(ang)), cross = Math.abs(W * Math.sin(ang)) + Math.abs(H * Math.cos(ang));
      const ls = [];
      for (let i = 0; i < N; i++) ls.push({ off: (R() - .5) * cross, x0: R() * (span + 600), len: L0[0] + R() * (L0[1] - L0[0]), th: T0[0] + R() * (T0[1] - T0[0]), k: .65 + R() * .7, a: .35 + R() * .65 });
      const g = `<defs><linearGradient id="slg${seedOf(s) % 1e6}" x1="0" x2="1"><stop offset="0" stop-color="${s.color || '#1E1C18'}" stop-opacity="0"/><stop offset=".75" stop-color="${s.color || '#1E1C18'}" stop-opacity="1"/><stop offset="1" stop-color="${s.color || '#1E1C18'}" stop-opacity=".9"/></linearGradient></defs>`;
      return `<svg class="fx-speed" width="${W}" height="${H}">${g}<g class="sl-g" transform="translate(${W / 2},${H / 2}) rotate(${s.angle || 0})">` +
        ls.map((l, i) => `<rect class="sl" data-i="${i}" x="0" y="${f2(l.off - l.th / 2)}" width="${f2(l.len)}" height="${f2(l.th)}" rx="${f2(l.th / 2)}" fill="url(#slg${seedOf(s) % 1e6})" opacity="${f2(l.a)}"/>`).join('') +
        `</g></svg><script type="application/json" class="sl-data">${JSON.stringify({ ls, span })}</script>`;
    },
    update(n, s, p, tau, c) {
      const lt = c.lt, t = lt - delayOf(s), dur = s.dur == null ? c.sceneDur - delayOf(s) : s.dur, fd = s.fade || .2;
      if (!n._d) n._d = JSON.parse(n.querySelector('.sl-data').textContent);
      const { ls, span } = n._d, V = s.speed || 1800, X = slPos(s, Math.max(0, t)) * V;
      const ra = s.reverseAt == null ? Infinity : s.reverseAt - delayOf(s), back = t > ra + (s.reverseDur || .7) / 2;
      const rects = n.querySelectorAll('.sl'), M = span + 600;
      rects.forEach((r, i) => {
        const l = ls[i]; let x = ((l.x0 + X * l.k) % M + M) % M - M / 2 - 300;
        r.setAttribute('x', f2(back ? x : x - l.len));
        r.setAttribute('transform', back ? `scale(-1,1) translate(${f2(-2 * x)},0)` : '');
      });
      const op = (s.alpha == null ? .45 : s.alpha) * clamp(t / fd, 0, 1) * (1 - prog(t, dur, fd));
      n.firstChild.style.opacity = f2(op);
    },
    win: (s, D) => [[delayOf(s), s.dur == null ? D : delayOf(s) + s.dur + (s.fade || .2)]]
  };

  /* =====================================================================
     onoma —— 拟声字：描边 + 立体厚度的大字逐字弹出、略倾斜、衰减抖动，停 hold 秒后放大淡出
     spec: text, x,y（中心）, size=150, font='Hannotate SC', color='#FFE15A', stroke='#1E1C18', strokeW=12,
           depth=7（立体厚度 px）, rot=-8, delay, stagger=.06, hold=.9, exit=.25, shake:{amp:6,freq:13,decay:.22}
     ===================================================================== */
  CH.onoma = FX.types.onoma = {
    build(s) {
      const R = rng(seedOf(s)), chars = [...String(s.text || '')], sw = s.strokeW == null ? 12 : s.strokeW, dp = s.depth == null ? 7 : s.depth;
      const st = s.stroke || '#1E1C18';
      let sh = []; for (let i = 1; i <= dp; i++) sh.push(`${i}px ${i}px 0 ${st}`);
      const body = chars.map(ch => {
        const r = (R() - .5) * 10, dy = (R() - .5) * .12;
        return `<span class="on-ch" style="--r:${f2(r)}deg;--dy:${f2(dy)}em"><span class="on-b" style="-webkit-text-stroke:${sw * 2}px ${st};text-shadow:${sh.join(',')}">${esc(ch)}</span><span class="on-f" style="color:${s.color || '#FFE15A'}">${esc(ch)}</span></span>`;
      }).join('');
      return `<div class="fx-in fx-ono" style="font-size:${s.size || 150}px;font-family:${s.font ? `'${s.font}',` : ''}var(--f-hand)">${body}</div>`;
    },
    update(n, s, p, tau, c) {
      const lt = c.lt, t = lt - delayOf(s), chs = n.querySelectorAll('.on-ch'), st = s.stagger == null ? .06 : s.stagger;
      const hold = s.hold == null ? .9 : s.hold, ex = s.exit == null ? .25 : s.exit, endIn = (chs.length - 1) * st + .3;
      const xq = prog(t, endIn + hold, ex);
      chs.forEach((ch, i) => {
        const q = prog(t, i * st, .3), sc = q <= 0 ? 0 : lerp(.4, 1, eOutBack(q, 2.4));
        ch.style.transform = `translateY(var(--dy)) rotate(var(--r)) scale(${(sc * (1 + xq * .12)).toFixed(4)})`;
        ch.style.opacity = q <= 0 ? 0 : 1;
      });
      const sk = s.shake || {}, A = sk.amp == null ? 6 : sk.amp, fq = sk.freq || 13, dc = sk.decay || .22;
      const jx = t > 0 ? A * Math.sin(2 * Math.PI * fq * t) * Math.exp(-t / dc) : 0, jy = t > 0 ? A * .6 * Math.cos(2 * Math.PI * fq * t * 1.3) * Math.exp(-t / dc) : 0;
      const inn = n.firstChild;
      inn.style.transform = `translate(-50%,-50%) translate(${f2(jx)}px,${f2(jy)}px) rotate(${s.rot == null ? -8 : s.rot}deg)`;
      inn.style.opacity = f2(1 - xq);
      n.style.left = s.x + 'px'; n.style.top = s.y + 'px'; n.style.width = '0px'; n.style.height = '0px';
    },
    win: s => { const n = [...String(s.text || '')].length, st = s.stagger == null ? .06 : s.stagger; return [[delayOf(s), delayOf(s) + (n - 1) * st + .3 + (s.hold == null ? .9 : s.hold) + (s.exit == null ? .25 : s.exit)]]; }
  };

  /* =====================================================================
     particles —— 极淡纸屑 / 光点 / 彩纸（可选环境层），canvas 每帧按闭式公式重画，持续运动
     spec: kind:'dust'|'sparkle'|'confetti', n=60, x,y,w,h, alpha=.22, color, speed=1, size=1, delay
     ===================================================================== */
  CH.particles = FX.types.particles = {
    build(s) { return `<canvas class="fx-ptc" width="${s.w || 1920}" height="${s.h || 1008}"></canvas>`; },
    update(n, s, p, tau, c) {
      const lt = c.lt, t = Math.max(0, lt - delayOf(s)), cv = n.firstChild, g = cv.getContext('2d'), W = cv.width, H = cv.height;
      g.clearRect(0, 0, W, H);
      const R = rng(seedOf(s)), N = s.n || 60, kind = s.kind || 'dust', A = (s.alpha == null ? .22 : s.alpha) * clamp(t / .5, 0, 1), sp = s.speed || 1, sz = s.size || 1;
      const pal = s.colors || ['#ad4d38', '#dec777', '#326c59', '#f4efe2'];
      for (let i = 0; i < N; i++) {
        const x0 = R() * W, y0 = R() * H, vx = (R() - .3) * 14 * sp, vy = (kind === 'confetti' ? 40 + R() * 50 : -6 - R() * 12) * sp, ph = R() * 6.28, om = .6 + R() * 1.8, r = (kind === 'sparkle' ? 2 + R() * 3 : 1 + R() * 2.2) * sz, ci = Math.floor(R() * pal.length);
        let x = x0 + vx * t + Math.sin(om * t + ph) * 10, y = y0 + vy * t;
        x = ((x % W) + W) % W; y = ((y % H) + H) % H;
        if (kind === 'dust') { g.globalAlpha = A * (.5 + .5 * Math.sin(om * t * .7 + ph)); g.fillStyle = s.color || '#6b5f4c'; g.beginPath(); g.ellipse(x, y, r * 1.6, r * .6, ph + t * .2, 0, 6.283); g.fill(); }
        else if (kind === 'sparkle') { const tw = Math.pow(Math.max(0, Math.sin(om * 2 * t + ph)), 6); g.globalAlpha = A * tw; g.fillStyle = s.color || '#fff6d8';
          g.beginPath(); g.moveTo(x, y - r * 3); g.lineTo(x + r * .6, y); g.lineTo(x, y + r * 3); g.lineTo(x - r * .6, y); g.closePath(); g.fill();
          g.beginPath(); g.moveTo(x - r * 3, y); g.lineTo(x, y + r * .6); g.lineTo(x + r * 3, y); g.lineTo(x, y - r * .6); g.closePath(); g.fill(); }
        else { g.globalAlpha = A; g.fillStyle = pal[ci]; g.save(); g.translate(x, y); g.rotate(ph + om * t * 2); g.scale(1, Math.cos(om * t * 3 + ph)); g.fillRect(-r * 2.2, -r * 1.3, r * 4.4, r * 2.6); g.restore(); }
      }
      g.globalAlpha = 1;
    },
    win: (s, D) => [[delayOf(s), D]]
  };

  /* =====================================================================
     maphl —— 地图逐区高亮：多边形从左擦入填色（可斜线网点）+ 虚线框 + 小标签弹出
     spec: regions:[{pts:[[x,y]…], delay(或 at), dur=.5, fill='#ad4d38', fillAlpha=.26, stroke, dash=true, hatch=false,
                    label, lx, ly, labelAt}], ref（可选：pts 用该原图像素，自动换算），x/y/w/h 默认整幅
     ===================================================================== */
  CH.maphl = FX.types.maphl = {
    build(s) {
      const id = 'mh' + (hashStr(s.id) % 1e7);
      let h = `<svg class="fx-map" width="1920" height="1008"><defs><pattern id="${id}h" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3.2" height="10" fill="#ad4d38" fill-opacity=".55"/></pattern></defs>`;
      (s.regions || []).forEach((r, i) => {
        h += `<clipPath id="${id}c${i}"><rect class="mh-clip" x="0" y="0" width="0" height="1008"/></clipPath>` +
          `<g clip-path="url(#${id}c${i})"><path class="mh-fill" fill="${r.fill || '#ad4d38'}" fill-opacity="${r.fillAlpha == null ? .26 : r.fillAlpha}"/>` +
          (r.hatch ? `<path class="mh-hatch" fill="url(#${id}h)"/>` : '') +
          `<path class="mh-line" fill="none" stroke="${r.stroke || r.fill || '#ad4d38'}" stroke-width="${r.width || 4}" ${r.dash === false ? '' : 'stroke-dasharray="14 9"'} stroke-linejoin="round"/></g>`;
      });
      h += `</svg>`;
      (s.regions || []).forEach(r => { if (r.label) h += `<div class="mh-label" style="--c:${r.stroke || r.fill || '#ad4d38'}">${rich(r.label)}</div>`; });
      return h;
    },
    update(n, s, p, tau, c) {
      const lt = c.lt; n.style.left = '0px'; n.style.top = '0px'; n.style.width = '1920px'; n.style.height = '1008px';
      const ref = s.ref && FX.specs[s.ref], fills = n.querySelectorAll('.mh-fill'), lines = n.querySelectorAll('.mh-line'), clips = n.querySelectorAll('.mh-clip');
      const hatches = n.querySelectorAll('.mh-hatch'), labels = n.querySelectorAll('.mh-label');
      let hi = 0, li = 0;
      (s.regions || []).forEach((r, i) => {
        const P = r.pts.map(pt => ref ? FX.map(ref, lt, pt) : pt), d = 'M' + P.map(q => `${f2(q[0])},${f2(q[1])}`).join('L') + 'Z';
        const xs = P.map(q => q[0]), x0 = Math.min(...xs) - 10, x1 = Math.max(...xs) + 10;
        const at = r.at != null ? r.at : (r.delay != null ? r.delay : delayOf(s)), q = eOutCubic(prog(lt, at, r.dur || .5));
        fills[i].setAttribute('d', d); lines[i].setAttribute('d', d);
        if (r.hatch) hatches[hi++].setAttribute('d', d);
        clips[i].setAttribute('x', f2(x0)); clips[i].setAttribute('width', f2((x1 - x0) * q));
        if (r.label) {
          const lb = labels[li++], la = r.labelAt == null ? at + (r.dur || .5) : r.labelAt, lq = prog(lt, la, .3);
          const lx = r.lx == null ? (Math.min(...xs) + Math.max(...xs)) / 2 : r.lx, ly = r.ly == null ? Math.min(...P.map(q => q[1])) - 30 : r.ly;
          lb.style.left = f2(lx) + 'px'; lb.style.top = f2(ly) + 'px'; lb.style.opacity = f2(clamp(lq * 3, 0, 1));
          lb.style.transform = `translate(-50%,-50%) scale(${lerp(.7, 1, eOutBack(lq, 1.8)).toFixed(4)})`;
        }
      });
    },
    win: s => (s.regions || []).flatMap(r => { const at = r.at != null ? r.at : (r.delay != null ? r.delay : delayOf(s));
      return [[at, at + (r.dur || .5)]].concat(r.label ? [[r.labelAt == null ? at + (r.dur || .5) : r.labelAt, (r.labelAt == null ? at + (r.dur || .5) : r.labelAt) + .35]] : []); }).concat(refWins(s))
  };

  /* =====================================================================
     arrow —— 手绘箭头：沿折线/曲线描出，末端箭头最后长出
     spec: pts:[[x,y],…]（画布像素，至少 2 点）, delay, dur=.5, color='#ad4d38', width=6, head=24, wobble=2.5, seed, dash=false
     ===================================================================== */
  CH.arrow = FX.types.arrow = {
    build(s) {
      const R = rng(seedOf(s)), pts = s.pts, sm = [];
      const N = 28, P = pts.map(p => p.slice());
      for (let i = 0; i < P.length - 1; i++) {
        const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
        for (let k = 0; k < N; k++) { const u = k / N, u2 = u * u, u3 = u2 * u;
          const f = (a, b, c2, d2) => .5 * ((2 * b) + (-a + c2) * u + (2 * a - 5 * b + 4 * c2 - d2) * u2 + (-a + 3 * b - 3 * c2 + d2) * u3);
          sm.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]); }
      }
      sm.push(P[P.length - 1]);
      const wb = s.wobble == null ? 2.5 : s.wobble, ph = R() * 6;
      const J = sm.map((q, i) => { const u = i / (sm.length - 1), w = Math.sin(u * Math.PI) * wb * Math.sin(u * 11 + ph); return [q[0] + w, q[1] - w * .6]; });
      const d = 'M' + J.map(q => `${f2(q[0])},${f2(q[1])}`).join('L');
      const e = J[J.length - 1], b = J[Math.max(0, J.length - 5)], ang = Math.atan2(e[1] - b[1], e[0] - b[0]), H = s.head || 24;
      const h1 = [e[0] - H * Math.cos(ang - .45), e[1] - H * Math.sin(ang - .45)], h2 = [e[0] - H * Math.cos(ang + .45), e[1] - H * Math.sin(ang + .45)];
      const col = s.color || '#ad4d38', wd = s.width || 6;
      return `<svg class="fx-arrow" width="1920" height="1008"><path class="ar-body" d="${d}" fill="none" stroke="${col}" stroke-width="${wd}" stroke-linecap="round" stroke-linejoin="round" ${s.dash ? 'stroke-dasharray="16 12"' : ''}/>` +
        `<path class="ar-head" d="M${f2(h1[0])},${f2(h1[1])}L${f2(e[0])},${f2(e[1])}L${f2(h2[0])},${f2(h2[1])}" fill="none" stroke="${col}" stroke-width="${wd}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    },
    update(n, s, p, tau, c) {
      const lt = c.lt; n.style.left = '0px'; n.style.top = '0px'; n.style.width = '1920px'; n.style.height = '1008px';
      const body = n.querySelector('.ar-body'), head = n.querySelector('.ar-head');
      if (!n._len) { n._len = body.getTotalLength(); n._hl = head.getTotalLength(); }
      const q = eOutCubic(prog(lt, delayOf(s), s.dur || .5)), hq = prog(lt, delayOf(s) + (s.dur || .5) * .8, .18);
      if (s.dash) {                                   // 虚线箭头：用裁切从左往右露出（虚线本身不能再用 dashoffset 描）
        const xs = s.pts.map(q2 => q2[0]), x0 = Math.min(...xs) - 30, x1 = Math.max(...xs) + 30;
        body.style.clipPath = `inset(0 ${f2(1920 - (x0 + (x1 - x0) * q))}px 0 0)`; }
      else { body.style.strokeDasharray = f2(n._len + 1); body.style.strokeDashoffset = f2((n._len + 1) * (1 - q)); }
      head.style.strokeDasharray = f2(n._hl + 1); head.style.strokeDashoffset = f2((n._hl + 1) * (1 - hq));
      body.style.visibility = q > 0 ? '' : 'hidden'; head.style.visibility = hq > 0 ? '' : 'hidden';
    },
    win: s => [[delayOf(s), delayOf(s) + (s.dur || .5) + .2]]
  };

  /* =====================================================================
     quotecard —— 金句打字卡：卡片落下后逐字出现（可分段卡在旁白念到的时刻）
     spec: x,y,w, text 或 segs:[{text, at}], ja（原文小字，可选）, who（出处行）, delay（卡出现）, cps=9（每秒字数）,
           size=56, style:'paper'|'dark'|'note', tape=true, rot=-1, align='left', enter='drop'
     ===================================================================== */
  function qcSegs(s) { return s.segs || [{ text: s.text || '', at: (s.typeAt == null ? delayOf(s) + .35 : s.typeAt) }]; }
  // 打字卡逐字拆分，支持 **红字** ==荧光== 和 \n 换行（标记本身不算字）
  function qcChars(text) {
    const out = []; let red = false, hl = false; const a = [...String(text)];
    for (let i = 0; i < a.length; i++) {
      if (a[i] === '*' && a[i + 1] === '*') { red = !red; i++; continue; }
      if (a[i] === '=' && a[i + 1] === '=') { hl = !hl; i++; continue; }
      out.push({ ch: a[i], red, hl });
    }
    return out;
  }
  const qcLen = text => qcChars(text).filter(c => c.ch !== '\n').length;
  CH.quotecard = FX.types.quotecard = {
    build(s) {
      let k = 0; const segs = qcSegs(s).map(sg => qcChars(sg.text).map(c => c.ch === '\n' ? '<br>' : `<span class="qc-c${c.red ? ' red' : ''}${c.hl ? ' hl' : ''}" data-k="${k++}">${esc(c.ch)}</span>`).join('')).join('');
      return `<div class="fx-in fx-qc st-${s.style || 'paper'}${s.over ? ' qc-over' : ''}" style="text-align:${s.align || 'left'}"><div class="qc-shadow"></div><div class="qc-paper">` +
        (s.ja ? `<div class="qc-ja">${rich(s.ja)}</div>` : '') + `<div class="qc-text" style="font-size:${s.size || 56}px">${segs}<i class="qc-caret"></i></div>` +
        (s.who ? `<div class="qc-who">${rich(s.who)}</div>` : '') + `</div>${s.tape === false ? '' : tapeHTML(seedOf(s), 'top')}</div>`;
    },
    update(n, s, p, tau, c) {
      const lt = c.lt, en = enterOf({ ...s, enterDur: s.enterDur || .45 }, lt, 'drop'), inn = n.firstChild;
      inn.style.transform = en.tr; inn.style.opacity = en.op;
      const cps = s.cps || 9, cs = n.querySelectorAll('.qc-c');
      let k = 0, lastOn = -1, typing = false;
      qcSegs(s).forEach(sg => {
        const L = qcLen(sg.text);
        for (let i = 0; i < L; i++, k++) {
          const on = lt >= (sg.times ? sg.times[i] : sg.at + i / (sg.cps || cps));
          if (cs[k]) { cs[k].style.opacity = on ? 1 : (s.over ? .20 : 0); if (on) lastOn = k; }
        }
        if (lt >= sg.at && lt < (sg.times ? sg.times[L - 1] : sg.at + L / (sg.cps || cps)) + .05) typing = true;
      });
      const caret = n.querySelector('.qc-caret');
      caret.style.opacity = typing ? 1 : 0;
      if (lastOn >= 0 && cs[lastOn]) { if (caret.previousSibling !== cs[lastOn]) cs[lastOn].after(caret); }
      else if (cs[0] && caret.nextSibling !== cs[0]) cs[0].before(caret);
    },
    win: s => { const segs = qcSegs(s); return [[delayOf(s), delayOf(s) + (s.enterDur || .45)]].concat(segs.map(sg => [sg.at, (sg.times ? sg.times[sg.times.length - 1] : sg.at + qcLen(sg.text) / (sg.cps || s.cps || 9)) + .1])); }
  };


  // 章卡沿用 note2 的纸色、绿边、投影；章名在便签落定后淡入。
  CH.chaptercard = FX.types.chaptercard = {
    build(s) {
      const slot = (s.w - 30) / s.keywords.length;
      return `<div class="cc-paper"><div class="cc-kicker">第 ${esc(s.no)} 章</div><div class="cc-name">${esc(s.name)}</div>` +
        s.keywords.map((word, i) => `<div class="el note2 cc-note" style="left:${i * slot + 12}px;top:260px;width:${slot - 30}px;height:168px;font-size:${Math.min(50, (slot - 100) / [...word].length)}px">${esc(word)}</div>`).join('') + `</div>`;
    },
    update(n, s, p, tau, c) {
      const lt = c.lt;
      n.querySelectorAll('.cc-note').forEach((card, i) => {
        const en = enterOf({delay:delayOf(s) + i * s.stagger, enterDur:.45, dropY:-80, dropRot:i % 2 ? 3 : -3}, lt);
        card.style.transform = `${en.tr} rotate(${i % 2 ? .7 : -.7}deg)`;
        card.style.opacity = en.op;
      });
      n.querySelector('.cc-name').style.opacity = eOutCubic(prog(lt, s.titleAt, .3));
    },
    win:s => s.keywords.map((_,i) => [delayOf(s) + i*s.stagger, delayOf(s) + i*s.stagger + .45]).concat([[s.titleAt,s.titleAt+.3]])
  };

  function rwLayout(s) {
    const cols = s.count <= 24 ? 6 : 8, rows = Math.ceil(s.count / cols), sw = (s.w - 32) / cols, sh = 470 / rows;
    const cw = Math.min(sw - 16, (sh - 18 - 12) * 1920 / 1008 + 12), ch = (cw - 12) * 1008 / 1920 + 12;
    return Array.from({length:s.count}, (_,i) => ({x:16 + (i % cols)*sw + (sw-cw)/2, y:16 + Math.floor(i/cols)*sh, w:cw, h:ch}));
  }
  CH.recapwall = FX.types.recapwall = {
    build(s) {
      const boxes = rwLayout(s);
      const cards = boxes.map((b,i) => `<div class="rw-card" style="left:${f2(b.x)}px;top:${f2(b.y)}px;width:${f2(b.w)}px;height:${f2(b.h)}px;transform:rotate(${i%3-1}deg)"><img src="${esc(s.images[i%s.images.length])}" alt="">${tapeHTML(seedOf(s)+i,'top',58,18)}</div>`).join('');
      const lines = s.focus.map((f,j) => {
        const b=boxes[f.tile], x=b.x+b.w/2, y=b.y+b.h;
        const R=rng(seedOf(s)+j*29), x1=x-15, y1=y+45, x2=s.w/2+(j-2)*50, xe=s.w/2+(j-2)*55;
        let d=`M${f2(x)},${f2(y)}`;
        for(let k=1;k<=36;k++) { const t=k/36,u=1-t;
          const px=u*u*u*x+3*u*u*t*x1+3*u*t*t*x2+t*t*t*xe, py=u*u*u*y+3*u*u*t*y1+3*u*t*t*450+t*t*t*535;
          d+=` L${f2(px+Math.sin(t*18+j)*1.8*Math.sin(Math.PI*t))},${f2(py+(R()-.5)*2.2*Math.sin(Math.PI*t))}`;
        }
        return `<path class="rw-line" d="${d}"/>`;
      }).join('');
      return `<div class="rw-clip"><div class="rw-camera">${cards}<svg width="${s.w}" height="550">${lines}</svg></div></div><div class="rw-conclusion" style="font-size:${Math.min(42,(s.w*.6-60)/qcLen(s.conclusion))}px">${rich(s.conclusion)}</div>`;
    },
    update(n,s,p,tau,c) {
      const lt=c.lt, z=lerp(s.zoom,1,eInOut(prog(lt,delayOf(s),s.zoomDur)));
      n.querySelector('.rw-camera').style.transform=`scale(${z.toFixed(5)})`;
      const active=s.focus.filter(f=>lt>=f.at), fade=active.length ? eInOut(prog(lt,s.focus[0].at,.25)) : 0;
      n.querySelectorAll('.rw-card').forEach((card,i)=>{
        const f=active.find(f=>f.tile===i), q=f ? eInOut(prog(lt,f.at,.25)) : 0;
        card.style.filter=`brightness(${lerp(1,.30,fade)*(1-q)+q})`;
        card.style.outlineColor=f ? `rgba(176,58,51,${q.toFixed(4)})` : 'transparent';
        card.style.zIndex=f ? '2' : '1';
      });
      n.querySelectorAll('.rw-line').forEach((path,j)=>{
        const L=path.getTotalLength(), q=eOutCubic(prog(lt,s.focus[j].at+.25,s.lineDur));
        path.style.strokeDasharray=f2(L+2);path.style.strokeDashoffset=f2((L+2)*(1-q));path.style.opacity=q>0 ? '1':'0';
      });
      const finalAt=s.focus[s.focus.length-1].at+.25+s.lineDur;
      n.querySelector('.rw-conclusion').style.opacity=eOutCubic(prog(lt,finalAt,.4));
    },
    win:s=>[[delayOf(s),delayOf(s)+s.zoomDur]].concat(s.focus.map(f=>[f.at,f.at+.25+s.lineDur]),[[s.focus[s.focus.length-1].at+.25+s.lineDur,s.focus[s.focus.length-1].at+.65+s.lineDur]])
  };

  /* =====================================================================
     rankboard —— 排行榜：逐行出现（先灰），点名的那行变墨色 + 荧光底 + 其余压淡
     spec: x,y,w, rows:[{rank, name, value, note, at}], rowH=88, delay, stagger=.3, focus:[{at,row}],
           bars=true, max, barColor, hlColor, valueW=230
     ===================================================================== */
  CH.rankboard = FX.types.rankboard = {
    build(s) {
      const rh = s.rowH || 88, mx = s.max || Math.max(...s.rows.map(r => +r.value || 0)) || 1;
      return `<div class="fx-in fx-rank">` + s.rows.map((r, i) =>
        `<div class="rk-row" style="top:${i * rh}px;height:${rh}px"><div class="rk-hl"></div><div class="rk-no">${esc(r.rank == null ? i + 1 : r.rank)}</div>` +
        `<div class="rk-name">${rich(r.name)}${r.note ? `<small>${rich(r.note)}</small>` : ''}</div>` +
        (s.bars === false ? '' : `<div class="rk-bar"><i style="width:${f2(100 * (+r.value || 0) / mx)}%;${s.barColor ? 'background:' + s.barColor : ''}"></i></div>`) +
        `<div class="rk-val" style="width:${s.valueW || 230}px">${esc(r.valueText || r.value)}</div></div>`).join('') + `</div>`;
    },
    update(n, s, p, tau, c) {
      const lt = c.lt, rows = n.querySelectorAll('.rk-row'), st = s.stagger == null ? .3 : s.stagger;
      let fi = -1, fq = 0;
      (s.focus || []).forEach(f => { if (lt >= f.at) { fi = f.row; fq = prog(lt, f.at, .45); } });
      rows.forEach((row, i) => {
        const r = s.rows[i], at = r.at != null ? r.at : delayOf(s) + i * st, q = eOutCubic(prog(lt, at, .4));
        row.style.opacity = f2(q * (fi >= 0 && fi !== i ? lerp(1, .42, fq) : 1));
        row.style.transform = `translateX(${f2((1 - q) * -60)}px)`;
        row.classList.toggle('on', fi === i);
        row.querySelector('.rk-hl').style.transform = `scaleX(${fi === i ? fq.toFixed(4) : 0})`;
        const bar = row.querySelector('.rk-bar i'); if (bar) bar.style.transform = `scaleX(${eOutCubic(prog(lt, at + .1, .6)).toFixed(4)})`;
      });
    },
    win: s => s.rows.map((r, i) => { const at = r.at != null ? r.at : delayOf(s) + i * (s.stagger == null ? .3 : s.stagger); return [at, at + .75]; })
      .concat((s.focus || []).map(f => [f.at, f.at + .5]))
  };

  /* =====================================================================
     timeline —— 时间线：轴线从左描出，节点逐个弹出（年份在下、说明在上），新节点出现时旧节点变灰
     spec: x,y（轴线左端）, w, points:[{label, text, at, pos(0–1，可省=均分), color, side:'up'|'down'}],
           delay（轴线开始画）, axisDur=.6, dimPrev=true, color
     ===================================================================== */
  CH.timeline = FX.types.timeline = {
    build(s) {
      const N = s.points.length;
      const tk = s.ticks ? Array.from({ length: s.ticks + 1 }, (_, k) => { const X = f2(s.w * k / s.ticks); return `<line class="tk" x1="${X}" y1="${k % 5 ? 4 : -2}" x2="${X}" y2="10"/>`; }).join('') : '';
      const PH = s.points.map((pt, i) => pt.photo ? `<div class="tl-ph" data-i="${i}" style="width:${s.photoW}px;height:${s.photoH}px;top:${-s.photoH - s.photoGap}px"><img src="${esc(pt.photo)}">` +
        (pt.photoCap ? `<span>${rich(pt.photoCap)}</span>` : '') + `</div>` : '').join('');
      return `<div class="fx-in fx-tl"><svg width="${s.w}" height="20" class="tl-axis">${tk}<line x1="0" y1="10" x2="${s.w}" y2="10"/><path d="M${s.w - 14},2 L${s.w},10 L${s.w - 14},18"/></svg>` + PH +
        (s.cursor ? `<div class="tl-cur"><i></i></div>` : '') +
        s.points.map((pt, i) => { const u = pt.pos == null ? (N === 1 ? .5 : .06 + .88 * i / (N - 1)) : pt.pos;
          return `<div class="tl-pt ${pt.side === 'down' ? 'down' : 'up'}" style="left:${f2(u * s.w)}px;--c:${pt.color || 'var(--red)'}"><i class="tl-dot"></i><b class="tl-lab">${rich(pt.label)}</b>${pt.text ? `<span class="tl-txt">${rich(pt.text)}</span>` : ''}</div>`; }).join('') + `</div>`;   // .tl-pt 是轴上的零尺寸锚点
    },
    update(n, s, p, tau, c) {
      const lt = c.lt, ax = n.querySelector('.tl-axis'), q = eOutCubic(prog(lt, delayOf(s), s.axisDur || .6));
      ax.style.clipPath = `inset(0 ${f2((1 - q) * 100)}% 0 0)`;
      const pts = n.querySelectorAll('.tl-pt'); let last = -1;
      s.points.forEach((pt, i) => { if (lt >= pt.at) last = i; });
      pts.forEach((el, i) => {
        const pq = prog(lt, s.points[i].at, .35);
        el.style.opacity = f2(clamp(pq * 3, 0, 1) * (s.dimPrev !== false && last > i ? .5 : 1));
        el.style.transform = `scale(${lerp(.6, 1, eOutBack(pq, 2)).toFixed(4)})`;
      });
      // 游标：从上一个点滑到当前点（0.6 秒）；照片卡跟着游标走，换点时旧卡淡出、新卡落下
      const N = s.points.length, U = i => s.points[i].pos == null ? (N === 1 ? .5 : .06 + .88 * i / (N - 1)) : s.points[i].pos;
      let cx = 0;
      if (last >= 0) { const q = eInOut(prog(lt, s.points[last].at, .6)); cx = lerp(last ? U(last - 1) : U(0), U(last), last ? q : 1) * s.w; }
      const cur = n.querySelector('.tl-cur');
      if (cur) { cur.style.opacity = last >= 0 ? f2(clamp(prog(lt, s.points[0].at, .3) * 1, 0, 1)) : 0; cur.style.transform = `translateX(${f2(cx)}px)`; }
      n.querySelectorAll('.tl-ph').forEach(el => {
        const i = +el.dataset.i, nx = s.points.findIndex((p2, j) => j > i && p2.photo && lt >= p2.at);
        const inQ = prog(lt, s.points[i].at, .45), outQ = nx >= 0 ? prog(lt, s.points[nx].at, .3) : 0;
        if (lt < s.points[i].at || outQ >= 1) { set(el, 'display', 'none'); return; }
        set(el, 'display', '');
        const px = clamp(cx - s.photoW / 2, 0, s.w - s.photoW), e = eOutBack(inQ, 1.3);
        el.style.left = f2(px) + 'px';
        el.style.opacity = f2(clamp(inQ * 3, 0, 1) * (1 - outQ));
        el.style.transform = `translateY(${f2(lerp(-50, 0, e) + outQ * 24)}px) rotate(${f2(lerp(-5, i % 2 ? 1.2 : -1.2, e))}deg)`;
      });
    },
    win: s => [[delayOf(s), delayOf(s) + (s.axisDur || .6)]].concat(s.points.map(pt => [pt.at, pt.at + (s.cursor || pt.photo ? .65 : .4)]))
  };

  /* =====================================================================
     以下五个组件 2026-10-11 加（概念长片拆解沉淀）。格子纸风，不是参考片的暗场发光。
     rough.js 一律用 generator()+toPaths()，在 build 里算好 d 烤进 HTML：
     既无 DOM 依赖，又保证逐帧不抖（seed 固定 → 路径固定）。
     ===================================================================== */

  /* 把 rough 图形转成 path 的 d 列表；库缺席时返回 null，调用方自己兜底 */
  const roughD = (fn) => {
    try {
      if (!window.rough || typeof rough.generator !== 'function') return null;
      const g = rough.generator();
      return g.toPaths(fn(g)).map(o => o.d).filter(Boolean);
    } catch (e) { return null; }
  };

  /* =====================================================================
     pill —— 圆角胶囊标签，挂年份 / 增量 / 概率
     spec: text, x, y, tone:'up'|'down'|'warn'|'neutral', size=28, solid, dot=true, delay, dur=.4
     ===================================================================== */
  CH.pill = FX.types.pill = {
    build(s) {
      return `<div class="fx-in fx-pillwrap"><span class="fx-pill tone-${s.tone || 'neutral'}${s.solid ? ' solid' : ''}" ` +
        `style="font-size:${s.size || 28}px">${s.dot === false ? '' : '<i class="pl-dot"></i>'}` +
        `<span class="pl-txt">${rich(s.text)}</span></span></div>`;
    },
    update(n, s, p, tau, c) {
      const d = s.dur || .4, a = delayOf(s), el = n.querySelector('.fx-pill');
      const q = prog(c.lt, a, d);
      el.style.opacity = f2(clamp(q * 2.2, 0, 1));
      el.style.transform = `scale(${lerp(.84, 1, eOutBack(q, 2)).toFixed(4)})`;
    },
    win: s => [[delayOf(s), delayOf(s) + (s.dur || .4)]]
  };

  /* =====================================================================
     linechart —— 趋势折线：线自己画出来，线头一个墨点跟着走，终点数字滚上去
     spec: x,y,w,h, points:[{label,value,text}], delay, dur=2.2, yMax,yMin, curve:'straight'
           peak=true（末点标红）, area=false, cap（左上小标题）, grid=3
     ===================================================================== */
  CH.linechart = FX.types.linechart = {
    build(s) {
      const W = s.w, H = s.h, PL = s.padL == null ? 130 : s.padL, PR = s.padR == null ? 96 : s.padR,
        PT = s.padT == null ? 78 : s.padT, PB = s.padB == null ? 66 : s.padB;
      const pts = s.points, N = pts.length;
      const vals = pts.map(o => +o.value);
      const maxV = s.yMax != null ? +s.yMax : Math.max(...vals) * 1.18;
      const minV = s.yMin != null ? +s.yMin : 0;
      const X = i => PL + (W - PL - PR) * (N > 1 ? i / (N - 1) : .5);
      const Y = v => PT + (H - PT - PB) * (1 - (v - minV) / Math.max(1e-6, maxV - minV));
      const xy = pts.map((o, i) => [X(i), Y(+o.value)]);
      let d;
      if (window.d3 && d3.line) {
        d = d3.line().x(a => a[0]).y(a => a[1])
          .curve(s.curve === 'straight' ? d3.curveLinear : d3.curveMonotoneX)(xy);
      } else {
        d = xy.map((a, i) => (i ? 'L' : 'M') + f2(a[0]) + ',' + f2(a[1])).join('');
      }
      const nTick = s.grid == null ? 3 : s.grid;
      let grid = '';
      for (let k = 0; k <= nTick; k++) {
        const v = minV + (maxV - minV) * k / nTick, yy = Y(v);
        grid += `<line x1="${f2(PL - 16)}" y1="${f2(yy)}" x2="${f2(W - PR + 16)}" y2="${f2(yy)}"/>`;
      }
      // v7b：每个节点在折线上的长度占比（按弦长累加），节点 / 数值按线真正走到的位置出现（原来按序号均分，陡段前面的点会提前冒出来）
      const segL = xy.map((a, i) => i ? Math.hypot(a[0] - xy[i - 1][0], a[1] - xy[i - 1][1]) : 0);
      const totL = segL.reduce((x, y) => x + y, 0) || 1; let acc = 0;
      const fr = segL.map(l => (acc += l) / totL);
      const nodes = xy.map((a, i) =>
        `<circle class="lc-node${s.peak !== false && i === N - 1 ? ' peak' : ''}" data-i="${i}" data-f="${fr[i].toFixed(4)}" ` +
        `cx="${f2(a[0])}" cy="${f2(a[1])}" r="${s.peak !== false && i === N - 1 ? 12 : 9}"/>`).join('');
      const area = s.area ? `<path class="lc-area" d="${d}L${f2(xy[N - 1][0])},${f2(H - PB)}L${f2(xy[0][0])},${f2(H - PB)}Z"/>` : '';
      const ylabs = [];
      for (let k = 0; k <= nTick; k++) {
        const v = minV + (maxV - minV) * k / nTick;
        ylabs.push(`<div class="lc-ylab" style="left:0;width:${f2(PL - 30)}px;top:${f2(Y(v))}px">${esc(s.yFmt ? s.yFmt.replace('{}', Math.round(v)) : Math.round(v))}</div>`);
      }
      return `<div class="fx-in fx-lc">` +
        (s.cap ? `<div class="lc-cap">${esc(s.cap)}</div>` : '') +
        `<svg class="lc-svg" width="${W}" height="${H}"><g class="lc-grid">${grid}</g>${area}` +
        `<line class="lc-base" x1="${f2(PL - 16)}" y1="${f2(H - PB)}" x2="${f2(W - PR + 16)}" y2="${f2(H - PB)}"/>` +
        `<path class="lc-path" d="${d}"/>${nodes}` +
        `<circle class="lc-halo" cx="0" cy="0" r="22"/><circle class="lc-head" cx="0" cy="0" r="11"/></svg>` +
        ylabs.join('') +
        pts.map((o, i) => `<div class="lc-xlab" style="left:${f2(xy[i][0])}px;top:${f2(H - PB + 22)}px">${esc(o.label)}</div>`).join('') +
        pts.map((o, i) => `<div class="lc-val${s.peak !== false && i === N - 1 ? ' peak' : ''}" data-i="${i}" ` +
          `style="left:${f2(xy[i][0])}px;top:${f2(xy[i][1] - (s.peak !== false && i === N - 1 ? 30 : 24))}px;` +
          `font-size:${s.peak !== false && i === N - 1 ? (s.peakSize || 92) : (s.valSize || 44)}px"></div>`).join('') +
        `</div>`;
    },
    update(n, s, p, tau, c) {
      const lt = c.lt, a = delayOf(s), dur = s.dur || 2.2, N = s.points.length;
      const path = n.querySelector('.lc-path');
      const q = eInOut(prog(lt, a, dur));
      const L = path.getTotalLength ? path.getTotalLength() : 1000;
      path.style.strokeDasharray = f2(L);
      path.style.strokeDashoffset = f2(L * (1 - q));
      // 线头：沿路径走的墨点 + 一圈淡晕
      const head = n.querySelector('.lc-head'), halo = n.querySelector('.lc-halo');
      const on = lt >= a && q < .999;
      if (path.getPointAtLength) {
        const pt = path.getPointAtLength(L * q);
        head.setAttribute('cx', f2(pt.x)); head.setAttribute('cy', f2(pt.y));
        halo.setAttribute('cx', f2(pt.x)); halo.setAttribute('cy', f2(pt.y));
      }
      head.style.opacity = on ? 1 : 0;
      halo.style.opacity = on ? f2(.55 + .35 * Math.sin(lt * 7)) : 0;
      // 节点与数值：线走到了才出现；末点的数字滚上去
      n.querySelectorAll('.lc-node').forEach((el, i) => {
        const at = N > 1 ? Math.max(0, +el.dataset.f - .01) : 0;      // v7b：线走到了节点才出现
        const vq = clamp((q - at) / .03, 0, 1);
        el.style.opacity = f2(vq);
        el.style.transform = `scale(${lerp(.4, 1, eOutBack(vq, 2.4)).toFixed(4)})`;
        el.style.transformOrigin = `${el.getAttribute('cx')}px ${el.getAttribute('cy')}px`;
      });
      n.querySelectorAll('.lc-val').forEach((el, i) => {
        const o = s.points[i], last = i === N - 1;
        const nd = n.querySelector(`.lc-node[data-i="${i}"]`);
        const at = N > 1 ? Math.max(0, +nd.dataset.f - .01) : 0;
        const vq = clamp((q - at) / .05, 0, 1);
        // v7b 修：末点数字不再从「0」滚起（原来线还没到终点就先显示 0、且丢掉负号/单位）。线画到终点后，末点直接以最终文字弹出
        const roll = last ? clamp((lt - (a + dur * .97)) / .35, 0, 1) : 1;
        el.style.opacity = f2(last ? roll : vq);
        const txt = o.text != null ? o.text
          : (s.valFmt ? s.valFmt.replace('{}', Math.round(+o.value)) : String(Math.round(+o.value)));
        el.textContent = txt;
        el.style.transform = `translate(-50%,-100%) scale(${last ? lerp(.8, 1, eOutBack(roll, 2)).toFixed(4) : 1})`;
      });
      const gq = lt >= a - 1e-6 ? (a < .05 ? 1 : clamp(prog(lt, a, .15), 0, 1)) : 0;   // v7b：开头即出现的图表，坐标轴第 0 帧就在                 // v7b：坐标轴、标题立刻出来（原 0.5 秒淡入）
      n.querySelectorAll('.lc-grid,.lc-base,.lc-ylab,.lc-xlab,.lc-cap,.lc-area').forEach(el => el.style.opacity = f2(gq));
    },
    win(s) {
      const a = delayOf(s), d = s.dur || 2.2;
      return [[a, a + d + .6]];
    }
  };

  /* =====================================================================
     forkpaths —— 分叉路径：一个点分出几条曲线通向不同结局，各挂 ❌/✓ 和概率标签
     spec: x,y,w,h, branches:[{text,note,mark:'x'|'v'|null,prob,probTone}], delay, stagger=.5, dur=.8
     ===================================================================== */
  CH.forkpaths = FX.types.forkpaths = {
    build(s) {
      const W = s.w, H = s.h, B = s.branches, n = B.length;
      const ox = s.ox == null ? 70 : s.ox, oy = H / 2;
      const endX = W - (s.endPad == null ? 440 : s.endPad);
      const ys = B.map((b, i) => b.y != null ? +b.y : (n === 1 ? oy : 60 + (H - 120) * i / (n - 1)));
      const sd = seedOf(s);
      let lines = '', marks = '';
      B.forEach((b, i) => {
        const y2 = ys[i];
        const d = `M${f2(ox)},${f2(oy)} C${f2(ox + (endX - ox) * .45)},${f2(oy)} ${f2(ox + (endX - ox) * .55)},${f2(y2)} ${f2(endX)},${f2(y2)}`;
        lines += `<path class="fk-line" data-i="${i}" d="${d}"/>`;
        if (b.mark) {
          const r = 26, cx = endX + 42, cy = y2;
          const col = b.mark === 'v' ? 'var(--green)' : 'var(--red)';
          let ds = null;
          if (b.mark === 'x') {
            const p1 = roughD(g => g.line(cx - r, cy - r, cx + r, cy + r, { seed: sd + i * 7 + 1, roughness: 1.7, strokeWidth: 7 }));
            const p2 = roughD(g => g.line(cx + r, cy - r, cx - r, cy + r, { seed: sd + i * 7 + 2, roughness: 1.7, strokeWidth: 7 }));
            ds = [...(p1 || []), ...(p2 || [])];
            if (!ds.length) ds = [`M${cx - r},${cy - r}L${cx + r},${cy + r}`, `M${cx + r},${cy - r}L${cx - r},${cy + r}`];
          } else {
            const p1 = roughD(g => g.linearPath([[cx - r, cy], [cx - r * .25, cy + r * .7], [cx + r, cy - r * .8]],
              { seed: sd + i * 7 + 3, roughness: 1.5, strokeWidth: 7 }));
            ds = p1 || [`M${cx - r},${cy}L${cx - r * .25},${cy + r * .7}L${cx + r},${cy - r * .8}`];
          }
          marks += `<g class="fk-markg" data-i="${i}" style="opacity:0">` +
            ds.map(d2 => `<path d="${d2}" fill="none" stroke="${col}" stroke-width="7" stroke-linecap="round"/>`).join('') + `</g>`;
        }
      });
      return `<div class="fx-in fx-fk"><svg class="fk-svg" width="${W}" height="${H}">` +
        `<circle class="fk-origin" cx="${f2(ox)}" cy="${f2(oy)}" r="13"/>${lines}${marks}</svg>` +
        B.map((b, i) => `<div class="fk-end${b.mark === 'x' ? ' bad' : ''}" data-i="${i}" ` +
          `style="left:${f2(endX + 86)}px;top:${f2(ys[i])}px"><b>${rich(b.text)}</b>` +
          (b.note ? `<small>${rich(b.note)}</small>` : '') + `</div>`).join('') +
        B.map((b, i) => b.prob ? `<div class="fk-prob" data-i="${i}" ` +
          `style="left:${f2(ox + (endX - ox) * .62)}px;top:${f2((oy + ys[i]) / 2 - 6)}px">` +
          `<span class="fx-pill tone-${b.probTone || 'neutral'}" style="font-size:24px">` +
          `<i class="pl-dot"></i><span class="pl-txt">${esc(b.prob)}</span></span></div>` : '').join('') +
        `</div>`;
    },
    update(n, s, p, tau, c) {
      const lt = c.lt, a = delayOf(s), st = s.stagger == null ? .5 : s.stagger, dur = s.dur || .8;
      n.querySelector('.fk-origin').style.opacity = f2(clamp(prog(lt, a, .3) * 2, 0, 1));
      n.querySelectorAll('.fk-line').forEach((el, i) => {
        const at = a + .25 + i * st, q = eOutCubic(prog(lt, at, dur));
        const L = el.getTotalLength ? el.getTotalLength() : 900;
        el.style.strokeDasharray = f2(L);
        el.style.strokeDashoffset = f2(L * (1 - q));
        el.style.opacity = lt >= at ? .78 : 0;
      });
      n.querySelectorAll('.fk-end').forEach((el, i) => {
        const q = prog(lt, a + .25 + i * st + dur * .75, .4);
        el.style.opacity = f2(clamp(q * 2, 0, 1));
        el.style.transform = `translateY(-50%) translateX(${f2((1 - eOutCubic(q)) * 26)}px)`;
      });
      n.querySelectorAll('.fk-markg').forEach(el => {
        const i = +el.dataset.i, at = a + .25 + i * st + dur * .9, q = prog(lt, at, .32);
        el.style.opacity = f2(clamp(q * 2, 0, 1));
      });
      n.querySelectorAll('.fk-prob').forEach(el => {
        const i = +el.dataset.i, at = a + .25 + i * st + dur * .55, q = prog(lt, at, .35);
        const pill = el.querySelector('.fx-pill');
        el.style.opacity = f2(clamp(q * 2, 0, 1));
        pill.style.transform = `scale(${lerp(.84, 1, eOutBack(q, 2)).toFixed(4)})`;
      });
    },
    win(s) {
      const a = delayOf(s), st = s.stagger == null ? .5 : s.stagger, d = s.dur || .8;
      return s.branches.map((b, i) => [a + .25 + i * st, a + .25 + i * st + d + .5]);
    }
  };

  /* =====================================================================
     branchmap —— 一个主体向下发散到 N 个子项，逐条点亮
     spec: x,y,w,h, head:{text,sub}, items:[{text,note}], delay, stagger=.35, dur=.5, headSize=104
     ===================================================================== */
  CH.branchmap = FX.types.branchmap = {
    build(s) {
      const W = s.w, H = s.h, items = s.items, n = items.length;
      const hy = s.hy == null ? 150 : s.hy;          // 主体底部 y
      const iy = s.iy == null ? H - 72 : s.iy;       // 子项 y
      const midY = (hy + iy) / 2;
      const xs = items.map((_, i) => (W / n) * (i + .5));
      let g = `<path class="bm-line" d="M${f2(W / 2)},${f2(hy)} L${f2(W / 2)},${f2(midY)}" data-i="-1"/>`;
      items.forEach((it, i) => {
        g += `<path class="bm-line" data-i="${i}" d="M${f2(W / 2)},${f2(midY)} C${f2(W / 2)},${f2(midY + 34)} ${f2(xs[i])},${f2(midY + 10)} ${f2(xs[i])},${f2(iy - 54)}"/>` +
          `<circle class="bm-dot" data-i="${i}" cx="${f2(xs[i])}" cy="${f2(iy - 54)}" r="8"/>`;
      });
      return `<div class="fx-in fx-bm">` +
        `<div class="bm-head" style="top:0"><b style="font-size:${s.headSize || 104}px">${rich(s.head.text)}</b>` +
        (s.head.sub ? `<small>${rich(s.head.sub)}</small>` : '') + `</div>` +
        `<svg class="bm-svg" width="${W}" height="${H}">${g}</svg>` +
        items.map((it, i) => `<div class="bm-item" data-i="${i}" style="left:${f2(xs[i])}px;top:${f2(iy - 36)}px">` +
          `<b>${rich(it.text)}</b>${it.note ? `<small>${rich(it.note)}</small>` : ''}</div>`).join('') +
        `</div>`;
    },
    update(n, s, p, tau, c) {
      const lt = c.lt, a = delayOf(s), st = s.stagger == null ? .35 : s.stagger, dur = s.dur || .5;
      const hq = prog(lt, a, .45);
      const head = n.querySelector('.bm-head');
      head.style.opacity = f2(clamp(hq * 2, 0, 1));
      head.style.transform = `translateY(${f2((1 - eOutCubic(hq)) * -18)}px)`;
      const trunk = n.querySelector('.bm-line[data-i="-1"]');
      const tq = eOutCubic(prog(lt, a + .3, .4));
      const TL = trunk.getTotalLength ? trunk.getTotalLength() : 100;
      trunk.style.strokeDasharray = f2(TL); trunk.style.strokeDashoffset = f2(TL * (1 - tq));
      n.querySelectorAll('.bm-line').forEach(el => {
        const i = +el.dataset.i; if (i < 0) return;
        const at = a + .6 + i * st, q = eOutCubic(prog(lt, at, dur));
        const L = el.getTotalLength ? el.getTotalLength() : 200;
        el.style.strokeDasharray = f2(L); el.style.strokeDashoffset = f2(L * (1 - q));
        el.style.opacity = lt >= at ? .5 : 0;
      });
      n.querySelectorAll('.bm-dot').forEach(el => {
        const i = +el.dataset.i, q = prog(lt, a + .6 + i * st + dur * .8, .25);
        el.style.opacity = f2(clamp(q * 2, 0, 1));
      });
      n.querySelectorAll('.bm-item').forEach(el => {
        const i = +el.dataset.i, q = prog(lt, a + .6 + i * st + dur * .8, .35);
        el.style.opacity = f2(clamp(q * 2, 0, 1));
        el.style.transform = `translateX(-50%) translateY(${f2((1 - eOutCubic(q)) * 14)}px)`;
      });
    },
    win(s) {
      const a = delayOf(s), st = s.stagger == null ? .35 : s.stagger, d = s.dur || .5;
      return [[a, a + .75]].concat(s.items.map((_, i) => [a + .6 + i * st, a + .6 + i * st + d + .35]));
    }
  };

  /* =====================================================================
     iconrow —— 一排图标 + 标签，逐个「点亮」（先压淡，再升到满 + 变红），不是淡入
     spec: x,y,w,h, items:[{icon,text,at}], delay, stagger=.6, dim=.26, hot=true
     ===================================================================== */
  CH.iconrow = FX.types.iconrow = {
    build(s) {
      const n = s.items.length, cw = s.w / n;
      return `<div class="fx-in fx-ir${s.mono ? ' mono' : ''}" style="height:${s.h || 200}px">` +
        s.items.map((it, i) => `<div class="ir-cell" data-i="${i}" style="width:${f2(cw)}px">` +
          (it.icon ? (String(it.icon).startsWith('ai:') ? `<div class="ir-ico ir-svg" style="--ic:${s.iconSize || 72}px">${FX.iconSVG(it.icon.slice(3), 7 + i, true, 6)}</div>`
            : `<div class="ir-ico" style="font-size:${s.iconSize || 72}px">${esc(it.icon)}</div>`) : '') +
          `<div class="ir-txt" style="font-size:${s.textSize || 40}px">${rich(it.text)}</div></div>`).join('') +
        `</div>`;
    },
    update(n, s, p, tau, c) {
      const lt = c.lt, a = delayOf(s), st = s.stagger == null ? .6 : s.stagger, dim = s.dim == null ? .26 : s.dim;
      // 第一步：整排先以压淡状态出现；第二步：逐个点亮
      const showQ = clamp(prog(lt, a, .5), 0, 1);
      n.querySelectorAll('.ir-cell').forEach((el, i) => {
        const it = s.items[i], at = it.at != null ? it.at : a + .5 + i * st;
        const q = eOutCubic(prog(lt, at, .35));
        el.style.opacity = f2(showQ * lerp(dim, 1, q));
        el.style.transform = `translateY(${f2((1 - showQ) * 16 - q * 6)}px) scale(${lerp(1, 1.04, q).toFixed(4)})`;
        el.classList.toggle('hot', s.hot !== false && q > .5);
      });
    },
    win(s) {
      const a = delayOf(s), st = s.stagger == null ? .6 : s.stagger;
      return [[a, a + .5]].concat(s.items.map((it, i) => {
        const at = it.at != null ? it.at : a + .5 + i * st; return [at, at + .4];
      }));
    }
  };

  /* ---------------- AI 片组件（2026-10-23）共用：逐字 span，未到时刻 display:none（行和气泡跟着长） ---------------- */
  const chSpans = (text, cls = 'tc') => qcChars(text).map(c => c.ch === '\n' ? `<br class="${cls}">` :
    `<span class="${cls}${c.red ? ' red' : ''}${c.hl ? ' hl' : ''}">${esc(c.ch)}</span>`).join('');
  function typeShow(nodes, n) {                               // 前 n 个逐字节点显示，其余隐藏
    nodes.forEach((el, k) => set(el, 'display', k < n ? '' : 'none'));
  }
  const nTyped = (lt, a, cps, L) => lt < a ? 0 : Math.min(L, Math.floor((lt - a) * cps) + 1);

  /* =====================================================================
     chatui —— 仿真聊天界面：1–3 个窗口并排；用户消息在输入框逐字打出再发送，AI 先「思考」三点再逐字吐字
     spec: x,y,w,h, delay, gap, enter, badge, windows:[{name, sub, accent, hello, msgs:[
             {role:'user'|'ai'|'sys', text, file, style:'error'|'ok', typeAt, sendAt, cps   (user)
                                                                 showAt, textAt, cps   (ai/sys)}]}]
     时刻都由 v6lib 算好放进 spec（镜头内秒数）
     ===================================================================== */
  const chFile = f => f ? `<div class="ch-file"><i class="ch-fico"></i><span>${esc(f)}</span></div>` : '';
  CH.chatui = FX.types.chatui = {
    build(s) {
      const n = s.windows.length, gap = s.gap == null ? 28 : s.gap, ww = (s.w - gap * (n - 1)) / n;
      return `<div class="fx-chat">` + s.windows.map((W, wi) =>
        `<div class="ch-win" style="left:${f2(wi * (ww + gap))}px;width:${f2(ww)}px;height:${s.h}px;--acc:${esc(W.accent || '#B03A33')}">` +
          `<div class="ch-bar"><i></i><i></i><i></i><b class="ch-name">${esc(W.name || '')}</b>${W.sub ? `<small>${esc(W.sub)}</small>` : ''}</div>` +
          `<div class="ch-body"><div class="ch-hello">${rich(W.hello || '')}</div><div class="ch-log">` +
          W.msgs.map((m, mi) => `<div class="ch-msg r-${m.role}${m.style ? ' s-' + m.style : ''}" data-m="${mi}">` +
            (m.role === 'user' ? chFile(m.file) : '') +
            (m.role === 'ai' ? `<div class="ch-dots"><i></i><i></i><i></i></div>` : '') +
            `<div class="ch-txt">${chSpans(m.text, m.role === 'user' ? 'tu' : 'tc')}</div></div>`).join('') +
          `</div></div>` +
          `<div class="ch-input">` + W.msgs.map((m, mi) => m.role !== 'user' ? '' :
            `<div class="ch-draft" data-m="${mi}">${chFile(m.file)}<span class="ch-dtxt">${chSpans(m.text)}<i class="ch-caret"></i></span></div>`).join('') +
          `<span class="ch-ph">${esc(W.placeholder || '发消息……')}</span><b class="ch-send"></b></div>` +
        `</div>`).join('') +
        (s.badge ? `<div class="ch-badge">${esc(s.badge)}</div>` : '') + `</div>`;
    },
    update(n, s, p, tau, c) {
      const lt = c.lt;
      n.querySelectorAll('.ch-win').forEach((win, wi) => {
        const W = s.windows[wi], en = enterOf({ ...s, delay: delayOf(s) + wi * .12, enterDur: s.enterDur || .5, dropRot: 0, dropY: -50 }, lt, s.enter || 'drop');
        win.style.transform = en.tr; win.style.opacity = en.op;
        let any = false, drafting = false;
        win.querySelectorAll('.ch-log .ch-msg').forEach(el => {
          const m = W.msgs[+el.dataset.m], txt = [...el.querySelectorAll('.ch-txt > span, .ch-txt > br')];
          if (m.role === 'user') {
            const on = lt >= m.sendAt; set(el, 'display', on ? '' : 'none'); any = any || on;
            if (on) { const q = eOutBack(prog(lt, m.sendAt, .3), 1.6); el.style.transform = `translateY(${f2((1 - q) * 24)}px) scale(${lerp(.92, 1, q).toFixed(4)})`; el.style.opacity = f2(clamp(q * 3, 0, 1)); }
          } else {
            const on = lt >= m.showAt; set(el, 'display', on ? '' : 'none'); any = any || on;
            if (!on) return;
            const q = eOutCubic(prog(lt, m.showAt, .25)); el.style.opacity = f2(q); el.style.transform = `translateY(${f2((1 - q) * 14)}px)`;
            const dots = el.querySelector('.ch-dots');
            if (dots) { const th = lt < m.textAt; set(dots, 'display', th ? '' : 'none');
              if (th) dots.querySelectorAll('i').forEach((d, k) => { d.style.opacity = f2(.25 + .75 * Math.max(0, Math.sin((lt - m.showAt) * 7 - k * .9))); }); }
            typeShow(txt, nTyped(lt, m.textAt, m.cps, txt.length));
          }
        });
        set(win.querySelector('.ch-hello'), 'display', any ? 'none' : '');
        win.querySelectorAll('.ch-draft').forEach(el => {
          const m = W.msgs[+el.dataset.m], act = lt >= m.typeAt && lt < m.sendAt;
          set(el, 'display', act ? '' : 'none'); if (!act) return; drafting = true;
          const cs = [...el.querySelectorAll('.ch-dtxt > span, .ch-dtxt > br')];
          typeShow(cs, nTyped(lt, m.typeAt + (m.file ? .35 : 0), m.cps, cs.length));
          const fq = eOutBack(prog(lt, m.typeAt, .3), 1.6), fi = el.querySelector('.ch-file');
          if (fi) { fi.style.transform = `scale(${lerp(.7, 1, fq).toFixed(4)})`; fi.style.opacity = f2(clamp(fq * 3, 0, 1)); }
          const sendHot = lt >= m.sendAt - .2; win.querySelector('.ch-send').classList.toggle('hot', sendHot);
        });
        if (!drafting) win.querySelector('.ch-send').classList.remove('hot');
        set(win.querySelector('.ch-ph'), 'display', drafting ? 'none' : '');
      });
      const b = n.querySelector('.ch-badge'); if (b) b.style.opacity = f2(prog(lt, delayOf(s) + .3, .3));
    },
    win(s) {
      const w = [[delayOf(s), delayOf(s) + (s.enterDur || .5) + .12 * s.windows.length + .3]];
      s.windows.forEach(W => W.msgs.forEach(m => w.push(m.role === 'user' ? [m.typeAt, m.sendAt + .35] : [m.showAt, m.textEnd + .1])));
      return w;
    }
  };

  /* =====================================================================
     codecard —— 编辑器卡：标题栏 + 行号，代码逐字打出（语法颜色由 v6lib 预先切好），可高亮某一行
     spec: x,y,w,h, delay, title, lang, lines:[[[text,cls],…],…], lineT:[[start,cps],…], focus:[{line,at,dur}], size, style
     ===================================================================== */
  CH.codecard = FX.types.codecard = {
    build(s) {
      const sz = s.size || 30;
      return `<div class="fx-in fx-code st-${s.style || 'dark'}" style="font-size:${sz}px">` +
        `<div class="cd-bar"><i></i><i></i><i></i><span class="cd-title">${esc(s.title || '')}</span>${s.lang ? `<small>${esc(s.lang)}</small>` : ''}</div>` +
        `<div class="cd-body">` + s.lines.map((ln, li) =>
          `<div class="cd-line" data-l="${li}"><b class="cd-hl"></b><span class="cd-no">${li + 1}</span><span class="cd-src">` +
          ln.map(([t, k]) => [...t].map(ch => `<span class="cd-c k-${k || 'p'}">${ch === ' ' ? '&nbsp;' : esc(ch)}</span>`).join('')).join('') +
          `<i class="cd-caret"></i></span></div>`).join('') + `</div></div>`;
    },
    update(n, s, p, tau, c) {
      const lt = c.lt, en = enterOf({ ...s, enterDur: s.enterDur || .45, dropRot: -2 }, lt, s.enter || 'drop'), inn = n.firstChild;
      inn.style.transform = en.tr; inn.style.opacity = en.op;
      let caretLine = -1;
      n.querySelectorAll('.cd-line').forEach((row, li) => {
        const [a, cps] = s.lineT[li], cs = [...row.querySelectorAll('.cd-c')], L = cs.length;
        const k = cps > 0 ? nTyped(lt, a, cps, L) : (lt >= a ? L : 0);
        typeShow(cs, k);
        set(row.querySelector('.cd-no'), 'opacity', lt >= a ? '1' : '0');
        if (lt >= a && (k < L || li === s.lines.length - 1 || lt < s.lineT[li + 1][0])) caretLine = li;
        const F = (s.focus || []).filter(f => f.line === li + 1);
        let hq = 0; F.forEach(f => { hq = Math.max(hq, eOutCubic(prog(lt, f.at, .35)) * (f.until != null ? 1 - prog(lt, f.until, .3) : 1)); });
        row.querySelector('.cd-hl').style.transform = `scaleX(${f2(hq)})`;
      });
      const typingEnd = s.lineT.length ? s.lineT[s.lineT.length - 1][0] + s.lines[s.lines.length - 1].reduce((a, [t]) => a + [...t].length, 0) / (s.lineT[s.lineT.length - 1][1] || 1e9) : 0;
      n.querySelectorAll('.cd-caret').forEach((cr, li) => set(cr, 'display', li === caretLine && lt < typingEnd + .6 ? '' : 'none'));
    },
    win(s) {
      const w = [[delayOf(s), delayOf(s) + (s.enterDur || .45)]];
      s.lineT.forEach(([a, cps], li) => { const L = s.lines[li].reduce((x, [t]) => x + [...t].length, 0); w.push([a, a + (cps > 0 ? L / cps : 0) + .1]); });
      if (s.lineT.length) { const e = w[w.length - 1][1]; w.push([e, e + .7]); }
      (s.focus || []).forEach(f => { w.push([f.at, f.at + .4]); if (f.until != null) w.push([f.until, f.until + .35]); });
      return w;
    }
  };

  /* =====================================================================
     termcard —— 术语大字：取景角 + 荧光笔一扫 + 字从左往右露出；下一个术语进来时，前面的缩成清单（打勾、变淡）
     spec: x,y,w, delay, items:[{text, sub, at}], size=96, listSize=44, color
     ===================================================================== */
  CH.termcard = FX.types.termcard = {
    build(s) {
      return `<div class="fx-term">` + s.items.map((it, i) =>
        `<div class="tm-row" data-i="${i}"><i class="tm-ck">✓</i><div class="tm-box"><span class="tm-tw"><b class="tm-band"></b>` +
        `<span class="tm-txt">${rich(it.text)}</span></span>${it.sub ? `<small class="tm-sub">${rich(it.sub)}</small>` : ''}` +
        `<i class="tm-cn a"></i><i class="tm-cn b"></i><i class="tm-cn c"></i><i class="tm-cn d"></i></div></div>`).join('') + `</div>`;
    },
    update(n, s, p, tau, c) {
      const lt = c.lt, big = s.size || 96, small = s.listSize || 44, N = s.items.length;
      n.querySelectorAll('.tm-row').forEach((row, i) => {
        const it = s.items[i], a = it.at;
        if (lt < a) { set(row, 'display', 'none'); return; }
        set(row, 'display', '');
        const nx = i + 1 < N ? s.items[i + 1].at : Infinity, dq = eInOut(prog(lt, nx, .45));      // 被下一个挤成清单
        const fs = lerp(big, small, dq);
        row.style.fontSize = f2(fs) + 'px';
        row.style.marginTop = i ? f2(lerp(28, 10, dq)) + 'px' : '0px';
        const wq = eOutCubic(prog(lt, a + .08, .42));                                           // 字从左往右露出
        row.querySelector('.tm-txt').style.clipPath = `inset(-20% ${f2((1 - wq) * 100)}% -20% 0)`;
        const sub = row.querySelector('.tm-sub'); if (sub) { sub.style.opacity = f2(prog(lt, a + .45, .3) * (1 - dq)); set(sub, 'display', dq >= 1 ? 'none' : ''); }
        const bq = prog(lt, a, .32);                                                            // 荧光笔先扫过
        row.querySelector('.tm-band').style.transform = `scaleX(${f2(eOutCubic(bq))})`;
        row.querySelector('.tm-band').style.opacity = f2(1 - dq * .75);
        const cq = eOutBack(prog(lt, a, .35), 1.4);                                             // 取景角收拢
        row.querySelectorAll('.tm-cn').forEach(cn => { cn.style.opacity = f2(clamp(cq * 2, 0, 1) * (1 - dq)); cn.style.setProperty('--k', f2(lerp(14, 0, cq))); });
        row.querySelector('.tm-ck').style.opacity = f2(dq);
        row.querySelector('.tm-ck').style.width = f2(dq * fs * 1.1) + 'px';
        row.style.opacity = f2(lerp(1, .62, dq));
      });
    },
    win(s) {
      const w = [];
      s.items.forEach((it, i) => { w.push([it.at, it.at + .6]); if (i + 1 < s.items.length) w.push([s.items[i + 1].at, s.items[i + 1].at + .5]); });
      return w;
    }
  };

  /* =====================================================================
     AI 线稿图标库（2026-10-23）：100×100 坐标，只描边不填色；每个图标 = 若干笔，aiicon 逐笔画出
     ===================================================================== */
  const iC = (cx, cy, r) => `M${cx - r},${cy}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`;
  const iR = (x, y, w, h, r = 0) => r ? `M${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x + r}Q${x},${y + h} ${x},${y + h - r}V${y + r}Q${x},${y} ${x + r},${y}Z`
    : `M${x},${y}H${x + w}V${y + h}H${x}Z`;
  const iL = (...p) => 'M' + p.reduce((a, v, i) => a + (i % 2 ? ',' : (i ? 'L' : '')) + v, '');
  const ICONS = FX.ICONS = {
    model:  { zh: '模型', d: [iL(26, 30, 50, 22), iL(26, 30, 50, 50), iL(26, 30, 50, 78), iL(26, 70, 50, 22), iL(26, 70, 50, 50), iL(26, 70, 50, 78),
                               iL(50, 22, 76, 50), iL(50, 50, 76, 50), iL(50, 78, 76, 50), iC(22, 30, 6), iC(22, 70, 6), iC(50, 22, 6), iC(50, 50, 6), iC(50, 78, 6), iC(78, 50, 7)] },
    gpu:    { zh: '显卡', d: [iR(12, 28, 76, 42, 5), iC(34, 49, 13), iC(66, 49, 13), iL(34, 36, 34, 62) + iL(21, 49, 47, 49), iL(66, 36, 66, 62) + iL(53, 49, 79, 49),
                               iL(20, 70, 20, 80, 60, 80, 60, 70), iL(12, 28, 8, 28, 8, 80)] },
    chip:   { zh: '芯片', d: [iR(28, 28, 44, 44, 4), iR(39, 39, 22, 22, 2), iL(38, 28, 38, 16) + iL(50, 28, 50, 16) + iL(62, 28, 62, 16), iL(38, 72, 38, 84) + iL(50, 72, 50, 84) + iL(62, 72, 62, 84),
                               iL(28, 38, 16, 38) + iL(28, 50, 16, 50) + iL(28, 62, 16, 62), iL(72, 38, 84, 38) + iL(72, 50, 84, 50) + iL(72, 62, 84, 62)] },
    data:   { zh: '数据', d: [`M20,24a30,9 0 1,0 60,0a30,9 0 1,0 -60,0`, `M20,24V76a30,9 0 0,0 60,0V24`, `M20,41a30,9 0 0,0 60,0`, `M20,58a30,9 0 0,0 60,0`] },
    agent:  { zh: '智能体', d: [iR(22, 32, 56, 44, 10), iC(38, 52, 6), iC(62, 52, 6), iL(40, 66, 60, 66), iL(50, 32, 50, 18), iC(50, 14, 4), iL(22, 50, 14, 50, 14, 60) + iL(78, 50, 86, 50, 86, 60)] },
    tool:   { zh: '工具', d: [iR(18, 16, 64, 24, 5), iR(43, 40, 14, 48, 5), iL(30, 16, 30, 40)] },
    terminal: { zh: '终端', d: [iR(10, 18, 80, 64, 6), iL(10, 30, 90, 30), iL(24, 44, 36, 54, 24, 64), iL(42, 66, 62, 66)] },
    code:   { zh: '代码', d: [iL(34, 28, 14, 50, 34, 72), iL(66, 28, 86, 50, 66, 72), iL(56, 22, 44, 78)] },
    doc:    { zh: '文档', d: [iL(24, 10, 62, 10, 78, 26, 78, 90, 24, 90, 24, 10), iL(62, 10, 62, 26, 78, 26), iL(34, 42, 68, 42) + iL(34, 56, 68, 56) + iL(34, 70, 56, 70)] },
    chat:   { zh: '对话', d: [`M18,20H82Q88,20 88,26V62Q88,68 82,68H44L28,82V68H18Q12,68 12,62V26Q12,20 18,20Z`, iC(34, 44, 3) + iC(50, 44, 3) + iC(66, 44, 3)] },
    server: { zh: '服务器', d: [iR(16, 14, 68, 20, 4), iR(16, 40, 68, 20, 4), iR(16, 66, 68, 20, 4), iC(28, 24, 3) + iC(28, 50, 3) + iC(28, 76, 3), iL(52, 24, 74, 24) + iL(52, 50, 74, 50) + iL(52, 76, 74, 76)] },
    cloud:  { zh: '云端', d: [`M28,74H74a14,14 0 0,0 2,-28a20,20 0 0,0 -38,-6a14,14 0 0,0 -10,34z`] },
    user:   { zh: '用户', d: [iC(50, 34, 15), `M20,86a30,26 0 0,1 60,0`] },
    lock:   { zh: '加密', d: [iR(24, 44, 52, 40, 6), `M34,44V32a16,16 0 0,1 32,0V44`, iC(50, 62, 5) + iL(50, 67, 50, 74)] },
    key:    { zh: '钥匙', d: [iC(30, 50, 16), iL(46, 50, 88, 50), iL(76, 50, 76, 62) + iL(86, 50, 86, 60)] },
    globe:  { zh: '网页', d: [iC(50, 50, 36), `M50,14a16,36 0 1,0 0,72a16,36 0 1,0 0,-72`, iL(14, 50, 86, 50), `M20,32H80M20,68H80`] },
    gear:   { zh: '设置', d: [iC(50, 50, 24), iC(50, 50, 9), [0, 45, 90, 135, 180, 225, 270, 315].map(a => { const r = a * Math.PI / 180;
                               return iL(+(50 + 24 * Math.cos(r)).toFixed(1), +(50 + 24 * Math.sin(r)).toFixed(1), +(50 + 34 * Math.cos(r)).toFixed(1), +(50 + 34 * Math.sin(r)).toFixed(1)); }).join('')] },
    bolt:   { zh: '算力', d: [iL(56, 8, 24, 56, 48, 56, 40, 92, 76, 40, 52, 40, 56, 8)] },
    search: { zh: '搜索', d: [iC(42, 42, 24), iL(60, 60, 86, 86)] },
    memory: { zh: '内存', d: [iR(8, 30, 84, 32, 4), iR(16, 37, 14, 18) + iR(36, 37, 14, 18) + iR(56, 37, 14, 18) + iR(76, 37, 8, 18),
                               iL(14, 62, 14, 72) + iL(24, 62, 24, 72) + iL(34, 62, 34, 72) + iL(44, 62, 44, 72) + iL(58, 62, 58, 72) + iL(68, 62, 68, 72) + iL(78, 62, 78, 72) + iL(88, 62, 88, 72)] },
    eye:    { zh: '视觉', d: [`M8,50Q50,10 92,50Q50,90 8,50Z`, iC(50, 50, 14), iC(50, 50, 4)] },
    game:   { zh: '游戏', d: [`M28,34H72a18,18 0 0,1 16,26l-6,14a8,8 0 0,1 -14,0l-6,-8H40l-6,8a8,8 0 0,1 -14,0l-6,-14a18,18 0 0,1 14,-26z`,
                               iL(30, 44, 30, 56) + iL(24, 50, 36, 50), iC(66, 46, 3) + iC(74, 54, 3)] },
    book:   { zh: '论文', d: [`M50,24Q34,14 12,18V80Q34,76 50,86Q66,76 88,80V18Q66,14 50,24Z`, iL(50, 24, 50, 86), iL(20, 34, 40, 36) + iL(20, 48, 40, 50) + iL(60, 36, 80, 34) + iL(60, 50, 80, 48)] },
    phone:  { zh: '手机', d: [iR(28, 8, 44, 84, 8), iL(44, 16, 56, 16), iC(50, 82, 3)] },
  };
  // 一个图标 → 若干条 path 的 d（rough=true 时过一遍 rough.js：同 seed 逐帧一致，库缺席时退回干净线）
  function iconPaths(name, seed, rough) {
    const ic = ICONS[name]; if (!ic) return [];
    if (!rough) return ic.d;
    return ic.d.map((d, k) => { const r = roughD(g => g.path(d, { seed: seed + k * 11 + 1, roughness: .55, bowing: .6, maxRandomnessOffset: 1.2, disableMultiStroke: true }));
      return r && r.length ? r.join(' ') : d; });
  }
  FX.iconSVG = (name, seed = 7, rough = false, sw = 5) => `<svg viewBox="-4 -4 108 108" class="ai-ico">` +
    iconPaths(name, seed, rough).map(d => `<path d="${d}" pathLength="1" style="stroke-width:${sw}"/>`).join('') + `</svg>`;

  /* =====================================================================
     aiicon —— 线稿图标逐笔画出（AI 片的「线稿图解」零件）；可「点亮」变红；下面可带标签
     spec: x,y,w(=h=图标边长), name, label, delay, drawDur=.7, rough=true, sw=5, hotAt, color
     ===================================================================== */
  CH.aiicon = FX.types.aiicon = {
    build(s) {
      return `<div class="fx-in fx-aiicon${s.label ? ' has-lab' : ''}" style="--ic:${s.w}px;${s.color ? '--icc:' + s.color : ''}">` +
        FX.iconSVG(s.name, seedOf(s), s.rough !== false, s.sw || 5) + (s.label ? `<b class="ai-lab">${rich(s.label)}</b>` : '') + `</div>`;
    },
    update(n, s, p, tau, c) {
      const lt = c.lt, a = delayOf(s), D = s.drawDur || .7, ps = n.querySelectorAll('path'), N = ps.length || 1;
      ps.forEach((el, k) => { const q = eOutCubic(prog(lt, a + D * k / N * .85, D / N * 1.6)); el.style.strokeDashoffset = f2(1 - q); el.style.opacity = q > 0 ? 1 : 0; });
      const lab = n.querySelector('.ai-lab'); if (lab) { const q = prog(lt, a + D * .7, .3); lab.style.opacity = f2(q); lab.style.transform = `translateY(${f2((1 - eOutCubic(q)) * 10)}px)`; }
      n.firstChild.classList.toggle('hot', s.hotAt != null && lt >= s.hotAt);
    },
    win: s => [[delayOf(s), delayOf(s) + (s.drawDur || .7) * 1.5 + .35]].concat(s.hotAt != null ? [[s.hotAt, s.hotAt + .1]] : [])
  };

  /* =====================================================================
     specgrid —— 参数对比卡：表头先出，每行从左滑入；focus 的格子变红 + 荧光笔一扫
     spec: x,y,w,h, cols:[表头…（第一列是行名列的表头，可空）], rows:[{label, vals:[…], note, at}], delay, stagger,
           focus:[{row, col, at}]（row/col 从 0 数，col 指 vals 的下标）, labelW, size, cap
     ===================================================================== */
  CH.specgrid = FX.types.specgrid = {
    build(s) {
      const nv = s.cols.length - 1, lw = s.labelW || 260, cw = (s.w - lw - 48) / nv, rh = s.rowH || 76;
      const cell = (t, i, cls = '') => `<div class="sg-c${cls}" style="left:${f2(lw + 24 + i * cw)}px;width:${f2(cw)}px"><span class="sg-t">${rich(t)}</span></div>`;
      return `<div class="fx-in fx-sg" style="font-size:${s.size || 34}px">${s.cap ? `<div class="sg-cap">${rich(s.cap)}</div>` : ''}` +
        `<div class="sg-head" style="height:${rh}px"><div class="sg-l" style="width:${lw}px">${rich(s.cols[0] || '')}</div>${s.cols.slice(1).map((t, i) => cell(t, i)).join('')}</div>` +
        s.rows.map((r, ri) => `<div class="sg-row" data-r="${ri}" style="height:${rh}px"><div class="sg-l" style="width:${lw}px">${rich(r.label)}` +
          (r.note ? `<small>${rich(r.note)}</small>` : '') + `</div>` +
          r.vals.map((v, i) => cell(v, i, ' v')).join('') + `</div>`).join('') + `</div>`;
    },
    update(n, s, p, tau, c) {
      const lt = c.lt, a = delayOf(s), st = s.stagger == null ? .35 : s.stagger, inn = n.firstChild;
      const en = enterOf({ ...s, enterDur: .45, dropRot: -1 }, lt, s.enter || 'drop'); inn.style.transform = en.tr; inn.style.opacity = en.op;
      const lw = s.labelW || 260, nv = s.cols.length - 1, cw = (s.w - lw - 48) / nv;
      n.querySelectorAll('.sg-row').forEach((row, ri) => {
        const r = s.rows[ri], at = r.at != null ? r.at : a + .45 + ri * st, q = eOutCubic(prog(lt, at, .4));
        row.style.opacity = f2(q); row.style.transform = `translateX(${f2((1 - q) * -40)}px)`;
        row.querySelectorAll('.sg-c.v').forEach((el, ci) => {
          const F = (s.focus || []).find(f => f.row === ri && f.col === ci), hq = F ? eOutCubic(prog(lt, F.at, .35)) : 0;
          el.classList.toggle('hot', hq > 0);
          el.style.setProperty('--hq', f2(hq));
        });
      });
    },
    win(s) {
      const a = delayOf(s), st = s.stagger == null ? .35 : s.stagger;
      return [[a, a + .5]].concat(s.rows.map((r, ri) => { const at = r.at != null ? r.at : a + .45 + ri * st; return [at, at + .45]; }),
        (s.focus || []).map(f => [f.at, f.at + .4]));
    }
  };

})();
