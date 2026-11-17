/* =========================================================================
   1) 拆稿：把你写的 .md 文案，变成「分镜」——每一屏画面 + 每一句旁白
   ========================================================================= */
import fs from 'node:fs';
import path from 'node:path';
const VW = 1920, VH = 1080;

/* 线稿目录：[线描] 用的 SVG 直接读成文字嵌进分镜（要一笔一笔描，不能当图片贴） */
let SVG_DIR = '';
export function setSvgDir(dir) { SVG_DIR = dir || ''; }
const readSvg = n => {
  const x = String(n || '').trim(); if (!x || !SVG_DIR) return '';
  const f = [x, x + '.svg'].map(v => path.join(SVG_DIR, v)).find(v => /\.svg$/i.test(v) && fs.existsSync(v));
  if (!f) return '';
  const t = fs.readFileSync(f, 'utf8');
  const i = t.indexOf('<svg'); if (i < 0) return '';
  return t.slice(i).replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, '');
};

/* 素材清单（做旧后的文件），由外部灌入 */
let MEDIA = [];
export function setMedia(list) { MEDIA = list || []; }
const findM = n => {
  const x = String(n || '').trim(); if (!x) return null;
  const strip = v => v.replace(/\.[^.]+$/, '');
  return MEDIA.find(m => m.name === x) || MEDIA.find(m => strip(m.name) === strip(x)) || null;
};
const mediaEl = (m, o) => ({
  type: 'media', kind: m.kind, src: 'file://' + m.src, dur: m.dur, ...o
});
const MAXSUB = 18;                 // 一条字幕最多几个字
const MINSUB = 5;                  // 短于这个字数的碎片并到相邻行，免得字幕一闪而过
const bare = s => s.replace(/[\s，,、：:。！？!?；;…“”「」『』‘’（）()—]/g, '').length;

/* ---------- 把一段话切成「字幕大小」的短句 ---------- */
function splitLines(text) {
  const out = [];
  text.split(/\n+/).forEach(para => {
    // 句末标点后面紧跟的引号、括号留在本句，不单独成一条
    para.split(/(?<=[。！？!?；;…])(?![”」』’）)。！？!?…])/).forEach(s => {
      s = s.trim().replace(/^[、，,]/, '');
      if (!s) return;
      if (s.length <= MAXSUB) { out.push(s); return; }
      // 太长 → 在逗号处切开
      let buf = '';
      s.split(/(?<=[，,、：:]|——)/).forEach(part => {
        // 短引号（如“科技衰退、制造业疲软”「我学历低，所以成功不了」）不从中间断开
        const openQ = (o, c) => (buf.split(o).length - buf.split(c).length) > 0 && part.includes(c) && part.indexOf(c) <= 8;
        const inShortQuote = openQ('“', '”') || openQ('「', '」');
        if ((buf + part).length > MAXSUB && buf && bare(buf) >= MINSUB && bare(part) >= MINSUB && !inShortQuote) {
          out.push(buf); buf = part;
        } else buf += part;
      });
      if (buf) out.push(buf);
    });
  });
  return out.map(s => s.replace(/[，,、]$/, '')).filter(Boolean);
}

/* 印章版式的项目拆分：普通项 = 印章；「注：」= 下面的小字；「圈：大字/小字」= 墨圈 */
const sealParts = items => {
  const nt = items.find(t => /^注[:：]/.test(t)), rg = items.find(t => /^圈[:：]/.test(t));
  return { seals: items.filter(t => t !== nt && t !== rg).slice(0, 4),
    note: nt ? nt.replace(/^注[:：]\s*/, '') : '', ring: rg ? rg.replace(/^圈[:：]\s*/, '').split(/\s*[\/／]\s*/) : null };
};
const sealCols = t => { const n = [...t].length; return n <= 3 ? n : Math.ceil(n / 2); };

