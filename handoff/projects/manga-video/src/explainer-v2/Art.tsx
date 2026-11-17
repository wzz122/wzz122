/* v2 用的插画物件（代码绘制的圆润日式素材风占位；正式版可换成统一画风的生成图） */
import React from 'react';

const OL = '#5A4A42';

// 钱袋：color 决定含义（橙=付出去的捐款，绿=以后抵扣，黄=自己负担）
export const MoneyBag: React.FC<{ size: number; body: string; shade: string; mark?: string }> = ({ size, body, shade, mark = '¥' }) => (
  <svg viewBox="0 0 240 260" width={size} height={size * 260 / 240} style={{ overflow: 'visible' }}>
    <ellipse cx={120} cy={250} rx={92} ry={10} fill="rgba(90,74,66,0.15)" />
    <path d="M78 70 Q40 110 30 170 Q22 238 120 244 Q218 238 210 170 Q200 110 162 70 Z" fill={body} stroke={OL} strokeWidth={6} strokeLinejoin="round" />
    <path d="M58 150 Q60 210 110 226" stroke={shade} strokeWidth={14} strokeLinecap="round" fill="none" opacity={0.55} />
    <path d="M86 30 L104 52 L120 26 L136 52 L154 30 L162 70 L78 70 Z" fill={body} stroke={OL} strokeWidth={6} strokeLinejoin="round" />
    <rect x={74} y={62} width={92} height={18} rx={9} fill={shade} stroke={OL} strokeWidth={5} />
    <circle cx={120} cy={160} r={44} fill="#FFF6DC" stroke={OL} strokeWidth={5} />
    <text x={120} y={180} textAnchor="middle" fontFamily="'Noto Sans SC'" fontWeight={900} fontSize={56} fill={OL}>{mark}</text>
  </svg>
);

// 一小摞硬币
export const Coins: React.FC<{ size: number; n?: number }> = ({ size, n = 3 }) => (
  <svg viewBox="0 0 120 120" width={size} height={size}>
    {Array.from({ length: n }, (_, i) => (
      <g key={i} transform={`translate(0 ${-i * 16})`}>
        <ellipse cx={60} cy={96} rx={44} ry={14} fill="#E7A93A" stroke={OL} strokeWidth={4} />
        <rect x={16} y={84} width={88} height={12} fill="#E7A93A" />
        <ellipse cx={60} cy={84} rx={44} ry={14} fill="#FFD25C" stroke={OL} strokeWidth={4} />
      </g>
    ))}
  </svg>
);

// 日历：表示「以后」
export const Calendar: React.FC<{ size: number; label: string }> = ({ size, label }) => (
  <svg viewBox="0 0 200 190" width={size} height={size * 190 / 200}>
    <rect x={10} y={24} width={180} height={156} rx={22} fill="#FFFFFF" stroke={OL} strokeWidth={6} />
    <path d="M10 46 Q10 24 32 24 L168 24 Q190 24 190 46 L190 70 L10 70 Z" fill="#E86A5A" stroke={OL} strokeWidth={6} />
    <rect x={50} y={8} width={14} height={34} rx={7} fill="#fff" stroke={OL} strokeWidth={5} />
    <rect x={136} y={8} width={14} height={34} rx={7} fill="#fff" stroke={OL} strokeWidth={5} />
    <text x={100} y={142} textAnchor="middle" fontFamily="'Noto Sans SC'" fontWeight={900} fontSize={44} fill={OL}>{label}</text>
  </svg>
);

// 税单：表示「住民税」
export const TaxSlip: React.FC<{ size: number }> = ({ size }) => (
  <svg viewBox="0 0 200 250" width={size} height={size * 250 / 200}>
    <path d="M20 14 L150 14 L184 48 L184 236 L20 236 Z" fill="#FFFFFF" stroke={OL} strokeWidth={6} strokeLinejoin="round" />
    <path d="M150 14 L150 48 L184 48" fill="#EDE7DA" stroke={OL} strokeWidth={6} strokeLinejoin="round" />
    <text x={100} y={86} textAnchor="middle" fontFamily="'Noto Sans SC'" fontWeight={900} fontSize={34} fill={OL}>住民税</text>
    {[118, 148, 178, 208].map(y => <rect key={y} x={44} y={y} width={y === 208 ? 70 : 116} height={10} rx={5} fill="#D9D2C3" />)}
  </svg>
);
