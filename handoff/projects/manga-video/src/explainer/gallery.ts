// 组件自测用的假时间轴：每个组件 3 秒，步骤每 0.4 秒一步
import type { Timeline, VisualTL } from './types';

const SPAN = 90;
const items: [string, any, number][] = [
  ['chapterTitle', { no: '01', kicker: '组件自测', title: '图解组件一览', tags: ['代码绘制', '数据驱动'] }, 1],
  ['keyNumber', { label: '一年要交的住民税（约）', value: 24, decimals: 0, unit: '万日元／年', sub: '每月约 2 万' }, 2],
  ['bulletReveal', { title: '三个要点', items: ['上限看年收和家庭构成', '自己负担固定 2,000 日元', '先垫钱，明年再抵税'] }, 3],
  ['calculation', { terms: [{ value: '57,000', label: '捐款' }, { op: '−', value: '2,000', label: '自己负担' }], result: { value: '55,000', label: '抵税' }, unit: '日元' }, 3],
  ['compare', { left: { title: '用', tone: 'good', items: ['负担 2,000', '换回礼品'] }, right: { title: '不用', tone: 'bad', items: ['税照交', '什么都没有'] }, highlight: { left: [1], right: [1] } }, 3],
  ['table', { columns: ['项目', '金额'], rows: [['捐款', '57,000'], ['少交的税', '−55,000'], ['负担', '2,000']], highlight: [2], callout: '8.5 倍' }, 5],
  ['barChart', { title: '年收与捐款上限（单身，约）', unit: ' 日元', highlight: 1, bars: [{ label: '年收 400 万', value: 42000 }, { label: '年收 500 万', value: 57000 }, { label: '年收 600 万', value: 77000 }] }, 3],
  ['timeline', { nodes: [{ date: '2026 年', label: '捐款' }, { date: '2027.6', label: '开始少扣' }, { date: '2028.5', label: '扣完' }], footer: '每月少扣约 4,600 日元' }, 4],
  ['iconGrid', { title: '礼品举例', items: [{ label: '大米', glyph: '米' }, { label: '和牛', glyph: '牛' }, { label: '卫生纸', glyph: '纸' }] }, 3],
  ['warningBox', { level: 'yellow', title: '注意', text: '钱是先垫出去的', sub: '手头紧别捐到顶' }, 1],
];

const visuals: VisualTL[] = items.map(([type, data, n], i) => ({
  id: `g${i}`, type, data, overlay: false, from: i * SPAN, to: (i + 1) * SPAN,
  steps: Array.from({ length: n }, (_, k) => i * SPAN + 6 + k * 12),
}));
visuals.push({ id: 'cameo', type: 'cheeseCameo', data: { text: '那我自己要掏多少？一半？' }, overlay: true, from: 9 * SPAN, to: 10 * SPAN, steps: [9 * SPAN] });

export const galleryTimeline: Timeline = {
  id: 'gallery', fps: 30, width: 1920, height: 1080, durationInFrames: items.length * SPAN,
  title: '组件自测', audio: null, assets: [],
  characters: {
    gyudon: { name: '牛丼老师', color: '#E8743B', placeholder: {} },
    cheese: { name: '芝士', color: '#F2B705', placeholder: { body: '#7FA7D9', skin: '#F6DCC4', hair: '#2B2B2B', badge: true } },
  },
  segments: items.map(([type], i) => ({ chapter: '组件自测', label: type, from: i * SPAN, to: (i + 1) * SPAN })),
  visuals,
  lines: [
    { speaker: 'gyudon', expression: 'smile', from: 0, to: 80, mouth: '0123456543210'.repeat(7), pointAt: [40] },
    { speaker: 'gyudon', expression: 'serious', from: 9 * SPAN, to: 9 * SPAN + 60, mouth: '05050505'.repeat(8), pointAt: [] },
  ],
  subtitles: items.map(([type], i) => ({ speaker: 'gyudon', from: i * SPAN, to: (i + 1) * SPAN, runs: [{ t: '组件：', em: false }, { t: type, em: true }] })),
};