/* ---------- 版式库：每种版式怎么摆元素 ---------- */
const LAYOUTS = {
  title: (items, id) => items.slice(0, 4).map((t, i) => ({
    id: id(i), type: 'sub', size: 46, text: '— ' + t, x: 210, y: 640 + i * 82, w: 1480, anim: 'left'
  })),

  // 没写版式时的默认画面：标题 + 红线 + 淡淡的大号序号（不重复旁白）
  _bare: (items, id, no) => [
    { id: id('r'), type: 'rule', x: 190, y: 600, w: 260, anim: 'draw', dur: .8 },
    { id: id('n'), type: 'bignum', text: String(no).padStart(2, '0'),
      x: 1430, y: 430, size: 300, color: 'rgba(178,58,37,.13)', anim: 'fade', dur: 1.2 }
  ],

  卡片: (items, id) => {
    const n = Math.min(items.length, 4), gap = 44;
    const w = Math.floor((1560 - gap * (n - 1)) / n);
    return items.slice(0, 4).map((t, i) => {
      const [txt, stamp] = t.split(/\s*[:：]\s*/);
      return {
        id: id(i), type: 'card', text: txt, stamp: stamp || '', lines: 4,
        x: 180 + i * (w + gap), y: 505, w, anim: 'up', rot: (i % 2 ? 1 : -1) * (0.6 + i * 0.25)
      };
    });
  },

  便利贴: (items, id) => {
    const col = ['y', 'g', 'p', 'b'];
    const pos = [[230, 545], [700, 505], [1170, 560], [320, 745], [800, 760], [1255, 770]];
    return items.slice(0, 6).map((t, i) => ({
      id: id(i), type: 'note', cls: col[i % 4], text: t,
      x: pos[i % 6][0], y: pos[i % 6][1], w: 430, anim: 'pop',
      rot: [-2.6, 2.2, -1.6, 3.0, -2.0, 1.4][i % 6]
    }));
  },

  列表: (items, id) => items.slice(0, 5).map((t, i) => ({
    id: id(i), type: 'sub', size: 52, text: '— ' + t, x: 220, y: 520 + i * 96, w: 1480, anim: 'left'
  })),

  对比: (items, id, br = {}) => items.slice(0, 2).map((t, i) => {
    // 可选眉标：项目开头写 [眉标]（[] = 不要眉标）；不写仍是默认的 PUBLIC / INTERNAL（旧稿不变）
    const km = t.match(/^\[([^\]]*)\]\s*/); if (km) t = t.slice(km[0].length);
    let [head, body] = t.split(/\s*[:：]\s*/);
    if (body && br[body]) body = br[body].split('|').join('\n');
    return {
      id: id(i), type: 'panel', cls: i === 1 ? 'dark' : '',
      kicker: km ? km[1] : (i === 0 ? 'PUBLIC' : 'INTERNAL'), text: head, body: body || '',
      x: 190 + i * 800, y: 525, w: 740, h: 350, anim: i === 0 ? 'left' : 'right'
    };
  }),

  数字: (items, id) => {
    const [num, ...rest] = items;
    return [
      { id: id(0), type: 'bignum', text: num, x: 1250, y: 430, size: 300, anim: 'pop' },
      ...rest.slice(0, 3).map((t, i) => ({
        id: id(i + 1), type: 'sub', size: 44, text: '— ' + t, x: 210, y: 600 + i * 84, w: 980, anim: 'left'
      }))
    ];
  },

  // 出处/译文长、折成两行时，整块往上挪，下沿离字幕条（顶约 915）留 30px 以上
  引用: (items, id, br = {}) => {
    const q = items[0] || '', qt = br[q] ? br[q].split('|').join('\n') : q;     // 横屏断行表：日文引语按词组断
    const sl = items[1] ? Math.ceil(visLen(items[1]) * 38 / 1400) : 0;
    // 很长的引语（上移 80 也放不下、会压到字幕）：按可用高度把字号缩小，每行字数随之放宽
    let fs = 64, ql = qt.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / 21)), 0);
    if (560 + ql * 96 + 40 + sl * 61 - 885 > 80) {
      for (fs = 60; fs > 40; fs -= 2) {
        ql = qt.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(visLen(l) * fs / 1400)), 0);   // 按字宽估行数（西文字母窄）
        if (480 + ql * fs * 1.5 + 40 + sl * 61 <= 885) break;
      }
    }
    const lh = fs * 1.5, up = Math.min(80, Math.max(0, 560 + ql * lh + 40 + sl * 61 - 885));
    return [{
      id: id(0), type: 'quote', cls: /^[「“『]/.test(q) ? 'hang' : '', text: qt, x: 230, y: 560 - up, w: 1460, anim: 'left',
      ...(fs < 64 ? { size: fs } : {})
    }, ...items.slice(1, 2).map((t, i) => ({
      id: id(i + 1), type: 'small', size: 38, text: t, w: 1400, anim: 'up', x: 262,
      y: 560 - up + ql * lh + 40
    }))];
  },

  地图: (items, id) => {
    const pos = [[300, 470], [1010, 560], [520, 790]];
    return items.slice(0, 3).map((t, i) => ({
      id: id(i), type: 'pin', icon: '◉', text: t,
      x: pos[i][0], y: pos[i][1], w: 720, anim: 'pop'
    }));
  },

  条形: (items, id) => items.slice(0, 5).map((t, i) => {
    const [lb, val, pct] = t.split(/\s*[:：]\s*/);
    return {
      id: id(i), type: 'bar', text: lb, value: val || '', pct: Number(pct || 50),
      x: 180, y: 540 + i * 92, w: 1560, anim: 'left'
    };
  }),


  /* ===== 数据图 / 概念图 / 界面复刻（第二代版式） ===== */
  折线图: (items, id) => [{ id: id(0), type: 'line', items, x: 620, y: 300, w: 1180, h: 520, span: 'scene' }],

  柱状图: (items, id) => [{ id: id(0), type: 'bars', items, x: 370, y: 450, w: 1180, h: 420, span: 'scene' }],

  方块图: (items, id) => {
    const pct = String(items[0] || '0').replace('%', '');
    return [
      { id: id(0), type: 'waffle', items: [pct], x: 1120, y: 230, w: 640, span: 'scene' },
      { id: id(1), type: 'waffnum', text: pct + '%', x: 150, y: 470, anim: 'pop' },
      ...(items[1] ? [{ id: id(2), type: 'waffcap', text: items[1], x: 155, y: 660, w: 800, anim: 'up' }] : [])
    ];
  },

  // 6 步以上、成对（问/答、原因/结果）的流程，一行排不下：横屏也两两成行（格子矮一点，整块放在标题下方、字幕上方）
  流程: (items, id) => items.length >= 6 && items.length % 2 === 0
    ? [{ id: id(0), type: 'flow', v: 'pair', items, x: 360, y: 500, w: 1200, bh: 70, gap: 20, span: 'scene' }]
    : [{ id: id(0), type: 'flow', items, x: 180, y: 640, w: 1560, span: 'scene' }],

  靶心: (items, id) => [{ id: id(0), type: 'target', items, label: items[0] || '', x: 1010, y: 200, w: 680, span: 'scene' }],

  汇聚: (items, id) => [{ id: id(0), type: 'converge', items, x: 840, y: 230, w: 1000, h: 560, span: 'scene' }],

  下坠: (items, id) => [{ id: id(0), type: 'drop', items, x: 930, y: 195, w: 700, h: 690, span: 'scene' }],

  热搜: (items, id) => [{ id: id(0), type: 'trend', items, x: 380, y: 400, w: 1160, span: 'scene' }],

  公文: (items, id) => [{ id: id(0), type: 'doc', items, x: 545, y: 205, w: 830, span: 'scene', rot: -0.5 }],

  /* ===== 笔墨版式（2026-10-05）：人群 / 印章 / 墨圈 / 声波 / 线描 ===== */
  // 人群：整屏的透视大场面，标题压在左上角
  人群: (items, id) => [{ id: id(0), type: 'crowd', items, x: 0, y: 0, w: VW, h: VH, z: 0, span: 'scene', maxDur: 7, first: true }],

  // 印章：每句旁白盖下一枚。可选「注：小字说明」「圈：大字/小字」（右侧墨圈，圈住结论）
  印章: (items, id, br, ctx = {}) => {
    const { seals, note, ring } = sealParts(items);
    const n = seals.length, areaW = ring ? 1040 : 1560, gap = 64, y = ctx.head ? 520 : 400;
    const cols = seals.map(sealCols), maxRows = Math.max(...seals.map(t => Math.ceil([...t].length / sealCols(t))));
    const size = Math.floor(Math.min(maxRows > 1 ? 136 : 170, (areaW - gap * (n - 1)) / cols.reduce((a, c) => a + c + .28, 0)));
    const total = cols.reduce((a, c) => a + (c + .28) * size, 0) + gap * (n - 1);
    let x = 180 + (areaW - total) / 2;
    const els = seals.map((t, i) => {
      const e = { id: id(i), type: 'seal', text: t, size, x: Math.round(x), y, anim: 'stamp', dur: .5, rot: [-2.2, 1.4, -1, 2][i % 4] };
      x += (cols[i] + .28) * size + gap; return e;
    });
    const sh = (maxRows + .28) * size;
    if (note) els.push({ id: id('n'), type: 'sealnote', size: 40, text: note, x: Math.round(180 + (areaW - visLen(note) * 40) / 2), y: Math.round(y + sh + 34), anim: 'up' });
    if (ring) els.push({ id: id('g'), type: 'enso', items: ring, x: 1290, y: Math.round(y + sh / 2 - 240), w: 480, span: 'scene' });
    return els;
  },

  // 墨圈：右边一个大墨圈，标题在左
  墨圈: (items, id) => [{ id: id(0), type: 'enso', items, x: 1090, y: 240, w: 640, span: 'scene' }],

  // 声波：话筒 + 声波；项目是「喊出来的词」，一句旁白出一个，越往后越大。**词** = 红字
  声波: (items, id) => {
    const ws = items.slice(0, 3);
    const pos = { 1: [[840, 400, 300]], 2: [[800, 300, 250], [1150, 540, 290]], 3: [[760, 270, 200], [1040, 450, 220], [1330, 630, 230]] }[ws.length] || [];
    return [{ id: id(0), type: 'mic', first: true, items: [], x: 170, y: 290, w: 520, h: 640, span: 'scene' },
      ...ws.map((t, i) => ({ id: id(i + 1), type: 'brush', text: t, size: pos[i][2], x: pos[i][0], y: pos[i][1], anim: 'bounce', dur: .5 }))];
  },

  // 线描：SVG 线稿一笔一笔描出来；后两项是左右竖排题字（可省），**字** = 红字
  线描: (items, id) => {
    const [file, l, r] = items, side = !!(l || r);
    const els = [{ id: id(0), type: 'lineart', first: true, name: file, svg: readSvg(file), items: [], x: side ? 440 : 260, y: 230, w: side ? 1040 : 1400, h: 650, span: 'scene', maxDur: 6 }];
    const vsz = t => Math.min(112, Math.floor(640 / Math.max(1, [...t.replace(/\*\*|==/g, '')].length) / 1.06));
    if (l) els.push({ id: id(1), type: 'vbrush', text: l, size: vsz(l), x: 190, y: 240, anim: 'down' });
    if (r) els.push({ id: id(2), type: 'vbrush', text: r, size: vsz(r), x: 1730 - vsz(r), y: 240, anim: 'down' });
    return els;
  },

  图: (items, id) => {
    const ms = items.slice(0, 2).map(findM).filter(Boolean);
    if (!ms.length) return [];
    if (ms.length === 1) return [mediaEl(ms[0], { id: id(0), x: 700, y: 300, w: 1060, h: 600, anim: 'pop', rot: 1.0 })];
    return ms.map((m, i) => mediaEl(m, { id: id(i), x: 180 + i * 830, y: 460, w: 760, h: 430, anim: 'pop', rot: i ? -1.2 : 1.2 }));
  },

  画中画: (items, id) => {
    // 截图卡优先用竖屏那套「-竖」卡（重新取景、译文只翻看得见的日文、手动断行，已核对）；
    // 数据图（C 编号）仍用横版原图。没有「-竖」卡时照旧：图框 1.6:1、完整显示不裁切
    const mv = /-C\d+-/.test(items[0] || '') ? null : findV(items[0]);
    const card = mv && /-竖$/.test(mv.name.replace(/\.[^.]+$/, '')) ? mv : null;
    const m = card || findM(items[0]);
    const els = [];
    let w = 883, h = 552;                               // 图框上限（含 14px 白边）
    if (card && card.w && card.h) {
      const ar = card.w / card.h;
      w = Math.min(883, Math.round((552 - 28) * ar) + 28); h = Math.round((w - 28) / ar) + 28;
    }
    if (m) els.push(mediaEl(m, { id: id(0), cls: 'fit', x: 740, y: 115, w, h, anim: 'pop', rot: -1.1 }));
    // 说明条：与图片左边对齐，逐条叠放在图片下方（距图底 53px；最低一条底约 850，字幕条顶约 915）
    items.slice(1, 3).forEach((t, i) => els.push({
      id: id(i + 1), type: 'tag', text: t, x: 740, y: 115 + h + 53 + i * 68, anim: 'up'
    }));
    return els;
  },

  满屏: (items, id) => {
    const m = findM(items[0]);
    const els = [];
    if (m) els.push(mediaEl(m, { id: id(0), cls: 'full', frame: false, z: 0,
      x: 0, y: 0, w: VW, h: VH, anim: 'fade', dur: m.dur }));
    els.push({ id: id('sc'), type: 'scrim', z: 1, x: 0, y: 0, w: VW, h: VH, anim: 'fade' });
    return els;
  },
};

