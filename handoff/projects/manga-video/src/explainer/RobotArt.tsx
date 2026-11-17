/* 芝士（机器人版）：呆萌小机器人，半身。屏幕脸 + LED 嘴 + 芝士黄天线球。 */
import React from 'react';

const OL = '#3E3A4A';

export const RobotArt: React.FC<{ mouth: number; blink: boolean; mood?: 'normal' | 'surprised' | 'happy' }> = ({ mouth, blink, mood = 'normal' }) => {
  const open = mouth >= 2;
  const eye = (cx: number) => {
    if (blink) return <rect x={cx - 16} y={196} width={32} height={6} rx={3} fill="#7FF0FF" />;
    if (mood === 'happy') return <path d={`M${cx - 16} 204 Q${cx} 184 ${cx + 16} 204`} stroke="#7FF0FF" strokeWidth={8} fill="none" strokeLinecap="round" />;
    const r = mood === 'surprised' ? 19 : 15;
    return (
      <g>
        <ellipse cx={cx} cy={198} rx={r} ry={r * 1.15} fill="#7FF0FF" />
        <circle cx={cx + 5} cy={191} r={5} fill="#FFFFFF" />
      </g>
    );
  };
  const mw = open ? 34 + mouth * 3 : 40;
  const mh = open ? 8 + mouth * 2.2 : 6;
  return (
    <svg viewBox="0 0 360 420" width="100%" height="100%" style={{ overflow: 'visible' }}>
      {/* 天线：芝士黄的小球 */}
      <path d="M180 92 L180 46" stroke={OL} strokeWidth={6} strokeLinecap="round" />
      <circle cx={180} cy={38} r={16} fill="#FFC93C" stroke={OL} strokeWidth={5} />
      <circle cx={175} cy={33} r={5} fill="#FFF3B0" />
      {/* 身体 */}
      <path d="M70 420 L84 330 Q90 300 120 296 L240 296 Q270 300 276 330 L290 420 Z" fill="#DCE6F0" stroke={OL} strokeWidth={5} strokeLinejoin="round" />
      <rect x={138} y={326} width={84} height={58} rx={12} fill="#FFC93C" stroke={OL} strokeWidth={4} />
      {/* 胸口的芝士小图标 */}
      <path d="M152 370 L208 370 L208 346 Z" fill="#FFE07A" stroke={OL} strokeWidth={3} strokeLinejoin="round" />
      <circle cx={190} cy={360} r={4} fill="#F0B429" />
      <circle cx={200} cy={366} r={3} fill="#F0B429" />
      {/* 脖子 */}
      <rect x={156} y={276} width={48} height={26} rx={6} fill="#B8C6D6" stroke={OL} strokeWidth={4} />
      {/* 耳朵螺栓 */}
      <rect x={42} y={168} width={26} height={60} rx={10} fill="#B8C6D6" stroke={OL} strokeWidth={5} />
      <rect x={292} y={168} width={26} height={60} rx={10} fill="#B8C6D6" stroke={OL} strokeWidth={5} />
      {/* 头 */}
      <rect x={62} y={92} width={236} height={190} rx={56} fill="#E9F0F7" stroke={OL} strokeWidth={6} />
      <path d="M86 120 Q110 104 150 102" stroke="#FFFFFF" strokeWidth={10} fill="none" strokeLinecap="round" opacity={0.9} />
      {/* 屏幕脸 */}
      <rect x={92} y={140} width={176} height={120} rx={34} fill="#22314F" stroke={OL} strokeWidth={4} />
      {eye(142)}
      {eye(218)}
      {/* 腮红 */}
      <ellipse cx={110} cy={238} rx={12} ry={6} fill="#FF8FA3" opacity={0.7} />
      <ellipse cx={250} cy={238} rx={12} ry={6} fill="#FF8FA3" opacity={0.7} />
      {/* LED 嘴 */}
      <rect x={180 - mw / 2} y={236 - mh / 2} width={mw} height={mh} rx={mh / 2} fill={open ? '#7FF0FF' : '#4FD1E0'} />
    </svg>
  );
};
