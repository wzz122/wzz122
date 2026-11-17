/* 银行和信用金库到底差在哪 的场景（2026-11-06 新稿）。
   规则：技能 tax-explainer-video「画面原则」「动画场景」；写法沿用 episodes/kotei-3000man/scenes.mjs。
   颜色语义（全片固定）：橙 paid = 付出去的钱（利息、手续费）；绿 credit = 被保护、省下来的钱；黄 self = 自己担着的钱（出资金）；存款、本金这类中性量用 蓝 / 藏青；
   身份色：银行 = 紫 purple，信用金库 = 青 teal；警告 红 red；中性说明 灰 gray。
   坐标：1920×1080，(x, y) 是中心；bar 和 anchor:'left' 的文字 x 是左边缘。主体放在 y 70–870、x 300–1580。老师和芝士全程在画面上，状态里只写 point。 */

import fs from 'node:fs';

const T = (text, size, x, y, { cue, more = [], ...rest } = {}) => ({ kind: 'text', text, size, weight: 700, ...rest, keys: [[cue, { x, y }], ...more] });
const OUT = { o: 0, dur: 12 };
const out = cue => [cue, OUT];
const shift = (cue, d) => { const m = cue.match(/^(.*?)([+-]\d+(?:\.\d+)?)?$/); const off = +(Number(m[2] ?? 0) + d).toFixed(2); return off ? `${m[1]}${off > 0 ? '+' : ''}${off}` : m[1]; };
const arrow = (from, to, cue, o = {}) => ({ id: o.id, kind: 'arrow', from, to, color: o.color ?? 'navy', bend: o.bend ?? 60, dash: o.dash, label: o.label, keys: [[cue, { fade: true, p: 0 }], [shift(cue, 0.05), { p: 1, dur: 14 }], ...(o.more ?? [])] });
const title = (text, cue, more = []) => ({ id: 'goal', ...T(text, 54, 940, 100, { cue, weight: 900, more }) });
const card = (id, value, x, y, cue, o = {}) => ({ id, kind: 'card', color: o.color ?? 'navy', label: o.label, value, size: o.size ?? 44, labelSize: o.labelSize ?? 30, minW: o.minW, valueColor: o.valueColor, role: o.role, keys: [[cue, { x, y }], ...(o.more ?? [])] });
const pill = (id, value, x, y, cue, o = {}) => ({ id, kind: 'pill', color: o.color ?? 'navy', label: o.label, value, size: o.size ?? 40, labelSize: o.labelSize ?? 26, role: o.role, dark: o.dark, keys: [[cue, { x, y }], ...(o.more ?? [])] });
const bar = (id, label, color, x, y, w, cue, o = {}) => ({ id, kind: 'bar', color, role: o.role, label, h: o.h ?? 84, size: o.size ?? 36, dark: o.dark, keys: [[cue, { x, y, w }], ...(o.more ?? [])] });
const stamp = (id, text, color, x, y, cue, o = {}) => ({ id, kind: 'stamp', color, text, size: o.size ?? 50, keys: [[cue, { x, y }], ...(o.more ?? [])] });
const emoji = (id, text, size, x, y, cue, more = []) => ({ id, kind: 'emoji', text, size, keys: [[cue, { x, y }], ...more] });
const dash = (id, w, h, x, y, cue, o = {}) => ({ id, kind: 'box', color: o.color ?? 'red', dash: true, fill: 'transparent', w, h, keys: [[cue, { x, y }], ...(o.more ?? [])] });
const panel = (id, w, h, x, y, cue, o = {}) => ({ id, kind: 'box', color: o.color ?? 'navy', w, h, title: o.title, titleSize: o.titleSize ?? 40, keys: [[cue, { x, y }], ...(o.more ?? [])] });
const bldg = (id, style, size, x, y, cue, more = []) => ({ id, kind: 'bldg', style, size, keys: [[cue, { x, y }], ...more] });
const house = (id, style, size, x, y, cue, more = []) => ({ id, kind: 'house', style, size, keys: [[cue, { x, y }], ...more] });
const bag = (id, color, size, x, y, cue, o = {}) => ({ id, kind: 'bag', color, size, role: o.role, mark: o.mark, keys: [[cue, { x, y }], ...(o.more ?? [])] });