/* ===== 竖屏版式（1080×1920，小红书 / 视频号）=====
   内容区 x 80~1000、y 280~1300；1300 以下留给两行字幕（底边距 380）和平台界面。
   标题会自动折行，所以先估标题高度，再把内容依次往下排，保证不重叠。 */
const VX = 80, VWID = 920, VTOP = 280, VBOTTOM = 1300;
const visLen = t => 1.06 * [...t.replace(/==/g, '')].reduce((n, c) => n + (/[\x00-\x7f]/.test(c) ? 0.56 : 1), 0);   // 1.06：字距与标点的余量
const vTitleH = (text, size, w = VWID) =>
  text.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(visLen(l) * size / w)), 0) * size * 1.18;
// 竖屏优先用「-竖」版素材（为竖屏重新取景的截图、重画的图表），没有才用原图
const findV = n => {
  const b = String(n || '').trim().replace(/\.[^.]+$/, '').replace(/-横$/, '');
  return findM(b + '-竖') || findM(n);
};
// 按素材真实比例摆一张带白边的图：宽占满内容区；放不下就按高度缩小、水平居中。不加说明条
const FRAME = 28;                                  // .framed 白边 14px × 2
const vMedia = (m, id, y0, rot = 0) => {
  const ar = m.w && m.h ? m.w / m.h : 1.6;
  let w = VWID, h = Math.round((w - FRAME) / ar) + FRAME;
  if (h > VBOTTOM - y0) { h = VBOTTOM - y0; w = Math.round((h - FRAME) * ar) + FRAME; }
  return mediaEl(m, { id, cls: 'fit', x: VX + Math.round((VWID - w) / 2), y: y0, w, h, anim: 'pop', rot });
};
// _h：估计高度，只用来把整块内容在安全区里上下居中
const V_LAYOUTS = {
  title: (items, id, y0) => items.slice(0, 4).map((t, i) => ({
    id: id(i), type: 'sub', size: 46, text: '— ' + t, x: VX, y: y0 + i * 86, w: VWID, _h: 72, anim: 'left' })),
  列表: (items, id, y0) => items.slice(0, 5).map((t, i) => ({
    id: id(i), type: 'sub', size: 48, text: '— ' + t, x: VX, y: y0 + i * 96, w: VWID, _h: 75, anim: 'left' })),
  // 对比：上下两块，不要英文小标；高度按正文行数算
  对比: (items, id, y0, br = {}) => {
    let y = y0;
    return items.slice(0, 2).map((t, i) => {
      t = t.replace(/^\[[^\]]*\]\s*/, '');                 // 竖屏不画眉标：横屏用的 [眉标] 前缀直接去掉
      let [head, body] = t.split(/\s*[:：]\s*/);
      if (body && br[body]) body = br[body].split('|').join('\n');
      const bl = body ? body.split('\n').reduce((n, l) => n + Math.ceil(visLen(l) * 44 / (VWID - 92)), 0) : 0;
      const h = 92 + 87 + (body ? 22 + bl * 69 : 0);
      const e = { id: id(i), type: 'panel', cls: i === 1 ? 'dark' : '', text: head, body: body || '',
        x: VX, y, w: VWID, h, anim: i === 0 ? 'left' : 'right' };
      y += h + 36; return e;
    });
  },
  数字: (items, id, y0) => [
    { id: id(0), type: 'bignum', text: items[0], x: VX, y: y0, size: 260, _h: 260, anim: 'pop' },
    ...items.slice(1, 4).map((t, i) => ({ id: id(i + 1), type: 'sub', size: 44, text: '— ' + t, x: VX, y: y0 + 320 + i * 84, w: VWID, _h: 68, anim: 'left' }))],
  // 引用：原文可在断行表里手动断行（日文不在词中间断）；「出处 · 译：译文」拆成出处一行 + 译文一行；
  // 第二项不是出处（没有「译：」）时，当作要强调的一句话，用粗宋体
  引用: (items, id, y0, br = {}) => {
    const q = items[0] || '', t = items[1] || '';
    const tw = VWID - 69, tx = VX + 69;            // 引用条：红线 9 + 左内边距 40，正文从 VX+69 起
    const m = t.match(/^(.*?)\s*·\s*译[：:]\s*(.+)$/);
    // 日文原句 + 署名（第二项只是「哲人」「第二夜的小标题」这类出处，没有译文）：署名单独一小行，不当强调句
    const jaAttr = !!t && !m && /^[「『“]/.test(q) && /[぀-ヿ]/.test(q);
    if (t && !m && !jaAttr) {                       // 第二项不是「出处 · 译：」：两句放进同一个引用条，第二句红色加粗
      const sz = Math.min(64, Math.floor(tw / Math.max(visLen(q), visLen(t))));
      return [{ id: id(0), type: 'quote', text: q + '\n**' + t + '**', size: sz, x: VX + 20, y: y0, w: VWID - 20, _h: 2 * sz * 1.5, anim: 'left' }];
    }
    const qt = br[q] ? br[q].split('|').join('\n') : q;
    // 日文原句 + 署名：字号按最长一行定（不超过 60），断行写在断行表里
    const qs = jaAttr ? Math.min(60, Math.floor(tw / Math.max(...qt.split('\n').map(visLen)))) : 64;
    const ql = qt.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(visLen(l) * qs / tw)), 0);
    const els = [{ id: id(0), type: 'quote', cls: /^[「“『]/.test(q) ? 'hang' : '', text: qt, size: jaAttr ? qs : undefined,
      x: VX + 20, y: y0, w: VWID - 20, _h: ql * qs * 1.5, anim: 'left' }];
    let y = y0 + ql * qs * 1.5 + 30;
    if (m) {
      const tl = Math.ceil(visLen('译：' + m[2]) * 40 / tw);
      els.push({ id: id(1), type: 'sub', cls: 'tr', size: 40, text: '译：' + m[2], x: tx, y, w: tw, _h: tl * 62, anim: 'up' });
      els.push({ id: id(2), type: 'small', size: 30, text: '—— ' + m[1], x: tx, y: y + tl * 62 + 18, w: tw, _h: 48, anim: 'up' });
    } else if (jaAttr) {
      els.push({ id: id(1), type: 'small', size: 32, text: '—— ' + t, x: tx, y: y + 6, w: tw, _h: 52, anim: 'up' });
    }
    return els;
  },
  // 卡片：竖着叠、满宽；不画假文横线，印章（数据）在标题下面，长印章少转一点（vcard）
  卡片: (items, id, y0) => {
    let y = y0;
    return items.slice(0, 4).map((t, i) => {
      const [txt, stamp] = t.split(/\s*[:：]\s*/);
      const sl = stamp ? Math.max(1, Math.ceil(visLen(stamp) * 34 / (VWID - 64 - 40))) : 0;
      const h = 24 + 60 + 12 + (stamp ? 8 + sl * 50 + 8 : 0) + 24;          // 与 stage.css 的 .vcard 尺寸对应
      const e = { id: id(i), type: 'card', cls: 'vcard', text: txt, stamp: stamp || '', lines: 0,
        x: VX, y, w: VWID, _h: h, anim: 'up', rot: (i % 2 ? 1 : -1) * 0.5 };
      y += h + 30; return e;
    });
  },
  // 流程：偶数且 ≥4 项按「左 → 右」两两一行（问/答、原因/结果）；其余竖着一格格往下
  流程: (items, id, y0) => {
    const n = items.length, pair = n >= 4 && n % 2 === 0;
    const h = pair ? (n / 2) * 96 + (n / 2 - 1) * 34 : 34 + n * 100 + (n - 1) * 60;
    return [{ id: id(0), type: 'flow', v: pair ? 'pair' : 'col', items, x: VX, y: y0 + 10, w: VWID, h, _h: h + 10, span: 'scene' }];
  },
  柱状图: (items, id, y0) => [{ id: id(0), type: 'bars', v: true, items, x: VX, y: y0 + 30, w: VWID, h: 560, _h: 590, span: 'scene' }],
  折线图: (items, id, y0) => [{ id: id(0), type: 'line', items, x: VX - 50, y: y0 + 20, w: VWID + 70, h: 640, _h: 660, span: 'scene' }],   // 2026-10-05 补：原先竖屏没有排法，图会出画
  下坠: (items, id, y0) => [{ id: id(0), type: 'drop', v: true, items, x: VX + 40, y: y0 + 10, w: VWID - 80, h: 660, _h: 670, span: 'scene' }],
  热搜: (items, id, y0) => [{ id: id(0), type: 'trend', v: true, items, x: 60, y: y0, w: 960, _h: items.length * 162 + 54, span: 'scene' }],
  // 笔墨版式的竖屏排法（2026-10-05）
  人群: (items, id, y0) => [{ id: id(0), type: 'crowd', items, x: 0, y: y0, w: 1080, h: 1920 - y0, hy: 150, fs: 40, _h: VBOTTOM - y0, span: 'scene', maxDur: 7, first: true }],
  印章: (items, id, y0) => {
    const { seals, note, ring } = sealParts(items);
    const cols = Math.max(...seals.map(sealCols)), rows = Math.max(...seals.map(t => Math.ceil([...t].length / sealCols(t))));
    const per = seals.length > 1 ? 2 : 1, gap = 60;
    const size = Math.floor(Math.min(180, (VWID - gap * (per - 1)) / per / (cols + .28)));
    const sw = (cols + .28) * size, sh = (rows + .28) * size, x0 = VX + (VWID - (per * sw + (per - 1) * gap)) / 2;
    const lone = i => seals.length % per && i === seals.length - 1 ? (sw + gap) / 2 : 0;     // 最后一行只剩一枚：居中
    const els = seals.map((t, i) => ({ id: id(i), type: 'seal', text: t, size, x: Math.round(x0 + (i % per) * (sw + gap) + lone(i)), y: Math.round(y0 + Math.floor(i / per) * (sh + 50)),
      _h: sh, anim: 'stamp', dur: .5, rot: [-2.2, 1.4, -1, 2][i % 4] }));
    let y = y0 + Math.ceil(seals.length / per) * (sh + 50);
    if (note) { els.push({ id: id('n'), type: 'sealnote', size: 44, text: note, x: Math.round(VX + (VWID - visLen(note) * 44) / 2), y, _h: 66, anim: 'up' }); y += 100; }
    if (ring) els.push({ id: id('g'), type: 'enso', items: ring, x: VX + 250, y, w: 420, _h: 420, span: 'scene' });
    return els;
  },
  墨圈: (items, id, y0) => [{ id: id(0), type: 'enso', items, x: VX + 150, y: y0, w: 620, _h: 620, span: 'scene' }],
  声波: (items, id, y0) => {
    const ws = items.slice(0, 3), sz = [230, 270, 290];
    return [{ id: id(0), type: 'mic', first: true, items: [], x: VX, y: y0 + 20, w: 330, h: 300 + ws.length * 200, _h: 300 + ws.length * 200, span: 'scene' },
      ...ws.map((t, i) => ({ id: id(i + 1), type: 'brush', text: t, size: sz[i], x: [420, 470, 400][i], y: y0 + 40 + i * 290, _h: sz[i], anim: 'bounce', dur: .5 }))];
  },
  线描: (items, id, y0) => {
    const [file, l, r] = items;
    const els = [{ id: id(0), type: 'lineart', first: true, name: file, svg: readSvg(file), items: [], x: VX, y: y0, w: VWID, h: 600, _h: 600, span: 'scene', maxDur: 6 }];
    [l, r].filter(Boolean).forEach((t, i) => els.push({ id: id(i + 1), type: 'brush', text: t, size: 120, x: VX + 20 + i * 330, y: y0 + 640 + i * 150, _h: 126, anim: 'up' }));
    return els;
  },
  画中画: (items, id, y0) => { const m = findV(items[0]); return m ? [vMedia(m, id(0), y0)] : []; },
  图: (items, id, y0) => { const m = findV(items[0]); return m ? [vMedia(m, id(0), y0, 0.6)] : []; },
  满屏: (items, id) => {
    const m = findV(items[0]), els = [];
    if (m) els.push(mediaEl(m, { id: id(0), cls: 'full', frame: false, z: 0, x: 0, y: 0, w: 1080, h: 1920, anim: 'fade', dur: m.dur }));
    els.push({ id: id('sc'), type: 'scrim', z: 1, x: 0, y: 0, w: 1080, h: 1920, anim: 'fade' });
    return els;
  },
};
/* 竖屏标题断行：断行表里有就按表（键是去掉 == 的标题）；否则在靠近中间的逗号/冒号后断，
   其次在「的」「着」等虚词后断；任何一行少于 3 个字的断法不要（如「议长：」单独一行） */
