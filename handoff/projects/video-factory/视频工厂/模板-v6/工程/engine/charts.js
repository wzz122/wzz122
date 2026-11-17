/* =========================================================================
   图表引擎：用 SVG 画数据图 / 概念图 / 界面复刻
   每种图都有两个方法：
     build(spec)          -> 生成 HTML（一次性）
     update(node,spec,p)  -> 按进度 p(0~1) 更新（每帧调用，所以能做「逐段画出来」）
   ========================================================================= */
(function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const rich = s => esc(s)
    .replace(/==(.+?)==/g, '<tspan class="hl-t">$1</tspan>')
    .replace(/\*\*(.+?)\*\*/g, '<tspan class="red-t">$1</tspan>');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = p => 1 - Math.pow(1 - p, 3);
  // 把一组元素按进度依次点亮：返回第 i 个的局部进度
  const stagger = (p, i, n, overlap = 0.45) => {
    const step = 1 / Math.max(1, n - overlap * (n - 1));
    const st = i * step * (1 - overlap);
    return clamp((p - st) / step, 0, 1);
  };
  const nice = v => v >= 10000 ? (v / 10000).toFixed(1) + '万' : String(v);

  /* ---------------- 折线图：逐段画出来 ---------------- */
  const line = {
    build(s) {
      // 批注项（可选，写在数据项后面）：图题：文字 ｜ 竖线：数据键=标签 ｜ 横线：数值=标签 ｜ 箭头：数据键=标签 ｜ 大字：文字
      const ann = [], data = [];
      s.items.forEach(x => { const m = x.match(/^(图题|竖线|横线|箭头|大字)\s*[:：]\s*(.+)$/); m ? ann.push([m[1], m[2]]) : data.push(x); });
      const pts = data.map(x => { const [k, v] = x.split(/\s*[:：]\s*/); return { k, v: +v }; });
      const W = s.w || 1180, H = s.h || 520, PL = 150, PR = 70, PT = 86, PB = 60;
      const max = Math.max(...pts.map(p => p.v)) * 1.12, min = 0;
      const X = i => PL + (W - PL - PR) * (pts.length > 1 ? i / (pts.length - 1) : .5);
      const Y = v => PT + (H - PT - PB) * (1 - (v - min) / (max - min));
      const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.v).toFixed(1)}`).join('');
      const ticks = [0, .25, .5, .75, 1].map(f => Math.round(max * f));
      let g = '';
      ticks.forEach(t => { const y = Y(t); g += `<line class="grid" x1="${PL - 14}" y1="${y}" x2="${W - PR}" y2="${y}"/>` +
        `<text class="ax" x="${PL - 26}" y="${y + 7}" text-anchor="end">${t ? nice(t) : ''}</text>`; });
      let nodes = '';
      pts.forEach((p, i) => {
        const isLast = i === pts.length - 1;
        nodes += `<g class="pt" data-i="${i}">` +
          `<circle cx="${X(i)}" cy="${Y(p.v)}" r="${isLast ? 11 : 8}" fill="${isLast ? 'var(--red)' : 'var(--ink)'}"/>` +
          `<text class="val ${isLast ? 'big' : ''}" x="${i === 0 ? X(i) + 10 : X(i)}" y="${Y(p.v) - (isLast ? 30 : 24)}" ` +
          `text-anchor="${i === 0 ? 'start' : 'middle'}">${esc(nice(p.v))}</text>` +
          `<text class="ax" x="${X(i)}" y="${H - PB + 34}" text-anchor="middle">${esc(p.k)}</text></g>`;
      });
      let extra = '', cap = s.label || '';
      const kv = t => { const a = t.split(/\s*[=＝]\s*/); return [a[0], a.slice(1).join('=')]; };
      const at = i => pts.length > 1 ? (i / (pts.length - 1)) * 0.88 : 0;   // 折线画到第 i 个点时的进度（与 update 里一致）
      // 大字放在左上空处：有横线时贴在横线上方（放不下就放到横线下方）
      const hl = ann.find(([k]) => k === '横线'), hy = hl ? Y(+kv(hl[1])[0]) : null;
      const bigY = hy == null ? PT + 140 : (hy >= 176 ? hy - 22 : hy + 150);
      ann.forEach(([kind, val]) => {
        if (kind === '图题') { cap = val; return; }
        if (kind === '大字') {
          extra += `<text class="an anbig" data-at="0.84" x="${PL + 60}" y="${bigY}">${esc(val)}</text>`; return;
        }
        const [k, lb] = kv(val);
        if (kind === '横线') {
          const y = Y(+k);
          extra += `<g class="an" data-at="0.02"><line class="dash" x1="${PL - 14}" y1="${y}" x2="${W - PR}" y2="${y}"/>` +
            (lb ? `<text class="anlb" x="${PL + 10}" y="${y + 38}">${esc(lb)}</text>` : '') + `</g>`; return;
        }
        const i = pts.findIndex(q => q.k === k); if (i < 0) return;
        const x = X(i), yL = Y(pts[i].v);
        if (kind === '竖线') {
          extra += `<g class="an" data-at="${at(i).toFixed(3)}"><line class="dash" x1="${x}" y1="${PT - 30}" x2="${x}" y2="${H - PB}"/>` +
            (lb ? `<text class="anlb" x="${x - 14}" y="${PT - 6}" text-anchor="end">${esc(lb)}</text>` : '') + `</g>`;
        } else {                                              // 箭头：从折线下方起笔，向右上甩出去
          const y0 = Math.min(H - PB - 64, yL + 130), y1 = Math.max(PT - 44, yL - 200), x0 = x + 26, x1 = x + 178;
          const ang = Math.atan2(y1 - (yL - 96), x1 - (x0 + 64)) * 180 / Math.PI;
          extra += `<g class="an" data-at="${Math.min(.9, at(i) + .04).toFixed(3)}" data-arrow="1">` +
            `<path class="arw" d="M${x0},${y0} C${x0 - 6},${yL + 10} ${x0 + 64},${yL - 96} ${x1},${y1}" fill="none"/>` +
            `<path class="arwh" transform="translate(${x1},${y1}) rotate(${ang.toFixed(1)})" d="M8,0 L-16,-11 L-10,0 L-16,11 Z"/>` +
            (lb ? `<text class="anlb red-t" x="${x0 + 28}" y="${Math.min(H - PB - 16, y0 + 52)}">${esc(lb)}</text>` : '') + `</g>`;
        }
      });
      return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
        ${cap ? `<text class="cap" x="${PL}" y="34">${esc(cap)}</text>` : ''}
        ${g}${extra}<path class="ln" d="${d}" fill="none"/>${nodes}</svg>`;
    },
    update(n, s, p) {
      const path = n.querySelector('.ln'); if (!path) return;
      const L = path.getTotalLength ? path.getTotalLength() : 1000;
      const e = ease(clamp(p, 0, 1));
      path.style.strokeDasharray = L; path.style.strokeDashoffset = L * (1 - e);
      const pts = n.querySelectorAll('.pt'), N = pts.length;
      pts.forEach((g, i) => {
        const at = N > 1 ? (i / (N - 1)) * 0.88 : 0;    // 留出余量，最后一个点也要露出来
        const q = clamp((e - at) / 0.07, 0, 1);
        g.style.opacity = q; g.style.transform = `translateY(${(1 - q) * 10}px)`;
      });
      n.querySelectorAll('.grid,.ax,.cap').forEach(x => x.style.opacity = clamp(p * 4, 0, 1));
      n.querySelectorAll('.an').forEach(g => {                // 批注：折线画到它那里才出现；箭头跟着画出来
        const q = clamp((e - (+g.dataset.at || 0)) / 0.1, 0, 1);
        g.style.opacity = clamp(q * 2.5, 0, 1);
        if (g.dataset.arrow) {
          const a = g.querySelector('.arw'), h = g.querySelector('.arwh'), lb = g.querySelector('.anlb');
          const La = a.getTotalLength ? a.getTotalLength() : 400;
          a.style.strokeDasharray = La; a.style.strokeDashoffset = La * (1 - ease(q));
          h.style.opacity = q > .92 ? 1 : 0; if (lb) lb.style.opacity = clamp((q - .5) * 2, 0, 1);
        }
      });
    }
  };

  /* ---------------- 方块图：一格格填色 ---------------- */
  const waffle = {
    build(s) {
      const pct = Math.max(0, Math.min(100, Math.round(+s.items[0])));
      const W = s.w || 760, H = 760, C = 10, gap = 10, cell = (W - gap * (C - 1)) / C;
      let cells = '';
      for (let i = 0; i < 100; i++) {
        const r = Math.floor(i / C), c = i % C;
        cells += `<rect class="cell" data-i="${i}" x="${c * (cell + gap)}" y="${r * (cell + gap)}" ` +
          `width="${cell}" height="${cell}" rx="3"/>`;
      }
      return `<svg class="chart waffle" viewBox="0 0 ${W} ${W}" width="${W}" height="${W}" data-pct="${pct}">${cells}</svg>`;
    },
    update(n, s, p) {
      const svg = n.querySelector('svg') || n;
      const pct = +svg.dataset.pct || 0;
      const shown = Math.round(ease(clamp(p, 0, 1)) * pct);
      n.querySelectorAll('.cell').forEach((c, i) => {
        c.setAttribute('fill', i < shown ? 'var(--red)' : 'rgba(120,110,92,.22)');
        c.style.opacity = i < shown ? 1 : clamp(p * 3, 0, 1) * .9;
      });
    }
  };

  /* ---------------- 柱状图：逐条生长 ---------------- */
  const bars = {
    build(s) {
      // 值可以是区间（如「4–12」）：实心画到下限，下限到上限半透明，标签照原样写
      const pts = s.items.map(x => {
        const [k, v] = x.split(/\s*[:：]\s*/);
        const r = String(v).match(/^\s*([\d.]+)\s*[–—\-~～至]\s*([\d.]+)\s*$/);
        return r ? { k, lo: +r[1], v: +r[2], raw: v.trim() } : { k, v: +v, raw: null };
      });
      const W = s.w || 1180, H = s.h || 500, PB = 66, PT = 56;
      const max = Math.max(...pts.map(p => p.v)) * 1.15;
      const bw = (W / pts.length) * 0.46, gap = W / pts.length;
      let g = '';
      pts.forEach((p, i) => {
        const h = (H - PB - PT) * (p.v / max), x = i * gap + (gap - bw) / 2, y = H - PB - h;
        const hl = p.lo != null ? (H - PB - PT) * (p.lo / max) : h;
        const col = i === pts.length - 1 ? 'var(--red)' : 'rgba(60,54,44,.72)';
        g += `<g class="br" data-i="${i}" data-base="${H - PB}" data-lo="${hl}" data-tot="${h}">` +
          `<rect class="b0" x="${x}" y="${H - PB - hl}" width="${bw}" height="${hl}" fill="${col}"/>` +
          (p.lo != null ? `<rect class="b1" x="${x}" y="${y}" width="${bw}" height="${h - hl}" fill="${col}" fill-opacity=".38"/>` : '') +
          `<text class="val" x="${x + bw / 2}" y="${y - 18}" text-anchor="middle">${esc(p.raw || nice(p.v))}</text>` +
          `<text class="ax" x="${x + bw / 2}" y="${H - PB + 38}" text-anchor="middle">${esc(p.k)}</text></g>`;
      });
      return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
        <line class="grid" x1="0" y1="${H - PB}" x2="${W}" y2="${H - PB}"/>${g}</svg>`;
    },
    update(n, s, p) {
      const gs = n.querySelectorAll('.br');
      gs.forEach((g, i) => {
        const q = ease(stagger(clamp(p, 0, 1), i, gs.length));
        const base = +g.dataset.base, lo = +g.dataset.lo, tot = +g.dataset.tot, G = tot * q;
        const b0 = g.querySelector('.b0'), b1 = g.querySelector('.b1');
        const h0 = Math.min(G, lo); b0.setAttribute('height', h0); b0.setAttribute('y', base - h0);
        if (b1) { const h1 = Math.max(0, G - lo); b1.setAttribute('height', h1); b1.setAttribute('y', base - lo - h1); }
        g.querySelector('.val').style.opacity = q > .96 ? 1 : 0;
        g.querySelector('.ax').style.opacity = clamp(p * 3, 0, 1);
      });
    }
  };

  /* ---------------- 流程图：箭头顺着生长 ---------------- */
  /* 竖屏流程图：pair = 两两一行「左 → 右」（问/答、原因/结果）；col = 一格格往下 */
  const vlen = t => [...String(t)].reduce((a, c) => a + (/[\x00-\x7f]/.test(c) ? 0.56 : 1), 0);
  function flowV(s) {
    const n = s.items.length, W = s.w || 920, pair = s.v === 'pair';
    let g = '', H;
    if (pair) {
      const rows = n / 2, aw = 70, bw = (W - aw) / 2, bh = s.bh || 96, gap = s.gap == null ? 34 : s.gap;   // 横屏两两成行用矮一点的格子
      const fs = Math.min(40, Math.floor((bw - 32) / Math.max(...s.items.map(vlen))));
      H = rows * bh + (rows - 1) * gap;
      for (let r = 0; r < rows; r++) {
        const y = r * (bh + gap), cy = y + bh / 2;
        [0, 1].forEach(c => {
          const i = r * 2 + c, x = c ? bw + aw : 0, last = i === n - 1;
          g += `<g class="st" data-i="${i}"><rect x="${x}" y="${y}" width="${bw}" height="${bh}" fill="${c ? 'rgba(255,252,244,.55)' : 'none'}" ` +
            `stroke="${last ? 'var(--red)' : 'rgba(60,54,44,.55)'}" stroke-width="${last ? 3 : 2}"/>` +
            `<text class="bt ${last ? 'red-t' : ''}" style="font-size:${fs}px" x="${x + bw / 2}" y="${cy + fs * .36}" text-anchor="middle">${esc(s.items[i])}</text></g>`;
        });
        g += `<g class="ar" data-i="${r * 2}"><line x1="${bw + 12}" y1="${cy}" x2="${bw + aw - 18}" y2="${cy}" stroke="var(--red)" stroke-width="2.5"/>` +
          `<path d="M${bw + aw - 10},${cy} l-11,-7 l0,14 z" fill="var(--red)"/></g>`;
      }
    } else {
      const bh = 100, gap = 60, top = 34;
      const fs = Math.min(40, Math.floor((W - 48) / Math.max(...s.items.map(vlen))));
      H = top + n * bh + (n - 1) * gap;
      s.items.forEach((t, i) => {
        const y = top + i * (bh + gap), last = i === n - 1;
        g += `<g class="st" data-i="${i}"><text class="step" x="2" y="${y - 12}">STEP 0${i + 1}</text>` +
          `<rect x="0" y="${y}" width="${W}" height="${bh}" fill="none" stroke="${last ? 'var(--red)' : 'rgba(60,54,44,.55)'}" stroke-width="${last ? 3 : 2}"/>` +
          `<text class="bt ${last ? 'red-t' : ''}" style="font-size:${fs}px" x="${W / 2}" y="${y + bh / 2 + fs * .36}" text-anchor="middle">${esc(t)}</text></g>`;
        if (!last) g += `<g class="ar" data-i="${i}"><line x1="${W / 2}" y1="${y + bh + 8}" x2="${W / 2}" y2="${y + bh + gap - 16}" stroke="var(--red)" stroke-width="2.5"/>` +
          `<path d="M${W / 2},${y + bh + gap - 6} l-7,-11 l14,0 z" fill="var(--red)"/></g>`;
      });
    }
    return `<svg class="chart" data-v="${s.v}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${g}</svg>`;
  }

  const flow = {
    build(s) {
      if (s.v === 'pair' || s.v === 'col') return flowV(s);
      const n = s.items.length, W = s.w || 1560, H = 240;
      const bw = (W - 62 * (n - 1)) / n, bh = 104, y = 76;
      let g = '';
      s.items.forEach((t, i) => {
        const x = i * (bw + 62), last = i === n - 1;
        g += `<g class="st" data-i="${i}">` +
          `<text class="step" x="${x}" y="${y - 22}">STEP 0${i + 1}</text>` +
          `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" fill="none" ` +
          `stroke="${last ? 'var(--red)' : 'rgba(60,54,44,.55)'}" stroke-width="${last ? 3 : 2}"/>` +
          `<text class="bt ${last ? 'red-t' : ''}" x="${x + bw / 2}" y="${y + bh / 2 + 16}" text-anchor="middle">${esc(t)}</text></g>`;
        if (!last) g += `<g class="ar" data-i="${i}"><line x1="${x + bw + 12}" y1="${y + bh / 2}" x2="${x + bw + 46}" y2="${y + bh / 2}" ` +
          `stroke="var(--red)" stroke-width="2.5"/><path d="M${x + bw + 46},${y + bh / 2} l-9,-6 l0,12 z" fill="var(--red)"/></g>`;
      });
      return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${g}</svg>`;
    },
    update(n, s, p) {
      const st = n.querySelectorAll('.st'), ar = n.querySelectorAll('.ar');
      const svg = n.querySelector('svg'), col = svg && svg.dataset.v === 'col', vert = svg && !!svg.dataset.v;
      st.forEach((g, i) => {
        const q = ease(stagger(clamp(p, 0, 1), i, st.length, .35));
        g.style.opacity = q; g.style.transform = col ? `translateY(${(1 - q) * -14}px)` : `translateX(${(1 - q) * -18}px)`;
      });
      ar.forEach((g, i) => {
        const k = g.dataset.i != null ? +g.dataset.i : i;       // 箭头跟在它左边那一格后面亮起（两两成行时第 r 行箭头的 data-i 是 2r；原来按箭头序号 i 算，后几行箭头比格子先出现）
        const q = ease(stagger(clamp(p, 0, 1), k + .55, st.length, .35));
        g.style.opacity = q;
        if (vert) g.style.transformBox = 'fill-box';           // 竖屏：以箭头自身为原点生长
        g.style.transformOrigin = col ? 'center top' : 'left center';
        g.style.transform = col ? `scaleY(${.2 + .8 * q})` : `scaleX(${.2 + .8 * q})`;
      });
    }
  };

  /* ---------------- 靶心：一圈圈往外扩散 ---------------- */
  const target = {
    build(s) {
      const S = s.w || 620, c = S / 2, rings = 4;
      let g = '';
      for (let i = rings; i >= 1; i--) g += `<circle class="rg" data-i="${rings - i}" cx="${c}" cy="${c}" r="${(S / 2 - 24) * i / rings}" ` +
        `fill="none" stroke="rgba(55,48,38,.78)" stroke-width="3.2"/>`;
      g += `<circle class="core" cx="${c}" cy="${c}" r="${S * .10}" fill="rgba(178,58,37,.22)"/>`;
      g += `<path class="fig" transform="translate(${c},${c})" fill="var(--red)" d="M0,-42 a10,10 0 1,1 0,20 a10,10 0 1,1 0,-20 M-13,-19 h26 v29 h-9 v29 h-8 v-29 h-9 z"/>`;
      if (s.label) g += `<text class="cap red-t" x="${c}" y="${S - 2}" text-anchor="middle">${esc(s.label)}</text>`;
      return `<svg class="chart" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">${g}</svg>`;
    },
    update(n, s, p) {
      const e = ease(clamp(p, 0, 1));
      const core = n.querySelector('.core'), fig = n.querySelector('.fig');
      if (core) core.style.opacity = clamp(e * 3, 0, 1);
      if (fig) { fig.style.opacity = clamp(e * 3, 0, 1); fig.style.transform = fig.getAttribute('transform') + ` scale(${.7 + .3 * clamp(e * 3, 0, 1)})`; }
      const rg = n.querySelectorAll('.rg');
      rg.forEach((c, i) => {
        const q = ease(stagger(e, i, rg.length, .3));
        c.style.opacity = q; c.style.transformOrigin = 'center';
        c.style.transform = `scale(${.55 + .45 * q})`;
      });
      const cap = n.querySelector('.cap'); if (cap) cap.style.opacity = clamp((e - .75) * 4, 0, 1);
    }
  };

  /* ---------------- 汇聚图：多条线汇成一点，再往下 ---------------- */
  const converge = {
    build(s) {
      const tops = (s.items[0] || '').split(/\s*[、,，]\s*/).filter(Boolean);
      const mid = s.items[1] || '', bot = s.items[2] || '';
      const W = s.w || 1000, H = 560, tw = 190, th = 68;
      const gap = (W - tw * tops.length) / (tops.length + 1);
      const mx = W / 2, my = 210, mw = 380, mh = 84;
      let g = '';
      tops.forEach((t, i) => {
        const x = gap + i * (tw + gap);
        g += `<g class="tp" data-i="${i}"><rect x="${x}" y="30" width="${tw}" height="${th}" fill="none" stroke="rgba(60,54,44,.55)" stroke-width="2"/>` +
          `<text class="bt2" x="${x + tw / 2}" y="${30 + th / 2 + 12}" text-anchor="middle">${esc(t)}</text></g>` +
          `<path class="lk" data-i="${i}" d="M${x + tw / 2},${30 + th} L${mx},${my}" stroke="var(--red)" stroke-width="2" fill="none"/>`;
      });
      g += `<g class="md"><rect x="${mx - mw / 2}" y="${my}" width="${mw}" height="${mh}" fill="none" stroke="var(--red)" stroke-width="2.5"/>` +
        `<text class="bt red-t" x="${mx}" y="${my + mh / 2 + 15}" text-anchor="middle">${esc(mid)}</text></g>`;
      g += `<path class="dn" d="M${mx},${my + mh} L${mx},${my + mh + 84}" stroke="var(--red)" stroke-width="2.5" fill="none"/>` +
        `<path class="dh" d="M${mx},${my + mh + 84} l-7,-11 l14,0 z" fill="var(--red)"/>`;
      g += `<g class="bt3"><rect x="${mx - 170}" y="${my + mh + 96}" width="340" height="112" fill="none" stroke="rgba(60,54,44,.7)" stroke-width="2.5"/>` +
        `<text class="big2" x="${mx}" y="${my + mh + 160}" text-anchor="middle">${esc(bot)}</text></g>`;
      return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${g}</svg>`;
    },
    update(n, s, p) {
      const e = ease(clamp(p, 0, 1));
      n.querySelectorAll('.tp').forEach((g, i) => {
        const q = ease(stagger(e, i, 3, .4)); g.style.opacity = q;
        g.style.transform = `translateY(${(1 - q) * -14}px)`;
      });
      n.querySelectorAll('.lk').forEach((g, i) => {
        const q = clamp((e - .28) / .22, 0, 1); const L = g.getTotalLength ? g.getTotalLength() : 300;
        g.style.strokeDasharray = L; g.style.strokeDashoffset = L * (1 - q);
      });
      const md = n.querySelector('.md'); if (md) { const q = clamp((e - .46) / .18, 0, 1); md.style.opacity = q; md.style.transform = `scale(${.94 + .06 * q})`; md.style.transformOrigin = 'center'; }
      const dn = n.querySelector('.dn'); if (dn) { const q = clamp((e - .66) / .16, 0, 1); const L = dn.getTotalLength ? dn.getTotalLength() : 90; dn.style.strokeDasharray = L; dn.style.strokeDashoffset = L * (1 - q); }
      const dh = n.querySelector('.dh'); if (dh) dh.style.opacity = clamp((e - .8) / .1, 0, 1);
      const b3 = n.querySelector('.bt3'); if (b3) { const q = clamp((e - .82) / .18, 0, 1); b3.style.opacity = q; b3.style.transform = `translateY(${(1 - q) * 12}px)`; }
    }
  };

  /* ---------------- 下坠：小人往下掉，刻度一格格过 ---------------- */
  const drop = {
    build(s) {
      const marks = s.items.slice(1);
      const W = s.w || 620, H = s.h || 620;
      let g = `<line class="grid" x1="${W * .34}" y1="20" x2="${W * .34}" y2="${H - 20}" stroke-dasharray="6 8"/>`;
      marks.forEach((m, i) => {
        const y = 60 + (H - 120) * (i + 1) / marks.length;
        g += `<g class="mk" data-i="${i}"><line x1="${W * .40}" y1="${y}" x2="${W * .46}" y2="${y}" stroke="rgba(55,48,38,.7)" stroke-width="2.6"/>` +
          `<text class="ax2" x="${W * .50}" y="${y + 9}">${esc(m)}</text></g>`;
      });
      g += `<path class="fig" fill="var(--ink)" d="M0,-36 a9,9 0 1,1 0,18 a9,9 0 1,1 0,-18 M-12,-17 h24 v26 h-8 v26 h-8 v-26 h-8 z"/>`;
      return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" data-w="${W}" data-h="${H}">${g}</svg>`;
    },
    update(n, s, p) {
      const svg = n.querySelector('svg') || n;
      const W = +svg.dataset.w, H = +svg.dataset.h;
      const e = clamp(p, 0, 1), y = 50 + (H - 110) * e * e;   // 加速下落
      const fig = n.querySelector('.fig');
      if (fig) { fig.setAttribute('transform', `translate(${W * .34},${y})`); fig.style.opacity = clamp(p * 6, 0, 1); }
      const mk = n.querySelectorAll('.mk');
      mk.forEach((g, i) => { g.style.opacity = clamp((e * e - (i) / mk.length) * 6, 0, 1); });
    }
  };

  /* ---------------- 界面复刻：热搜榜 ---------------- */
  const trend = {
    build(s) {
      // 竖屏（s.v）：词条一行、括号里的中文释义另起一行小字，免得长释义折行后剩一两个字
      const tx = t => {
        const m = s.v && t.match(/^==(.+?)==\s*[（(](.+)[）)]$/);
        return m ? `<em>${esc(m[1])}</em><small>${esc(m[2])}</small>` : esc(t).replace(/==(.+?)==/g, '<em>$1</em>');
      };
      let rows = s.items.map((t, i) => `<div class="tr" data-i="${i}"><span class="ic">⌕</span>` +
        `<span class="tx">${tx(t)}</span><span class="bd">热搜</span></div>`).join('');
      return `<div class="trendbox">${rows}</div>`;
    },
    update(n, s, p) {
      const rs = n.querySelectorAll('.tr');
      rs.forEach((r, i) => {
        const q = ease(stagger(clamp(p, 0, 1), i, rs.length, .4));
        r.style.opacity = q; r.style.transform = `translateX(${(1 - q) * -22}px)`;
      });
    }
  };

  /* ---------------- 界面复刻：公文 ---------------- */
  const doc = {
    build(s) {
      const [title, body, sign, date] = s.items;
      const paras = (body || '').split(/\s*\/\/\s*/).map(x => `<p>${esc(x)}</p>`).join('');
      return `<div class="docbox"><div class="dt">${esc(title || '')}</div><div class="db">${paras}</div>` +
        `<div class="ds">${esc(sign || '')}</div><div class="dd">${esc(date || '')}</div></div>`;
    },
    update(n, s, p) {
      const e = ease(clamp(p, 0, 1));
      const box = n.querySelector('.docbox'); if (box) { box.style.opacity = clamp(p * 3, 0, 1); box.style.transform = `translateY(${(1 - e) * 26}px)`; }
      const parts = n.querySelectorAll('.dt,.db p,.ds,.dd');
      parts.forEach((x, i) => { x.style.opacity = ease(stagger(e, i, parts.length, .6)); });
    }
  };

  /* =====================================================================
     笔墨版式（2026-10-05）：人群透视 / 墨圈 / 声波 / 线描
     ===================================================================== */
  // 固定种子的随机数：每一帧、每次渲染结果都一样
  const rng = seed => () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const dot = (x, y, r) => `M${(x - r).toFixed(1)},${y.toFixed(1)}a${r.toFixed(1)},${r.toFixed(1)} 0 1,0 ${(2 * r).toFixed(1)},0a${r.toFixed(1)},${r.toFixed(1)} 0 1,0 ${(-2 * r).toFixed(1)},0`;

  /* ---------------- 人群：一条路伸向远处，两旁站满人，由远到近排出来 ----------------
     项目：远处标签 | 左侧标签 | 右侧标签（都可省） */
  const crowd = {
    build(s) {
      const W = s.w || 1920, H = s.h || 1080, cx = W / 2;
      const hy = s.hy != null ? s.hy : H * .31, base = H * 1.05;       // 地平线、最近一排（略出画）
      const road = W * .30, band = W * .37, COLS = 14, ZF = 16, K = 1.035;
      const fs = s.fs || 36, R = rng(7);
      const Y = z => hy + (base - hy) / z, Xs = (z, lat, sd) => cx + sd * (road + lat) / z;
      let rows = [];
      for (let z = 1; z < ZF; z *= K) rows.push(z);
      rows.reverse();                                                   // 远的先画，近的压在上面
      let g = `<line class="hz" x1="${W * .03}" y1="${hy}" x2="${W * .97}" y2="${hy}"/>` +
        `<line class="mid" x1="${cx}" y1="${hy + 8}" x2="${cx}" y2="${H}"/>`;
      // 人群站的地面：两条黑带，一直收到灭点
      const poly = sd => `M${Xs(60, 0, sd)},${Y(60)} L${Xs(1, 0, sd)},${Y(1)} L${Xs(1, band, sd)},${Y(1)} L${Xs(60, band, sd)},${Y(60)} Z`;
      g += `<clipPath id="cw${s.id}"><rect class="clip" x="0" y="${hy}" width="${W}" height="0"/></clipPath>` +
        `<g clip-path="url(#cw${s.id})"><path class="gd" d="${poly(-1)}"/><path class="gd" d="${poly(1)}"/></g>`;
      rows.forEach(z => {
        const r = Math.max(.9, 11 / z), y = Y(z);
        let k = '', rd = '', st = '';
        [-1, 1].forEach(sd => {
          for (let c = 0; c < COLS; c++) {
            const lat = (c + .15 + R() * .7) * band / COLS, x = Xs(z, lat, sd), yy = y - r * (1.1 + R() * .9);
            const flag = c === COLS - 1 && R() < .34;                   // 最外一列：有人举着小红旗
            if (flag) { st += `M${x.toFixed(1)},${yy.toFixed(1)}l${(sd * r * .5).toFixed(1)},${(-r * 3.4).toFixed(1)}`; rd += dot(x + sd * r * .5, yy - r * 3.9, r * .95); k += dot(x, yy, r); }
            else if (R() < .2) rd += dot(x, yy, r); else k += dot(x, yy, r);
          }
        });
        g += `<g class="rw" data-y="${y.toFixed(1)}"><path class="st" d="${st}"/><path class="k" d="${k}"/><path class="r" d="${rd}"/></g>`;
      });
      // 标签 + 引线：远处一个，左右各一个
      const [far, left, right] = s.items;
      const lab = (cls, t, tx, ty, lx, ly, anchor) => t ? `<g class="lb ${cls}">` +
        `<line class="ld" x1="${lx}" y1="${ly + 14}" x2="${tx}" y2="${ty}"/><circle class="tip" cx="${tx}" cy="${ty}" r="4.5"/>` +
        `<text class="lt" style="font-size:${fs}px" x="${lx}" y="${ly}" text-anchor="${anchor}">${esc(t)}</text></g>` : '';
      g += `<circle class="vp" cx="${cx}" cy="${hy}" r="9"/>`;
      g += lab('f', far, cx + 8, hy - 6, Math.min(W - fs * (vlen(far || '') + 1), cx + W * .13), Math.max(fs, hy - H * .095), 'start');
      // 左右标签：先放在人群外沿的斜上方；字会压到人群（窄画面、长标签）就整行往上挪，直到放得下
      const zt = 1.95, ty = Y(zt) - 30, edge = y => (road + band) / ((base - hy) / Math.max(1, y - hy));   // 高度 y 处人群外沿离中线多远
      const side = (cls, t, sd) => {
        if (!t) return '';
        const tw = vlen(t) * fs * 1.04, lx = sd < 0 ? Math.max(W * .035, Xs(zt, band, -1) - W * .09) : Math.min(W * .965, Xs(zt, band, 1) + W * .09);
        let ly = ty - H * .13;
        while (ly > hy + fs * 1.6 && Math.abs(lx - cx) - tw < edge(ly + 14) + 18) ly -= 8;
        return lab(cls, t, Xs(zt, band * .96, sd), ty, lx, ly, sd < 0 ? 'start' : 'end');
      };
      g += side('l', left, -1) + side('r', right, 1);
      return `<svg class="chart crowd" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" data-hy="${hy}" data-h="${H}">${g}</svg>`;
    },
    update(n, s, p) {
      const svg = n.querySelector('svg'), hy = +svg.dataset.hy, H = +svg.dataset.h;
      const a = clamp(p / .12, 0, 1);
      n.querySelectorAll('.hz,.mid').forEach(x => { x.style.opacity = a; });
      const vp = n.querySelector('.vp'); vp.style.opacity = a;
      const e = ease(clamp((p - .08) / .64, 0, 1)), front = hy + e * (H - hy + 60);   // 人群前沿：从地平线往镜头推
      n.querySelector('.clip').setAttribute('height', Math.max(0, front - hy));
      n.querySelectorAll('.rw').forEach(g => { g.style.opacity = clamp((front - (+g.dataset.y)) / 26, 0, 1); });
      n.querySelectorAll('.lb').forEach((g, i) => { g.style.opacity = clamp((p - .74 - i * .07) / .08, 0, 1); });
    }
  };

  /* ---------------- 墨圈：一笔画出的墨圈，圈住一个词 ----------------
     项目：圈里的大字 | 下面的小字（可省） */
  const enso = {
    build(s) {
      const S = s.w || 560, c = S / 2, R0 = S * .40, N = 96, a0 = -100, sweep = 344;
      const out = [], inn = [], mid = [];
      for (let i = 0; i <= N; i++) {
        const u = i / N, th = (a0 + u * sweep) * Math.PI / 180, R = R0 * (1 + .014 * Math.sin(u * 7 + 1));
        const w = S * .010 + S * .052 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.06)), .8) * (.78 + .22 * Math.sin(u * 9 + .6));
        const cs = Math.cos(th), sn = Math.sin(th);
        out.push(`${(c + (R + w / 2) * cs).toFixed(1)},${(c + (R + w / 2) * sn).toFixed(1)}`);
        inn.push(`${(c + (R - w / 2) * cs).toFixed(1)},${(c + (R - w / 2) * sn).toFixed(1)}`);
        mid.push(`${(c + R * cs).toFixed(1)},${(c + R * sn).toFixed(1)}`);
      }
      // 起笔处的几点飞墨
      const th0 = a0 * Math.PI / 180, sx = c + R0 * Math.cos(th0), sy = c + R0 * Math.sin(th0);
      const spl = [[-14, -12, 7], [-2, -20, 5], [-24, -2, 4]].map(([dx, dy, r]) => dot(sx + dx * S / 560, sy + dy * S / 560, r * S / 560)).join('');
      const [main, sub] = s.items, fsz = Math.min(S * .30, S * .56 / Math.max(1, vlen(String(main || '').replace(/\*\*|==/g, ''))));
      return `<svg class="chart enso" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">` +
        `<mask id="en${s.id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${S}" height="${S}"><path class="mk" d="M${mid.join(' L')}" fill="none" stroke="#fff" stroke-width="${S * .17}" stroke-linecap="round"/></mask>` +
        `<g filter="url(#ink-rough)"><path class="ink" mask="url(#en${s.id})" d="M${out.join(' L')} L${inn.reverse().join(' L')} Z"/><path class="ink spl" d="${spl}"/></g>` +
        `<text class="em" style="font-size:${fsz.toFixed(0)}px" x="${c}" y="${c + (sub ? fsz * .08 : fsz * .34)}" text-anchor="middle">${esc(String(main || '').replace(/\*\*|==/g, ''))}</text>` +
        (sub ? `<text class="es" style="font-size:${(S * .105).toFixed(0)}px" x="${c}" y="${c + fsz * .08 + S * .17}" text-anchor="middle">${esc(sub)}</text>` : '') + `</svg>`;
    },
    update(n, s, p, t) {
      const q = t != null ? clamp((t - .1) / 1.15, 0, 1) : clamp(p / .6, 0, 1);      // 一笔约 1.2 秒，不随本屏长短变慢
      const mk = n.querySelector('.mk'), L = mk.getTotalLength ? mk.getTotalLength() : 1500, e = 1 - Math.pow(1 - q, 2.2);
      mk.style.strokeDasharray = L + 40; mk.style.strokeDashoffset = (L + 40) * (1 - e);
      n.querySelector('.spl').style.opacity = q > .02 ? 1 : 0;
      const w = t != null ? clamp((t - .75) / .4, 0, 1) : clamp((p - .5) / .25, 0, 1);
      const em = n.querySelector('.em'), es = n.querySelector('.es');
      em.style.opacity = w; em.style.transformBox = 'fill-box'; em.style.transformOrigin = 'center'; em.style.transform = `scale(${1.18 - .18 * ease(w)})`;
      if (es) es.style.opacity = t != null ? clamp((t - 1.15) / .35, 0, 1) : clamp((p - .75) / .2, 0, 1);
    }
  };

  /* ---------------- 声波：老式话筒 + 一圈圈传出去的声波（大字由版式另外排） ---------------- */
  const mic = {
    build(s) {
      const W = s.w || 520, H = s.h || 620, k = W / 520;
      const mx = 150 * k, top = 40 * k, cw = 132 * k, ch = 196 * k, cy = top + ch / 2;
      let grid = '';
      for (let i = 1; i < 8; i++) grid += `<line x1="${mx - cw / 2 + i * cw / 8}" y1="${top}" x2="${mx - cw / 2 + i * cw / 8}" y2="${top + ch}"/>`;
      for (let i = 1; i < 12; i++) grid += `<line x1="${mx - cw / 2}" y1="${top + i * ch / 12}" x2="${mx + cw / 2}" y2="${top + i * ch / 12}"/>`;
      let arcs = '';
      for (let i = 0; i < 6; i++) {
        const r = (190 + i * 96) * k, a = 36 * Math.PI / 180;
        arcs += `<path class="arc${i === 2 ? ' red' : ''}" data-i="${i}" d="M${mx + r * Math.cos(a)},${cy - r * Math.sin(a)} A${r},${r} 0 0,1 ${mx + r * Math.cos(a)},${cy + r * Math.sin(a)}" fill="none"/>`;
      }
      return `<svg class="chart mic" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${arcs}<g class="body">` +
        `<clipPath id="mc${s.id}"><rect x="${mx - cw / 2}" y="${top}" width="${cw}" height="${ch}" rx="${cw / 2}"/></clipPath>` +
        `<g clip-path="url(#mc${s.id})"><rect x="${mx - cw / 2}" y="${top}" width="${cw}" height="${ch}" fill="rgba(255,252,244,.7)"/><g class="mesh">${grid}</g>` +
        `<rect x="${mx - cw / 2}" y="${cy + 6 * k}" width="${cw}" height="${16 * k}" fill="var(--red)"/></g>` +
        `<rect class="cap0" x="${mx - cw / 2}" y="${top}" width="${cw}" height="${ch}" rx="${cw / 2}" fill="none"/>` +
        `<path class="hold" d="M${mx - cw * .62},${top + ch * .93} v${42 * k} h${cw * 1.24} v${-42 * k}" fill="none"/>` +
        `<line class="hold" x1="${mx}" y1="${top + ch * .93 + 42 * k}" x2="${mx}" y2="${H}"/></g></svg>`;
    },
    update(n, s, p, t) {
      if (t == null) t = p * 6;
      const b = n.querySelector('.body'); b.style.opacity = clamp(t / .4, 0, 1);
      n.querySelectorAll('.arc').forEach((a, i) => {
        const q = clamp((t - .3 - i * .14) / .35, 0, 1);
        const wave = Math.pow(Math.max(0, Math.cos(2 * Math.PI * (t * .55 - i * .17))), 2);     // 亮的那一圈不断往外走
        a.style.opacity = q * (.38 + .62 * wave);
      });
    }
  };

  /* ---------------- 线描：一张 SVG 线稿，一笔一笔描出来，再上色 ----------------
     SVG 放在「1-我的文案/素材/」，由 parse.mjs 读进来放在 spec.svg */
  const lineart = {
    build(s) {
      return s.svg ? `<div class="labox">${s.svg}</div>`
        : `<div class="labox miss">缺少线稿：${esc(s.name || '')}<br>把 SVG 放进 1-我的文案/素材/</div>`;
    },
    update(n, s, p, t) {
      const svg = n.querySelector('svg'); if (!svg) return;
      if (!n._la) {                                           // 第一次：量出每一笔的长度，记下原来的填色透明度
        svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%');
        n._la = [...svg.querySelectorAll('path,line,polyline,polygon,rect,circle,ellipse,text')].filter(x => !x.closest('defs,clipPath,mask,pattern')).map(x => {
          const cs = getComputedStyle(x), stroked = cs.stroke && cs.stroke !== 'none' && x.getTotalLength;
          let L = 0; try { L = stroked ? x.getTotalLength() : 0; } catch (e) { }
          if (L) x.style.strokeDasharray = L + 1;
          return { x, L, fo: parseFloat(cs.fillOpacity) || 1, filled: cs.fill && cs.fill !== 'none' };
        });
      }
      const e = clamp(p, 0, 1), N = n._la.length;
      n._la.forEach((o, i) => {
        const q = stagger(e, i, N, .82);
        if (o.L) { o.x.style.strokeDashoffset = (o.L + 1) * (1 - ease(q)); o.x.style.fillOpacity = o.filled ? o.fo * clamp((q - .55) / .45, 0, 1) : 0; }
        else o.x.style.opacity = clamp(q * 1.6, 0, 1);
      });
    }
  };

  window.CHARTS = { line, waffle, bars, flow, target, converge, drop, trend, doc, crowd, enso, mic, lineart };
})();
