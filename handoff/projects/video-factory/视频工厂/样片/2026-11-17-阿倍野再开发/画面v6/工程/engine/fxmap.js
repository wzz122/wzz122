/* =========================================================================
   fxmap.js —— 地图舞台组件（2026-10-27 加；学 Wendao「一张自绘底图贯穿全片」的结构，版式是我们自己的）
   底图 = photocard(style:'map')：src 是 地图/做底图.py 画的 SVG（矢量，推近不糊），views 关键帧 = 推镜。
   下面的组件都用 ref=底图元素 id + 底图像素坐标（v6lib 的 LL() 把经纬度换成底图像素），每帧经 FX.map 换算，
   所以镜头推拉时线、点、标签跟着地图走；线宽、字号按屏幕像素恒定，不随缩放变粗变大。
     mapline    线路生长：实线 / 虚线（已消失的河），双层描边，可带生长头
     mappins    编号点（①②③ + 黑底白字标签）/ 地名点 / 大字区名，可连细引线到照片卡，可打勾（结尾回扣）
     yeartag    左上年份牌「1891 ｜ 长屋建筑规则」，关键帧上翻切换
     bigchapter 站卡：路线进度（几站中的第几站）+ 粗宋站名 + 年代
     songtitle  宋体大标题逐字浮现 + 红短线 + 副标题，可选背景虚化压淡
   规矩同 fx.js：只由镜头内秒数 lt 算属性、每帧无状态、确定性。
   ========================================================================= */