/* 在标题里按「去掉 == 后的字位置」插入换行（可多处）；断点落在 ==高亮== 里时补全高亮标记 */
function insertBreaks(t, cuts) {
  const set = new Set(cuts); let out = '', n = 0, inHl = false;
  for (let i = 0; i < t.length; i++) {
    if (t.startsWith('==', i)) { inHl = !inHl; out += '=='; i++; continue; }
    out += t[i]; n++;
    if (!set.has(n)) continue;
    if (inHl && t.startsWith('==', i + 1)) { out += '==\n'; inHl = false; i += 2; continue; }   // 高亮正好在这里结束
    out += inHl ? '==\n==' : '\n';
  }
  return out;
}
/* 断行表里的值「上|中|下」→ 断点位置列表 */
const cutsOf = v => { const c = []; let n = 0; for (const ch of v) { if (ch === '|') c.push(n); else n++; } return c; };
function vBreakTitle(t, size, br = {}) {
  if (!t || t.includes('\n')) return t;
  const plain = t.replace(/==/g, '');
  if (br[plain]) return insertBreaks(t, cutsOf(br[plain]));
  let cut = -1;
  if (cut < 0 && visLen(t) * size > VWID) {
    const total = visLen(plain), cands = [];
    for (let k = 1; k < plain.length; k++) {
      const a = plain.slice(0, k), b = plain.slice(k);
      if (visLen(a) * size > VWID || visLen(b) * size > VWID || bare(a) < 3 || bare(b) < 3) continue;
      const rank = '，：、；'.includes(plain[k - 1]) ? 0 : '的了着过是在和与把被就也都还'.includes(plain[k - 1]) ? 1 : -1;
      if (rank >= 0) cands.push({ k, rank, d: Math.abs(visLen(a) - total / 2) });
    }
    cands.sort((x, y) => x.rank - y.rank || x.d - y.d);
    if (cands.length) cut = cands[0].k;
  }
  return cut < 0 ? t : insertBreaks(t, [cut]);
}
/* 竖屏字幕：每行最多 16 字，两行；优先手动断点，其次标点、虚词，靠近中间 */
function vWrap(s, breaks = {}, n = 16) {
  if (breaks[s]) return breaks[s].replace('|', '\n');
  if (s.length <= n) return s;
  const L = s.length, lo = Math.max(1, L - n), hi = Math.min(n, L - 1), mid = L / 2;
  const best = chars => { let k = null; for (let i = lo; i <= hi; i++) if (chars.includes(s[i - 1]) && (k === null || Math.abs(i - mid) < Math.abs(k - mid))) k = i; return k; };
  let cut = best('，、：；”）') ?? best('的了着地得在就把被给和与是对向从让') ?? Math.round(mid);
  while (cut < L && /\d/.test(s[cut - 1]) && /\d/.test(s[cut])) cut++;
  return s.slice(0, cut) + '\n' + s.slice(cut);
}

