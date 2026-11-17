/* 字幕（共用）：解析 **强调**、自动强调数字/金额/术语、按标点切成一屏一条、导出 .srt */

const NUM_RE = /[−\-]?\d[\d,，.]*(?:\s*(?:万日元|万|日元|元|倍|%|公斤|个月|年|月))?/g;

// 返回 [{ch, em}]，ch 为单个字符
export function parseEmphasis(text, terms = [], extra = []) {
  const chars = [];
  let em = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '*' && text[i + 1] === '*') { em = !em; i++; continue; }
    chars.push({ ch: text[i], em });
  }
  const plain = chars.map(c => c.ch).join('');
  const mark = (start, len) => { for (let k = start; k < start + len; k++) chars[k].em = true; };
  for (const m of plain.matchAll(NUM_RE)) mark(m.index, m[0].trimEnd().length);
  for (const t of [...terms, ...extra]) {
    let idx = plain.indexOf(t);
    while (idx >= 0) { mark(idx, t.length); idx = plain.indexOf(t, idx + t.length); }
  }
  return chars;
}

export const stripMarks = text => text.replace(/\*\*/g, '');

const width = ch => (/[\x00-\xff]/.test(ch) ? 0.55 : 1);

// 先按标点切短句，再贪心拼成不超过 maxWidth 的一屏
export function chunk(chars, maxWidth = 22) {
  const phrases = [];
  let cur = [];
  chars.forEach((c, i) => {
    cur.push(c);
    // 数字里的千分位逗号（5,000）不切
    const inNum = /[,，]/.test(c.ch) && /\d/.test(chars[i - 1]?.ch ?? '') && /\d/.test(chars[i + 1]?.ch ?? '');
    if (/[，。！？：；、,!?:;]/.test(c.ch) && !inNum && i < chars.length - 1) { phrases.push(cur); cur = []; }
  });
  if (cur.length) phrases.push(cur);
  const w = arr => arr.reduce((s, c) => s + width(c.ch), 0);
  const out = [];
  let buf = [];
  for (const p of phrases) {
    if (buf.length && w(buf) + w(p) > maxWidth) { out.push(buf); buf = []; }
    if (w(p) > maxWidth) { // 单句太长：硬切
      let piece = [];
      for (const c of p) { if (w(piece) + width(c.ch) > maxWidth) { out.push(piece); piece = []; } piece.push(c); }
      buf = piece;
    } else buf = buf.concat(p);
  }
  if (buf.length) out.push(buf);
  return out;
}

// 句尾的逗号句号不上屏
export function toRuns(chars) {
  const trimmed = [...chars];
  while (trimmed.length && /[，。,、：；]/.test(trimmed[trimmed.length - 1].ch)) trimmed.pop();
  // 硬切时句尾标点可能被挤到下一屏开头（「，或者…」），开头的也不上屏
  while (trimmed.length && /[，。,、：；]/.test(trimmed[0].ch)) trimmed.shift();
  const runs = [];
  for (const c of trimmed) {
    const last = runs[runs.length - 1];
    if (last && last.em === c.em) last.t += c.ch; else runs.push({ t: c.ch, em: c.em });
  }
  return runs;
}

const ts = s => {
  const ms = Math.max(0, Math.round(s * 1000));
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};

export function toSrt(entries) {
  return entries.map((e, i) => `${i + 1}\n${ts(e.start)} --> ${ts(e.end)}\n${e.text}\n`).join('\n');
}