// 官方原件截图（放在 public/episodes/bank-shinkin/m/，出处见本期 facts.md「三」）
const IMG = n => `episodes/bank-shinkin/m/${n}`;
const PAD = 24, CW = 1240;
const png = f => { const b = fs.readFileSync(new URL(`../../public/${IMG(f)}`, import.meta.url)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
const doc = (id, file, source, w, h, marks, keys) => { const big = file.startsWith('big-'), z = big ? png(file) : null; return { id, kind: 'image', src: IMG(file), source, w, h: big ? Math.round((w - 2 * PAD - 12) * z[1] / z[0] + 2 * PAD + 12) : h, pad: big ? PAD : 0, labelAbove: true, marks, keys }; };

export default {
  /* ───────── 开场：信用金库不就是银行嘛 ───────── */
  open: {
    sfx: 'explicit',
    states: [
      { id: 'hs', cue: '0:贷款的话', why: '芝士在看房，中介说去信用金库问问', focus: 'agentC', hold: 1.5 },
      { id: 'eq', cue: '1', why: '芝士以为信用金库就是银行', focus: 'eqT', hold: 1.5 },
      { id: 'two', cue: '2:完全是两种东西', why: '长得像，但完全是两种东西', focus: 'neS', hold: 1, sfx: '盖章-两下', point: 'neS' },
      { id: 'lawB', cue: '4:银行归', why: '银行归银行法管', focus: 'lawB', hold: 0.8, sfx: 'tick-1' },
      { id: 'lawS', cue: '4:信用金库归', why: '信用金库归信用金库法管', focus: 'lawS', hold: 1, sfx: 'tick-2' },
      { id: 'both', cue: '5:都能存钱', why: '反正都能存钱、借钱，有啥区别', focus: 'bothC', hold: 1.5 },
      { id: 'r1', cue: '6:多付一大笔利息', why: '地方选错了，轻的多付一大笔利息', focus: 'rA', hold: 1.2, sfx: 'tick-1' },
      { id: 'r2', cue: '6:买了一堆', why: '重的买了一堆不需要的东西', focus: 'rB', hold: 1.5, sfx: 'tick-2' },
      { id: 'clear', cue: '7:走进银行窗口', why: '看完走进窗口，心里有底', focus: 'clearT', hold: 1.5 },
    ],
    objects: [
      title('中介：贷款去信用金库问问', '@hs', [['@eq', { text: '信用金库 ＝ 银行？' }], ['@two', { text: '长得像，但完全是两种东西' }], ['@both', { text: '对上班族有啥区别？' }], ['@r1', { text: '地方选错了' }], ['@clear', { text: '今天讲清楚' }]]),
      house('hs', 'detached', 330, 640, 430, '@hs', [out('@eq-0.3')]),
      card('agentC', '中介：贷款的话\n去附近的信用金库问问', 1190, 430, '@hs', { color: 'gray', size: 40, valueColor: '#3A4A6B', more: [out('@eq-0.3')] }),
      bldg('bk', 'bank', 340, 590, 380, '@eq', [out('@r1-0.3')]),
      bldg('sk', 'shinkin', 340, 1290, 380, '@eq+0.2', [out('@r1-0.3')]),
      { id: 'eqT', ...T('＝ ？', 88, 940, 390, { cue: '@eq', color: 'gray', weight: 900, more: [out('@two-0.2')] }) },
      stamp('neS', '两种东西', 'red', 940, 390, '@two', { size: 56, more: [out('@both-0.2')] }),
      pill('nmB', '银行', 590, 610, '@eq', { color: 'purple', size: 44, more: [out('@r1-0.3')] }),
      pill('nmS', '信用金库', 1290, 610, '@eq+0.2', { color: 'teal', size: 44, more: [out('@r1-0.3')] }),
      card('lawB', '《银行法》', 590, 745, '@lawB', { color: 'purple', size: 44, more: [out('@r1-0.3')] }),
      card('lawS', '《信用金库法》', 1290, 745, '@lawS', { color: 'teal', size: 44, more: [out('@r1-0.3')] }),
      card('bothC', '都能存钱\n都能借钱', 940, 390, '@both', { color: 'gray', size: 40, valueColor: '#3A4A6B', more: [out('@r1-0.3')] }),
      bag('bagA', 'orange', 250, 620, 370, '@r1', { role: 'paid', more: [out('@clear-0.3')] }),
      card('rA', '轻的：多付一大笔利息', 620, 610, '@r1', { color: 'orange', role: 'paid', size: 42, more: [out('@clear-0.3')] }),
      emoji('docE', '📑', 200, 1260, 370, '@r2', [out('@clear-0.3')]),
      card('rB', '重的：买了不需要的东西\n还不好意思退', 1260, 625, '@r2', { color: 'red', size: 42, more: [out('@clear-0.3')] }),
      { id: 'clearT', ...T('走进窗口之前，心里先有底', 62, 940, 420, { cue: '@clear', color: 'navy', weight: 900 }) },
    ],
  },

  /* ───────── 第 1 段：为谁赚钱 ───────── */
  who: {
    sfx: 'explicit',
    states: [
      { id: 'q', cue: '0:什么样的公司', why: '银行是什么样的公司', focus: 'bk', hold: 1.2 },
      { id: 'guess', cue: '1', why: '芝士：国家开的？', focus: 'guess', hold: 0.6 },
      { id: 'kk', cue: '2:股份公司', why: '银行是股份公司（株式会社）', focus: 'kk', hold: 1.5, sfx: 'tick-1' },
      { id: 'holder', cue: '3:股东', why: '股份公司为股东存在', focus: 'holdT', hold: 1 },
      { id: 'goods', cue: '4:赚钱的商品', why: '借钱给你，是赚钱的商品', focus: 'goods', hold: 1.5, sfx: 'tick-2', point: 'goods' },
      { id: 'rule', cue: '4:能赚就做', why: '能赚就做，不能赚就不做', focus: 'goods', hold: 1.5 },
      { id: 'sk', cue: '5', why: '那信用金库呢', focus: 'sk', hold: 0.8 },
      { id: 'np', cue: '6:非营利', why: '不是股份公司，是非营利的协同组织', focus: 'np', hold: 1.5, sfx: 'tick-1' },
      { id: 'mem', cue: '6:本地的居民', why: '本地居民和中小企业一起出钱', focus: 'memT', hold: 1.5 },
      { id: 'aim', cue: '7:能借到钱', why: '目的：让本地能借到钱、存得了钱', focus: 'aim', hold: 1.8, sfx: 'tick-2', point: 'aim' },
      { id: 'tag', cue: '8:赚钱', why: '一个赚钱，一个互助；全信协的原话', focus: 'tagB', hold: 0.8 },
      { id: 'tag2', cue: '8:互助', why: '互助', focus: 'tagS', hold: 1.5, sfx: '叮-落定' },
    ],
    objects: [
      title('银行，是什么样的公司？', '@q', [['@holder', { text: '为谁赚钱？' }]]),
      bldg('bk', 'bank', 300, 470, 370, '0', [out('@tag-0.3')]),
      pill('guess', '国家开的？', 800, 370, '@guess', { color: 'gray', size: 40, more: [out('@holder-0.3')] }),
      card('kk', '股份公司（株式会社）', 620, 590, '@kk', { color: 'purple', size: 42, more: [out('@tag-0.3')] }),
      emoji('holdE', '🧑‍💼', 120, 800, 340, '@holder', [out('@tag-0.3')]),
      { id: 'holdT', ...T('股东', 40, 800, 440, { cue: '@holder', color: 'purple', weight: 900, more: [out('@tag-0.3')] }) },
      card('goods', '借钱给你 ＝ 赚钱的商品', 620, 725, '@goods', { color: 'purple', size: 36, more: [['@rule', { value: '借钱给你 ＝ 赚钱的商品\n能赚就做，不能赚就不做' }], out('@tag-0.3')] }),
      bldg('sk', 'shinkin', 300, 1410, 370, '@sk', [out('@tag-0.3')]),
      card('np', '非营利 · 协同组织', 1260, 590, '@np', { color: 'teal', size: 42, more: [out('@tag-0.3')] }),
      emoji('memE', '🏘️', 96, 1080, 300, '@mem', [out('@tag-0.3')]),
      emoji('smeE', '🏪', 96, 1080, 410, '@mem+0.3', [out('@tag-0.3')]),
      { id: 'memT', ...T('居民 ＋ 小企业\n一起出钱', 30, 1080, 500, { cue: '@mem', color: 'teal', weight: 900, more: [out('@tag-0.3')] }) },
      card('aim', '让本地的人和小企业\n能借到钱、存得了钱', 1260, 735, '@aim', { color: 'teal', size: 36, more: [out('@tag-0.3')] }),
      pill('tagB', '银行：赚钱', 640, 225, '@tag', { color: 'purple', size: 46 }),
      pill('tagS', '信用金库：互助', 1240, 225, '@tag2', { color: 'teal', size: 46 }),
      doc('dSk', 'big-sk.png', '全国信用金庫協会 · 信用金庫と銀行の違い', CW, 0, [[0.287, 0.02, 0.538, 0.15], [0.768, 0.365, 0.852, 0.49], [0.005, 0.525, 0.222, 0.655]], [['@tag', { x: 940, y: 560, cx: 0.5, cy: 0.5, z: 1, mk: [0] }], ['@tag2', { mk: [0, 1, 2] }]]),
    ],
  },

  /* ───────── 第 1 段：地盘 ───────── */
  area: {
    sfx: 'explicit',
    states: [
      { id: 'q', cue: '9:地盘', why: '第二个大区别：地盘', focus: 'goal', hold: 1 },
      { id: 'bk', cue: '11:银行想去哪', why: '银行想去哪开分店就去哪', focus: 'b1', hold: 1 },
      { id: 'kt', cue: '11:关西的银行', why: '关西的银行去东京开分店', focus: 'ktA', hold: 1.2, sfx: '嗖' },
      { id: 'sk', cue: '11:但信用金库不行', why: '信用金库不行', focus: 's1', hold: 0.8 },
      { id: 'fix', cue: '11:定死', why: '营业区域是定死的', focus: 'zoneT', hold: 1.5, sfx: 'tick-1', point: 'zoneT' },
      { id: 'root', cue: '13:扎根本地', why: '这就是它的使命：扎根本地', focus: 'rootT', hold: 1.2, sfx: '叮-落定' },
    ],
    objects: [
      title('还有一个大区别：地盘', '@q'),
      panel('pB', 600, 560, 630, 460, '@q', { color: 'purple', title: '银行' }),
      bldg('b1', 'bank', 170, 470, 600, '@bk'),
      pill('kansai', '关西', 470, 712, '@bk', { color: 'purple', size: 32 }),
      arrow([560, 540], [690, 430], '@kt', { id: 'ktA', color: 'purple', bend: 40 }),
      { id: 'ktT', ...T('开分店', 34, 500, 400, { cue: '@kt', color: 'purple', weight: 900 }) },
      bldg('b2', 'bank', 170, 790, 380, '@kt+0.2'),
      pill('tokyo', '东京', 790, 492, '@kt+0.2', { color: 'purple', size: 32 }),
      panel('pS', 600, 560, 1250, 460, '@q', { color: 'teal', title: '信用金库' }),
      dash('zone', 400, 400, 1250, 510, '@fix', { color: 'teal' }),
      bldg('s1', 'shinkin', 210, 1250, 490, '@sk'),
      { id: 'zoneT', ...T('营业区域，定死的', 34, 1250, 660, { cue: '@fix', color: 'teal', weight: 900 }) },
      { id: 'rootT', ...T('它的使命：扎根本地', 46, 1250, 815, { cue: '@root', color: 'navy', weight: 900 }) },
    ],
  },

  /* ───────── 第 1 段：连锁大饭店和老店 ───────── */
  analogy: {
    sfx: 'explicit',
    states: [
      { id: 'd', cue: '14:连锁大饭店', why: '银行像连锁大饭店', focus: 'dn', hold: 1.2, sfx: 'tick-1' },
      { id: 'dv', cue: '14:这一单', why: '看你这一单划不划算', focus: 'dC', hold: 1.2 },
      { id: 's', cue: '14:老店', why: '信用金库像商店街的老店', focus: 'op', hold: 1.2, sfx: 'tick-2' },
      { id: 'sv', cue: '14:街坊', why: '认的是街坊', focus: 'oC', hold: 1.2 },
      { id: 'q', cue: '15', why: '去老店更好说话？', focus: 'goal', hold: 0.8 },
      { id: 'case', cue: '16:小个体户', why: '例：刚起步的小个体户', focus: 'prem', hold: 1 },
      { id: 'sayB', cue: '16:年收多少', why: '大银行可能先问年收', focus: 'sayB', hold: 1.5 },
      { id: 'cold', cue: '16:基本没下文', why: '客气，但基本没下文', focus: 'sayB', hold: 1.2 },
      { id: 'sayS', cue: '17:您以后', why: '信用金库可能说一起看看', focus: 'sayS', hold: 2, sfx: 'tick-1' },
      { id: 'pin', cue: '19:预防针', why: '这是大方向，打个预防针', focus: 'pinC', hold: 0.8 },
      { id: 'man', cue: '19:负责人', why: '最后还看碰到的负责人', focus: 'pinC', hold: 2, point: 'pinC', sfx: 'tick-2' },
    ],
    objects: [
      title('打个比方', '@d', [['@q', { text: '去老店，更好说话？' }], ['@pin', { text: '这是大方向' }]]),
      bldg('dn', 'diner', 300, 520, 355, '@d', [out('@pin-0.3')]),
      card('dC', '看这一单划不划算', 520, 575, '@dv', { color: 'purple', size: 38, more: [out('@pin-0.3')] }),
      bldg('op', 'shop', 300, 1360, 355, '@s', [out('@pin-0.3')]),
      card('oC', '开了几十年，认街坊', 1360, 575, '@sv', { color: 'teal', size: 38, more: [out('@pin-0.3')] }),
      card('prem', '例：刚起步的小个体户', 940, 215, '@case', { color: 'gray', size: 40, valueColor: '#3A4A6B', more: [out('@pin-0.3')] }),
      card('sayB', '「年收多少？才这么点啊……」', 620, 725, '@sayB', { color: 'gray', size: 34, valueColor: '#3A4A6B', more: [['@cold', { value: '「年收多少？才这么点啊……」\n客气是客气，但基本没下文' }], out('@pin-0.3')] }),
      card('sayS', '「您以后打算怎么做？\n我们一起看看。」', 1270, 725, '@sayS', { color: 'teal', size: 34, more: [out('@pin-0.3')] }),
      emoji('manE', '🧑‍💼', 170, 940, 300, '@pin'),
      card('pinC', '最后好不好说话\n还是看你碰到的负责人（担当者）', 940, 540, '@pin', { color: 'navy', size: 46 }),
    ],
  },

  /* ───────── 第 2 段：只有会员才能用？ ───────── */
  member: {
    sfx: 'explicit',
    states: [
      { id: 'q', cue: '0:只有会员', why: '是不是只有会员才能用', focus: 'goal', hold: 1.2 },
      { id: 'dep', cue: '1:存钱的话', why: '存钱谁都可以', focus: 'depC', hold: 1.2, sfx: 'tick-1' },
      { id: 'loan', cue: '1:但借钱', why: '借钱原则上要先当会员', focus: 'loanC', hold: 1.2, sfx: 'tick-2', point: 'loanC' },
      { id: 'nat', cue: '2:日本国籍', why: '要日本国籍吗', focus: 'goal', hold: 0.8 },
      { id: 'place', cue: '3:不是国籍', why: '看地方，不看国籍', focus: 'placeT', hold: 1.2, sfx: 'tick-1' },
      { id: 'live', cue: '3:住在', why: '住在营业区域里', focus: 'live', hold: 1, sfx: 'tick-2' },
      { id: 'work', cue: '3:在区域里上班', why: '或者在区域里上班', focus: 'work', hold: 1.2, sfx: 'tick-3', point: 'work' },
      { id: 'cn', cue: '5:华人', why: '很多在日本上班的华人符合入会条件', focus: 'cnC', hold: 1.2 },
    ],
    objects: [
      title('只有会员才能用？', '@q', [['@nat', { text: '会员怎么当？要日本国籍吗？' }]]),
      bldg('sk', 'shinkin', 280, 940, 345, '0'),
      card('depC', '存钱\n谁都可以', 520, 345, '@dep', { color: 'blue', size: 42 }),
      card('loanC', '借钱\n原则上先当会员', 1360, 345, '@loan', { color: 'navy', size: 42 }),
      { id: 'placeT', ...T('看「地方」，不看国籍', 48, 940, 575, { cue: '@place', color: 'teal', weight: 900 }) },
      pill('live', '住在营业区域里', 620, 690, '@live', { color: 'teal', size: 42 }),
      pill('work', '在营业区域里上班', 1260, 690, '@work', { color: 'teal', size: 42 }),
      { id: 'cnC', ...T('在日本上班的华人，很多符合入会条件', 42, 940, 810, { cue: '@cn', color: 'navy', weight: 900 }) },
    ],
  },

  /* ───────── 第 2 段：出资金不是存款 ───────── */
  shusshi: {
    sfx: 'explicit',
    states: [
      { id: 'in', cue: '5:入会要交', why: '入会要交一笔出资金', focus: 'sBag', hold: 1.2, sfx: 'tick-1' },
      { id: 'few', cue: '5:五千到一万', why: '一般五千到一万日元起步', focus: 'sC', hold: 1 },
      { id: 'div', cue: '5:分红', why: '每年可能有一点分红', focus: 'divP', hold: 1 },
      { id: 'wish', cue: '6:当存款', why: '芝士想多出点当存款', focus: 'wishT', hold: 1.2 },
      { id: 'stop', cue: '7:出资金不是存款', why: '出资金不是存款', focus: 'noS', hold: 1, sfx: '盖章-两下', point: 'noS' },
      { id: 'dp', cue: '9:存款受', why: '存款受存款保险保护', focus: 'shield', hold: 1.2, sfx: 'tick-1' },
      { id: 'sp', cue: '9:出资金不受', why: '出资金不受（信金自己的说明）', focus: 'noP', hold: 1.2, sfx: 'tick-2' },
      { id: 'quit', cue: '10:退会', why: '退会想拿回来', focus: 'goal', hold: 1.2 },
      { id: 'wait', cue: '10:年度结算', why: '要等年度结算之后才退', focus: 'goal', hold: 1.5, sfx: 'tick-1' },
      { id: 'enough', cue: '11:交够', why: '交够入会需要的，别当理财', focus: 'enT', hold: 1.5, point: 'enT' },
    ],
    objects: [
      title('入会要交一笔「出资金」', '@in', [['@stop', { text: '出资金不是存款' }], ['@quit', { text: '退会想拿回来：不是想取就取' }], ['@wait', { text: '要等年度结算之后才退（最长约 1 年半）' }]]),
      bag('sBag', 'yellow', 200, 620, 290, '@in', { role: 'self' }),
      card('sC', '出资金（出資金）', 620, 475, '@in', { color: 'yellow', role: 'self', size: 40, valueColor: '#7A5A00', more: [['@few', { value: '出资金（出資金）\n一般 5000～1 万日元起步' }]] }),
      pill('divP', '每年可能有一点分红', 620, 600, '@div', { color: 'gray', size: 36, more: [out('@sp-0.2')] }),
      { id: 'wishT', ...T('多出点，当存款放着？', 44, 1260, 300, { cue: '@wish', color: 'red', weight: 900, more: [out('@stop-0.2')] }) },
      bag('dBag', 'blue', 200, 1260, 290, '@stop'),
      card('dC', '存款', 1260, 475, '@stop', { color: 'blue', size: 40 }),
      stamp('noS', '不是一回事', 'red', 940, 300, '@stop', { size: 50 }),
      emoji('shield', '🛡️', 110, 1420, 240, '@dp'),
      pill('yesP', '存款保险保护', 1260, 600, '@dp', { color: 'green', role: 'credit', size: 38 }),
      pill('noP', '不受存款保险保护', 620, 600, '@sp', { color: 'red', size: 38 }),
      doc('quitC', 'big-seto.png', '瀬戸信用金庫 · 出資金についてのご説明', CW, 0, [[0.06, 0.04, 0.46, 0.96], [0.47, 0.04, 0.985, 0.96]], [['@sp', { x: 940, y: 780, cx: 0.5, cy: 0.5, z: 1, mk: [0, 1] }], out('@enough-0.2')]),
      { id: 'enT', ...T('交够入会需要的就行，别当理财', 48, 940, 760, { cue: '@enough', color: 'navy', weight: 900 }) },
    ],
  },

  /* ───────── 第 2 段：存款保险 ───────── */
  hoken: {
    sfx: 'explicit',
    states: [
      { id: 'q', cue: '12:安全吗', why: '信用金库这么小，钱安全吗', focus: 'goal', hold: 1 },
      { id: 'both', cue: '13:都在存款保险', why: '银行和信用金库都在保护范围里', focus: 'sh', hold: 1.5, sfx: 'tick-1' },
      { id: 'quiz', cue: '13:最多保护多少', why: '最多保护多少', focus: 'goal', hold: 0.8 },
      { id: 'wrong', cue: '14', why: '芝士：全家一共一千万？', focus: 'wrongT', hold: 0.8 },
      { id: 'who', cue: '15:每个人', why: '每个人、每家机构', focus: 'ansA', hold: 1, sfx: 'tick-1' },
      { id: 'amt', cue: '15:本金', why: '本金一千万加上利息', focus: 'ansB', hold: 1.5, sfx: 'tick-2', point: 'ansB' },
      { id: 'two', cue: '16:两千万', why: '假设有两千万', focus: 'twoT', hold: 0.8 },
      { id: 'no', cue: '17', why: '你没有', focus: 'twoT', hold: 0.5 },
      { id: 'split', cue: '19:分两家存', why: '分两家存，都在保护范围', focus: 'b2', hold: 1.5, sfx: '叮-落定' },
    ],
    objects: [
      title('钱放在信用金库，安全吗？', '@q', [['@quiz', { text: '最多保护多少？' }], ['@two', { text: '假设有两千万' }]]),
      bldg('bk', 'bank', 230, 520, 330, '@q'),
      bldg('sk', 'shinkin', 230, 1360, 330, '@q+0.2'),
      emoji('sh', '🛡️', 190, 940, 310, '@both'),
      { id: 'shT', ...T('都在存款保险的范围里', 40, 940, 470, { cue: '@both', color: 'green', weight: 900, more: [out('@wrong-0.2')] }) },
      dash('wrongB', 560, 110, 940, 575, '@wrong', { more: [out('@who-0.1')] }),
      { id: 'wrongT', ...T('全家一共 1000 万？', 42, 940, 575, { cue: '@wrong', color: 'red', weight: 900, more: [out('@who-0.1')] }) },
      card('ansA', '每个人 · 每家机构', 940, 470, '@who', { color: 'navy', size: 40, more: [out('@two-0.3')] }),
      card('ansB', '本金 1000 万日元 ＋ 利息', 940, 575, '@amt', { color: 'green', role: 'credit', size: 44, more: [out('@two-0.3')] }),
      doc('dPay', 'big-payoff.png', '金融庁 · 預金保険制度', CW, 0, [[0.56, 0.08, 0.985, 0.44], [0.06, 0.54, 0.65, 0.92]], [['@amt', { x: 940, y: 775, cx: 0.5, cy: 0.5, z: 1, mk: [0, 1] }], out('@two-0.3')]),
      { id: 'twoT', ...T('2000 万 ÷ 2 家', 50, 940, 520, { cue: '@two', color: 'navy', weight: 900 }) },
      bag('b1', 'blue', 150, 520, 560, '@split'),
      { id: 'b1T', ...T('1000 万', 42, 520, 680, { cue: '@split', color: 'blue', weight: 900 }) },
      bag('b2', 'blue', 150, 1360, 560, '@split+0.2'),
      { id: 'b2T', ...T('1000 万', 42, 1360, 680, { cue: '@split+0.2', color: 'blue', weight: 900 }) },
      pill('okP', '两家都在保护范围里', 940, 640, '@split+0.4', { color: 'green', role: 'credit', size: 40 }),
    ],
  },

  /* ───────── 第 3 段：利率差（日银 2026 年 8 月统计；房贷看报价） ───────── */
  rate: {
    sfx: 'explicit',
    states: [
      { id: 'q', cue: '0:房贷', why: '房贷是不是找信金就对了', focus: 'goal', hold: 1.2 },
      { id: 'dis', cue: '1:利息', why: '缺点：利息一般稍微贵一点', focus: 'disT', hold: 1.2, sfx: 'tick-1' },
      { id: 'myth', cue: '2', why: '非营利不是应该更便宜吗', focus: 'mythT', hold: 1 },
      { id: 'bars', cue: '3:平均贷款利率', why: '日银统计：平均贷款利率', focus: 'dRate', hold: 1, sfx: '纸张滑入' },
      { id: 'gap', cue: '3:0.3', why: '高大概 0.3–0.5 个百分点', focus: 'gapP', hold: 1.5, sfx: 'tick-2', point: 'gapP' },
      { id: 'biz', cue: '3:企业贷款', why: '这个平均数包括企业贷款', focus: 'gapP', hold: 1.2 },
      { id: 'calc', cue: '5:假设', why: '假设贷 3000 万，差 0.4%', focus: 'f1', hold: 1.5 },
      { id: 'wrong', cue: '6:四千', why: '芝士：四千？', focus: 'wrongP', hold: 0.6 },
      { id: 'ans', cue: '7:十二万', why: '一年差约 12 万', focus: 'f1', hold: 1.5, sfx: '叮-落定' },
      { id: 'y30', cue: '9:三十几年', why: '三十几年', focus: 'y30', hold: 1 },
      { id: 'sum', cue: '9:上百万', why: '加起来差上百万', focus: 'y30', hold: 1.5, sfx: 'tick-1', point: 'y30' },
      { id: 'boj', cue: '10:日本银行', why: '日银把政策利率提到 1.25%', focus: 'dBoj', hold: 2, sfx: '纸张滑入' },
      { id: 'fl', cue: '11:浮动利率', why: '浮动利率以后可能跟着涨', focus: 'flC', hold: 1.5 },
      { id: 'avg', cue: '13:平均数', why: '刚才是平均数，还包括企业贷款', focus: 'avgC', hold: 1.2 },
      { id: 'var', cue: '13:有的信金', why: '房贷各家差得很大，有的信金更便宜', focus: 'varC', hold: 1.5, sfx: 'tick-1' },
      { id: 'quote', cue: '13:看每家的报价', why: '别凭印象，看每家的报价', focus: 'quoteS', hold: 1.2, sfx: '盖章-两下', point: 'quoteS' },
    ],
    objects: [
      title('房贷，找信用金库就对了？', '@q', [['@bars', { text: '从日银统计看：平均贷款利率' }], ['@calc', { text: '0.4% 算下来多少钱？' }], ['@boj', { text: '而且现在利率在涨' }], ['@avg', { text: '单看房贷呢？' }]]),
      bldg('sk', 'shinkin', 280, 940, 370, '@q', [out('@bars-0.3')]),
      { id: 'disT', ...T('缺点：利息一般稍微贵一点', 46, 940, 580, { cue: '@dis', color: 'orange', role: 'paid', weight: 900, more: [out('@bars-0.3')] }) },
      { id: 'mythT', ...T('非营利 ＝ 更便宜？', 44, 940, 690, { cue: '@myth', color: 'gray', weight: 900, more: [out('@bars-0.3')] }) },
      doc('dRate', 'big-rate.png', '日本銀行 · 貸出約定平均金利（2026 年 8 月）', CW, 0, [[0.893, 0.24, 0.995, 0.47], [0.893, 0.77, 0.995, 0.995]], [['@bars', { x: 940, y: 480, cx: 0.5, cy: 0.5, z: 1, mk: [0, 1] }], out('@calc-0.3')]),
      pill('gapP', '信金高约 0.3～0.5 个百分点', 940, 810, '@gap', { color: 'orange', role: 'paid', size: 44, more: [['@biz', { value: '信金高约 0.3～0.5 个百分点（含企业贷款）' }], out('@calc-0.3')] }),
      card('prem', '假设：贷 3000 万，利率差 0.4%', 940, 205, '@calc', { color: 'gray', size: 40, valueColor: '#3A4A6B', more: [out('@boj-0.3')] }),
      card('f1', '3000 万 × 0.4% ＝ ？', 940, 350, '@calc', { color: 'navy', size: 54, more: [['@ans', { value: '3000 万 × 0.4% ≈ 12 万' }], out('@boj-0.3')] }),
      pill('wrongP', '四千？', 940, 500, '@wrong', { color: 'gray', size: 44, more: [out('@ans-0.1')] }),
      card('y12', '第一年的利息差', 940, 500, '@ans', { color: 'orange', role: 'paid', size: 44, more: [out('@boj-0.3')] }),
      card('y30', '房贷三十几年', 940, 660, '@y30', { color: 'orange', role: 'paid', size: 44, more: [['@sum', { value: '贷 35 年粗算：累计差 200 多万' }], out('@boj-0.3')] }),
      doc('dBoj', 'big-boj.png', '日本銀行 · 2026 年 9 月 18 日', CW, 0, [[0.585, 0.73, 0.78, 0.85]], [['@boj', { x: 940, y: 390, cx: 0.5, cy: 0.5, z: 1, mk: [0] }], out('@avg-0.3')]),
      pill('bojP', '政策利率 1.25%：三十多年来最高', 940, 660, '@boj', { color: 'navy', size: 44, more: [out('@avg-0.3')] }),
      card('flC', '浮动利率的房贷，以后可能跟着涨', 940, 790, '@fl', { color: 'orange', role: 'paid', size: 42, more: [out('@avg-0.3')] }),
      card('avgC', '刚才是平均数，还包括企业贷款', 940, 270, '@avg', { color: 'gray', size: 44, valueColor: '#3A4A6B' }),
      card('varC', '房贷：各家差得很大\n有的信金比网络银行还便宜', 940, 470, '@var', { color: 'teal', size: 48 }),
      stamp('quoteS', '别凭印象，看每家的报价', 'red', 940, 690, '@quote', { size: 54 }),
    ],
  },

  /* ───────── 第 3 段：愿意听你说 ───────── */
  listen: {
    sfx: 'explicit',
    states: [
      { id: 'q', cue: '14', why: '信用金库的优势在哪', focus: 'goal', hold: 1 },
      { id: 'say', cue: '15:愿意听你说', why: '愿意听你说', focus: 'sayT', hold: 1, sfx: 'tick-1' },
      { id: 'num', cue: '15:审查很看数字', why: '银行审查看数字，不标准就被刷', focus: 'numC', hold: 1.5 },
      { id: 'j', cue: '16:刚跳槽不久', why: '例：刚跳槽不久', focus: 'p1', hold: 0.8, sfx: 'tick-1' },
      { id: 'side', cue: '16:副业', why: '例：收入里有副业或个体户部分', focus: 'p2', hold: 1, sfx: 'tick-2' },
      { id: 'face', cue: '16:面对面谈', why: '信用金库有时更愿意面对面谈', focus: 'faceC', hold: 2, point: 'faceC' },
    ],
    objects: [
      title('信用金库的优势在哪？', '@q'),
      { id: 'sayT', ...T('「愿意听你说」', 58, 940, 205, { cue: '@say', color: 'teal', weight: 900 }) },
      bldg('bk', 'bank', 220, 480, 400, '@q'),
      card('numC', '银行：审查很看数字\n条件不标准，容易直接被刷', 620, 620, '@num', { color: 'purple', size: 34 }),
      bldg('sk', 'shinkin', 220, 1400, 400, '@q'),
      card('faceC', '信用金库：有时更愿意面对面谈\n看你这个人和实际情况', 1250, 620, '@face', { color: 'teal', size: 34 }),
      pill('p1', '刚跳槽不久', 940, 340, '@j', { color: 'gray', size: 36 }),
      pill('p2', '有副业 / 个体户收入', 940, 450, '@side', { color: 'gray', size: 36 }),
    ],
  },

  /* ───────── 第 3 段：没有竣工检查合格证的房子 ───────── */
  kensa: {
    sfx: 'explicit',
    states: [
      { id: 'hs', cue: '17:挺便宜', why: '看中的房子挺便宜', focus: 'hs', hold: 1 },
      { id: 'no', cue: '17:竣工检查合格证', why: '但没有竣工检查合格证', focus: 'noC', hold: 1.5, sfx: 'tick-1' },
      { id: 'what', cue: '18:指定的检查机构', why: '盖好后政府检查、确认合格的证明', focus: 'cert', hold: 2, sfx: '纸张滑入', point: 'cert' },
      { id: 'old', cue: '18:老房子', why: '老房子没有这个的不少：1998 年度完了检查率约四成', focus: 'dMl', hold: 1.5, sfx: '纸张滑入' },
      { id: 'ng', cue: '18:借不了', why: '不少银行要看这份证明，没有可能借不了', focus: 'ngS', hold: 1, sfx: 'tick-2' },
      { id: 'why', cue: '20:抵押', why: '房贷要拿房子做抵押', focus: 'f1', hold: 1.2, sfx: 'tick-1' },
      { id: 'sell', cue: '20:不好卖', why: '手续有问题的房子不好卖', focus: 'f2', hold: 1, sfx: 'tick-2' },
      { id: 'lose', cue: '20:收不回钱', why: '还不上时银行收不回钱', focus: 'f3', hold: 1.2, sfx: 'tick-3' },
      { id: 'hq', cue: '20:总部', why: '大银行总部按规则统一审', focus: 'hqC', hold: 1.5 },
      { id: 'sk', cue: '22:信金能发挥', why: '信金能发挥的地方', focus: 'sk', hold: 1 },
      { id: 'knows', cue: '22:熟悉本地', why: '熟悉本地，也看你这个人', focus: 'knowC', hold: 1.5 },
      { id: 'can', cue: '22:能谈下来', why: '有时候能谈下来', focus: 'canP', hold: 1, sfx: 'tick-1' },
      { id: 'cond', cue: '24:能谈', why: '能谈不等于条件好', focus: 'goal', hold: 0.8 },
      { id: 'c1', cue: '24:首付', why: '首付要多交', focus: 'c1', hold: 0.5, sfx: 'tick-1' },
      { id: 'c2', cue: '24:利率更高', why: '利率更高', focus: 'c2', hold: 0.5, sfx: 'tick-2' },
      { id: 'c3', cue: '24:年限更短', why: '年限更短', focus: 'c3', hold: 0.5, sfx: 'tick-3' },
      { id: 'c4', cue: '24:不是每家', why: '不是每家都做', focus: 'c4', hold: 0.8 },
      { id: 'next', cue: '25:下一个买家', why: '将来下一个买家也难借', focus: 'nextA', hold: 1.5 },
      { id: 'cheap', cue: '25:便宜是有原因的', why: '便宜是有原因的', focus: 'cheapS', hold: 1, sfx: '盖章-两下' },
      { id: 'think', cue: '26', why: '一直自己住，还是将来要卖', focus: 'thinkC', hold: 2, point: 'thinkC' },
    ],
    objects: [
      title('这套房子挺便宜，但……', '@hs', [['@why', { text: '为什么借不了？' }], ['@sk', { text: '信用金库呢？' }], ['@cond', { text: '能谈，不等于条件好（常见情况）' }], ['@next', { text: '这种房子便宜，是有原因的' }]]),
      house('hs', 'detached', 280, 560, 365, '@hs', [out('@why-0.3')]),
      pill('noC', '没有竣工检查合格证（検査済証）', 940, 585, '@no', { color: 'red', size: 38, more: [out('@why-0.3')] }),
      { id: 'cert', kind: 'doc', title: '竣工检查合格证（検査済証）', w: 620, rowH: 72, rows: [{ k: '谁发：政府或指定检查机构', v: '' }, { k: '什么时候：房子盖好以后', v: '' }, { k: '证明：检查合格', v: '' }], keys: [['@what', { x: 1200, y: 348 }], out('@why-0.3')] },
      doc('dMl', 'big-mlit.png', '国土交通省 · 完了検査率（H10 ＝ 1998 年度）', 1000, 0, [[0.33, 0.08, 0.6, 0.92]], [['@old', { x: 940, y: 752, cx: 0.5, cy: 0.5, z: 1, mk: [0] }], out('@why-0.3')]),
      pill('ngS', '不少银行要看这份证明，没有可能借不了', 940, 852, '@ng', { color: 'red', size: 32, more: [out('@why-0.3')] }),
      house('h1', 'detached', 240, 540, 310, '@why', [out('@sk-0.3')]),
      bldg('b1', 'bank', 240, 1340, 310, '@why', [out('@sk-0.3')]),
      arrow([700, 310], [1180, 310], '@why', { id: 'f1', color: 'navy', bend: 60, label: '房子做抵押', more: [out('@sk-0.3')] }),
      card('f2', '手续有问题 → 不好卖', 540, 530, '@sell', { color: 'navy', size: 38, more: [out('@sk-0.3')] }),
      card('f3', '你还不上 → 收不回钱', 1340, 530, '@lose', { color: 'red', size: 38, more: [out('@sk-0.3')] }),
      card('hqC', '大银行一般：总部按规则统一审，不符合很难商量', 940, 690, '@hq', { color: 'purple', size: 38, more: [out('@sk-0.3')] }),
      bldg('sk', 'shinkin', 280, 620, 370, '@sk', [out('@cond-0.3')]),
      card('knowC', '熟悉本地：这条街好不好卖\n也看你这个人', 1200, 320, '@knows', { color: 'teal', size: 40, more: [out('@cond-0.3')] }),
      pill('canP', '有时候能谈下来', 1200, 500, '@can', { color: 'teal', size: 44, more: [out('@cond-0.3')] }),
      ...[['c1', '首付要多交', 620, 330], ['c2', '利率更高', 1260, 330], ['c3', '年限更短', 620, 490], ['c4', '不是每家都做', 1260, 490]].map(([id, v, x, y]) => card(id, v, x, y, `@${id}`, { color: id === 'c4' ? 'gray' : 'orange', role: id === 'c4' ? undefined : 'paid', size: 46, minW: 480, valueColor: id === 'c4' ? '#3A4A6B' : undefined, more: [out('@next-0.3')] })),
      house('h2', 'detached', 240, 560, 340, '@next'),
      arrow([720, 340], [1020, 340], '@next', { id: 'nextA', color: 'red', bend: 50, label: '将来卖房' }),
      emoji('buyer', '🧑', 150, 1180, 330, '@next+0.2'),
      { id: 'buyT', ...T('下一个买家也一样难借', 40, 1180, 470, { cue: '@next+0.2', color: 'red', weight: 900 }) },
      stamp('cheapS', '便宜有原因', 'red', 560, 560, '@cheap', { size: 50 }),
      card('thinkC', '买之前想清楚：一直自己住？将来要卖？', 940, 740, '@think', { color: 'navy', size: 44 }),
    ],
  },

  /* ───────── 第 3 段：外国人 ───────── */
  gaikoku: {
    sfx: 'explicit',
    states: [
      { id: 'q', cue: '27', why: '外国人呢', focus: 'goal', hold: 0.8 },
      { id: 'div', cue: '28:不管银行', why: '不管哪家，有没有永住权是最大的分水岭', focus: 'pr', hold: 1.2, sfx: 'tick-1', point: 'pr' },
      { id: 'yes', cue: '28:基本跟日本人', why: '有永住，基本跟日本人一样审', focus: 'yesC', hold: 1.5, sfx: 'tick-2' },
      { id: 'no', cue: '29:没有永住', why: '没有永住，有的机构接受', focus: 'noC', hold: 1 },
      { id: 'strict', cue: '29:多准备首付', why: '通常条件更严', focus: 'noC', hold: 1.8, sfx: 'tick-3' },
      { id: 'ask', cue: '31:几家同时问', why: '几家同时问', focus: 'a3', hold: 1.2 },
      { id: 'cmp', cue: '31:拿审查结果', why: '拿审查结果来比', focus: 'cmpT', hold: 1.5, sfx: '叮-落定', point: 'cmpT' },
    ],
    objects: [
      title('那我们外国人呢？', '@q', [['@ask', { text: '被一家拒了，别马上放弃' }]]),
      bldg('gBk', 'bank', 280, 560, 460, '@q', [out('@yes-0.3')]),
      bldg('gSk', 'shinkin', 280, 1320, 460, '@q', [out('@yes-0.3')]),
      pill('pr', '永住权：最大的分水岭', 940, 215, '@div', { color: 'navy', size: 46, more: [out('@ask-0.3')] }),
      arrow([760, 270], [640, 350], '@yes', { id: 'yA', color: 'teal', bend: -30, more: [out('@ask-0.3')] }),
      arrow([1120, 270], [1240, 350], '@no', { id: 'nA', color: 'gray', bend: -30, more: [out('@ask-0.3')] }),
      card('yesC', '有永住\n基本跟日本人一样审', 620, 465, '@yes', { color: 'teal', size: 42, more: [out('@ask-0.3')] }),
      card('noC', '没有永住\n有的机构接受，条件通常更严', 1250, 490, '@no', { color: 'gray', valueColor: '#3A4A6B', size: 36, more: [['@strict', { value: '没有永住\n有的机构接受，条件通常更严\n例：多准备首付\n配偶是日本人或永住者做保证' }], out('@ask-0.3')] }),
      doc('dTama', 'big-tama.png', '多摩信用金庫 · 住宅ローン 申込条件', CW, 0, [[0.445, 0.04, 0.99, 0.5], [0.03, 0.54, 0.17, 0.96]], [['@yes+0.5', { x: 940, y: 785, cx: 0.5, cy: 0.5, z: 1, mk: [0, 1] }], out('@ask-0.3')]),
      card('a1', '网络银行', 500, 330, '@ask', { color: 'purple', size: 42, minW: 340 }),
      card('a2', '大银行', 940, 330, '@ask+0.2', { color: 'purple', size: 42, minW: 340 }),
      card('a3', '本地信用金库', 1380, 330, '@ask+0.4', { color: 'teal', size: 42, minW: 340 }),
      { id: 'cmpT', ...T('几家同时问，拿审查结果来比', 50, 940, 530, { cue: '@cmp', color: 'navy', weight: 900 }) },
    ],
  },

  /* ───────── 第 3 段：平时有往来 ───────── */
  tsukiai: {
    sfx: 'explicit',
    states: [
      { id: 'q', cue: '33:平时', why: '平时就跟本地信金有往来', focus: 'sk', hold: 1 },
      { id: 'pay', cue: '33:工资卡', why: '工资卡放那边', focus: 'c1', hold: 0.8, sfx: 'tick-1' },
      { id: 'bill', cue: '33:水电费', why: '水电费扣款放那边', focus: 'c2', hold: 0.8, sfx: 'tick-2' },
      { id: 'known', cue: '33:陌生人', why: '要借钱时不是陌生人', focus: 'knownT', hold: 1.5, point: 'knownT' },
      { id: 'five', cue: '34:五年不联系', why: '五年不联系、一开口就借钱，谁都犹豫', focus: 'fiveT', hold: 1.5 },
    ],
    objects: [
      title('提前能做什么：平时就有往来', '@q'),
      bldg('sk', 'shinkin', 300, 1160, 370, '@q'),
      emoji('e1', '💳', 90, 420, 300, '@pay'),
      card('c1', '工资卡', 640, 300, '@pay', { color: 'teal', size: 42, minW: 300 }),
      emoji('e2', '💡', 90, 420, 450, '@bill'),
      card('c2', '水电费扣款', 640, 450, '@bill', { color: 'teal', size: 42, minW: 300 }),
      arrow([790, 370], [990, 370], '@bill+0.1', { id: 'a', color: 'teal', bend: 30 }),
      { id: 'knownT', ...T('真要借钱时，你不是突然冒出来的陌生人', 44, 940, 620, { cue: '@known', color: 'navy', weight: 900 }) },
      { id: 'fiveT', ...T('五年不联系、一开口就借钱，谁都犹豫', 40, 940, 730, { cue: '@five', color: 'gray', weight: 900 }) },
    ],
  },

  /* ───────── 第 4 段：窗口为什么推荐 ───────── */
  madoguchi: {
    sfx: 'explicit',
    states: [
      { id: 'q', cue: '0:可能比房贷还重要', why: '这个可能比房贷还重要', focus: 'goal', hold: 1 },
      { id: 'pile', cue: '1:一沓资料', why: '换地址时拿到一沓资料', focus: 'pileE', hold: 1 },
      { id: 'kind', cue: '1:投资信托', why: '投资信托、外币保险', focus: 'p1', hold: 1, sfx: 'tick-1' },
      { id: 'say', cue: '1:划算', why: '说比存钱划算多了', focus: 'sayC', hold: 1.2 },
      { id: 'why', cue: '2', why: '她为什么推荐', focus: 'goal', hold: 0.8 },
      { id: 'kpi', cue: '4:销售指标', why: '员工有销售指标', focus: 'k1', hold: 1, sfx: 'tick-1' },
      { id: 'fee', cue: '4:手续费', why: '卖出去银行收手续费', focus: 'k2', hold: 1.2, sfx: 'tick-2' },
      { id: 'hold', cue: '5', why: '银行为股东赚钱', focus: 'k3', hold: 1, sfx: 'tick-3', point: 'k3' },
      { id: 'sk', cue: '6:信用金库', why: '那信用金库就不推销了吗', focus: 'goal', hold: 1 },
      { id: 'yes', cue: '8:也会', why: '也会，也卖投资信托', focus: 'skC', hold: 1.2, sfx: '盖章-两下' },
      { id: 'np', cue: '8:非营利是说', why: '非营利是不给股东分钱，运营也要收入', focus: 'npC', hold: 2, point: 'npC' },
    ],
    objects: [
      title('窗口推荐的理财', '@q', [['@why', { text: '她为什么推荐？' }], ['@sk', { text: '那信用金库就不推销了吗？' }]]),
      emoji('pileE', '📑', 230, 560, 400, '@pile', [out('@why-0.3')]),
      pill('p1', '投资信托', 1000, 330, '@kind', { color: 'navy', size: 42, more: [out('@why-0.3')] }),
      pill('p2', '外币保险', 1320, 330, '@kind+0.5', { color: 'navy', size: 42, more: [out('@why-0.3')] }),
      card('sayC', '「比存钱划算多了」', 1160, 500, '@say', { color: 'gray', size: 46, valueColor: '#3A4A6B', more: [out('@why-0.3')] }),
      card('k1', '员工有销售指标', 560, 280, '@kpi', { color: 'purple', size: 40, more: [out('@sk-0.3')] }),
      arrow([770, 280], [860, 280], '@fee-0.1', { id: 'kA1', bend: 0, color: 'orange', more: [out('@sk-0.3')] }),
      card('k2', '卖出去，银行收手续费', 1160, 280, '@fee', { color: 'orange', role: 'paid', size: 40, more: [out('@sk-0.3')] }),
      card('k3', '银行要给股东赚钱', 1160, 460, '@hold', { color: 'purple', size: 40, more: [out('@sk-0.3')] }),
      bldg('sk', 'shinkin', 280, 560, 400, '@sk'),
      stamp('skC', '也会卖投资信托', 'red', 1160, 300, '@yes', { size: 50 }),
      card('npC', '非营利 ＝ 不给股东分钱\n员工工资、运营也要收入来源', 1160, 500, '@np', { color: 'teal', size: 38 }),
    ],
  },

  /* ───────── 第 4 段：成本 ───────── */
  cost: {
    sfx: 'explicit',
    states: [
      { id: 'q', cue: '9', why: '这些产品到底有什么问题', focus: 'goal', hold: 1 },
      { id: 'buy', cue: '10:成本', why: '主要是成本', focus: 'whole', hold: 1 },
      { id: 'cut', cue: '10:3%', why: '有的买入时扣 3% 左右', focus: 'cut', hold: 1.5, sfx: 'tick-1', point: 'cut' },
      { id: 'yr', cue: '10:每年', why: '之后每年还要扣管理费', focus: 'yrP', hold: 1.2, sfx: 'tick-2' },
      { id: 'ins', cue: '11:外币保险', why: '外币保险更复杂', focus: 'goal', hold: 0.8 },
      { id: 'fx', cue: '11:汇率风险', why: '汇率风险', focus: 'i1', hold: 0.6, sfx: 'tick-1' },
      { id: 'fe', cue: '11:有手续费', why: '有手续费', focus: 'i2', hold: 0.6, sfx: 'tick-2' },
      { id: 'cl', cue: '11:中途解约', why: '中途解约很可能亏本', focus: 'i3', hold: 1, sfx: 'tick-3' },
      { id: 'read', cue: '11:十几分钟', why: '柜台十几分钟根本看不懂', focus: 'readT', hold: 1.5, point: 'readT' },
    ],
    objects: [
      title('这些产品的问题：成本', '@q', [['@ins', { text: '外币保险更复杂' }]]),
      card('prem', '例：窗口买 100 万日元的投资信托', 940, 205, '@q', { color: 'gray', size: 40, valueColor: '#3A4A6B', more: [out('@ins-0.3')] }),
      bar('whole', '100 万', 'blue', 420, 360, 1080, '@q', { size: 42, h: 100, more: [['@cut', { w: 1048, dur: 18 }], out('@ins-0.3')] }),
      bar('cut', '', 'orange', 1468, 360, 32, '@cut', { role: 'paid', h: 100, more: [['@cut+0.4', { y: 500, dur: 18 }], out('@ins-0.3')] }),
      pill('cutP', '买入时扣 3% 左右 ＝ 约 3 万', 1040, 500, '@cut+0.4', { color: 'orange', role: 'paid', size: 40, more: [out('@ins-0.3')] }),
      pill('yrP', '之后每年还要扣管理费', 940, 640, '@yr', { color: 'orange', role: 'paid', size: 44, more: [out('@ins-0.3')] }),
      card('i1', '汇率风险', 480, 350, '@fx', { color: 'red', size: 44, minW: 360 }),
      card('i2', '手续费', 940, 350, '@fe', { color: 'orange', role: 'paid', size: 44, minW: 360 }),
      card('i3', '中途解约\n很可能亏本', 1400, 350, '@cl', { color: 'red', size: 44, minW: 360 }),
      { id: 'readT', ...T('不一定不好，但柜台十几分钟根本看不懂', 48, 940, 580, { cue: '@read', color: 'navy', weight: 900 }) },
    ],
  },

  /* ───────── 第 4 段：贷款和理财是两件事 ───────── */
  bundle: {
    sfx: 'explicit',
    states: [
      { id: 'q', cue: '13:更麻烦', why: '更麻烦的情况', focus: 'goal', hold: 1 },
      { id: 'loan', cue: '13:谈房贷', why: '正在谈房贷', focus: 'loan', hold: 0.8 },
      { id: 'prod', cue: '13:顺便推荐', why: '顺便推荐买保险、投信', focus: 'prod', hold: 1, sfx: 'tick-1' },
      { id: 'fear', cue: '14:不买的话', why: '不买房贷会不会批不下来', focus: 'fearT', hold: 1.2 },
      { id: 'two', cue: '15:两件事', why: '贷款和买不买理财，原则上是两件事', focus: 'twoS', hold: 1.5, sfx: '盖章-两下', point: 'twoS' },
      { id: 'no', cue: '15:不需要', why: '觉得不需要，就不用买', focus: 'noT', hold: 1.5 },
    ],
    objects: [
      title('一边谈房贷，一边推荐理财', '@q'),
      house('loanH', 'mansion', 190, 540, 240, '@q'),
      card('loan', '房贷', 540, 390, '@q', { color: 'navy', size: 50, minW: 340 }),
      emoji('prodE', '📑', 150, 1320, 240, '@prod'),
      card('prod', '保险 · 投资信托', 1320, 390, '@prod', { color: 'orange', role: 'paid', size: 46, minW: 400 }),
      { id: 'link', kind: 'rule', h: 8, fill: '#E04F4F', keys: [['@fear', { x: 930, y: 390, w: 230 }], out('@two-0.1')] },
      dash('fearB', 760, 110, 940, 560, '@fear', { more: [out('@two-0.1')] }),
      { id: 'fearT', ...T('不买，房贷会不会批不下来？', 40, 940, 560, { cue: '@fear', color: 'red', weight: 900, more: [out('@two-0.1')] }) },
      stamp('twoS', '两件事', 'red', 930, 390, '@two', { size: 54 }),
      doc('dLaw', 'big-law.png', '銀行法 第 13 条の3 第 3 号（信用金庫法 第 89 条で準用）', CW, 0, [[0.668, 0.27, 0.995, 0.48], [0.0, 0.52, 0.272, 0.72]], [['@two', { x: 940, y: 732, cx: 0.5, cy: 0.5, z: 1, mk: [0, 1] }]]),
      { id: 'noT', ...T('法律不许不当地把「买产品」当放贷条件', 40, 940, 488, { cue: '@two', color: 'navy', weight: 900, more: [['@no', { text: '觉得不需要，就不用买' }]] }) },
    ],
  },

  /* ───────── 第 4 段：万能台词 ───────── */
  line: {
    sfx: 'explicit',
    states: [
      { id: 'q', cue: '16', why: '脸皮薄，当面拒绝不了', focus: 'goal', hold: 1 },
      { id: 'say', cue: '17:万能台词', why: '万能台词', focus: 'sayC', hold: 2.5, sfx: 'tick-1', point: 'sayC' },
      { id: 'act', cue: '17:资料带走', why: '资料带走，当场不签字', focus: 'actP', hold: 1.5, sfx: 'tick-2' },
      { id: 'cmp', cue: '19:慢慢比较', why: '回家慢慢比较', focus: 'cmpT', hold: 1 },
      { id: 'nisa', cue: '19:网络证券账户', why: '自己开网络证券账户用 NISA', focus: 'nisaC', hold: 1.2, sfx: 'tick-1' },
      { id: 'fee', cue: '19:买入手续费', why: '同样是投资信托，买入手续费往往低很多', focus: 'nisaC', hold: 1.8, point: 'nisaC' },
    ],
    objects: [
      title('当面拒绝不了怎么办？', '@q', [['@cmp', { text: '回家以后再比较' }]]),
      emoji('shyE', '😳', 190, 940, 400, '@q', [out('@say-0.2')]),
      card('sayC', '「谢谢，我拿回家\n跟家里人商量一下。」', 940, 340, '@say', { color: 'teal', size: 62, more: [out('@cmp-0.3')] }),
      pill('actP', '资料带走，当场不签字', 940, 590, '@act', { color: 'navy', size: 48, more: [out('@cmp-0.3')] }),
      { id: 'cmpT', ...T('投资信托的平均买入手续费（2025 年度上半年）', 42, 940, 225, { cue: '@cmp', color: 'navy', weight: 900 }) },
      card('winC', '银行窗口\n主要行 0.9% · 地方银行 1.5%', 590, 380, '@cmp', { color: 'purple', size: 40, minW: 420 }),
      card('nisaC', '网络证券 ＋ NISA', 1290, 380, '@nisa', { color: 'green', role: 'credit', size: 40, minW: 460, more: [['@fee', { value: '网络证券 ＋ NISA\n网络系 0.05%' }]] }),
      doc('dFsa', 'big-fsa.png', '金融庁 · 個人向け販売等の定量データ集（2026 年 7 月）', 1040, 0, [[0.01, 0.06, 0.99, 0.94]], [['@fee', { x: 940, y: 640, cx: 0.5, cy: 0.5, z: 1, mk: [0] }]]),
    ],
  },

  /* ───────── 总结 ───────── */
  outro: {
    sfx: 'explicit',
    states: [
      { id: 'q', cue: '0:到底选哪个', why: '到底选哪个', focus: 'goal', hold: 1 },
      { id: 'both', cue: '2:两个都要', why: '两个都要', focus: 'bothS', hold: 1, sfx: '盖章-两下' },
      { id: 'split', cue: '2:分工', why: '不是二选一，是分工', focus: 'bothS', hold: 1.2 },
      { id: 't1', cue: '5', why: '第一，本质不同', focus: 'k1', hold: 2, sfx: 'tick-1' },
      { id: 't2', cue: '6', why: '第二，利息看报价，商量看信金', focus: 'k2', hold: 2.5, sfx: 'tick-2' },
      { id: 't3', cue: '7', why: '第三，窗口推荐的理财当场别签', focus: 'k3', hold: 2, sfx: 'tick-3' },
      { id: 'man', cue: '9:最终好不好说话', why: '最后还是看负责人', focus: 'manC', hold: 1.5 },
      { id: 'chain', cue: '10:分店', why: '就像同一家连锁店的不同分店', focus: 'chainC', hold: 2 },
      { id: 'next', cue: '12', why: '换一家问，换一个分店问', focus: 'nextT', hold: 1 },
      { id: 'you', cue: '12:选择权', why: '选择权在你手上', focus: 'youT', hold: 1.5, sfx: '叮-落定', point: 'youT' },
    ],
    objects: [
      title('银行和信用金库，到底选哪个？', '@q', [['@t1', { text: '记三句话' }], ['@man', { text: '最后说句实话' }]]),
      bldg('bk', 'bank', 300, 560, 400, '@q', [out('@t1-0.3')]),
      bldg('sk', 'shinkin', 300, 1320, 400, '@q+0.2', [out('@t1-0.3')]),
      stamp('bothS', '两个都要', 'red', 940, 400, '@both', { size: 54, more: [out('@t1-0.3')] }),
      { id: 'splitT', ...T('不是二选一，是分工', 46, 940, 640, { cue: '@split', color: 'navy', weight: 900, more: [out('@t1-0.3')] }) },
      ...[
        ['k1', '① 本质不同：银行为股东赚钱，信金为本地的会员和小企业服务', '@t1'],
        ['k2', '② 借钱：利息看报价，商量看信金；几家一起问，拿结果比', '@t2'],
        ['k3', '③ 窗口推荐的理财：不管在哪家，当场别签，拿回家比完再说', '@t3'],
      ].map(([id, v, cue], i) => card(id, v, 940, 280 + 170 * i, cue, { color: 'navy', size: 36, minW: 1240, more: [out('@man-0.3')] })),
      emoji('manE', '🧑‍💼', 170, 940, 290, '@man'),
      card('manC', '最终好不好说话，看你碰到的负责人', 940, 470, '@man', { color: 'navy', size: 44 }),
      card('chainC', '同一家连锁店，有的分店服务好，有的差', 940, 620, '@chain', { color: 'gray', size: 40, valueColor: '#3A4A6B' }),
      { id: 'nextT', ...T('换一家问，换一个分店问', 46, 940, 750, { cue: '@next', color: 'navy', weight: 900 }) },
      { id: 'youT', ...T('选择权在你手上', 54, 940, 835, { cue: '@you', color: 'red', weight: 900 }) },
    ],
  },
};
