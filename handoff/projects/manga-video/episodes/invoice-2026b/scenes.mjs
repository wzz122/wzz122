/* Invoice 登记号，小老板到底办不办？（易懂版第四稿，2026-11-15）的场景。
   用户要求：给没学过税的小老板看；每个名词配小例子；图表要帮助理解。做法：
   - 全片只有一种图：一根「销项」长条。右端绿色 = 能减掉的进项，剩下的 = 交给国家。花店、广告公司、设计工作室都用它。
   - 颜色全片固定：橙 paid = 付出去 / 交出去的税；绿 credit = 能减掉；黄 self = 减不掉、自己多负担；蓝 / 藏青 = 中性（收到的税、要交的数）。
   - 每个名词出现时，画面上先有例子里的那一块，再贴名字。
   坐标：1920×1080，(x, y) 是中心；bar 的 x 是左边缘。主体放在 y 70–870、x 300–1580。老师和芝士全程在画面上。 */
import fs from 'node:fs';

const T = (text, size, x, y, { cue, more = [], ...rest } = {}) => ({ kind: 'text', text, size, weight: 700, ...rest, keys: [[cue, { x, y }], ...more] });
const OUT = { o: 0, dur: 12 };
const out = cue => [cue, OUT];
const shift = (cue, d) => { const m = cue.match(/^(.*?)([+-]\d+(?:\.\d+)?)?$/); const off = +(Number(m[2] ?? 0) + d).toFixed(2); return off ? `${m[1]}${off > 0 ? '+' : ''}${off}` : m[1]; };
const arrow = (from, to, cue, o = {}) => ({ id: o.id, kind: 'arrow', from, to, color: o.color ?? 'navy', bend: o.bend ?? 60, dash: o.dash, label: o.label, keys: [[cue, { fade: true, p: 0 }], [shift(cue, 0.05), { p: 1, dur: 14 }], ...(o.more ?? [])] });
const title = (text, cue, more = []) => ({ id: 'goal', ...T(text, 54, 940, 100, { cue, weight: 900, more }) });
const card = (id, value, x, y, cue, o = {}) => ({ id, kind: 'card', color: o.color ?? 'navy', label: o.label, value, size: o.size ?? 44, labelSize: o.labelSize ?? 30, minW: o.minW, valueColor: o.valueColor, role: o.role, keys: [[cue, { x, y }], ...(o.more ?? [])] });
const pill = (id, value, x, y, cue, o = {}) => ({ id, kind: 'pill', color: o.color ?? 'navy', label: o.label, value, size: o.size ?? 40, labelSize: o.labelSize ?? 26, role: o.role, keys: [[cue, { x, y }], ...(o.more ?? [])] });
const premise = (value, cue, more = [], y = 198) => ({ id: 'premise', kind: 'card', color: 'gray', value, size: 40, valueColor: '#3A4A6B', keys: [[cue, { x: 940, y }], ...more] });
const bar = (id, label, color, x, y, w, cue, o = {}) => ({ id, kind: 'bar', color, role: o.role, label, h: o.h ?? 100, size: o.size ?? 40, dark: o.dark, keys: [[cue, { x, y, w }], ...(o.more ?? [])] });
const stamp = (id, text, color, x, y, cue, o = {}) => ({ id, kind: 'stamp', color, text, size: o.size ?? 50, keys: [[cue, { x, y }], ...(o.more ?? [])] });
const emoji = (text, size, x, y, cue, more = [], id) => ({ id, kind: 'emoji', text, size, keys: [[cue, { x, y }], ...more] });
const wallet = (id, size, x, y, cue, more = []) => ({ id, kind: 'prop', style: 'wallet', size, keys: [[cue, { x, y }], ...more] });
const grid = (id, cols, colW, rows, x, y, cue, o = {}) => ({ id, kind: 'grid', cols, colW, rows, rowH: o.rowH ?? 84, size: o.size ?? 36, keys: [[cue, { x, y, n: o.n ?? rows.length, hl: [], hlCol: -1, ...(o.first ?? {}) }], ...(o.more ?? [])] });