(function () {
  const FX = window.FX, CH = window.CHARTS;
  const { clamp, lerp, eOutCubic, eInOut, eOutBack } = FX.util;
  const prog = (lt, a, d) => clamp((lt - a) / Math.max(1e-3, d), 0, 1);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rich = s => esc(s).replace(/==(.+?)==/g, '<span class="hl">$1</span>').replace(/\*\*(.+?)\*\*/g, '<span class="red">$1</span>').replace(/\n/g, '<br>');
  const f2 = v => (+v).toFixed(2);
  const delayOf = s => s.delay || 0;
  const full = n => { n.style.left = '0px'; n.style.top = '0px'; n.style.width = '1920px'; n.style.height = '1008px'; };
  const refOf = s => FX.specs[s.ref];
  const mapPt = (s, lt, p) => { const r = refOf(s); return r ? FX.map(r, lt, p) : p; };
  // 底图推镜 / 入场时，叠在上面的组件也得逐帧重画
  const refWins = s => { const r = refOf(s); if (!r) return [];
    return (r.views || []).slice(1).map(v => [v.at, v.at + (v.dur || .95)]).concat([[delayOf(r), delayOf(r) + (r.enterDur || .55)]]); };
  const RED = '#C7372F', INK = '#1E1C18', BLUE = '#3E7FA6', PAPER = '#EEE6D4';

  /* ---------------- 样式（随本文件一起进渲染指纹） ---------------- */
  const css = `
.fx-card.st-map .pc-frame{background:transparent;}
.fx-card.st-map .pc-shadow{display:none;}
.fx-card.st-map .pc-win{background:${PAPER};}
.fx-card.st-map .pc-win::after{content:"";position:absolute;inset:0;background:url(assets/paper-light.png) 0 0/1920px 1008px;mix-blend-mode:multiply;opacity:.6;pointer-events:none;}
.fx-card.st-sat .pc-frame{background:transparent;}
.fx-card.st-sat .pc-shadow{display:none;}
.fx-card.st-sat .pc-win{background:#2a2e2a;}
.mp-pin.sat.k-place .mp-lb{color:#fff;font-weight:700;text-shadow:0 0 3px #000,0 0 3px #000,0 0 6px rgba(0,0,0,.9),1px 1px 0 #000,-1px -1px 0 #000;}
.mp-pin.sat.k-place .mp-mk .c{background:#fff;box-shadow:0 0 0 3px #111;}
.mp-pin.sat.k-big .mp-lb{color:#fff;text-shadow:0 0 4px #000,0 0 8px rgba(0,0,0,.9),2px 2px 0 #000,-2px -2px 0 #000,2px -2px 0 #000,-2px 2px 0 #000;}
.mp-pin.sat.k-dot .mp-mk .c{box-shadow:0 0 0 5px #111,0 0 0 8px rgba(255,255,255,.8);}
.fx-card.st-sat .pc-img{filter:saturate(.45) brightness(.88) contrast(1.06);}
.fx-card.st-sat .pc-win::after{content:"";position:absolute;inset:0;background:rgba(46,66,92,.16);mix-blend-mode:multiply;pointer-events:none;}
.mp-pin.k-card .mp-mk .c{width:24px;height:24px;background:#C7372F;font:700 15px/1 "Helvetica Neue",sans-serif;color:#fff;box-shadow:0 0 0 2px #fff;}
.mp-pin.k-card .mp-lb{background:rgba(252,250,245,.97);color:#1E1C18;font:700 28px/1.2 "Songti SC",serif;padding:6px 12px 7px;border-radius:3px;box-shadow:0 2px 8px rgba(0,0,0,.35);}
.mp-pin.k-card .mp-lb small{font:500 16px/1.3 "PingFang SC",sans-serif;color:#6B6760;margin-top:3px;}
.mp-pin.k-tick .mp-mk{display:none;}
.mp-pin.k-tick .mp-lb{padding-left:14px;border-left:2px solid currentColor;font:600 26px/1.25 "Songti SC",serif;color:#1E1C18;}
.mp-pin.k-tick.sat .mp-lb{color:#fff;text-shadow:0 0 3px #000,0 0 6px rgba(0,0,0,.85),1px 1px 0 #000;}
.mp-pin.k-tick .mp-lb small{font:500 17px/1.3 "PingFang SC",sans-serif;opacity:.85;}
.fx-mapimg{position:absolute;left:0;top:0;width:1920px;height:1008px;overflow:hidden;}
.fx-mapimg img{position:absolute;left:0;top:0;transform-origin:0 0;max-width:none;}
.mp-pin.k-card.done .mp-mk .c{background:#2F6E57;}
.fx-chov{position:absolute;left:0;top:0;width:1920px;height:1008px;}
.co-bg{position:absolute;inset:0;background:linear-gradient(20deg,rgba(236,229,214,.97) 0%,rgba(236,229,214,.9) 34%,rgba(236,229,214,0) 70%);}
.co-no{position:absolute;left:150px;top:520px;font:900 250px/1 "Songti SC",serif;color:#1E1C18;}
.co-k{position:absolute;left:430px;top:600px;font:600 30px/1 "Songti SC",serif;color:#C7372F;letter-spacing:.2em;}
.co-name{position:absolute;left:430px;top:645px;font:900 76px/1.1 "Songti SC",serif;color:#1E1C18;white-space:nowrap;}
.co-y{position:absolute;left:434px;top:745px;font:500 28px/1 "Songti SC",serif;color:#6B6760;letter-spacing:.08em;}
.fxm-svg{position:absolute;left:0;top:0;overflow:visible;}
.mp-pin{position:absolute;width:0;height:0;}
.mp-mk{position:absolute;left:0;top:0;transform-origin:0 0;}
.mp-mk .c{position:absolute;left:0;top:0;display:flex;align-items:center;justify-content:center;border-radius:50%;
  transform:translate(-50%,-50%);font:800 30px/1 "Helvetica Neue","PingFang SC",sans-serif;color:#fff;}
.mp-pin.k-num .mp-mk .c{width:50px;height:50px;background:${RED};box-shadow:0 0 0 4px #fff,0 4px 10px rgba(40,25,15,.35);}
.mp-pin.k-num.done .mp-mk .c{background:#2F6E57;}
.mp-pin.k-dot .mp-mk .c{width:18px;height:18px;background:#fff;box-shadow:0 0 0 5px ${INK},0 2px 6px rgba(40,25,15,.3);}
.mp-pin.k-place .mp-mk .c{width:13px;height:13px;background:${INK};box-shadow:0 0 0 3px #fff;}
.mp-pin.k-big .mp-mk{display:none;}
.mp-ring{position:absolute;left:0;top:0;width:50px;height:50px;border-radius:50%;border:4px solid ${RED};transform:translate(-50%,-50%);opacity:0;}
.mp-lb{position:absolute;left:0;top:0;white-space:nowrap;}
.mp-pin.k-num .mp-lb{background:rgba(30,28,24,.92);color:#fff;font:600 31px/1.25 "PingFang SC",sans-serif;padding:7px 16px 8px;border-radius:9px;letter-spacing:.02em;box-shadow:0 4px 12px rgba(30,20,10,.28);}
.mp-pin.k-num .mp-lb .red{color:#FF9C8C;} .mp-pin.k-num .mp-lb .hl{color:#FFE36E;}
.mp-pin.k-dot .mp-lb{background:rgba(251,248,241,.95);color:${INK};font:600 30px/1.25 "PingFang SC",sans-serif;padding:6px 14px 7px;border-radius:8px;border-left:6px solid ${INK};box-shadow:0 3px 10px rgba(30,20,10,.22);}
.mp-pin.k-place .mp-lb{color:#2B2925;font:600 27px/1.2 "PingFang SC",sans-serif;
  text-shadow:0 0 3px ${PAPER},0 0 3px ${PAPER},0 0 5px ${PAPER},0 0 8px ${PAPER},1px 1px 0 ${PAPER},-1px -1px 0 ${PAPER},1px -1px 0 ${PAPER},-1px 1px 0 ${PAPER};}
.mp-pin.k-big .mp-lb{color:${INK};font:900 52px/1.15 "Songti SC",serif;letter-spacing:.06em;
  text-shadow:0 0 4px ${PAPER},0 0 6px ${PAPER},0 0 10px ${PAPER},2px 2px 0 ${PAPER},-2px -2px 0 ${PAPER},2px -2px 0 ${PAPER},-2px 2px 0 ${PAPER};}
.mp-lb small{display:block;font-size:.72em;font-weight:500;opacity:.85;margin-top:2px;}
.fx-yeartag{position:absolute;}
.yt-box{position:absolute;left:0;top:0;height:84px;min-width:260px;border-radius:12px;background:rgba(251,248,241,.95);
  box-shadow:0 5px 16px rgba(40,28,15,.22);overflow:hidden;}
.yt-box::before{content:"";position:absolute;left:0;top:0;bottom:0;width:8px;background:${RED};}
.yt-row{position:absolute;left:0;top:0;height:84px;display:flex;align-items:center;padding:0 26px 0 30px;white-space:nowrap;}
.yt-y{font:800 52px/1 "Helvetica Neue",sans-serif;color:${INK};letter-spacing:-.01em;}
.yt-s{width:3px;height:40px;background:#B8AE9C;margin:0 18px;}
.yt-t{font:600 32px/1 "PingFang SC",sans-serif;color:#3A3732;}
.fx-bigch{position:absolute;left:0;top:0;width:1920px;height:1008px;}
.bc-bg{position:absolute;inset:0;background:var(--paper) url(assets/paper-light.png) 0 0/1920px 1008px no-repeat;}
.bc-bg::before{content:"";position:absolute;inset:0;background-image:linear-gradient(var(--grid-major) 1px,transparent 1px),linear-gradient(90deg,var(--grid-major) 1px,transparent 1px),linear-gradient(var(--grid-minor) 1px,transparent 1px),linear-gradient(90deg,var(--grid-minor) 1px,transparent 1px);
  background-size:var(--grid-major-step) var(--grid-major-step),var(--grid-major-step) var(--grid-major-step),var(--grid) var(--grid),var(--grid) var(--grid);background-position:0 24px,0 0,0 24px,0 0;}
.bc-no{position:absolute;left:300px;top:300px;font:700 40px/1 "PingFang SC",sans-serif;color:#fff;background:${RED};padding:12px 24px 13px;border-radius:10px;letter-spacing:.12em;}
.bc-name{position:absolute;left:296px;top:385px;font:900 150px/1.1 "Songti SC",serif;color:${INK};letter-spacing:.04em;white-space:nowrap;}
.bc-name span{display:inline-block;}
.bc-rule{position:absolute;left:304px;top:590px;height:8px;background:${RED};border-radius:4px;}
.bc-years{position:absolute;left:304px;top:628px;font:600 44px/1 "Helvetica Neue",sans-serif;color:#6B6760;letter-spacing:.06em;}
.bc-stop{position:absolute;font:600 32px/1 "PingFang SC",sans-serif;color:#8C867B;white-space:nowrap;transform:translateY(-50%);}
.bc-stop.cur{color:${INK};font-weight:800;font-size:38px;}
.fx-stitle{position:absolute;left:0;top:0;width:1920px;height:1008px;}
.st-scrim{position:absolute;inset:0;background:rgba(238,230,212,.74);backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px);}
.st-text{position:absolute;white-space:nowrap;font:900 120px/1.12 "Songti SC",serif;color:${INK};letter-spacing:.05em;}
.st-text span{display:inline-block;}
.st-text .red{color:${RED};}
.st-rule{position:absolute;height:9px;background:${RED};border-radius:5px;}
.st-sub{position:absolute;white-space:nowrap;font:600 40px/1.2 "PingFang SC",sans-serif;color:#4A463F;letter-spacing:.08em;}
`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  /* =====================================================================
     mapline —— 线路生长
     spec: ref, lines:[{pts:[[x,y]…]（底图像素）, at, dur=1.6, color, width=8, casing=true|色|false, casingW=+6,
                        dash:[a,b]（屏幕像素；虚线 = 已经不在的河/规划线）, opacity=1, tip=false, hideAt}]
     ===================================================================== */
  const dOf = P => 'M' + P.map(q => `${f2(q[0])},${f2(q[1])}`).join('L');
  CH.mapline = FX.types.mapline = {
    build(s) {
      const id = 'ml' + (FX.util.hashStr(s.id) % 1e7);
      let h = `<svg class="fxm-svg" width="1920" height="1008"><defs>`;
      (s.lines || []).forEach((L, i) => { if (L.dash) h += `<mask id="${id}m${i}" maskUnits="userSpaceOnUse" x="-200" y="-200" width="2320" height="1408"><path class="ml-rev" fill="none" stroke="#fff" stroke-width="${(L.width || 8) + 30}" stroke-linecap="round" stroke-linejoin="round" pathLength="1000"/></mask>`; });
      h += `</defs>`;
      (s.lines || []).forEach((L, i) => {
        const col = L.color || RED, w = L.width || 8, cas = L.casing === false ? null : (L.casing === true || L.casing == null ? '#FFFFFF' : L.casing);
        h += `<g class="ml-g" ${L.dash ? `mask="url(#${id}m${i})"` : ''} opacity="${L.opacity == null ? 1 : L.opacity}"${L.glow ? ` style="filter:drop-shadow(0 0 ${L.glow}px ${col})"` : ''}>`;
        if (cas) h += `<path class="ml-cas" fill="none" stroke="${cas}" stroke-width="${w + (L.casingW || 6)}" stroke-linecap="round" stroke-linejoin="round" ${L.dash ? '' : 'pathLength="1000"'} stroke-opacity=".92"/>`;
        h += `<path class="ml-main" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="${L.dash ? 'butt' : 'round'}" stroke-linejoin="round" ${L.dash ? `stroke-dasharray="${L.dash.join(' ')}"` : 'pathLength="1000"'}/>`;
        h += `</g>`;
        if (L.tip) h += `<circle class="ml-tip" r="${w * .9 + 4}" fill="${col}" stroke="#fff" stroke-width="4"/>`;
      });
      return h + `</svg>`;
    },
    update(n, s, p, tau, c) {
      full(n);
      const lt = c.lt, gs = n.querySelectorAll('.ml-g'), revs = n.querySelectorAll('.ml-rev'), tips = n.querySelectorAll('.ml-tip');
      let ri = 0, ti = 0;
      (s.lines || []).forEach((L, i) => {
        const g = gs[i], at = L.at == null ? delayOf(s) : L.at, q = eInOut(prog(lt, at, L.dur || 1.6));
        let op = lt < at ? 0 : 1;
        if (L.hideAt != null) op *= 1 - prog(lt, L.hideAt, .35);
        g.style.visibility = op > 0 && q > 0 ? '' : 'hidden';
        g.style.opacity = f2(op * (L.opacity == null ? 1 : L.opacity));
        const d = dOf(L.pts.map(pt => mapPt(s, lt, pt)));
        g.querySelectorAll('path').forEach(pa => pa.setAttribute('d', d));
        if (L.dash) { const r = revs[ri++]; r.setAttribute('d', d); r.style.strokeDasharray = '1000 1000'; r.style.strokeDashoffset = f2(1000 * (1 - q)); }
        else g.querySelectorAll('path').forEach(pa => { pa.style.strokeDasharray = '1000 1000'; pa.style.strokeDashoffset = f2(1000 * (1 - q)); });
        if (L.tip) {
          const tp = tips[ti++], main = g.querySelector('.ml-main');
          const len = main.getTotalLength(), P = main.getPointAtLength(len * q);
          tp.setAttribute('cx', f2(P.x)); tp.setAttribute('cy', f2(P.y));
          tp.style.visibility = op > 0 && q > 0 && q < 1 ? '' : 'hidden';
        }
      });
    },
    win: s => (s.lines || []).flatMap(L => { const at = L.at == null ? delayOf(s) : L.at;
      return [[at, at + (L.dur || 1.6)]].concat(L.hideAt != null ? [[L.hideAt, L.hideAt + .35]] : []); }).concat(refWins(s))
  };

  /* =====================================================================
     mappins —— 地图上的点和标签（屏幕像素大小恒定）
     spec: ref, pins:[{pt:[x,y]（底图像素）, at, kind:'num'|'dot'|'place'|'big', n（编号）, label, sub（第二行小字）,
                       dir:'r'|'l'|'u'|'d', gap=14, dx, dy（标签再偏移）, ring=true（num 默认出现时扩散一圈）,
                       to:[x,y]（画布像素：引线终点，如照片卡角）, toAt, hideAt, checkAt（打勾变绿，结尾回扣）}]
     ===================================================================== */
  const R_OF = { num: 25, dot: 11, place: 8, big: 0, card: 12, tick: 0 };
  CH.mappins = FX.types.mappins = {
    build(s) {
      let h = `<svg class="fxm-svg mp-lead" width="1920" height="1008">`;
      (s.pins || []).forEach(P => { if (P.to) h += `<path class="mp-ld" fill="none" stroke="${RED}" stroke-width="3" stroke-linecap="round" pathLength="1000"/><circle class="mp-ldd" r="6" fill="${RED}"/>`; });
      h += `</svg>`;
      (s.pins || []).forEach(P => {
        const k = P.kind || 'num';
        h += `<div class="mp-pin k-${k}${s.theme === 'sat' ? ' sat' : ''}"><div class="mp-ring"></div><div class="mp-mk"><div class="c">${k === 'num' ? esc(P.n == null ? '' : P.n) : ''}</div></div>` +
          (P.label ? `<div class="mp-lb">${rich(P.label)}${P.sub ? `<small>${rich(P.sub)}</small>` : ''}</div>` : '') + `</div>`;
      });
      return h;
    },
    update(n, s, p, tau, c) {
      full(n);
      const lt = c.lt, pins = n.querySelectorAll('.mp-pin'), lds = n.querySelectorAll('.mp-ld'), ldds = n.querySelectorAll('.mp-ldd');
      let li = 0;
      (s.pins || []).forEach((P, i) => {
        const el = pins[i], k = P.kind || 'num', at = P.at == null ? delayOf(s) : P.at;
        const [X, Y] = mapPt(s, lt, P.pt);
        let op = lt < at ? 0 : 1;
        if (P.hideAt != null) op *= 1 - prog(lt, P.hideAt, .3);
        el.style.left = f2(X) + 'px'; el.style.top = f2(Y) + 'px';
        el.style.opacity = f2(op); el.style.visibility = op > 0 ? '' : 'hidden';
        const mq = prog(lt, at, .38), mk = el.querySelector('.mp-mk');
        mk.style.transform = `scale(${lerp(.25, 1, eOutBack(mq, 2)).toFixed(4)})`;
        mk.style.opacity = f2(clamp(mq * 3, 0, 1));
        const ring = el.querySelector('.mp-ring');
        if (k === 'num' && P.ring !== false) { const rq = prog(lt, at + .05, .8);
          ring.style.opacity = f2(rq > 0 && rq < 1 ? (1 - rq) * .7 : 0); ring.style.transform = `translate(-50%,-50%) scale(${lerp(1, 2.6, eOutCubic(rq)).toFixed(4)})`; }
        if (k === 'num' || k === 'card') { const done = P.checkAt != null && lt >= P.checkAt; el.classList.toggle('done', done);
          const cc = el.querySelector('.c'), want = done ? '✓' : String(P.n == null ? '' : P.n); if (cc.textContent !== want) cc.textContent = want;
          if (done) { const cq = prog(lt, P.checkAt, .3); mk.style.transform = `scale(${lerp(1.35, 1, eOutCubic(cq)).toFixed(4)})`; } }
        const lb = el.querySelector('.mp-lb');
        if (lb) {
          const r = R_OF[k], gap = P.gap == null ? 14 : P.gap, dir = P.dir || 'r', lq = eOutCubic(prog(lt, at + (k === 'big' ? 0 : .12), .35));
          let tx = '', off = (1 - lq) * 14;
          if (dir === 'r') tx = `translate(${f2(r + gap + (P.dx || 0) - off)}px,calc(-50% + ${f2(P.dy || 0)}px))`;
          else if (dir === 'l') tx = `translate(calc(-100% - ${f2(r + gap - (P.dx || 0) - off)}px),calc(-50% + ${f2(P.dy || 0)}px))`;
          else if (dir === 'u') tx = `translate(calc(-50% + ${f2(P.dx || 0)}px),calc(-100% - ${f2(r + gap - (P.dy || 0) - off)}px))`;
          else tx = `translate(calc(-50% + ${f2(P.dx || 0)}px),${f2(r + gap + (P.dy || 0) - off)}px)`;
          lb.style.transform = tx; lb.style.opacity = f2(lq);
        }
        if (P.to) {
          const ld = lds[li], dd = ldds[li]; li++;
          const ta = P.toAt == null ? at + .25 : P.toAt, q = eOutCubic(prog(lt, ta, .45));
          ld.setAttribute('d', `M${f2(X)},${f2(Y)}L${f2(P.to[0])},${f2(P.to[1])}`);
          ld.style.strokeDasharray = '1000 1000'; ld.style.strokeDashoffset = f2(1000 * (1 - q));
          ld.style.visibility = q > 0 && op > 0 ? '' : 'hidden'; ld.style.opacity = f2(op);
          dd.setAttribute('cx', f2(P.to[0])); dd.setAttribute('cy', f2(P.to[1])); dd.style.visibility = q >= 1 && op > 0 ? '' : 'hidden'; dd.style.opacity = f2(op);
        }
      });
    },
    win: s => (s.pins || []).flatMap(P => { const at = P.at == null ? delayOf(s) : P.at;
      const w = [[at, at + ((P.kind || 'num') === 'num' && P.ring !== false ? .9 : .5)]];
      if (P.to) { const ta = P.toAt == null ? at + .25 : P.toAt; w.push([ta, ta + .5]); }
      if (P.hideAt != null) w.push([P.hideAt, P.hideAt + .35]);
      if (P.checkAt != null) w.push([P.checkAt, P.checkAt + .35]);
      return w; }).concat(refWins(s))
  };

  /* =====================================================================
     yeartag —— 左上年份牌：keys:[{at, year, text}]，换年份时旧的上翻出去、新的从下面翻上来
     ===================================================================== */
  CH.yeartag = FX.types.yeartag = {
    build(s) { return `<div class="yt-box"><div class="yt-row yt-prev"></div><div class="yt-row yt-cur"></div></div>`; },
    update(n, s, p, tau, c) {
      const lt = c.lt, ks = s.keys || [], box = n.querySelector('.yt-box'), cur = n.querySelector('.yt-cur'), prev = n.querySelector('.yt-prev');
      let ki = -1; ks.forEach((k, i) => { if (lt >= k.at) ki = i; });
      if (ki < 0) { box.style.opacity = '0'; return; }
      const html = k => k ? `<span class="yt-y">${esc(k.year)}</span>${k.text ? `<span class="yt-s"></span><span class="yt-t">${rich(k.text)}</span>` : ''}` : '';
      if (cur._k !== ki) { cur.innerHTML = html(ks[ki]); prev.innerHTML = html(ks[ki - 1]); cur._k = ki; }
      const q = eOutCubic(prog(lt, ks[ki].at, .42)), first = ki === 0;
      box.style.opacity = f2(first ? q : 1);
      box.style.transform = first ? `translateY(${f2((1 - q) * -16)}px)` : '';
      cur.style.transform = `translateY(${f2(first ? 0 : (1 - q) * 70)}px)`; cur.style.opacity = f2(first ? 1 : q);
      prev.style.transform = `translateY(${f2(-q * 70)}px)`; prev.style.opacity = f2(first ? 0 : 1 - q);
      const wc = cur.scrollWidth, wp = prev.scrollWidth || wc;
      box.style.width = f2(first ? wc : lerp(wp, wc, q)) + 'px';
    },
    win: s => (s.keys || []).map(k => [k.at, k.at + .45])
  };

  /* =====================================================================
     bigchapter —— 站卡：纸底 + 左侧红色「第一站」+ 粗宋站名逐字由虚到实 + 红短线 + 年代；右侧竖向路线进度
     spec: no（「第一站」）, name, years, stops:['日本桥',…], cur（第几站，0 起）, delay
     ===================================================================== */
  CH.bigchapter = FX.types.bigchapter = {
    build(s) {
      const stops = s.stops || [];
      let h = `<div class="fx-bigch"><div class="bc-bg"></div>`;
      if (stops.length) {
        h += `<svg class="fxm-svg" width="1920" height="1008"><line class="bc-track" x1="1460" x2="1460" stroke="#CFC6B4" stroke-width="10" stroke-linecap="round"/>` +
          `<line class="bc-done" x1="1460" x2="1460" stroke="${RED}" stroke-width="10" stroke-linecap="round"/>` +
          stops.map(() => `<circle class="bc-dot" cx="1460" r="16" stroke-width="6"/>`).join('') + `<circle class="bc-ring" cx="1460" r="16" fill="none" stroke="${RED}" stroke-width="4"/></svg>`;
        h += stops.map((t, i) => `<div class="bc-stop${i === s.cur ? ' cur' : ''}" style="left:1500px">${esc(t)}</div>`).join('');
      }
      h += `<div class="bc-no">${esc(s.no || '')}</div><div class="bc-name">${[...String(s.name || '')].map(ch => `<span>${esc(ch)}</span>`).join('')}</div>` +
        `<div class="bc-rule"></div>${s.years ? `<div class="bc-years">${esc(s.years)}</div>` : ''}</div>`;
      return h;
    },
    update(n, s, p, tau, c) {
      full(n);
      const lt = c.lt - delayOf(s), stops = s.stops || [], cur = s.cur || 0;
      n.querySelector('.bc-bg').style.opacity = f2(eOutCubic(clamp(lt / .35, 0, 1)));
      const no = n.querySelector('.bc-no'), nq = prog(lt, .25, .4);
      no.style.opacity = f2(nq); no.style.transform = `translateX(${f2((1 - eOutCubic(nq)) * -30)}px)`;
      n.querySelectorAll('.bc-name span').forEach((sp, i) => {
        const q = prog(lt, .45 + i * .07, .55), e = eOutCubic(q);
        sp.style.opacity = f2(q); sp.style.filter = `blur(${f2((1 - e) * 10)}px)`; sp.style.transform = `translateY(${f2((1 - e) * 24)}px)`;
      });
      const nameEnd = .45 + [...String(s.name || '')].length * .07 + .3;
      const rq = eOutCubic(prog(lt, nameEnd, .45)); n.querySelector('.bc-rule').style.width = f2(rq * 120) + 'px';
      const yr = n.querySelector('.bc-years'); if (yr) { const yq = prog(lt, nameEnd + .15, .4); yr.style.opacity = f2(yq); yr.style.transform = `translateY(${f2((1 - yq) * 12)}px)`; }
      if (stops.length) {
        const y0 = 260, y1 = 760, yAt = i => stops.length > 1 ? lerp(y0, y1, i / (stops.length - 1)) : (y0 + y1) / 2;
        const tq = eOutCubic(prog(lt, .2, .6));
        const tr = n.querySelector('.bc-track'); tr.setAttribute('y1', y0); tr.setAttribute('y2', f2(lerp(y0, y1, tq)));
        const dq = eInOut(prog(lt, .6, .8)), dn = n.querySelector('.bc-done');
        dn.setAttribute('y1', y0); dn.setAttribute('y2', f2(lerp(y0, yAt(cur), dq))); dn.style.visibility = cur > 0 && dq > 0 ? '' : 'hidden';
        n.querySelectorAll('.bc-dot').forEach((d, i) => {
          const q = prog(lt, .25 + i * .1, .3), past = i < cur, isCur = i === cur, lit = past || (isCur && lt >= .6 + .8 * (cur / Math.max(1, stops.length - 1)));
          d.setAttribute('cy', f2(yAt(i))); d.setAttribute('fill', lit ? (isCur ? RED : '#fff') : '#fff'); d.setAttribute('stroke', lit || past ? RED : '#CFC6B4');
          d.setAttribute('r', f2((isCur ? 22 : 15) * lerp(.3, 1, eOutBack(q, 1.8)))); d.style.opacity = f2(clamp(q * 3, 0, 1));
        });
        const rg = n.querySelector('.bc-ring'), rq2 = prog(lt, 1.5, .9);
        rg.setAttribute('cy', f2(yAt(cur))); rg.setAttribute('r', f2(lerp(22, 46, eOutCubic(rq2)))); rg.style.opacity = f2(rq2 > 0 && rq2 < 1 ? (1 - rq2) * .8 : 0);
        n.querySelectorAll('.bc-stop').forEach((el, i) => { const q = prog(lt, .35 + i * .1, .35); el.style.top = f2(yAt(i)) + 'px'; el.style.opacity = f2(q * (i === cur ? 1 : .85)); });
      }
    },
    win: s => { const a = delayOf(s), L = [...String(s.name || '')].length; return [[a, a + Math.max(2.5, .45 + L * .07 + 1.3)]]; }
  };

  /* =====================================================================
     songtitle —— 宋体大标题：背景虚化压淡（scrim）→ 逐字由大到正 → 红短线 → 副标题
     spec: text（支持 **红字**）, sub, tx, ty（标题框左上）, tw（居中用的宽度）, size=120, scrim=true, delay, stagger=.08
     ===================================================================== */
  CH.songtitle = FX.types.songtitle = {
    build(s) {
      const chars = []; let red = false; const a = [...String(s.text || '')];
      for (let i = 0; i < a.length; i++) { if (a[i] === '*' && a[i + 1] === '*') { red = !red; i++; continue; } chars.push({ ch: a[i], red }); }
      return `<div class="fx-stitle">${s.scrim === false ? '' : '<div class="st-scrim"></div>'}` +
        `<div class="st-text" style="font-size:${s.size || 120}px">${chars.map(c => `<span${c.red ? ' class="red"' : ''}>${esc(c.ch)}</span>`).join('')}</div>` +
        `<div class="st-rule"></div>${s.sub ? `<div class="st-sub">${rich(s.sub)}</div>` : ''}</div>`;
    },
    update(n, s, p, tau, c) {
      full(n);
      const lt = c.lt - delayOf(s), sc = n.querySelector('.st-scrim'), tx = n.querySelector('.st-text'), sz = s.size || 120;
      if (sc) sc.style.opacity = f2(eOutCubic(clamp(lt / .5, 0, 1)));
      const W = s.tw || 1620, X = s.tx == null ? 150 : s.tx, Y = s.ty == null ? 330 : s.ty;
      const tw = tx.scrollWidth; tx.style.left = f2(X + (W - tw) / 2) + 'px'; tx.style.top = f2(Y) + 'px';
      const spans = tx.querySelectorAll('span'), stg = s.stagger || .08;
      spans.forEach((sp, i) => { const q = prog(lt, .2 + i * stg, .45), e = eOutCubic(q);
        sp.style.opacity = f2(q); sp.style.transform = `scale(${lerp(1.5, 1, e).toFixed(4)})`; sp.style.filter = `blur(${f2((1 - e) * 8)}px)`; });
      const endT = .2 + spans.length * stg + .3, rq = eOutCubic(prog(lt, endT, .4)), rule = n.querySelector('.st-rule');
      rule.style.width = f2(rq * 140) + 'px'; rule.style.left = f2(X + (W - 140) / 2) + 'px'; rule.style.top = f2(Y + sz * 1.22) + 'px';
      const sub = n.querySelector('.st-sub');
      if (sub) { const q = prog(lt, endT + .2, .4); sub.style.opacity = f2(q); const swd = sub.scrollWidth;
        sub.style.left = f2(X + (W - swd) / 2) + 'px'; sub.style.top = f2(Y + sz * 1.22 + 40 + (1 - q) * 12) + 'px'; }
    },
    win: s => { const a = delayOf(s), L = [...String(s.text || '').replace(/\*\*/g, '')].length; return [[a, a + .2 + L * (s.stagger || .08) + 1.2]]; }
  };

  /* =====================================================================
     maptint —— 年代滤色：整屏叠一层颜色（正片叠底），按关键帧淡入淡出。讲江户、明治时地图泛黄变旧，回到今天褪掉。
     spec: keys:[{at, color='#C9A46A', alpha=.35, dur=.8}]（alpha=0 = 褪掉）
     ===================================================================== */
  CH.maptint = FX.types.maptint = {
    build(s) { return `<div style="position:absolute;inset:0;mix-blend-mode:multiply;"></div><div class="mt-grain" style="position:absolute;inset:0;background:url(assets/paper-light.png) 0 0/1920px 1008px;mix-blend-mode:multiply;"></div>`; },
    update(n, s, p, tau, c) {
      full(n);
      const lt = c.lt, ks = s.keys || [], L = n.firstChild, G = n.lastChild;
      let col = (ks[0] && ks[0].color) || '#C9A46A', a = 0;
      ks.forEach(k => { const q = eInOut(prog(lt, k.at, k.dur || .8)); if (q > 0) { a = lerp(a, k.alpha == null ? .35 : k.alpha, q); if (k.color) col = k.color; } });
      L.style.background = col; L.style.opacity = f2(a); G.style.opacity = f2(a * 1.2);
    },
    win: s => (s.keys || []).map(k => [k.at, k.at + (k.dur || .8)])
  };

  /* =====================================================================
     mapflow —— 圆点沿路线流动（客流/列车示意）：每条路径 n 个点，按弧长匀速前进，循环
     spec: ref, paths:[{pts（底图像素）, at, hideAt, n=10, period=4（一个点走完全程秒数）, color, r=7, reverse}]
     ===================================================================== */
  CH.mapflow = FX.types.mapflow = {
    build(s) {
      let h = `<svg class="fxm-svg" width="1920" height="1008">`;
      (s.paths || []).forEach(P => { for (let i = 0; i < (P.n || 10); i++) h += `<circle class="mf-d" r="${P.r || 7}" fill="${P.color || '#FFD24A'}" stroke="#111" stroke-width="2"/>`; });
      return h + `</svg>`;
    },
    update(n, s, p, tau, c) {
      full(n);
      const lt = c.lt, ds = n.querySelectorAll('.mf-d'); let k = 0;
      (s.paths || []).forEach(P => {
        const at = P.at == null ? delayOf(s) : P.at, N = P.n || 10, per = P.period || 4;
        const Q = P.pts.map(pt => mapPt(s, lt, pt)), L = [0];
        for (let i = 1; i < Q.length; i++) L.push(L[i - 1] + Math.hypot(Q[i][0] - Q[i - 1][0], Q[i][1] - Q[i - 1][1]));
        const tot = L[L.length - 1] || 1;
        let op = clamp((lt - at) / .4, 0, 1); if (P.hideAt != null) op *= 1 - prog(lt, P.hideAt, .4);
        for (let i = 0; i < N; i++) {
          const d = ds[k++]; let f = ((Math.max(0, lt - at) / per) + i / N) % 1; if (P.reverse) f = 1 - f;
          const target = f * tot; let j = 1; while (j < L.length - 1 && L[j] < target) j++;
          const u = (target - L[j - 1]) / Math.max(1e-6, L[j] - L[j - 1]);
          d.setAttribute('cx', f2(lerp(Q[j - 1][0], Q[j][0], u))); d.setAttribute('cy', f2(lerp(Q[j - 1][1], Q[j][1], u)));
          const edge = Math.min(f, 1 - f) * 12; d.style.opacity = f2(op * clamp(edge, 0, 1));
        }
      });
    },
    win: (s, D) => (s.paths || []).map(P => [P.at == null ? delayOf(s) : P.at, P.hideAt != null ? P.hideAt + .45 : D])
  };

  /* =====================================================================
     mapimage —— 老地图/图片按三个角的底图像素原位贴到底图上（仿射），跟着推镜走，按关键帧调透明度
     spec: ref, src, iw, ih, corners:{tl:[x,y], tr:[x,y], bl:[x,y]}（底图像素）, keys:[{at, alpha, dur}]
     ===================================================================== */
  CH.mapimage = FX.types.mapimage = {
    build(s) { return `<div class="fx-mapimg"><img src="${esc(s.src)}" alt=""></div>`; },
    update(n, s, p, tau, c) {
      full(n);
      const lt = c.lt, img = n.querySelector('img');
      const A = mapPt(s, lt, s.corners.tl), B = mapPt(s, lt, s.corners.tr), Cc = mapPt(s, lt, s.corners.bl);
      img.style.width = s.iw + 'px';
      const a = (B[0] - A[0]) / s.iw, b = (B[1] - A[1]) / s.iw, cc = (Cc[0] - A[0]) / s.ih, d = (Cc[1] - A[1]) / s.ih;
      img.style.transform = `matrix(${a.toFixed(6)},${b.toFixed(6)},${cc.toFixed(6)},${d.toFixed(6)},${f2(A[0])},${f2(A[1])})`;
      let al = 0; (s.keys || []).forEach(k => { const q = eInOut(prog(lt, k.at, k.dur || .8)); al = lerp(al, k.alpha, q); });
      n.style.opacity = f2(al);
    },
    win: s => (s.keys || []).map(k => [k.at, k.at + (k.dur || .8)]).concat(refWins(s))
  };

  /* =====================================================================
     chapterover —— 章节标题叠在地图上：左下飘来纸色渐变 + 超大衬线数字 + 小字站号 + 章名 + 年代（学 Wendao 章节，不另起一页）
     spec: numeral（一/二…）, kicker（第一站）, name, years, delay；退场用 hideAt
     ===================================================================== */
  CH.chapterover = FX.types.chapterover = {
    build(s) { return `<div class="fx-chov"><div class="co-bg"></div><div class="co-no">${esc(s.numeral || '')}</div><div class="co-k">${esc(s.kicker || '')}</div>` +
      `<div class="co-name">${esc(s.name || '')}</div>${s.years ? `<div class="co-y">${esc(s.years)}</div>` : ''}</div>`; },
    update(n, s, p, tau, c) {
      full(n);
      const lt = c.lt - delayOf(s), bg = n.querySelector('.co-bg'), q0 = eOutCubic(clamp(lt / .5, 0, 1));
      bg.style.opacity = f2(q0); bg.style.transform = `translate(${f2((1 - q0) * -120)}px,${f2((1 - q0) * 60)}px)`;
      const no = n.querySelector('.co-no'), q1 = eOutCubic(prog(lt, .15, .55));
      no.style.opacity = f2(q1); no.style.filter = `blur(${f2((1 - q1) * 12)}px)`; no.style.transform = `scale(${lerp(1.12, 1, q1).toFixed(4)})`;
      [['.co-k', .45], ['.co-name', .6], ['.co-y', .85]].forEach(([sel, a]) => { const el = n.querySelector(sel); if (!el) return;
        const q = eOutCubic(prog(lt, a, .45)); el.style.opacity = f2(q); el.style.transform = `translateX(${f2((1 - q) * 30)}px)`; });
    },
    win: s => [[delayOf(s), delayOf(s) + 1.4]]
  };
})();
