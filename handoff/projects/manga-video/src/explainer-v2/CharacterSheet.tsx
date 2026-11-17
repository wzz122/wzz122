// 角色一览（审图用）：目前两个角色都是代码画的占位
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { FONT, loadFonts } from '../explainer/theme';
import { CheeseHead, TeacherSVG } from '../explainer/Characters';

loadFonts();

const T: [string, string, number][] = [
  ['normal', '平常', 0], ['smile', '笑', 0], ['serious', '严肃', 0], ['surprised', '吃惊', 0],
  ['normal', '说话（张嘴）', 6], ['point', '抬手', 0], ['pointLeft', '指向左边', 0],
];

export const CharacterSheet: React.FC = () => (
  <AbsoluteFill style={{ background: '#FBEFC8', fontFamily: FONT, color: '#1F2A44', padding: 40 }}>
    <div style={{ fontSize: 44, fontWeight: 900 }}>牛丼老师（主讲）· 代码绘制精修版</div>
    <div style={{ display: 'flex', gap: 34, marginTop: 20, paddingLeft: 60 }}>
      {T.map(([e, label, m], i) => (
        <div key={i} style={{ width: 200, textAlign: 'center' }}>
          <div style={{ width: 200, height: 281 }}><TeacherSVG expr={e} mouth={m} blink={false} /></div>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>{label}</div>
        </div>
      ))}
    </div>
    <div style={{ fontSize: 44, fontWeight: 900, marginTop: 50 }}>芝士（插话的学生）· 代码绘制精修版</div>
    <div style={{ display: 'flex', gap: 60, marginTop: 24, paddingLeft: 60 }}>
      {([['平常', 0, false], ['说话（张嘴）', 6, false], ['眨眼', 0, true]] as [string, number, boolean][]).map(([label, m, b], i) => (
        <div key={i} style={{ textAlign: 'center' }}>
          <CheeseHead mouth={m} blink={b} ph={{ body: '#7FA7D9', skin: '#F6DCC4', hair: '#2B2B2B', badge: true }} size={240} />
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>{label}</div>
        </div>
      ))}
    </div>
  </AbsoluteFill>
);