// 官方原件沿用上一版截好的（public/episodes/invoice-2026/m/，出处见 facts.md「三」）
const IMG = n => `episodes/invoice-2026/m/${n}`;
const PAD = 24, CW = 1240;
const png = f => { const b = fs.readFileSync(new URL(`../../public/${IMG(f)}`, import.meta.url)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
const docH = (file, w) => { const z = png(file); return Math.round((w - 2 * PAD - 12) * z[1] / z[0] + 2 * PAD + 12); };
const doc = (id, file, source, w, marks, keys) => ({ id, kind: 'image', src: IMG(file), source, w, h: docH(file, w), pad: PAD, labelAbove: true, marks, keys });

const NTA = '国税厅';
const TOKUSHU = `${NTA} · 令和 8 年度税制改正特集`;
const PREM = '例：朋友的设计工作室 · 一年 300 万 ＋ 消费税 30 万';
const AD = '例：客户是一家广告公司 · 今年收到的销项 100 万';

// 第 6 段的对比图：四个时期，每个时期两根柱子（黄 = 不办，客户最多亏；橙 = 办了，你自己交）
const BASE = 750, PX = 11;   // 柱子底边 y、每 1 万的高度
const GX = [540, 810, 1080, 1350];
const PERIOD = ['现在 ～\n2028 年 9 月', '2028 年 10 月 ～\n2030 年 9 月', '2030 年 10 月 ～\n2031 年 9 月', '2031 年 10 月\n以后'];
const LOSS = [9, 15, 21, 30], PAY = [9, 15, 15, 15], PAYTXT = ['6 → 9 万', '15 万', '15 万', '15 万'];
const col = (id, color, role, v, x, cue, more = []) => bar(id, '', color, x - 50, BASE - v * PX / 2, 100, cue, { role, h: v * PX, more });

export default {
  /* ───────── 片头：先说答案 ───────── */
  cold: {
    sfx: 'explicit',
    states: [
      { id: 'ask', cue: '0', why: '客户问：有没有登记号？', focus: 'ask', hold: 1.2 },
      { id: 'one', cue: '1:办还是不办', why: '今天只想清楚一件事：这个号，办还是不办', focus: 'goal', hold: 1.5, sfx: 'tick-1' },
      { id: 'near', cue: '2:这两三年', why: '答案：这两三年，办不办差不多', focus: 'a1', hold: 1.2, sfx: 'tick-2' },
      { id: 'far', cue: '2:越往后', why: '越往后，不办越吃亏', focus: 'a2', hold: 2, sfx: 'tick-3' },
    ],
    objects: [
      title('客户问你：有登记号吗？', '@ask', [['@one', { text: '登记号：办，还是不办？' }], ['@near', { text: '先说答案' }]]),
      emoji('🏢', 130, 560, 400, '@ask', [out('@near-0.3')]),
      T('客户', 34, 560, 500, { cue: '@ask', more: [out('@near-0.3')] }),
      card('ask', '你有 Invoice 登记号吗？', 1120, 400, '@ask', { label: '客户发来的邮件', color: 'gray', size: 48, labelSize: 34, valueColor: '#3A4A6B', more: [out('@near-0.3')] }),
      pill('yes', '办', 760, 660, '@one', { color: 'purple', size: 60, more: [out('@near-0.3')] }),
      { kind: 'op', text: '还是', size: 54, keys: [['@one', { x: 940, y: 660 }], out('@near-0.3')] },
      pill('no', '不办', 1130, 660, '@one', { color: 'teal', size: 60, more: [out('@near-0.3')] }),
      card('a1', '办不办，差不多', 940, 360, '@near', { label: '这两三年', color: 'navy', size: 56, labelSize: 36, minW: 760 }),
      card('a2', '不办，越吃亏', 940, 610, '@far', { label: '越往后', color: 'red', size: 56, labelSize: 36, minW: 760 }),
    ],
  },

  /* ───────── 第 1 段开头：一封邮件 ───────── */
  mail: {
    sfx: 'explicit',
    states: [
      { id: 'friend', cue: '0', why: '芝士的朋友开了个小设计工作室', focus: 'pc', hold: 1 },
      { id: 'mail', cue: '0:邮件', why: '客户突然发来邮件：有没有登记号', focus: 'mail', hold: 1.2, sfx: '纸张滑入' },
      { id: 'price', cue: '1', why: '没有的话，价钱要重新谈', focus: 'mail', hold: 1.5 },
      { id: 'calm', cue: '2', why: '先别慌', focus: 'goal', hold: 0.6 },
      { id: 'two', cue: '2:两个词', why: '要看懂这封邮件，先认识两个词', focus: 'w1', hold: 1.2, sfx: 'tick-1' },
      { id: 'shop', cue: '2:花店', why: '用一家花店来讲', focus: 'shopE', hold: 1.2 },
    ],
    objects: [
      title('朋友的小设计工作室', '@friend', [['@calm', { text: '先别慌：先认识两个词' }]]),
      emoji('🧑‍💻', 150, 520, 390, '@friend', [out('@calm-0.2')], 'pc'),
      T('朋友：开小设计工作室', 36, 520, 510, { cue: '@friend', more: [out('@calm-0.2')] }),
      card('mail', '📩 来了一封新邮件', 1130, 400, '@mail', { label: '客户的邮件', color: 'gray', size: 46, labelSize: 34, valueColor: '#3A4A6B', more: [['@mail+0.5', { value: '请问您有登记号吗？' }], ['@price', { value: '请问您有登记号吗？\n没有的话，价钱要重新谈。' }], out('@calm-0.2')] }),
      pill('w1', '第一个词：销项税额', 660, 360, '@two', { color: 'navy', size: 44 }),
      pill('w2', '第二个词：进项税额', 1220, 360, '@two+0.4', { color: 'navy', size: 44 }),
      emoji('💐', 150, 940, 590, '@shop', [], 'shopE'),
      T('用一家花店来讲', 38, 940, 710, { cue: '@shop' }),
    ],
  },

  /* ───────── 第 1 段：花店的一束花（销项 100 − 进项 30 ＝ 交 70）───────── */
  flower: {
    sfx: 'explicit',
    states: [
      { id: 'sell', cue: '3', why: '花店卖一束花，1,000 日元', focus: 'shopE', hold: 1 },
      { id: 'pay', cue: '3:1100', why: '客人实际付 1,100', focus: 'buyer', hold: 0.8 },
      { id: 'tax', cue: '3:多出来', why: '多出来的 100 是消费税', focus: 'got', hold: 1.2, sfx: 'tick-1' },
      { id: 'hold', cue: '5:先收下', why: '花店只是先收下，以后要交给国家', focus: 'gov', hold: 1.2 },
      { id: 'out', cue: '6:销项税额', why: '名词：销项税额 ＝ 卖东西时收到的税（花店：100）', focus: 'tb', hold: 2.5, point: 'tb', sfx: '叮-落定' },
      { id: 'buy', cue: '8:批发市场', why: '另一头：花店去批发市场进花，一批 300 日元', focus: 'supply', hold: 1 },
      { id: 'p30', cue: '8:就是', why: '也要付 10% 的消费税：30', focus: 'paid30', hold: 1.2, sfx: 'tick-2' },
      { id: 'in', cue: '9:进项税额', why: '名词：进项税额 ＝ 进货时付出去的税（花店：30）', focus: 'tb', hold: 2.5, point: 'tb', sfx: '叮-落定' },
      { id: 'q', cue: '11', why: '那花店最后要交给国家多少？', focus: 'goal', hold: 1 },
      { id: 'all', cue: '12', why: '芝士：收了 100，就交 100？', focus: 'allTag', hold: 1.2 },
      { id: 'twice', cue: '13:批发商', why: '那 30 批发商已经收走了；再交 100，这束花就被收了两遍税', focus: 'twice', hold: 2.5 },
      { id: 'minus', cue: '14:100 减 30', why: '所以只交 100 减 30', focus: 'cut', hold: 0.8, sfx: 'tick-3' },
      { id: 'p70', cue: '14:交 70', why: '交 70', focus: 'got', hold: 1.5, sfx: '叮-落定' },
      { id: 'term', cue: '15:进项抵扣', why: '名词：进项抵扣 ＝ 把进项从销项里减掉', focus: 'tb', hold: 2.5, point: 'tb' },
      { id: 'sum', cue: '16', why: '销项 − 进项 ＝ 交给国家', focus: 'sumStamp', hold: 1.5 },
      { id: 'key', cue: '17', why: '今天后面所有的事，都离不开这一句', focus: 'sumStamp', hold: 2, sfx: '盖章-两下' },
    ],
    objects: [
      title('花店卖一束花', '@sell', [['@buy', { text: '再看另一头：花店去进货' }], ['@q', { text: '花店要交给国家多少？' }], ['@term', { text: '进项抵扣：销项 − 进项' }]]),
      emoji('🧑', 96, 460, 232, '@sell', [], 'buyer'),
      T('客人', 30, 460, 310, { cue: '@sell' }),
      arrow([540, 232], [850, 232], '@sell', { label: '一束花 1,000 日元', bend: 40 }),
      emoji('💐', 96, 940, 232, '@sell', [], 'shopE'),
      T('花店', 30, 940, 310, { cue: '@sell' }),
      T('实际付 1,100 日元', 32, 700, 300, { cue: '@pay', color: 'gray' }),
      emoji('🏛️', 96, 1420, 232, '@hold', [], 'gov'),
      T('国家', 30, 1420, 310, { cue: '@hold' }),
      arrow([1020, 232], [1340, 232], '@hold', { label: '以后交上去', bend: 40, dash: true }),
      // 一根长条：销项 100。右端 30 是能减掉的进项，剩下 70 交给国家
      bar('got', '收到的消费税 100', 'blue', 420, 420, 600, '@tax', { size: 36, h: 84, more: [['@out', { label: '销项 100' }], ['@minus+0.3', { w: 420, dur: 16 }], ['@p70', { label: '交给国家 70', color: 'navy' }]] }),
      bar('cut', '− 30', 'green', 840, 420, 180, '@minus', { role: 'credit', size: 36, h: 84 }),
      { id: 'supply', ...T('🚚 进货：一批花 300 日元', 32, 610, 525, { cue: '@buy' }) },
      bar('paid30', '30', 'orange', 840, 525, 180, '@p30', { role: 'paid', size: 36, h: 70, more: [['@in', { label: '进项 30' }]] }),
      T('← 进货时付出去的消费税', 30, 1215, 525, { cue: '@p30', color: 'gray', more: [out('@twice-0.3')] }),
      { id: 'allTag', ...T('交 100？', 44, 1180, 420, { cue: '@all', color: 'red', more: [out('@minus-0.2')] }) },
      card('twice', '那 30，批发商已经收走了\n再交 100 → 被收了两遍税', 1300, 525, '@twice', { color: 'red', size: 30, more: [out('@minus-0.2')] }),
      // 名词表：讲到一个，出现一行
      grid('tb', ['名词', '是什么', '花店的例子'], [300, 520, 260], [['销项税额', '卖东西时收到的税', '100'], ['进项税额', '进货时付出去的税', '30'], ['进项抵扣', '销项 − 进项 ＝ 要交的税', '70']], 940, 725, '@out', { n: 1, rowH: 66, size: 34, first: { hl: [0] }, more: [['@buy', { hl: [] }], ['@in', { n: 2, hl: [1], dur: 10 }], ['@q', { hl: [] }], ['@term', { n: 3, hl: [2], dur: 10 }], ['@sum', { hl: [] }]] }),
      stamp('sumStamp', '销项 − 进项 ＝ 交给国家', 'navy', 1330, 490, '@sum', { size: 42 }),
    ],
  },

  /* ───────── 第 2 段：小生意的优待（免税事业者）→ 设计工作室的 30 万 ───────── */
  exempt: {
    sfx: 'explicit',
    states: [
      { id: 'perk', cue: '0', why: '小生意有一个优待', focus: 'goal', hold: 0.8 },
      { id: 'term', cue: '1:1000 万', why: '一年营业额 1,000 万日元以下，消费税可以不交：免税事业者', focus: 'term', hold: 2.5, point: 'term', sfx: 'tick-1' },
      { id: 'q', cue: '2', why: '芝士：那花店收的那 100 呢？', focus: 'goal', hold: 1 },
      { id: 'keep', cue: '3', why: '留在自己的钱包里', focus: 'wal', hold: 1.5, sfx: '叮-落定' },
      { id: 'ex', cue: '4', why: '换成朋友来算，后面一直用这个例子', focus: 'premise', hold: 1 },
      { id: 'fee', cue: '5:300 万', why: '一年做 300 万的设计', focus: 'fee', hold: 1 },
      { id: 'tax', cue: '5:30 万', why: '另外收 30 万消费税：这是他的销项', focus: 'tax', hold: 1.5, sfx: 'tick-2' },
      { id: 'inq', cue: '6', why: '芝士：那他的进项呢？', focus: 'goal', hold: 0.8 },
      { id: 'in3', cue: '7:大概', why: '做设计几乎不用进货：买软件、买电脑付的税，大概 3 万', focus: 'in3', hold: 2, sfx: 'tick-3' },
      { id: 'all', cue: '8:全部留下', why: '免税事业者：销项 30 万不用交，全部留下', focus: 'tax', hold: 1.5, point: 'wal', sfx: '叮-落定' },
      { id: 'more', cue: '9', why: '芝士：等于每年多拿 30 万？', focus: 'moreTag', hold: 1.2 },
      { id: 'rule', cue: '10', why: '不违规：规则本来就是这么定的', focus: 'ruleTag', hold: 1.5 },
      { id: 'care', cue: '11', why: '国家怕小生意算税太累，才给了这个优待', focus: 'careTag', hold: 2 },
    ],
    objects: [
      title('小生意，有一个优待', '@perk', [['@q', { text: '那花店收的那 100 呢？' }], ['@ex', { text: '换成朋友的工作室来算' }], ['@inq', { text: '那他的进项呢？' }], ['@all', { text: '销项 30 万：全部留下' }]]),
      card('term', '一年营业额 1,000 万日元以下\n→ 消费税可以不交', 940, 300, '@term', { label: '名词：免税事业者（免税事業者）', size: 44, more: [out('@q-0.3')] }),
      doc('base', 'big-menzei.png', `${NTA} · タックスアンサー No.6501 納税義務の免除`, CW, [[0.60, 0.575, 0.985, 0.737], [0.246, 0.80, 0.525, 0.965], [0.564, 0.35, 0.743, 0.51]],
        [['@term+0.6', { x: 940, y: 650, cx: 0.5, cy: 0.5, z: 1, mk: [0, 1] }], out('@q-0.3')]),
      // 花店的 100：留在钱包里
      bar('f100', '花店收到的销项 100', 'blue', 520, 420, 460, '@q', { size: 34, h: 84, more: [['@keep', { x: 620, y: 600, dur: 18 }], out('@ex-0.3')] }),
      wallet('wal', 230, 1240, 600, '@keep-0.2', [['@ex', { x: 1290, y: 640, dur: 14 }]]),
      { id: 'walTag', ...T('自己的钱包', 34, 1240, 730, { cue: '@keep-0.2', more: [['@ex', { x: 1290, y: 770, dur: 14 }]] }) },
      T('不用交给国家 →', 36, 1010, 520, { cue: '@keep', color: 'gray', more: [out('@ex-0.3')] }),
      premise(PREM, '@ex'),
      bar('fee', '设计费 300 万', 'blue', 330, 360, 820, '@fee'),
      bar('tax', '销项 30 万', 'navy', 1170, 360, 250, '@tax', { size: 36, more: [['@all', { x: 880, y: 640, dur: 18 }]] }),
      bar('in3', '3 万', 'orange', 1170, 480, 130, '@in3', { role: 'paid', size: 34, h: 72 }),
      T('进项（买软件、买电脑付的税）：大概 →', 32, 800, 480, { cue: '@in3', color: 'gray' }),
      T('不用交：全部留下 →', 36, 620, 640, { cue: '@all', color: 'gray', more: [out('@rule-0.2')] }),
      stamp('moreTag', '每年多拿 30 万？', 'red', 700, 790, '@more', { size: 44, more: [out('@rule-0.2')] }),
      { id: 'ruleTag', ...T('不违规：规则本来就是这么定的', 36, 700, 760, { cue: '@rule' }) },
      { id: 'careTag', ...T('国家怕小生意算税太累，才给了这个优待', 34, 700, 825, { cue: '@care', color: 'gray' }) },
    ],
  },

  /* ───────── 第 3 段：Invoice ＝ 带号的账单 ───────── */
  inv: {
    sfx: 'explicit',
    states: [
      { id: 'new', cue: '0', why: '2023 年，国家加了一条新规则', focus: 'goal', hold: 0.8 },
      { id: 'about', cue: '0:进项抵扣', why: '管的就是进项抵扣', focus: 'about', hold: 1.2, sfx: 'tick-1' },
      { id: 'old', cue: '1', why: '以前：花店拿着批发商的账单，就能把那 30 减掉', focus: 'billOld', hold: 2, sfx: '纸张滑入' },
      { id: 'now', cue: '2:登记号', why: '现在：账单上必须有一个登记号，才能减', focus: 'billNew', hold: 2, point: 'billNew', sfx: 'tick-2' },
      { id: 'name', cue: '2:带号', why: '名词：Invoice ＝ 带登记号的账单（T ＋ 13 位数字）', focus: 'term', hold: 2.5, sfx: '叮-落定' },
      { id: 'q', cue: '3', why: '芝士：那没有号的账单呢？', focus: 'goal', hold: 1 },
      { id: 'no', cue: '4', why: '就不能全减了；站到朋友的客户那边看', focus: 'noStamp', hold: 2 },
    ],
    objects: [
      title('2023 年：加了一条新规则', '@new', [['@old', { text: '以前：有账单，就能减' }], ['@now', { text: '现在：账单上要有登记号' }], ['@q', { text: '那没有号的账单呢？' }]]),
      pill('about', '新规则管的，就是「进项抵扣」', 940, 330, '@about', { color: 'navy', size: 46, more: [out('@old-0.3')] }),
      { id: 'billOld', kind: 'doc', title: '請求書（批发商的账单）', w: 560, rowH: 76, rows: [{ k: '花', v: '300 円' }, { k: '消費税（10%）', v: '30 円' }], keys: [['@old', { x: 640, y: 420, hl: [1] }], out('@now-0.2')] },
      pill('oldTag', '有这张账单 → 进项 30 可以减掉', 1230, 420, '@old+0.4', { color: 'green', role: 'credit', size: 36, more: [out('@now-0.2')] }),
      { id: 'billNew', kind: 'doc', title: '請求書（批发商的账单）', w: 560, rowH: 76, rows: [{ k: '登録番号', v: 'T1234567890123' }, { k: '花', v: '300 円' }, { k: '消費税（10%）', v: '30 円' }], keys: [['@now', { x: 640, y: 420, hl: [0] }], out('@no-0.3')] },
      card('term', '带登记号的账单', 1250, 300, '@name', { label: '名词：Invoice（適格請求書）', size: 46, more: [out('@no-0.3')] }),
      card('numCard', 'T ＋ 13 位数字', 1250, 520, '@name+0.4', { label: '登记号（登録番号）', size: 46, more: [out('@no-0.3')] }),
      doc('numDoc', 'big-toroku.png', `${NTA} · インボイス Q&A 問 18（登録番号の構成）`, 900, [[0.06, 0.61, 0.545, 0.97]],
        [['@name+0.8', { x: 940, y: 786, cx: 0.5, cy: 0.5, z: 1, mk: [0] }], out('@no-0.3')]),
      { id: 'billNo', kind: 'doc', title: '請求書（没有登记号的账单）', w: 560, rowH: 76, rows: [{ k: '登録番号', v: '（没有）' }, { k: '設計料', v: '3,000,000 円' }, { k: '消費税（10%）', v: '300,000 円' }], keys: [['@no', { x: 640, y: 450, hl: [0] }]] },
      stamp('noStamp', '进项不能全减了', 'red', 1250, 380, '@no', { size: 48 }),
      T('站到朋友的客户那边，看一下 →', 38, 1250, 540, { cue: '4:站到' }),
    ],
  },

  /* ───────── 第 3 段：客户是广告公司（有号交 70 万，没号交 100 万）───────── */
  adco: {
    sfx: 'explicit',
    states: [
      { id: 'co', cue: '5', why: '假设客户是一家广告公司', focus: 'co', hold: 0.8 },
      { id: 's100', cue: '5:100 万', why: '它今年从自己的客人那里，收了 100 万销项', focus: 'base', hold: 1.5, sfx: 'tick-1' },
      { id: 'in30', cue: '6:30 万', why: '付给朋友 30 万消费税，这是它的进项', focus: 'in30', hold: 1.5, sfx: 'tick-2' },
      { id: 'has', cue: '7', why: '账单上有号：100 万 − 30 万', focus: 'okCut', hold: 1 },
      { id: 'p70', cue: '7:交 70 万', why: '它交 70 万', focus: 'base', hold: 1.5, sfx: '叮-落定' },
      { id: 'none', cue: '8', why: '账单上没号：这 30 万减不掉', focus: 'ngCut', hold: 1.2, sfx: 'hit-轻' },
      { id: 'p100', cue: '8:100 万', why: '它要交 100 万', focus: 'ngCut', hold: 1.5, point: 'ngCut' },
      { id: 'why', cue: '9', why: '同样一笔生意，多交 30 万：难怪它来问有没有号', focus: 'whyTag', hold: 2.5 },
    ],
    objects: [
      title('站到客户那边看一下', '@co', [['@has', { text: '账单上有号：减掉 30 万' }], ['@none', { text: '账单上没号：减不掉' }], ['@why', { text: '难怪它来问：有没有号' }]]),
      premise(AD, '@co'),
      emoji('🏢', 96, 400, 370, '@co', [], 'co'),
      T('广告公司', 30, 400, 450, { cue: '@co' }),
      // 上面一根：账单有号。下面一根：账单没号。两根留在画面上对比
      bar('base', '销项 100 万', 'blue', 520, 370, 900, '@s100', { size: 38, more: [['@has+0.4', { w: 630, dur: 16 }], ['@p70', { label: '交给国家 70 万', color: 'navy' }]] }),
      bar('in30', '进项 30 万', 'orange', 1150, 490, 270, '@in30', { role: 'paid', size: 34, h: 76, more: [out('@none-0.3')] }),
      T('付给朋友的消费税 →', 32, 950, 490, { cue: '@in30', color: 'gray', more: [out('@none-0.3')] }),
      bar('okCut', '减掉 30 万', 'green', 1150, 370, 270, '@has', { role: 'credit', size: 34 }),
      T('有号', 40, 1500, 370, { cue: '@has', color: 'green' }),
      bar('base2', '交给国家 100 万', 'navy', 520, 610, 630, '@none', { size: 38, more: [['@p100', { w: 630 }]] }),
      bar('ngCut', '减不掉 30 万', 'yellow', 1150, 610, 270, '@none', { role: 'self', dark: true, size: 34 }),
      T('没号', 40, 1500, 610, { cue: '@none', color: 'red' }),
      T('↑ 这一截，变成广告公司自己多交的税', 32, 1090, 705, { cue: '@p100', color: 'gray' }),
      { id: 'whyTag', ...T('同样一笔生意：70 万 → 100 万，多交 30 万', 40, 900, 790, { cue: '@why', color: 'red' }) },
    ],
  },

  /* ───────── 第 3 段：客户的三个办法 → 办 / 不办（表）───────── */
  choice: {
    sfx: 'explicit',
    states: [
      { id: 'ways', cue: '10', why: '你没有号，客户有三个办法', focus: 'goal', hold: 0.6 },
      { id: 'rd1', cue: '11:自己认了', why: '① 自己认了', focus: 'rd1', hold: 0.8, sfx: 'tick-1' },
      { id: 'rd2', cue: '11:商量降价', why: '② 跟你商量降价', focus: 'rd2', hold: 0.8, sfx: 'tick-2' },
      { id: 'rd3', cue: '11:换一个', why: '③ 换一个有号的人来做', focus: 'rd3', hold: 1.5, sfx: 'tick-3' },
      { id: 'q', cue: '12', why: '芝士：那朋友去办一个号，不就可以了？', focus: 'goal', hold: 1 },
      { id: 'cost', cue: '13', why: '可以办，谁都能办，但是有代价', focus: 'costTag', hold: 1.2 },
      { id: 'tb', cue: '14', why: '表：办了号 → 免税的优待没了，要开始交税', focus: 'tb', hold: 2, sfx: '纸张滑入' },
      { id: 'tb2', cue: '15:不办', why: '不办 → 可能被降价，甚至丢客户', focus: 'tb', hold: 2 },
      { id: 'calc', cue: '16:算一算', why: '所以要算一算：哪一头亏得少', focus: 'calcStamp', hold: 2, sfx: '盖章-两下' },
    ],
    objects: [
      title('你没有号，客户有三个办法', '@ways', [['@q', { text: '那去办一个号，不就可以了？' }], ['@tb', { text: '办，还是不办：各有代价' }]]),
      card('rd1', '自己认了', 500, 450, '@rd1', { label: '① 客户多交税', color: 'gray', size: 54, labelSize: 34, valueColor: '#3A4A6B', more: [out('@cost-0.3')] }),
      card('rd2', '跟你\n商量降价', 940, 450, '@rd2', { label: '② 你少拿', color: 'navy', size: 54, labelSize: 34, more: [out('@cost-0.3')] }),
      card('rd3', '换一个\n有号的人', 1380, 450, '@rd3', { label: '③ 你丢客户', color: 'red', size: 54, labelSize: 34, more: [out('@cost-0.3')] }),
      pill('costTag', '可以办，谁都能办 —— 但是有代价', 940, 420, '@cost', { color: 'navy', size: 46, more: [out('@tb-0.3')] }),
      grid('tb', ['', '办了号', '不办'], [300, 440, 440], [['你', '免税的优待没了\n要开始交消费税', '不用交'], ['客户', '进项照常减', '进项减不掉，要多交'], ['结果', '你到手变少', '可能被降价、丢客户']], 940, 450, '@tb', { rowH: 108, size: 36, first: { hlCol: 1 }, more: [['@tb2', { hlCol: 2 }], ['@calc', { hlCol: -1, hl: [2] }]] }),
      stamp('calcStamp', '算一算：哪一头亏得少', 'red', 940, 770, '@calc'),
    ],
  },

  /* ───────── 第 4 段：先算不办（同一根 30 万：能减的越来越少）───────── */
  nobuy: {
    sfx: 'explicit',
    states: [
      { id: 'start', cue: '0', why: '先算不办', focus: 'goal', hold: 0.8 },
      { id: 'step', cue: '0:一级一级', why: '国家没有让客户一下子亏 30 万，是一级一级来的', focus: 'full', hold: 1.5 },
      { id: 'r70', cue: '1:七成', why: '没有号的账单，客户现在还能减七成', focus: 'ok', hold: 1.2, sfx: 'tick-1' },
      { id: 'n21', cue: '1:21 万', why: '30 万的七成，是 21 万', focus: 'ok', hold: 1.2 },
      { id: 'ad', cue: '2:100 万', why: '广告公司：100 万 − 21 万 ＝ 交 79 万', focus: 'calc', hold: 1.5 },
      { id: 'n9', cue: '2:多交', why: '比有号的时候多交 9 万', focus: 'ng', hold: 1.5, point: 'ng', sfx: '叮-落定' },
      { id: 'r50', cue: '4:五成', why: '到 2028 年 10 月：只能减五成，亏 15 万', focus: 'ng', hold: 2, sfx: 'tick-2' },
      { id: 'r30', cue: '5:三成', why: '2030 年 10 月：只能减三成，亏 21 万', focus: 'ng', hold: 2, sfx: 'tick-3' },
      { id: 'r0', cue: '6:一点都', why: '2031 年 10 月以后：一点都不能减，30 万全亏', focus: 'ng', hold: 2.5, sfx: 'hit-轻' },
      { id: 'chart', cue: '7', why: '越往后，客户亏得越多（国税厅的原图：70% → 50% → 30% → 0）', focus: 'chartDoc', hold: 2.5, point: 'chartDoc', sfx: '纸张滑入' },
      { id: 'talk', cue: '8:越往后', why: '客户现在可能不说什么，但越往后，越会来找你谈', focus: 'talkTag', hold: 2.5 },
    ],
    objects: [
      title('先算不办：客户亏多少', '@start', [['@chart', { text: '越往后，客户亏得越多' }]]),
      premise('例：广告公司付给朋友的消费税 30 万 · 账单没有号', '@start', [out('@chart-0.3')]),
      { id: 'era', ...T('不是一下子全亏：一级一级来', 40, 940, 300, { cue: '@step', color: 'navy', more: [['@r70', { text: '现在 ～ 2028 年 9 月' }], ['@r50', { text: '2028 年 10 月 ～ 2030 年 9 月' }], ['@r30', { text: '2030 年 10 月 ～ 2031 年 9 月' }], ['@r0', { text: '2031 年 10 月以后' }], out('@chart-0.3')] }) },
      bar('full', '进项 30 万', 'orange', 330, 400, 1000, '@step', { role: 'paid', size: 38, h: 92, more: [out('@r70')] }),
      // 同一根 30 万：绿 = 还能减，黄 = 减不掉（客户亏的）
      bar('ok', '还能减 七成', 'green', 330, 400, 700, '@r70', { role: 'credit', size: 36, h: 92, more: [['@n21', { label: '还能减 21 万（七成）' }], ['@r50', { w: 500, label: '还能减 15 万（五成）', dur: 18 }], ['@r30', { w: 300, label: '9 万（三成）', dur: 18 }], ['@r0', { w: 10, o: 0.02, dur: 18 }], out('@chart-0.3')] }),
      bar('ng', '减不掉', 'yellow', 1030, 400, 300, '@r70', { role: 'self', dark: true, size: 36, h: 92, more: [['@n9', { label: '减不掉 9 万' }], ['@r50', { x: 830, w: 500, label: '减不掉 15 万', dur: 18 }], ['@r30', { x: 630, w: 700, label: '减不掉 21 万', dur: 18 }], ['@r0', { x: 330, w: 1000, label: '减不掉 30 万：全亏', dur: 18 }], out('@chart-0.3')] }),
      { id: 'calc', ...T('广告公司：销项 100 万 − 21 万 ＝ 交 79 万', 34, 940, 492, { cue: '@ad', more: [['@n9', { text: '广告公司：交 79 万，比有号的时候（70 万）多交 9 万' }], out('@r50-0.3')] }) },
      grid('tb', ['什么时候', '没号的账单还能减', '客户亏'], [500, 360, 240], [['现在 ～ 2028 年 9 月', '七成', '9 万'], ['2028 年 10 月 ～ 2030 年 9 月', '五成', '15 万'], ['2030 年 10 月 ～ 2031 年 9 月', '三成', '21 万'], ['2031 年 10 月以后', '不能减', '30 万']], 940, 695, '@n9', { n: 1, rowH: 64, size: 32, first: { hl: [0] }, more: [['@r50', { n: 2, hl: [1], dur: 10 }], ['@r30', { n: 3, hl: [2], dur: 10 }], ['@r0', { n: 4, hl: [3], dur: 10 }], out('@chart-0.3')] }),
      doc('chartDoc', 'chart753.png', TOKUSHU, 1100, [[0.18, 0.319, 0.328, 0.40], [0.161, 0.481, 0.342, 0.544], [0.683, 0.0125, 0.792, 0.081], [0.858, 0.919, 0.931, 0.978]],
        [['@chart', { x: 940, y: 455, cx: 0.5, cy: 0.5, z: 1, mk: [0] }], ['@talk', { mk: [3] }]]),
      pill('talkTag', '红线 ＝ 没号的账单还能减几成：70% → 50% → 30% → 0', 940, 790, '@chart', { color: 'navy', size: 34, more: [['@talk', { value: '越往后，客户越会来找你谈' }]] }),
    ],
  },

  /* ───────── 第 5 段：再算办（同一根销项 30 万：正常算 27 万 → 两成 6 万 → 三成 9 万）───────── */
  reg: {
    sfx: 'explicit',
    states: [
      { id: 'start', cue: '0', why: '再算办：办了号，也要像花店那样算，销项减进项', focus: 'keep', hold: 1.5 },
      { id: 'n27', cue: '1:27 万', why: '芝士：销项 30 万 − 进项 3 万 ＝ 要交 27 万？', focus: 'pay', hold: 1.5, sfx: 'tick-1' },
      { id: 'few', cue: '2:进项太少', why: '按正常算法是 27 万：做设计的进项太少，几乎减不掉什么', focus: 'fewTag', hold: 2 },
      { id: 'much', cue: '3', why: '芝士：那也太多了', focus: 'muchTag', hold: 1 },
      { id: 'save', cue: '4:省钱', why: '国家给刚办号的小生意，准备了一个省钱的算法', focus: 'goal', hold: 1 },
      { id: 'two', cue: '5:两成', why: '不看实际进项，只交销项的两成', focus: 'pay', hold: 1.5, sfx: '叮-落定' },
      { id: 'term', cue: '5:两成特例', why: '名词：两成特例（2割特例）', focus: 'term', hold: 1.5, point: 'term' },
      { id: 'six', cue: '6', why: '芝士：30 万的两成，6 万，比 27 万少多了', focus: 'pay', hold: 2 },
      { id: 'y26', cue: '7:2026', why: '这个两成，个人可以用到 2026 年，也就是今年', focus: 'y2', hold: 2, sfx: 'tick-2' },
      { id: 'three', cue: '8:三成', why: '2027 年和 2028 年，变成三成，交 9 万', focus: 'pay', hold: 1.5, sfx: 'tick-3' },
      { id: 'term3', cue: '8:三成特例', why: '名词：三成特例（3割特例）', focus: 'term', hold: 1.5 },
      { id: 'solo', cue: '9', why: '注意：三成只给个人，开了公司的不能用', focus: 'soloTag', hold: 2.5, point: 'soloTag' },
    ],
    objects: [
      title('再算办：你交多少', '@start', [['@save', { text: '国家准备了一个省钱的算法' }], ['@three', { text: '2027、2028 年：变成三成' }]]),
      premise('例：朋友的设计工作室 · 销项 30 万 · 进项约 3 万', '@start'),
      bar('keep', '销项 30 万', 'blue', 330, 370, 1000, '@start', { more: [['@two', { x: 530, w: 800, label: '留在手里 24 万', dur: 18 }], ['@three', { x: 630, w: 700, label: '留在手里 21 万', dur: 16 }]] }),
      bar('pay', '要交 27 万', 'orange', 330, 370, 900, '@n27', { role: 'paid', size: 38, more: [['@two', { w: 200, label: '交 6 万', dur: 18 }], ['@three', { w: 300, label: '交 9 万（三成）', dur: 16 }]] }),
      bar('cut3', '', 'green', 1230, 370, 100, '@n27', { role: 'credit', more: [out('@two-0.2')] }),
      T('↑ 减掉进项 3 万', 30, 1280, 462, { cue: '@n27', color: 'green', more: [out('@two-0.2')] }),
      { id: 'fewTag', ...T('正常算法：销项 30 万 − 进项 3 万 ＝ 交 27 万', 38, 940, 560, { cue: '@n27', more: [['@few', { text: '正常算法：交 27 万（做设计的进项太少，几乎减不掉）' }], out('@two-0.2')] }) },
      stamp('muchTag', '交 27 万？太多了', 'red', 940, 700, '@much', { size: 46, more: [out('@save-0.2')] }),
      card('term', '不看实际进项，只交销项的两成', 940, 545, '@term', { label: '名词：两成特例（2割特例）', size: 42, more: [['@term3', { label: '名词：三成特例（3割特例）', value: '2027 年、2028 年：交销项的三成' }]] }),
      T('正常算 27 万 → 两成特例 6 万', 36, 940, 690, { cue: '@six', color: 'gray', more: [out('@y26-0.2')] }),
      bar('y2', '两成特例：到 2026 年（今年）', 'teal', 330, 790, 600, '@y26', { size: 30, h: 72 }),
      bar('y3', '三成特例：2027、2028 年', 'purple', 940, 790, 440, '@three', { size: 30, h: 72 }),
      pill('soloTag', '三成特例只给个人：开了公司的不能用', 940, 690, '@solo', { color: 'red', size: 38 }),
    ],
  },

  /* ───────── 第 5 段：2029 年以后，简易课税（国家帮你估进项）───────── */
  kani: {
    sfx: 'explicit',
    states: [
      { id: 'q', cue: '10', why: '芝士：那 2029 年以后呢？', focus: 'k4', hold: 1 },
      { id: 'term', cue: '11:简易课税', why: '名词：简易课税 ＝ 国家帮每个行业估一个进项', focus: 'term', hold: 1.5, point: 'term', sfx: 'tick-1' },
      { id: 'est', cue: '11:估一个进项', why: '不用自己一张一张算（国税厅的行业比例表）', focus: 'minDoc', hold: 2.5, sfx: '纸张滑入' },
      { id: 'shop', cue: '12', why: '卖东西的小店：进货多，算你进项八成，只交两成', focus: 'tb', hold: 2.5, sfx: 'tick-1' },
      { id: 'food', cue: '13', why: '餐馆：算你进项六成，交四成', focus: 'tb', hold: 2, sfx: 'tick-2' },
      { id: 'svc', cue: '14', why: '设计、翻译、美容这类服务：进货少，算你进项五成，交五成', focus: 'tb', hold: 2.5, sfx: 'tick-3' },
      { id: 'n15', cue: '15', why: '芝士：朋友做设计，交五成，15 万', focus: 'tb', hold: 1.5, point: 'tb' },
      { id: 'less', cue: '16', why: '比正常算的 27 万，还是少', focus: 'lessTag', hold: 1.5 },
      { id: 'apply', cue: '17', why: '简易课税要自己去申请；不申请就按正常的算法', focus: 'lessTag', hold: 2.5 },
    ],
    objects: [
      title('那 2029 年以后呢？', '@q', [['@term', { text: '简易课税：国家帮你估进项' }], ['@shop', { text: '简易课税：按行业，交固定的几成' }]]),
      bar('k2', '两成特例：到 2026 年', 'teal', 330, 420, 400, '@q', { size: 30, h: 80, more: [out('@term-0.3')] }),
      bar('k3', '三成特例：2027、2028 年', 'purple', 740, 420, 400, '@q', { size: 30, h: 80, more: [out('@term-0.3')] }),
      bar('k4', '2029 年以后：？', 'gray', 1150, 420, 400, '@q+0.3', { size: 32, h: 80, dark: true, more: [out('@term-0.3')] }),
      card('term', '国家帮每个行业估一个进项\n不用自己一张一张算', 940, 275, '@term', { label: '名词：简易课税（簡易課税）', size: 40, more: [out('@shop-0.3')] }),
      doc('minDoc', 'minashi.png', `${TOKUSHU}「簡易課税制度とは」`, CW, [[0.869, 0.02, 0.99, 0.12], [0.392, 0.762, 0.484, 0.84], [0.869, 0.74, 0.99, 0.857]],
        [['@est', { x: 940, y: 652, cx: 0.5, cy: 0.5, z: 1, mk: [0] }], out('@shop-0.3')]),
      premise('例：一年收到的销项 30 万', '@shop'),
      grid('tb', ['行业', '国家算你的进项', '你交', '销项 30 万的话'], [460, 300, 200, 300], [['卖东西的小店', '八成', '两成', '6 万'], ['餐馆', '六成', '四成', '12 万'], ['设计、翻译、美容等服务', '五成', '五成', '15 万']], 940, 470, '@shop', { n: 1, rowH: 88, size: 36, first: { hl: [0] }, more: [['@food', { n: 2, hl: [1], dur: 10 }], ['@svc', { n: 3, hl: [2], dur: 10 }]] }),
      pill('lessTag', '正常算 27 万 ＞ 简易课税 15 万', 940, 740, '@less', { color: 'navy', size: 40, more: [['@apply', { value: '简易课税要自己去申请；不申请，就按正常的算法', color: 'red' }]] }),
    ],
  },

  /* ───────── 第 6 段：两边放在一起比（成对的柱子）───────── */
  cmp: {
    sfx: 'explicit',
    states: [
      { id: 'start', cue: '0', why: '把两边放在一起：做设计，一年销项 30 万', focus: 'premise', hold: 1.2 },
      { id: 'yel', cue: '1', why: '黄色 ＝ 不办，客户最多亏的钱', focus: 'legY', hold: 1.5, sfx: 'tick-1' },
      { id: 'ora', cue: '1:橙色', why: '橙色 ＝ 办了，你自己交的税', focus: 'legO', hold: 1.5, sfx: 'tick-2' },
      { id: 'same', cue: '2', why: '芝士：前面两边差不多高？', focus: 'boxL', hold: 1.2 },
      { id: 'y30', cue: '3:2030', why: '到 2030 年为止，办和不办，花的钱都差不多', focus: 'note', hold: 2, sfx: '叮-落定' },
      { id: 'worst', cue: '4', why: '而且黄色是最坏的情况：客户亏的钱不一定全算到你头上', focus: 'note', hold: 2.5 },
      { id: 'extra', cue: '5', why: '办了号以后，每年要多报一次消费税', focus: 'note', hold: 2 },
      { id: 'wait', cue: '6:这两年', why: '客户没有明说要号的话，这两年先不办，说得过去', focus: 'note', hold: 2.5 },
      { id: 'right', cue: '8', why: '别急，看最右边', focus: 'boxR', hold: 1, point: 'boxR' },
      { id: 'dbl', cue: '9:整整', why: '不办客户亏 30 万，办自己交 15 万：整整多一倍', focus: 'dblStamp', hold: 2, sfx: '盖章-两下' },
      { id: 'dear', cue: '10:贵了一成', why: '到那一天，没有号的人在客户眼里，就是比别人贵了一成', focus: 'dearNote', hold: 2.5 },
    ],
    objects: [
      title('两边放在一起比', '@start', [['@right', { text: '别急，看最右边' }]]),
      premise('例：朋友做设计 · 一年销项 30 万', '@start'),
      bar('legY', '黄色：不办 → 客户最多亏', 'yellow', 490, 292, 430, '@yel', { role: 'self', dark: true, size: 30, h: 60 }),
      bar('legO', '橙色：办了 → 你自己交', 'orange', 960, 292, 430, '@ora', { role: 'paid', size: 30, h: 60 }),
      { kind: 'rule', h: 6, fill: '#5A4A42', keys: [['@start', { x: 940, y: BASE + 3, w: 1120 }]] },
      ...GX.flatMap((x, i) => [
        T(PERIOD[i], 26, x, BASE + 52, { cue: '@start', color: 'gray' }),
        col(`y${i}`, 'yellow', 'self', LOSS[i], x - 56, `@yel+${(0.15 * i).toFixed(2)}`),
        T(`${LOSS[i]} 万`, 30, x - 56, BASE - LOSS[i] * PX - 26, { cue: `@yel+${(0.15 * i).toFixed(2)}` }),
        col(`o${i}`, 'orange', 'paid', PAY[i], x + 56, `@ora+${(0.15 * i).toFixed(2)}`),
        T(PAYTXT[i], 30, x + 62, BASE - PAY[i] * PX - 26, { cue: `@ora+${(0.15 * i).toFixed(2)}`, color: 'orange' }),
      ]),
      { id: 'boxL', kind: 'box', color: 'navy', dash: true, fill: 'transparent', w: 540, h: 400, keys: [['@same', { x: 675, y: 655 }], out('@right-0.2')] },
      { id: 'boxR', kind: 'box', color: 'red', dash: true, fill: 'transparent', w: 260, h: 520, keys: [['@right', { x: 1350, y: 590 }]] },
      card('note', '到 2030 年为止：\n办和不办，花的钱都差不多', 690, 392, '@y30', { color: 'navy', size: 30, more: [['@worst', { value: '黄色是最坏的情况：\n客户亏的钱，不一定全算到你头上' }], ['@extra', { value: '办了号以后：\n每年要多报一次消费税' }], ['@wait', { value: '客户没有明说要号的话：\n这两年先不办，说得过去' }], out('@right')] }),
      card('dearNote', '到那一天，没有号的人\n在客户眼里就是：贵了一成', 690, 392, '@dear', { color: 'red', size: 30 }),
      stamp('dblStamp', '整整多一倍', 'red', 700, 410, '@dbl', { size: 46, more: [out('@dear-0.2')] }),
    ],
  },

  /* ───────── 第 7 段：三步做决定（每一步一个例子，结论落进表里）───────── */
  steps: {
    sfx: 'explicit',
    states: [
      { id: 'start', cue: '0', why: '最后给你三步', focus: 'goal', hold: 0.8 },
      { id: 's1', cue: '1', why: '第一步：看你的客人是谁', focus: 'step', hold: 1, sfx: 'tick-1' },
      { id: 'nail', cue: '2', why: '比如美甲店：客人是来做指甲的普通人', focus: 'ex1', hold: 1.5 },
      { id: 'no1', cue: '3:不用办', why: '普通人不报消费税，不看你的账单有没有号：不用办', focus: 'tb', hold: 2, point: 'tb', sfx: '叮-落定' },
      { id: 'also', cue: '4', why: '理发店、小饭馆也一样：客人是普通人的，都不用办', focus: 'tb', hold: 2 },
      { id: 's2', cue: '6', why: '第二步：客人是公司的，直接问一句：你们需要 Invoice 吗？', focus: 'step', hold: 2, sfx: 'tick-2' },
      { id: 'kani', cue: '8:简易课税', why: '比如客户是一家小公司，自己用的就是简易课税', focus: 'ex2', hold: 1.5 },
      { id: 'same', cue: '9:都一样', why: '国家帮它估进项，不看实际的账单：你有没有号，它交的税都一样', focus: 'ex2', hold: 2.5 },
      { id: 'free', cue: '10', why: '还有的客户自己也是免税的小生意，本来就不交消费税', focus: 'ex2', hold: 2 },
      { id: 'no2', cue: '10:都不需要', why: '这两种客户，都不需要你的号', focus: 'tb', hold: 2, point: 'tb', sfx: '叮-落定' },
      { id: 's3', cue: '11', why: '第三步：客户说需要，就拿刚才那张图来算', focus: 'step', hold: 1.5, sfx: 'tick-3' },
      { id: 'ad', cue: '12', why: '比如朋友：客户是广告公司，明说了要号', focus: 'ex3', hold: 1.5 },
      { id: 'by30', cue: '12:最晚', why: '现在办不办差不多，最晚 2030 年之前要拿定主意', focus: 'tb', hold: 2.5, point: 'tb', sfx: '叮-落定' },
    ],
    objects: [
      title('三步做决定', '@start'),
      pill('ov1', '① 看客人是谁', 500, 440, '@start', { color: 'navy', size: 44, more: [out('@nail-0.3')] }),
      pill('ov2', '② 问客户要不要', 940, 440, '@start+0.3', { color: 'navy', size: 44, more: [out('@nail-0.3')] }),
      pill('ov3', '③ 拿图来算', 1380, 440, '@start+0.6', { color: 'navy', size: 44, more: [out('@nail-0.3')] }),
      pill('step', '第一步：看你的客人是谁', 940, 215, '@s1', { color: 'navy', size: 44, more: [['@s2', { value: '第二步：客人是公司 → 直接问「你们需要 Invoice 吗？」' , size: 40 }], ['@s3', { value: '第三步：客户说需要 → 拿刚才那张图来算' }]] }),
      card('ex1', '客人是来做指甲的普通人', 940, 385, '@nail', { label: '例：美甲店 💅', color: 'gray', size: 38, labelSize: 32, valueColor: '#3A4A6B', minW: 1000, more: [['@no1-0.4', { value: '普通人不报消费税，没有进项抵扣这回事\n→ 根本不看你的账单有没有号' }], out('@s2')] }),
      card('ex2', '它自己用的就是简易课税', 940, 385, '@kani', { label: '例：客户是一家小公司 🏢', color: 'gray', size: 38, labelSize: 32, valueColor: '#3A4A6B', minW: 1000, more: [['@same-0.6', { value: '国家帮它估进项，不看实际的账单\n→ 你有没有号，它交的税都一样' }], ['@free', { label: '例：客户自己也是小生意 🏪', value: '它自己也是免税的\n→ 本来就不交消费税' }], out('@s3')] }),
      card('ex3', '明说了要号', 940, 385, '@ad', { label: '例：朋友的客户是广告公司 🏢', color: 'gray', size: 38, labelSize: 32, valueColor: '#3A4A6B', minW: 1000, more: [['@by30', { value: '明说了要号 → 现在办不办差不多\n最晚 2030 年之前，要拿定主意' }]] }),
      grid('tb', ['你的客人', '例子', '办不办'], [330, 500, 370], [['普通人', '美甲店、理发店、小饭馆', '不用办'], ['公司，但它不需要', '客户用简易课税\n或者自己也免税', '不用办'], ['公司，而且需要', '给广告公司做设计', '算一算\n2030 年之前定下来']], 940, 688, '@no1', { n: 1, rowH: 88, size: 32, first: { hl: [0] }, more: [['@s2', { hl: [] }], ['@no2', { n: 2, hl: [1], dur: 10 }], ['@s3', { hl: [] }], ['@by30', { n: 3, hl: [2], dur: 10 }]] }),
    ],
  },

  /* ───────── 第 7 段：后悔了能退吗 ＋ 顺序 ＋ 降价要两边同意 ───────── */
  undo: {
    sfx: 'explicit',
    states: [
      { id: 'q', cue: '13', why: '芝士：办了以后后悔，还能退吗？', focus: 'goal', hold: 1.2 },
      { id: 'can', cue: '14', why: '能退', focus: 'canCard', hold: 0.8 },
      { id: 'proc', cue: '14:另外办手续', why: '但要另外办手续（原件：想取消的那一年开始的 15 天前交申请）', focus: 'undoDoc', hold: 2, point: 'undoDoc', sfx: '纸张滑入' },
      { id: 'notnow', cue: '14:不是想退', why: '不是想退马上就能退', focus: 'detail', hold: 2 },
      { id: 'o1', cue: '15:先看客人', why: '顺序别搞反：① 先看客人', focus: 'o1', hold: 0.8, sfx: 'tick-1' },
      { id: 'o2', cue: '15:再问客户', why: '② 再问客户', focus: 'o2', hold: 0.8, sfx: 'tick-2' },
      { id: 'o3', cue: '15:最后才算钱', why: '③ 最后才算钱', focus: 'o3', hold: 1.5, sfx: '叮-落定' },
      { id: 'fair', cue: '16:降价', why: '降价不是客户一个人说了算：要两边商量、两边都同意', focus: 'fairCard', hold: 2.5 },
      { id: 'jftc', cue: '17', why: '单方面硬压价，公平交易委员会（公正取引委員会）会管', focus: 'jftc', hold: 2.5, point: 'jftc' },
    ],
    objects: [
      title('办了以后后悔，还能退吗？', '@q', [['15', { text: '所以，顺序别搞反' }], ['16', { text: '还有一句：关于降价' }]]),
      card('canCard', '能退', 940, 225, '@can', { color: 'teal', size: 46, more: [['@proc', { value: '能退，但要另外办手续' }], out('15-0.3')] }),
      doc('undoDoc', 'big-torikeshi.png', `${NTA} · インボイス制度 よくある質問（登録の取消し）`, CW, [[0.243, 0.19, 0.457, 0.354]],
        [['@proc', { x: 940, y: 525, cx: 0.5, cy: 0.5, z: 1, mk: [0] }], out('15-0.3')]),
      card('detail', '想从哪一年起取消 → 那一年开始的 15 天前交申请\n2024 年以后才办号的 → 头两年左右，取消了也照样要交税', 940, 790, '@proc+0.5', { color: 'gray', size: 32, valueColor: '#3A4A6B', more: [out('15-0.3')] }),
      pill('o1', '① 先看客人', 500, 420, '@o1', { color: 'navy', size: 46, more: [out('16-0.3')] }),
      { kind: 'op', text: '→', size: 70, keys: [['@o2-0.2', { x: 720, y: 420 }], out('16-0.3')] },
      pill('o2', '② 再问客户', 940, 420, '@o2', { color: 'navy', size: 46, more: [out('16-0.3')] }),
      { kind: 'op', text: '→', size: 70, keys: [['@o3-0.2', { x: 1160, y: 420 }], out('16-0.3')] },
      pill('o3', '③ 最后才算钱', 1390, 420, '@o3', { color: 'red', size: 46, more: [out('16-0.3')] }),
      card('fairCard', '降价：要两边商量、两边都同意才可以', 940, 330, '@fair', { color: 'navy', size: 44 }),
      pill('jftc', '单方面硬压价 → 公平交易委员会（公正取引委員会）会管', 940, 520, '@jftc', { color: 'red', size: 38 }),
    ],
  },

  /* ───────── 第 8 段：三句话收尾 ───────── */
  sum: {
    sfx: 'explicit',
    states: [
      { id: 'start', cue: '0', why: '三句话收尾', focus: 'goal', hold: 0.6 },
      { id: 'c1', cue: '1', why: '① 销项 − 进项，剩下的交给国家；Invoice 管的就是进项能不能减', focus: 'c1', hold: 2.5, sfx: 'tick-1' },
      { id: 'c2', cue: '2', why: '② 办了号要开始交税，但头几年只交两成、三成', focus: 'c2', hold: 2.5, sfx: 'tick-2' },
      { id: 'c3', cue: '3', why: '③ 客人是普通人，不办；客人是公司，先问、再算，2030 年之前定下来', focus: 'c3', hold: 3, sfx: 'tick-3' },
      { id: 'end', cue: '4:先别慌', why: '先别慌，先问客户', focus: 'endStamp', hold: 2, sfx: '盖章-两下' },
    ],
    objects: [
      title('三句话收尾', '@start'),
      card('c1', '销项 − 进项 ＝ 交给国家\nInvoice 管的，就是「进项能不能减」', 940, 255, '@c1', { label: '第一', color: 'navy', size: 40, minW: 1100 }),
      card('c2', '办了号，要开始交税\n但头几年只交两成、三成，不是全交', 940, 455, '@c2', { label: '第二', color: 'navy', size: 40, minW: 1100 }),
      card('c3', '客人是普通人：不办\n客人是公司：先问，再算，2030 年之前定下来', 940, 655, '@c3', { label: '第三', color: 'red', size: 40, minW: 1100 }),
      stamp('endStamp', '先别慌，先问客户', 'navy', 940, 820, '@end', { size: 46 }),
    ],
  },
};
