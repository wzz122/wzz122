/* 每条线的形象：visuals.json 顶层写 "look": "fudosan" 就换背景和服装，不写就是税务线原样。
   背景里不放放射线、格子或线条；房子、云都是淡色块，图解和字幕压在上面也读得清。 */
import React from 'react';
import { AbsoluteFill } from 'remotion';

export type Look = 'fudosan';
export const LOOKS: Look[] = ['fudosan'];

// 服装：脸、发型、声音不变，只换衣服
export const outfitOf = (look?: Look) => (look === 'fudosan' ? 'suit' : undefined);
export const cheesePh = (look?: Look): Record<string, any> => (look === 'fudosan' ? { body: '#6FB79A', hood: '#5AA084', key: true } : { badge: true });

// 税务线：纯色 + 中间柔光 + 两团淡色圆块
const TaxBackdrop: React.FC = () => (
  <>
    <AbsoluteFill style={{ background: 'radial-gradient(ellipse 60% 55% at 50% 45%, rgba(255,250,232,0.9) 0%, rgba(255,250,232,0) 100%)' }} />
    <div style={{ position: 'absolute', left: -160, bottom: -200, width: 560, height: 560, borderRadius: '50%', background: 'rgba(255,190,120,0.22)' }} />
    <div style={{ position: 'absolute', right: -160, top: 60, width: 460, height: 460, borderRadius: '50%', background: 'rgba(140,210,170,0.18)' }} />
  </>
);

// 不动产线：浅蓝天 + 底部两层住宅街剪影（x、宽、高、有没有屋顶；没屋顶的是公寓楼）
const FAR: [number, number, number, boolean][] = [[-20, 190, 250, false], [180, 150, 190, true], [350, 240, 300, false], [610, 170, 170, true], [800, 150, 200, true], [970, 260, 270, false], [1250, 170, 180, true], [1440, 210, 330, false], [1670, 270, 230, true]];
const NEAR: [number, number, number, boolean][] = [[60, 170, 130, true], [260, 190, 110, true], [480, 160, 140, true], [680, 200, 105, true], [920, 170, 130, true], [1120, 190, 115, true], [1340, 170, 135, true], [1540, 190, 110, true], [1740, 200, 140, true]];
const CLOUDS = [[60, 90, 250, 74], [130, 56, 120, 90], [1560, 150, 210, 60]];

const Houses: React.FC<{ list: typeof FAR; color: string }> = ({ list, color }) => (
  <>
    {list.map(([x, w, h, roof]) => (
      <React.Fragment key={x}>
        <div style={{ position: 'absolute', left: x, bottom: 0, width: w, height: h, background: color }} />
        {roof ? <div style={{ position: 'absolute', left: x - 14, bottom: h - 1, width: 0, height: 0, borderLeft: `${w / 2 + 14}px solid transparent`, borderRight: `${w / 2 + 14}px solid transparent`, borderBottom: `64px solid ${color}` }} /> : null}
      </React.Fragment>
    ))}
  </>
);

export const TownBackdrop: React.FC = () => (
  <>
    <AbsoluteFill style={{ background: 'linear-gradient(180deg, #D7ECF4 0%, #EEF6F2 62%, #F8F4E6 100%)' }} />
    {CLOUDS.map(([x, y, w, h]) => <div key={x} style={{ position: 'absolute', left: x, top: y, width: w, height: h, borderRadius: h / 2, background: 'rgba(255,255,255,0.8)' }} />)}
    <Houses list={FAR} color="#C9DED9" />
    <Houses list={NEAR} color="#AECBC3" />
  </>
);

export const Backdrop: React.FC<{ look?: Look }> = ({ look }) => (look === 'fudosan' ? <TownBackdrop /> : <TaxBackdrop />);
