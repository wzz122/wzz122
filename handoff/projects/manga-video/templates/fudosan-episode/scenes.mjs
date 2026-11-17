/* <题目> 的场景（从 templates/fudosan-episode 复制来的起点；visuals.json 里 look: fudosan，背景和服装自动换）。
   规则：技能 tax-explainer-video「画面原则」「动画场景」；完整例子：episodes/furusato-v3-trial-new/scenes.mjs。
   - 先写 states.md 的理解链，再把每一行写成这里的一个状态（id、cue、why、focus、hold；要指向时写 point）。
   - 对象关键帧用 '@状态id'（或 '@状态id+0.3'）触发；同一笔钱从头到尾是同一个对象，不在下一个场景重画。
   - 老师和芝士从头到尾都在画面上，不能离场：状态里不写 teacher / cheese（写 'out' 构建会直接报错）。
   - 颜色语义：橙 paid（付出去的钱）、绿 credit（省回来的钱）、黄 self（自己负担）；房价、贷款本金这类总额用中性蓝 / 藏青。都写 role。
   坐标：1920×1080，(x, y) 是中心；bar 的 x 是左边缘。 */
import fs from 'node:fs';

// 版面（2026-10-29 试作按用户意见定下的位置）。图解别压到左下（芝士）和右下（老师）
const L = {
  titleY: 100,                          // 标题（这一段要回答的问题），52px
  premise: { y: 198, size: 40 },        // 算例前提卡：放在标题下面，留到这个算例结束；字号不小于 40
  barX: 330, barW: 1100, barY: 390,     // 主长条：左边缘、全宽、中心高度
  zone: { x: 1130, y: 612, w: 680, h: 300 },  // 虚线框：切下来的几块落进这里（例：首付、诸费用）
  dropY: 530,                           // 切下来的几块落下后的高度
  card1Y: 605, card2Y: 825,             // 公式卡：第一行结构 → 第二行代入 → 第三行结果
};

// 文字对象：T(文字, 字号, x, y, { cue: 出现的触发点, more: 后续关键帧, 其余属性 })
const T = (text, size, x, y, { cue, more = [], ...rest } = {}) => ({ kind: 'text', text, size, weight: 700, ...rest, keys: [[cue, { x, y }], ...more] });
const OUT = { o: 0, dur: 12 };
// 官方原件（固定步骤，见技能「找图片、截官网原件」）。文字原件只截关键句，存成 big-*.png：按宽度算高度、四周留白、来源标签在卡片上方，图里的字约 30 号。
// 幻灯片、整页表格自带白边，文件名不带 big-，高度手写（16:9 幻灯片：宽 1100、高 619）。marks 是红框（0–1），只框关键词，mk 选当前亮哪几个。
// 例：doc('rate', 'big-rate.png', '金融厅 · NISA 特设网站', CW, 0, [[0.36, 0.16, 0.7, 0.4]], [['@rate', { x: 940, y: 640, cx: 0.5, cy: 0.5, z: 1, mk: [0] }], ['@next-0.3', OUT]])
const IMG = n => `episodes/<期名>/m/${n}`;
const PAD = 24, CW = 1240;
const png = f => { const b = fs.readFileSync(new URL(`../../public/${IMG(f)}`, import.meta.url)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
const doc = (id, file, source, w, h, marks, keys) => { const big = file.startsWith('big-'), z = big ? png(file) : null; return { id, kind: 'image', src: IMG(file), source, w, h: big ? Math.round((w - 2 * PAD - 12) * z[1] / z[0] + 2 * PAD + 12) : h, pad: big ? PAD : 0, labelAbove: true, marks, keys }; };

export default {
  calc: {
    sfx: 'explicit',
    states: [
      { id: 'start', cue: '0', why: '<这一段要回答的问题>', focus: 'goal', hold: 1.5 },
      { id: 'whole', cue: '0:end', why: '<整体：这笔钱有多少，算例前提是什么>', focus: 'income', hold: 2.5 },
      // { id: 'notax', cue: '<句>:<词>', why: '先画出切下来的几块要落进去的地方', focus: 'zone', hold: 2.5 },
      // { id: 'cut1', cue: '<句>:<词>', why: '同一根长条切掉第一块', focus: 'd1', hold: 2.5, sfx: 'tick-1' },
      // { id: 'answer', cue: '<句>:<词>', why: '老师回答并指向正确的那一截', focus: 'part', hold: 3, point: 'part' },
    ],
    objects: [
      { id: 'goal', ...T('<问题>', 52, 940, L.titleY, { cue: '@start', weight: 900 }) },
      { id: 'premise', kind: 'card', color: 'gray', value: '前提：<地区> · <新房 / 二手> · <买 / 租> · <在留资格或贷款条件>', size: L.premise.size, valueColor: '#3A4A6B', keys: [
        ['@start', { x: 940, y: L.premise.y }],
        // 条件变了在同一张卡上补：['@<状态>', { value: '前提：… · <哪一年规则>', pulse: true }],
      ] },
      { id: 'income', kind: 'bar', color: 'blue', role: 'neutral', label: '<整体金额>', h: 100, size: 42, keys: [['@whole', { x: L.barX, y: L.barY, w: L.barW }]] },

      /* 常用片段（照试作写法，去掉注释改数就能用）：
      // 虚线框 + 左边的说明，讲公式前退场
      { id: 'zone', kind: 'box', color: 'gray', dash: true, fill: 'transparent', w: L.zone.w, h: L.zone.h, keys: [['@notax', { x: L.zone.x, y: L.zone.y }], ['@rate-0.3', OUT]] },
      { id: 'zoneTag', ...T('<这一堆是什么> →', 36, 630, L.zone.y, { cue: '@notax', color: 'gray', more: [['@rate-0.3', OUT]] }) },
      // 切掉一块：先盖在长条右端（宽度按金额比例），再落进虚线框；长条同时缩短、换标签
      { id: 'd1', kind: 'bar', color: 'gray', label: '−<金额>', h: 84, size: 36, keys: [['@cut1', { x: <右端 x>, y: L.barY, w: <宽> }], ['<句>:<词>', { y: L.dropY, dur: 18 }]] },
      // 换位置时路线会穿过别的东西：先淡出、换位置再淡入
      more: [['@s-0.3', { o: 0, dur: 10 }], ['@s', { x: …, y: …, dur: 1 }], ['@s+0.6', { o: 1, dur: 10 }]]
      // 公式卡：结构 → 代入 → 结果（同一张卡加行）
      { id: 'f1', kind: 'card', color: 'navy', label: '<名词（中文解释）>', value: '＝ <结构>\n＝ <代入>', size: 36, labelSize: 30, keys: [['@rate', { x: 700, y: L.card1Y }], ['@result', { value: '＝ <结构>\n＝ <代入>\n≈ <结果>' }]] },
      */
    ],
  },
};
