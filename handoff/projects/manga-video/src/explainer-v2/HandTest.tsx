// 手势自检：同一姿势放大看细节、按视频里的实际大小看、按一览图的小尺寸看
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { TeacherArt } from '../explainer/CharacterArt';

const Fig: React.FC<{ expr: string; w: number }> = ({ expr, w }) => (
  <div style={{ width: w, height: w * 660 / 470, marginLeft: w * 0.25 }}><TeacherArt expr={expr} mouth={0} blink={false} /></div>
);

export const HandTest: React.FC = () => (
  <AbsoluteFill style={{ background: '#FBEFC8', flexDirection: 'row', alignItems: 'flex-end', padding: 30, gap: 10 }}>
    <Fig expr="point" w={560} />
    <Fig expr="pointLeft" w={560} />
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end' }}><Fig expr="point" w={370} /><Fig expr="pointLeft" w={370} /></div>
      <div style={{ display: 'flex', alignItems: 'flex-end' }}><Fig expr="point" w={200} /><Fig expr="pointLeft" w={200} /></div>
    </div>
  </AbsoluteFill>
);