/* 第二代版式：图表自己会按进度画，标题位置也要单独安排 */
const SPAN_LAYOUTS = ['折线图','柱状图','方块图','流程','靶心','汇聚','下坠','热搜','公文','图','画中画','满屏','人群','墨圈'];
const LAYOUT_TITLE = {
  折线图:{x:140,y:320,w:460}, 柱状图:{x:140,y:300,w:1560}, 方块图:{x:150,y:290,w:820},
  流程:{x:180,y:330,w:1560},  靶心:{x:140,y:390,w:700},   汇聚:{x:140,y:320,w:620},
  下坠:{x:140,y:370,w:680},   热搜:{x:180,y:240,w:1560},  公文:{x:180,y:180,w:1560},
  图:{x:140,y:340,w:500},     画中画:{x:140,y:330,w:530}, 满屏:{x:150,y:400,w:760},
  // 笔墨版式：size = 标题字号；fixed = 标题折成几行都不把画面往下推（画面位置是定死的）
  人群:{x:110,y:118,w:1560,size:88}, 墨圈:{x:140,y:390,w:860},
  声波:{x:110,y:118,w:1560,size:72,fixed:true}, 线描:{x:110,y:112,w:1700,size:72,fixed:true}
};
/* 折线/柱状画完后，镜头推到最后一个数据点（第二个参考视频的手法） */
const FOCUS_LAYOUTS = { 折线图:{dx:.70,dy:.34,zoom:1.45}, 柱状图:{dx:.74,dy:.46,zoom:1.4} };

