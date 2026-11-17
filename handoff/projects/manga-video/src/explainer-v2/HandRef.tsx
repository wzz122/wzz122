// 参照：系统表情的手型（只用来对照结构，不进成片）
import React from 'react';
import { AbsoluteFill } from 'remotion';
export const HandRef: React.FC = () => (
  <AbsoluteFill style={{ background: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 80, fontSize: 380, fontFamily: '"Apple Color Emoji"' }}>
    <span>☝️</span><span>👈</span><span>☝🏻</span>
  </AbsoluteFill>
);