/* ---------- 主解析 ---------- */
const forSub = s => s.replace(/[。！？!?；;…，,、：:]+$/g, '');

export function parseScript(md, opts = {}) {
  const V = !!opts.vertical;
  // <!-- … --> 是写给人看的注释（画面说明、本期设定等）：不念、不出字幕、不上屏。
  // 单行、多行都去掉，换成同样多的换行，校对页里的「第几行」不变。（2026-10-07）
  md = String(md).replace(/<!--[\s\S]*?-->/g, m => '\n'.repeat((m.match(/\n/g) || []).length));
  const lines = md.split(/\r?\n/);
  const meta = { channel: '', series: '', title: '', vw: V ? 1080 : VW, vh: V ? 1920 : VH };
  const sections = [];
  let cur = null, scene = null;

  const pushScene = () => {
    if (scene && (scene.say.length || scene.head)) cur.scenes.push(scene);
    scene = null;
  };
  let curLine = 0;
  const newScene = () => { pushScene(); scene = { head: '', layout: 'title', items: [], say: [], kicker: '', fx: [], l0: curLine + 1, l1: curLine + 1 }; };

  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li];
    const L = raw.trim();
    if (!L) continue;
    curLine = li;
    if (scene) scene.l1 = li + 1;
    if (/^#\s+/.test(L) && !cur) { meta.title = L.replace(/^#\s+/, ''); continue; }
    if (/^>\s*/.test(L) && !cur) {
      const p = L.replace(/^>\s*/, '').split(/\s*[|｜]\s*/);
      meta.channel = p[0] || ''; meta.series = p[1] || ''; continue;
    }
    if (/^##\s+/.test(L)) {                        // 新章节
      pushScene();
      cur = { chapter: L.replace(/^##\s+/, ''), scenes: [] };
      sections.push(cur); newScene(); continue;
    }
    if (!cur) continue;
    if (/^-{3,}$/.test(L)) { newScene(); continue; }          // --- 换一屏
    if (/^#\s+/.test(L)) { if (!scene) newScene();
      const t = L.replace(/^#\s+/, '');
      scene.head = scene.head ? scene.head + '\n' + t : t; continue; }
    if (/^@\s*/.test(L)) { if (!scene) newScene(); scene.kicker = L.replace(/^@\s*/, ''); continue; }
    // 按旁白触发的效果：写在哪一行旁白前面，就在那一句开口时出现（不是版式，不占用本屏的 [版式]）
    const fx = L.match(/^\[(推近|拉回|弹字|盖章)\]\s*(.*)$/);
    if (fx) {
      if (!scene) newScene();
      scene.fx.push({ kind: fx[1], args: fx[2].split(/\s*[|｜]\s*/).map(s => s.trim()), line: scene.say.length });
      continue;
    }
    const m = L.match(/^\[(.+?)\]\s*(.*)$/);                  // [版式] 项目1 | 项目2
    if (m) {
      if (!scene) newScene();
      scene.layout = m[1].trim();
      scene.items = m[2].split(/\s*[|｜]\s*/).map(s => s.trim()).filter(Boolean);
      continue;
    }
    if (!scene) newScene();
    scene.say.push(L);
  }
  pushScene();

  /* ---------- 组装分镜 ---------- */
  const scenes = [], beats = [];
  let no = 0, eid = 0;
  const COLS = 4;

  // 片头。长标题带冒号时拆成「主标题 + 副标题」两行，免得三行挤压到下面
  // 竖屏可在断行表里给片头标题手动分行（键是 # 标题原文）：「主标题第一行|第二行||副标题」，|| 后面没有就只排主标题
  const coverBr = V ? (opts.breaks || {})[meta.title] : null;
  const [tMain, tSub] = (() => {
    if (coverBr) { const [a, b = ''] = coverBr.split('||'); return [a.split('|').join('\n'), b.split('|').join('\n')]; }
    const m = meta.title.match(/^(.{2,14}?)[：:]\s*(.+)$/);
    return m ? [m[1], m[2]] : [meta.title, ''];
  })();
  let coverEls;
  if (V) {   // 竖屏封面：标题按宽度自动定字号（多行按最长一行），整体放在画面中上部
    const ml = tMain.split('\n'), sl = tSub ? tSub.split('\n') : [];
    const fit = (ls, cap) => Math.min(cap, Math.floor(VWID / Math.max(...ls.map(visLen))));
    // 手动分行时副标题不大于主标题的八成，主次分明
    const tS = fit(ml, 140), sS = tSub ? Math.min(fit(sl, 84), coverBr ? Math.round(tS * 0.8) : 84) : 0;
    const yT = 640, yS = yT + tS * 1.25 * ml.length + 24, yR = (tSub ? yS + sS * 1.3 * sl.length : yT + tS * 1.3 * ml.length) + 56;
    coverEls = [
      { id: 'c0', type: 'kicker', text: meta.series || 'FEATURE', x: VX + 10, y: yT - 64, anim: 'left' },
      { id: 'c1', type: 'cover-title', text: tMain, size: tS, x: VX, y: yT, w: VWID, anim: 'up' }];
    if (tSub) coverEls.push({ id: 'c4', type: 'cover-title', text: tSub, size: sS, x: VX + 4, y: yS, w: VWID, anim: 'up' });
    // 频道名留空（> | 系列名）时，片头不画短横线和频道名
    if (meta.channel) coverEls.push({ id: 'c2', type: 'rule', x: VX + 10, y: yR, w: 260, anim: 'draw' },
      { id: 'c3', type: 'cover-sub', text: meta.channel, x: VX + 10, y: yR + 40, anim: 'up' });
  } else {
  coverEls = [
      { id: 'c0', type: 'kicker', text: meta.series || 'FEATURE', x: 190, y: tSub ? 300 : 360, anim: 'left' },
      { id: 'c1', type: 'cover-title', text: tMain, x: 180, y: tSub ? 370 : 430, w: 1560, anim: 'up' }
    ];
    if (tSub) coverEls.push(
      { id: 'c4', type: 'cover-title', text: tSub, size: Math.min(96, Math.floor(1560 / tSub.length)), x: 184, y: 560, w: 1560, anim: 'up' });
    if (meta.channel) coverEls.push(
      { id: 'c2', type: 'rule', x: 190, y: tSub ? 720 : 760, w: 300, anim: 'draw' },
      { id: 'c3', type: 'cover-sub', text: meta.channel, x: 190, y: tSub ? 760 : 800, anim: 'up' });
  }
  scenes.push({
    chapter: false, x: 0, y: 0,
    camera: { cx: meta.vw / 2, cy: meta.vh / 2, zoom: 1.12 }, camEnd: { cx: meta.vw / 2, cy: meta.vh / 2, zoom: 1 },
    elements: coverEls
  });

  sections.forEach(sec => {
    no++;
    sec.scenes.forEach(sc => {
      const idx = scenes.length;
      const col = idx % COLS, row = Math.floor(idx / COLS);
      const X = col * (meta.vw + 240), Y = row * (meta.vh + 200);
      const id = i => 'e' + (eid++) + '_' + i;

      const els = [];
      const isSpan = SPAN_LAYOUTS.includes(sc.layout) && sc.items.length;
      let body;
      if (V) {
        // 竖屏：有版式的屏，标题在上、内容依次往下，整块在安全区里上下居中；只有标题的屏，标题放在画面中部
        const hasBody = !!sc.items.length && !!(V_LAYOUTS[sc.layout] || LAYOUTS[sc.layout]);
        const size = hasBody ? 84 : 100;
        if (sc.head) sc.head = vBreakTitle(sc.head, size, opts.breaks || {});
        const th = sc.head ? vTitleH(sc.head, size) : 0;
        const ty = hasBody ? VTOP : Math.round(800 - th / 2);
        const onTop = sc.layout === '满屏' ? 5 : undefined;
        if (sc.kicker) els.push({ id: id('k'), type: 'kicker', text: sc.kicker, x: VX + 10, y: ty - 56, z: onTop, anim: 'left' });
        if (sc.head) els.push({ id: id('h'), type: 'title', text: sc.head, x: VX, y: ty, w: VWID, size, z: onTop, anim: 'up' });
        const y0 = ty + th + (sc.head ? 60 : 0);
        if (hasBody) {
          body = V_LAYOUTS[sc.layout] ? V_LAYOUTS[sc.layout](sc.items, id, y0, opts.breaks || {}) : LAYOUTS[sc.layout](sc.items, id);
          if (sc.layout !== '满屏' && V_LAYOUTS[sc.layout]) {
            const bot = Math.max(ty + th, ...body.map(e => e.y + (e.h || e._h || 0)));
            const off = Math.round(Math.max(0, VBOTTOM - bot) * 0.45);
            if (off > 0) [...els, ...body].forEach(e => { e.y += off; });
          }
        } else {
          // 章节第一屏才放淡淡的大号章节序号；章节中间的标题屏只放标题 + 短线
          body = [{ id: id('r'), type: 'rule', x: VX + 10, y: ty + th + 46, w: 220, anim: 'draw', dur: .8 }];
          if (sec.scenes[0] === sc) body.push({ id: id('n'), type: 'bignum', text: String(no).padStart(2, '0'), x: 620, y: 1060, size: 280,
            color: 'rgba(178,58,37,.13)', anim: 'fade', dur: 1.2 });
        }
      } else {
        const TB = LAYOUT_TITLE[sc.layout] || { x: 180, y: 350, w: 1560 };
        // 横屏断行表（文案名.横屏断行.json）：标题按表断；窄标题栏（图表、截图旁）按最长一行缩字号，保证不再自动折行
        let tSize = TB.size || (isSpan && TB.w < 900 ? 82 : undefined);
        const hb = opts.hbreaks || {}, hp = (sc.head || '').replace(/==/g, '');
        if (sc.head && !sc.head.includes('\n') && hb[hp]) {
          sc.head = insertBreaks(sc.head, cutsOf(hb[hp]));
          const longest = Math.max(...sc.head.replace(/==/g, '').split('\n').map(visLen));
          tSize = Math.min(tSize || 104, Math.floor(TB.w / longest));
        }
        if (sc.kicker) els.push({ id: id('k'), type: 'kicker', text: sc.kicker, x: TB.x + 10, y: TB.y - 52, anim: 'left' });
        const onTop = sc.layout === '满屏' ? 5 : undefined;
        if (sc.head) els.push({ id: id('h'), type: 'title', text: sc.head,
          x: TB.x, y: TB.y, w: TB.w, z: onTop, size: tSize, anim: 'up' });
        if (onTop && els[0] && els[0].type === 'kicker') els[0].z = onTop;

        const explicit = !!sc.items.length && LAYOUTS[sc.layout];
        const maker = LAYOUTS[sc.layout] || LAYOUTS.title;
        body = explicit ? maker(sc.items, id, opts.hbreaks || {}, { head: !!sc.head }) : LAYOUTS._bare([], id, no);

        // 标题占两行以上时，把下面的内容整体往下挪（图表类版式标题在旁边，不用挪）
        const extra = isSpan || TB.fixed ? 0 : Math.max(0, (sc.head || '').split('\n').length - 1) * 118;
        if (extra) body.forEach(e => { if (e.type !== 'bignum') e.y += extra; });
      }
      els.push(...body);

      // 按旁白触发的效果。坐标都写比例：[推近]、扫光相对本屏第一张图（去掉白边），没有图就相对整屏；[弹字]、[盖章] 相对整屏（中心点）
      //   [推近] 中心x,中心y,倍数 | 扫光 x0,y0,x1,y1（可省）   [拉回]
      //   [弹字] 文字 | x,y | 白/黄/红/黑 | 延迟秒 | 字号        [盖章] 文字 | x,y | 角度 | 延迟秒 | 字号
      const media0 = body.find(e => e.type === 'media');
      const relXY = (rx, ry) => media0
        ? [media0.x + 14 + (media0.w - 28) * rx, media0.y + 14 + (media0.h - 28) * ry]
        : [meta.vw * rx, meta.vh * ry];
      const nums = s => String(s || '').split(/[,，\s]+/).filter(Boolean).map(Number);
      const fxEls = [], focusMarks = [];
      (sc.fx || []).forEach((f, k) => {
        const a = f.args;
        const shf = /^\+(\d+)句$/.exec(a.find(v => /^\+\d+句$/.test(v)) || ''), sft = shf ? Number(shf[1]) : 0;   // 「+N句」：落到这一行拆出的第 N+1 句
        if (f.kind === '推近') {
          const [rx, ry, z] = nums(a[0]), [x, y] = relXY(rx, ry);
          focusMarks.push({ line: f.line, shift: sft, focus: { x: Math.round(x), y: Math.round(y), zoom: z || 1.6 } });
          if (a[1] && !/句$/.test(a[1])) {
            const [x0, y0, x1, y1] = nums(a[1]), [ax, ay] = relXY(x0, y0), [bx, by] = relXY(x1, y1);
            const e = { id: id('fx' + k), type: 'sweep', x: Math.round(ax), y: Math.round(ay), w: Math.round(bx - ax), h: Math.round(by - ay),
              anim: 'draw', dur: 0.5, delay: 0.6, z: 3 };
            els.push(e); fxEls.push({ line: f.line, id: e.id, shift: sft });
          }
        } else if (f.kind === '拉回') {
          focusMarks.push({ line: f.line, shift: sft, focus: null });
        } else {
          const stamp = f.kind === '盖章', [px, py] = nums(a[1] || (stamp ? '0.5,0.42' : '0.5,0.66'));
          const e = { id: id('fx' + k), type: stamp ? 'bigstamp' : 'pop', text: a[0] || '', x: Math.round(meta.vw * px), y: Math.round(meta.vh * py),
            center: true, size: Number(a[4]) || (stamp ? 104 : 52), delay: shf ? 0 : (Number(a[3]) || 0), z: stamp ? 7 : 6 };
          const keep = /留$/.test(a[2] || '');                  // 样式后加「留」（如「白留」）：不随下一组弹字消失，留到本屏结束
          if (stamp) Object.assign(e, { rot: a[2] ? Number(a[2]) : -8, anim: 'stamp', dur: 0.5 });
          else Object.assign(e, { cls: { 白: 'pw', 黄: 'py', 红: 'pr', 黑: 'pk' }[(a[2] || '').replace(/留$/, '')] || 'py', anim: 'bounce', dur: 0.45 });
          els.push(e); fxEls.push({ line: f.line, id: e.id, shift: sft, pop: !stamp && !keep });
        }
      });

      const zoomIn = idx % 2 === 0, ZM = V ? 1.035 : 1.05;   // 竖屏推镜幅度小一点
      scenes.push({
        chapter: sec.chapter, no,
        src: { l0: sc.l0 || 0, l1: sc.l1 || 0, layout: sc.layout, head: sc.head || '', items: sc.items.slice() },
        x: X, y: Y,
        camera: { cx: meta.vw / 2, cy: meta.vh / 2, zoom: zoomIn ? 1 : ZM },
        camEnd: { cx: meta.vw / 2, cy: meta.vh / 2, zoom: zoomIn ? ZM : 1 },
        elements: els
      });

      // 旁白 → beats，元素按句子依次出现
      const says = splitLines(sc.say.join('\n'));
      const headIds = els.filter(e => /_[kh]$/.test(e.id)).map(e => e.id);
      // first：这块画面和标题一起在第一句出现（人群、话筒、线稿），其余元素再按句子依次出
      const firstIds = body.filter(e => e.first).map(e => e.id);
      const bodyIds = body.filter(e => !e.first).map(e => e.id);
      const list = says.length ? says : [''];
      const startBeat = headIds.length ? 1 : 0;
      const nB = Math.max(1, list.length - startBeat);
      const slot = new Map();                               // 元素 -> 第几句出现
      if (isSpan) {
        slot.set(Math.min(startBeat, list.length - 1), bodyIds.slice());   // 图表一次就位，之后自己画
      } else {
        bodyIds.forEach((bid, j) => {
          const k = startBeat + Math.floor(j * nB / Math.max(1, bodyIds.length));
          if (!slot.has(k)) slot.set(k, []);
          slot.get(k).push(bid);
        });
      }
      // 效果写在第 L 行旁白前 → 落在这一行拆出的第一句字幕上（拆字幕是逐行进行的，前面几行拆出几句就是第几句）
      const beatOfLine = L => Math.min(list.length - 1, splitLines(sc.say.slice(0, L).join('\n')).length);
      const grp = f => Math.min(list.length - 1, beatOfLine(f.line) + (f.shift || 0));
      const B0 = beats.length + 1;                          // 本屏第一句在全片 beats 里的序号（+1：最后会在最前面插入片头那一句）
      fxEls.forEach(f => {
        if (!f.pop) return;
        const later = fxEls.filter(g => g.id !== f.id && els.find(e => e.id === g.id).type !== 'sweep' && grp(g) > grp(f)).map(grp)
          .concat(focusMarks.filter(m => m.focus).map(grp).filter(b => b > grp(f)));
        if (later.length) els.find(e => e.id === f.id).hideBeat = B0 + Math.min(...later);
      });
      const focusAt = list.map(() => null);
      const marks = focusMarks.map(m => ({ b: grp(m), focus: m.focus })).sort((p, q) => p.b - q.b);
      const lastLine = beatOfLine(Math.max(0, sc.say.length - 1));   // 本屏最后一行旁白的第一句
      marks.forEach((m, j) => {                             // 推近一直保持到下一个 [推近]/[拉回]；都没有就在本屏最后一行旁白前拉回（推近写在最后一行的，保持到本屏结束）
        const end = j + 1 < marks.length ? marks[j + 1].b : (m.b < lastLine ? lastLine : list.length);
        for (let i = m.b; i < end; i++) focusAt[i] = m.focus;
      });
      list.forEach((s, i) => {
        let show = i === 0 ? headIds.concat(firstIds) : [];
        show = show.concat(slot.get(i) || []);
        if (i === list.length - 1) {                        // 兜底：没排上的最后一起出现
          const shown = new Set([...slot.values()].flat());
          bodyIds.forEach(x => { if (!shown.has(x)) show.push(x); });
        }
        fxEls.forEach(f => { if (Math.min(list.length - 1, beatOfLine(f.line) + (f.shift || 0)) === i) show.push(f.id); });
        const bt = { scene: scenes.length - 1, say: forSub(s), tts: s, show };
        if (focusAt[i]) bt.focus = focusAt[i];
        if (V) bt.sub = vWrap(bt.say, opts.breaks || {});        // 竖屏字幕预先断成两行
        const F = FOCUS_LAYOUTS[sc.layout];
        if (!V && F && isSpan && i === list.length - 1 && list.length >= 2 && body[0]) {
          bt.focus = { x: body[0].x + body[0].w * F.dx, y: body[0].y + (body[0].h || 500) * F.dy, zoom: F.zoom };
        }
        beats.push(bt);
      });
    });
  });

  // 片头的 beats
  beats.unshift({ scene: 0, say: '', show: scenes[0].elements.map(e => e.id) });

  return { meta, scenes, beats };
}
