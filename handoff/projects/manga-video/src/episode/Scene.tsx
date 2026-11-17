/* 通用动画场景：一组「对象」，每个对象有几个关键帧（由台词里的词触发），在关键帧之间平滑移动、缩放、变化。
   对象坐标是整个画面的 1920×1080，(x, y) 是对象中心；bar 的 x 是左边缘。
   第一个关键帧时对象弹出；之后的关键帧改位置/大小/透明度/文字。 */
import React from 'react';
import { Easing, Img, interpolate, spring, staticFile } from 'remotion';
import { C, FONT } from '../explainer/theme';
import { Calendar, MoneyBag, TaxSlip } from '../explainer-v2/Art';

type Key = { f: number; dur?: number; [k: string]: any };
type Obj = { id?: string; kind: string; keys: Key[]; [k: string]: any };

const NUM = ['x', 'y', 's', 'o', 'r', 'w', 'p', 'cx', 'cy', 'z', 'n'];  // 这些数值在两个关键帧之间平滑过渡；其余属性（文字、颜色、高亮）到点直接换
const COLORS: Record<string, { body: string; shade: string; pill: string; soft: string }> = {
  orange: { body: '#F4A259', shade: '#D9803A', pill: '#E8853D', soft: '#FDEBDD' },
  green: { body: '#5DBB8A', shade: '#3E9A6C', pill: '#2E8B62', soft: '#DCF3E7' },
  yellow: { body: '#FFD45C', shade: '#E8B23A', pill: '#F2B705', soft: '#FFF3C4' },
  blue: { body: '#7FB2E8', shade: '#4F86C6', pill: '#3B6FB6', soft: '#E3EEFB' },
  red: { body: '#F08A80', shade: '#D2574C', pill: '#E04F4F', soft: '#FDE4E2' },
  gray: { body: '#C9CED8', shade: '#9AA1B2', pill: '#7D8596', soft: '#EEF0F4' },
  navy: { body: '#3A4A6B', shade: '#22305A', pill: '#1F2A44', soft: '#E6E9F0' },
  // 比较双方的身份色（不占用橙/绿/黄）：iDeCo 青、NISA 紫
  teal: { body: '#4FB3BF', shade: '#2E8C98', pill: '#1F7F8C', soft: '#DDF2F4' },
  purple: { body: '#A58BD8', shade: '#7E63B8', pill: '#6E4FB0', soft: '#EEE7FA' },
  // 不动产线：土地用土色
  brown: { body: '#B99A72', shade: '#94754F', pill: '#7E6240', soft: '#F3EADD' },
};
const col = (c?: string) => COLORS[c ?? 'orange'] ?? COLORS.orange;
const E = Easing.bezier(0.33, 1, 0.68, 1);

// 出场会弹一下、强调时会放大一下的对象：人物 emoji 和钱袋；其余（文字、卡片、标签、长条、单据、印章……）一律不跳
const BOUNCE = new Set(['emoji', 'bag']);

// 某个对象在第 f 帧的状态
function stateAt(o: Obj, f: number) {
  const keys = o.keys;
  if (!keys.length || f < keys[0].f) return null;
  const st: Record<string, any> = { x: 960, y: 540, s: 1, o: 1, r: 0, w: o.w ?? 300, p: 0, cx: 0.5, cy: 0, z: 1 };
  for (const k of Object.keys(keys[0])) st[k] = keys[0][k];
  // 第一个关键帧：只有人物 / 物件（emoji、钱袋）弹出；文字、卡片、长条、表格只淡入，不跳（用户 2026-10-29 要求「文字不要跳动」）
  const born = keys[0].f;
  const calm = keys[0].fade || !BOUNCE.has(o.kind);
  const popS = calm ? 1 : spring({ frame: f - born, fps: 30, config: { damping: 12, stiffness: 170, mass: 0.8 } });
  const fadeIn = interpolate(f, [born, born + (calm ? 10 : 8)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (f < k.f) break;
    const d = k.dur ?? 16;
    const t = interpolate(f, [k.f, k.f + d], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: E });
    for (const p of NUM) if (k[p] !== undefined) st[p] = st[p] + (k[p] - st[p]) * t;
    for (const p of Object.keys(k)) if (!NUM.includes(p) && p !== 'f' && p !== 'dur') st[p] = k[p];
    if (k.pulse && f >= k.f) st.pulse = Math.max(0, 1 - (f - k.f) / 14);
  }
  st.s *= calm ? 1 : 0.4 + 0.6 * Math.min(1, popS);
  if (!BOUNCE.has(o.kind)) st.pulse = 0;  // 强调（pulse）也只让人物 / 物件放大一下，文字不动
  st.o *= fadeIn;
  return st;
}

// 房子（不动产线）：style 'mansion' 公寓楼、'detached' 一户建；st.hl 'land' / 'bldg' 把地或楼标亮，没标亮的一半变淡
const HouseArt: React.FC<{ kind: string; size: number; hl?: string }> = ({ kind, size, hl }) => {
  const OLN = '#5A4A42', land = hl === 'bldg' ? 0.35 : 1, bldg = hl === 'land' ? 0.35 : 1;
  return (
    <svg width={size} height={size} viewBox="0 0 300 300" style={{ display: 'block', overflow: 'visible' }}>
      <rect x={kind === 'mansion' ? 40 : 6} y={252} width={kind === 'mansion' ? 220 : 288} height={34} rx={10} fill="#B99A72" stroke={OLN} strokeWidth={6} opacity={land} />
      {kind === 'mansion' ? (
        <g opacity={bldg}>
          <rect x={70} y={22} width={160} height={230} rx={8} fill="#7FB2E8" stroke={OLN} strokeWidth={6} />
          {[48, 92, 136, 180].flatMap(y => [90, 136, 182].map(x => <rect key={`${x}-${y}`} x={x} y={y} width={30} height={28} rx={4} fill="#E3EEFB" stroke={OLN} strokeWidth={4} />))}
          <rect x={134} y={216} width={34} height={36} rx={4} fill="#3A4A6B" />
        </g>
      ) : (
        <g opacity={bldg}>
          <rect x={46} y={132} width={150} height={120} rx={6} fill="#E3EEFB" stroke={OLN} strokeWidth={6} />
          <path d="M26 138 L121 56 L216 138 Z" fill="#3A4A6B" stroke={OLN} strokeWidth={6} strokeLinejoin="round" />
          <rect x={72} y={168} width={38} height={36} rx={4} fill="#7FB2E8" stroke={OLN} strokeWidth={4} />
          <rect x={132} y={186} width={36} height={66} rx={4} fill="#3A4A6B" />
          <circle cx={252} cy={196} r={30} fill="#5DBB8A" stroke={OLN} strokeWidth={5} />
          <rect x={246} y={222} width={12} height={30} fill="#94754F" />
        </g>
      )}
    </svg>
  );
};

// 遗产税那期的道具（只加不改）：style 'tower' 塔楼（hl 'hi' 标亮 30 层附近、'lo' 标亮 3 层附近、'land' 标亮脚下的地）、
// 'cakeL' / 'cakeR' 一个蛋糕的左半、右半（两半挨着放就是整个）、'door' 一扇门（hl 'shut' 时上锁打叉，label 写门上的字）
const PropArt: React.FC<{ kind: string; size: number; hl?: string; label?: string }> = ({ kind, size, hl, label }) => {
  const OLN = '#5A4A42', font = "'Noto Sans SC'";
  if (kind === 'tower') {
    const floors = 14;
    return (
      <svg width={size * 0.6} height={size} viewBox="0 0 180 300" style={{ display: 'block', overflow: 'visible' }}>
        <rect x={40} y={276} width={100} height={18} rx={6} fill="#B99A72" stroke={OLN} strokeWidth={5} opacity={hl === 'land' || !hl ? 1 : 0.45} />
        {hl === 'land' ? <rect x={34} y={270} width={112} height={30} rx={8} fill="none" stroke="#E8533F" strokeWidth={6} /> : null}
        <rect x={52} y={10} width={76} height={268} rx={6} fill="#7FB2E8" stroke={OLN} strokeWidth={5} />
        <rect x={72} y={0} width={36} height={14} rx={3} fill="#3A4A6B" />
        {Array.from({ length: floors }, (_, r) => [64, 84, 104].map(x => {
          const y = 22 + r * 18, hi = hl === 'hi' && r <= 2, lo = hl === 'lo' && r >= floors - 3;
          return <rect key={`${r}-${x}`} x={x} y={y} width={13} height={11} rx={2} fill={hi || lo ? '#FFD45C' : '#E3EEFB'} stroke={OLN} strokeWidth={2.5} />;
        }))}
      </svg>
    );
  }
  if (kind === 'cakeL' || kind === 'cakeR') {
    const L = kind === 'cakeL';
    return (
      <svg width={size / 2} height={size * 0.8} viewBox={`${L ? 0 : 150} 0 150 240`} style={{ display: 'block', overflow: 'visible' }}>
        <defs><clipPath id={`ck-${kind}`}><rect x={L ? -20 : 150} y={-40} width={170} height={320} /></clipPath></defs>
        <g clipPath={`url(#ck-${kind})`}>
          <rect x={20} y={110} width={260} height={110} rx={18} fill="#F6E1C3" stroke={OLN} strokeWidth={6} />
          <rect x={20} y={150} width={260} height={18} fill="#F08A80" />
          <path d="M20 128 Q 20 92 60 92 L240 92 Q 280 92 280 128 L280 140 Q 260 156 240 140 Q 215 156 190 140 Q 165 156 140 140 Q 115 156 90 140 Q 65 156 40 140 Q 28 150 20 140 Z" fill="#FFFFFF" stroke={OLN} strokeWidth={6} strokeLinejoin="round" />
          {[70, 150, 230].map(x => <g key={x}><path d={`M${x - 16} 92 Q ${x} 54 ${x + 16} 92 Z`} fill="#E04F4F" stroke={OLN} strokeWidth={5} /><path d={`M${x - 8} 62 L${x} 52 L${x + 8} 62`} fill="none" stroke="#3E9A6C" strokeWidth={5} strokeLinecap="round" /></g>)}
        </g>
      </svg>
    );
  }
  // 'wallet' 钱包：对折的皮夹，露出两张钞票。表示「自己的钱 / 留在自己手里」。用户 2026-11-15 定：不用粉色零钱包图标
  if (kind === 'wallet') {
    return (
      <svg width={size} height={size * 0.8} viewBox="0 0 300 240" style={{ display: 'block', overflow: 'visible' }}>
        <rect x={62} y={18} width={150} height={90} rx={8} fill="#DCF3E7" stroke={OLN} strokeWidth={6} transform="rotate(-8 137 63)" />
        <rect x={96} y={12} width={150} height={90} rx={8} fill="#F4F8EE" stroke={OLN} strokeWidth={6} transform="rotate(5 171 57)" />
        <text x={171} y={62} textAnchor="middle" fontFamily={font} fontWeight={900} fontSize={34} fill="#3E9A6C" transform="rotate(5 171 57)">¥</text>
        <rect x={20} y={70} width={260} height={156} rx={26} fill="#94754F" stroke={OLN} strokeWidth={7} />
        <path d="M20 112 L280 112" stroke={OLN} strokeWidth={6} />
        <rect x={34} y={126} width={232} height={86} rx={16} fill="none" stroke="#F3EADD" strokeWidth={4} strokeDasharray="12 10" />
        <path d="M196 112 L280 112 L280 168 Q 280 180 268 180 L208 180 Q 196 180 196 168 Z" fill="#B99A72" stroke={OLN} strokeWidth={6} strokeLinejoin="round" />
        <circle cx={222} cy={146} r={11} fill="#FFD45C" stroke={OLN} strokeWidth={5} />
      </svg>
    );
  }
  if (kind === 'door') {
    const shut = hl === 'shut';
    return (
      <svg width={size * 0.66} height={size} viewBox="0 0 200 300" style={{ display: 'block', overflow: 'visible' }}>
        <rect x={10} y={10} width={180} height={284} rx={12} fill="#94754F" stroke={OLN} strokeWidth={6} />
        <rect x={28} y={28} width={144} height={266} rx={6} fill={shut ? '#C9CED8' : '#F6E1C3'} stroke={OLN} strokeWidth={5} />
        <circle cx={148} cy={168} r={9} fill="#3A4A6B" />
        {label ? <text x={100} y={120} textAnchor="middle" fontFamily={font} fontWeight={900} fontSize={label.length > 3 ? 30 : 40} fill={shut ? '#5A6478' : '#3A4A6B'}>{label}</text> : null}
        {shut ? (
          <g>
            <path d="M40 60 L160 270 M160 60 L40 270" stroke="#E04F4F" strokeWidth={12} strokeLinecap="round" opacity={0.85} />
            <rect x={78} y={196} width={44} height={36} rx={6} fill="#F2B705" stroke={OLN} strokeWidth={5} />
            <path d="M86 196 L86 184 Q 100 166 114 184 L114 196" fill="none" stroke={OLN} strokeWidth={6} />
          </g>
        ) : null}
      </svg>
    );
  }
  return null;
};

// 金融机构（银行 vs 信用金库那期）：style 'bank' 银行大楼、'shinkin' 本地小信金、'diner' 连锁大饭店、'shop' 商店街老店；只加不改，别的期不用
const BldgArt: React.FC<{ kind: string; size: number }> = ({ kind, size }) => {
  const OLN = '#5A4A42', P = '#A58BD8', PD = '#6E4FB0', T = '#4FB3BF', TD = '#1F7F8C', STONE = '#F6F1E7', GLASS = '#E3EEFB';
  const font = "'Noto Sans SC'";
  return (
    <svg width={size} height={size} viewBox="0 0 300 300" style={{ display: 'block', overflow: 'visible' }}>
      {kind === 'bank' ? (
        <g>
          <rect x={22} y={262} width={256} height={24} rx={6} fill="#E6DFD2" stroke={OLN} strokeWidth={6} />
          <rect x={42} y={242} width={216} height={22} rx={5} fill={STONE} stroke={OLN} strokeWidth={6} />
          <rect x={52} y={104} width={196} height={140} fill="#EFE8DA" stroke={OLN} strokeWidth={6} />
          {[64, 112, 160, 208].map(x => <rect key={x} x={x} y={104} width={28} height={138} rx={4} fill={STONE} stroke={OLN} strokeWidth={5} />)}
          <path d="M26 104 L150 22 L274 104 Z" fill={P} stroke={OLN} strokeWidth={6} strokeLinejoin="round" />
          <circle cx={150} cy={76} r={21} fill="#fff" stroke={OLN} strokeWidth={5} />
          <text x={150} y={89} textAnchor="middle" fontFamily={font} fontWeight={900} fontSize={35} fill={PD}>¥</text>
        </g>
      ) : kind === 'shinkin' ? (
        <g>
          <rect x={30} y={272} width={240} height={16} rx={6} fill="#B99A72" stroke={OLN} strokeWidth={6} />
          <rect x={52} y={92} width={196} height={182} rx={8} fill={STONE} stroke={OLN} strokeWidth={6} />
          <rect x={44} y={52} width={212} height={54} rx={10} fill={T} stroke={OLN} strokeWidth={6} />
          <text x={150} y={93} textAnchor="middle" fontFamily={font} fontWeight={900} fontSize={37} fill="#fff">信用金库</text>
          <rect x={76} y={126} width={58} height={54} rx={5} fill={GLASS} stroke={OLN} strokeWidth={5} />
          <rect x={166} y={126} width={58} height={54} rx={5} fill={GLASS} stroke={OLN} strokeWidth={5} />
          <path d="M60 206 L240 206 L252 232 L48 232 Z" fill={T} stroke={OLN} strokeWidth={5} strokeLinejoin="round" />
          <rect x={124} y={232} width={52} height={42} rx={3} fill={TD} stroke={OLN} strokeWidth={5} />
        </g>
      ) : kind === 'diner' ? (
        <g>
          <rect x={6} y={266} width={288} height={20} rx={6} fill="#C9CED8" stroke={OLN} strokeWidth={6} />
          <rect x={18} y={96} width={264} height={172} rx={8} fill={STONE} stroke={OLN} strokeWidth={6} />
          <rect x={8} y={34} width={284} height={70} rx={12} fill={P} stroke={OLN} strokeWidth={6} />
          <text x={150} y={85} textAnchor="middle" fontFamily={font} fontWeight={900} fontSize={45} fill="#fff">连锁大饭店</text>
          {[42, 104, 166, 228].map(x => <rect key={x} x={x} y={124} width={40} height={50} rx={4} fill={GLASS} stroke={OLN} strokeWidth={5} />)}
          <rect x={60} y={196} width={180} height={72} rx={4} fill={GLASS} stroke={OLN} strokeWidth={5} />
          <path d="M150 196 L150 268" stroke={OLN} strokeWidth={5} />
        </g>
      ) : (
        <g>
          <rect x={26} y={270} width={248} height={16} rx={6} fill="#B99A72" stroke={OLN} strokeWidth={6} />
          <rect x={48} y={124} width={204} height={148} fill="#E9D3B0" stroke={OLN} strokeWidth={6} />
          <path d="M22 130 L62 60 L238 60 L278 130 Z" fill="#7E6240" stroke={OLN} strokeWidth={6} strokeLinejoin="round" />
          <rect x={92} y={84} width={116} height={36} rx={5} fill="#F6F1E7" stroke={OLN} strokeWidth={4} />
          <text x={150} y={112} textAnchor="middle" fontFamily={font} fontWeight={900} fontSize={27} fill="#7E6240">老店</text>
          <rect x={92} y={186} width={116} height={86} rx={3} fill="#94754F" stroke={OLN} strokeWidth={5} />
          {[60, 104, 148, 192].map(x => <path key={x} d={`M${x} 136 h44 v50 q-22 8 -44 0 Z`} fill={T} stroke={OLN} strokeWidth={4} strokeLinejoin="round" />)}
          <ellipse cx={28} cy={196} rx={15} ry={22} fill="#E8533F" stroke={OLN} strokeWidth={5} />
          <path d="M28 138 L28 174" stroke={OLN} strokeWidth={4} />
        </g>
      )}
    </svg>
  );
};

const pillStyle = (bg: string, dark?: boolean): React.CSSProperties => ({ background: bg, color: dark ? C.ink : '#fff', borderRadius: 22, padding: '10px 28px 12px', textAlign: 'center', border: '5px solid #5A4A42', boxShadow: '0 6px 0 rgba(90,74,66,0.18)', whiteSpace: 'nowrap', fontFamily: FONT });

const Thing: React.FC<{ o: Obj; st: Record<string, any> }> = ({ o, st }) => {
  const c = col(st.color ?? o.color);
  const label = st.label ?? o.label, value = st.value ?? o.value, text = st.text ?? o.text;
  switch (o.kind) {
    case 'bag': return <MoneyBag size={o.size ?? 260} body={c.body} shade={c.shade} mark={o.mark} />;
    case 'pill':
      return (
        <div style={pillStyle(c.pill, o.dark)}>
          {label ? <div style={{ fontSize: o.labelSize ?? 28, fontWeight: 700, lineHeight: 1.2 }}>{label}</div> : null}
          <div style={{ fontSize: o.size ?? 56, fontWeight: 900, lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
        </div>
      );
    case 'text':
      return <div style={{ fontFamily: FONT, fontSize: o.size ?? 56, fontWeight: o.weight ?? 900, color: o.color2 ?? ((st.color ?? o.color) ? c.pill : C.ink), whiteSpace: 'pre', textAlign: o.anchor === 'left' ? 'left' : 'center', lineHeight: 1.25 }}>{text}</div>;
    case 'op':
      return <div style={{ fontFamily: FONT, fontSize: o.size ?? 90, fontWeight: 900, color: C.gray }}>{text}</div>;
    case 'box':
      return (
        <div style={{ width: o.w, height: o.h, borderRadius: 36, background: o.fill ?? c.soft, border: `5px ${o.dash ? 'dashed' : 'solid'} ${o.border ?? c.body}`, fontFamily: FONT, position: 'relative' }}>
          {o.title ? <div style={{ position: 'absolute', left: 30, top: 18, fontSize: o.titleSize ?? 38, fontWeight: 900, color: c.pill }}>{st.title ?? o.title}</div> : null}
        </div>
      );
    case 'bar': {
      const w = st.w;
      return (
        <div style={{ width: w, height: o.h ?? 90, borderRadius: 18, background: c.body, border: '5px solid #5A4A42', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', fontFamily: FONT, fontSize: o.size ?? 40, fontWeight: 900, color: o.dark ? C.ink : '#fff', whiteSpace: 'nowrap' }}>
          {w > 120 ? label : ''}
        </div>
      );
    }
    case 'arrow': {
      const [x1, y1] = o.from, [x2, y2] = o.to;
      const mx = (x1 + x2) / 2, my = (o.bend ?? 80) >= 0 ? Math.min(y1, y2) - (o.bend ?? 80) : Math.max(y1, y2) - (o.bend ?? 80);
      const p = st.p ?? 1;
      const color = c.pill;
      return (
        <svg width={1920} height={1080} style={{ position: 'absolute', left: -960, top: -540, overflow: 'visible' }}>
          <path d={`M${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`} fill="none" stroke={color} strokeWidth={10} strokeLinecap="round" strokeDasharray={o.dash ? '22 16' : undefined} pathLength={1} style={{ strokeDasharray: o.dash ? undefined : `${p} 1` }} opacity={o.dash ? (p > 0 ? 1 : 0) : 1} />
          {p >= 0.98 ? (() => { const a = Math.atan2(y2 - my, x2 - mx); const l = 30; return <path d={`M${x2 - l * Math.cos(a - 0.5)} ${y2 - l * Math.sin(a - 0.5)} L${x2} ${y2} L${x2 - l * Math.cos(a + 0.5)} ${y2 - l * Math.sin(a + 0.5)}`} fill="none" stroke={color} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" />; })() : null}
          {o.label ? <text x={mx} y={(o.bend ?? 80) >= 0 ? (y1 + y2) / 4 + my / 2 - 18 : (y1 + y2) / 4 + my / 2 + 46} textAnchor="middle" fontFamily="'Noto Sans SC'" fontWeight={900} fontSize={34} fill={color}>{o.label}</text> : null}
        </svg>
      );
    }
    case 'line': {
      // 折线（例：收益曲线）：pts 是整个画面坐标里的点，p 从 0 到 1 表示从左往右画出来
      const pts: number[][] = o.pts;
      return (
        <svg width={1920} height={1080} style={{ position: 'absolute', left: -960, top: -540, overflow: 'visible' }}>
          <polyline points={pts.map(q => q.join(',')).join(' ')} fill="none" stroke={c.pill} strokeWidth={o.stroke ?? 9} strokeLinecap="round" strokeLinejoin="round" pathLength={1} style={{ strokeDasharray: `${st.p ?? 1} 1` }} />
        </svg>
      );
    }
    case 'rule': return <div style={{ width: st.w, height: o.h ?? 8, borderRadius: 4, background: o.fill ?? C.ink }} />;
    case 'doc': {
      // 一张单据：标题 + 几行（日文项目名 + 数字），st.hl 里的行用黄底标出来
      const hl: number[] = st.hl ?? [];
      return (
        <div style={{ width: o.w ?? 540, background: '#fff', border: '5px solid #5A4A42', borderRadius: 18, boxShadow: '0 12px 0 rgba(90,74,66,0.12)', padding: '22px 26px 26px', fontFamily: FONT }}>
          <div style={{ fontSize: 30, fontWeight: 900, textAlign: 'center', paddingBottom: 14, borderBottom: '4px solid #5A4A42', marginBottom: 12, whiteSpace: 'nowrap' }}>{o.title}</div>
          {(o.rows as { k: string; v: string }[]).map((r, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: o.rowH ?? 84, padding: '0 14px', marginTop: 6, borderRadius: 12, background: hl.includes(i) ? '#FFE58A' : '#F6F2EA', border: hl.includes(i) ? '4px solid #E8B23A' : '4px solid transparent', fontSize: 27, fontWeight: 700, whiteSpace: 'nowrap' }}>
              <span>{r.k}</span><span style={{ fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{r.v}</span>
            </div>
          ))}
        </div>
      );
    }
    case 'image': {
      // 资料原件（官方网页、PDF、样票的截图）：放在白纸卡片里；cx/cy 是镜头对准图里的哪一点（0–1），z 是在「铺满卡片宽度」基础上再放大几倍；
      // marks 是图里的高亮框 [x0, y0, x1, y1]（0–1），st.mk 列出当前要亮的框；source 是卡片顶上的来源标签
      // pad：图片和卡片边框之间的留白；labelAbove：来源标签放在卡片上方，不压图片内容（用户 2026-11-05 说引用太挤）
      const W = o.w ?? 1100, H = o.h ?? 640, iw = o.iw ?? 1600, ih = o.ih ?? 1000, pad = o.pad ?? 0;
      const inset = pad ? 2 * pad + 12 : 0, Wv = W - inset, Hv = H - inset;  // 12 = 左右（上下）边框
      const sc = (Wv / iw) * st.z, dw = iw * sc, dh = ih * sc;
      const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
      const left = dw <= Wv ? (Wv - dw) / 2 : clamp(Wv / 2 - st.cx * dw, Wv - dw, 0);
      const top = dh <= Hv ? (Hv - dh) / 2 : clamp(Hv / 2 - st.cy * dh, Hv - dh, 0);
      const mk: number[] = st.mk ?? [];
      return (
        <div style={{ position: 'relative', fontFamily: FONT }}>
          {o.source ? <div style={{ position: 'absolute', left: 24, top: o.labelAbove ? -56 : -30, zIndex: 2, background: '#3A4A6B', color: '#fff', borderRadius: 12, padding: '4px 18px 6px', fontSize: 28, fontWeight: 900, whiteSpace: 'nowrap', border: '4px solid #5A4A42' }}>{o.source}</div> : null}
          <div style={{ width: W, height: H, overflow: 'hidden', position: 'relative', background: '#fff', border: '6px solid #5A4A42', borderRadius: 20, boxShadow: '0 14px 0 rgba(90,74,66,0.14)' }}>
            <div style={{ position: 'absolute', left: pad, top: pad, width: Wv, height: Hv, overflow: st.z > 1.01 ? 'hidden' : 'visible' }}>
            <div style={{ position: 'absolute', left, top, width: dw, height: dh }}>
              <Img src={staticFile(o.src)} style={{ width: dw, height: dh, display: 'block' }} />
              {(o.marks ?? []).map((m: number[], i: number) => mk.includes(i) ? (
                <div key={i} style={{ position: 'absolute', boxSizing: 'border-box', left: m[0] * dw - (pad ? 10 : 8), top: m[1] * dh - (pad ? 9 : 6), width: (m[2] - m[0]) * dw + (pad ? 20 : 16), height: (m[3] - m[1]) * dh + (pad ? 18 : 12), border: `${pad ? 4 : Math.max(5, 7 / st.z * 1.4)}px solid #E8533F`, borderRadius: pad ? 8 : 12, background: 'rgba(255,214,92,0.28)' }} />
              ) : null)}
            </div>
            </div>
          </div>
        </div>
      );
    }
    case 'house': return <HouseArt kind={o.style ?? 'detached'} size={o.size ?? 300} hl={st.hl} />;
    case 'bldg': return <BldgArt kind={o.style ?? 'bank'} size={o.size ?? 300} />;
    case 'prop': return <PropArt kind={o.style} size={o.size ?? 300} hl={st.hl} label={label} />;
    case 'people': {
      // 一排排小人：rows × cols 个，前 st.n 个（四舍五入）用 color 标出来，其余灰色。遗产税那期「10 个里 1 个」「100 个里 4 个 / 8 个 / 10 个」
      const rows = o.rows ?? 1, cols = o.cols ?? 10, gap = o.gap ?? 1.25, sz = o.size ?? 60, k = Math.round(st.n ?? 0);
      const on = col(st.color ?? o.color ?? 'navy');
      return (
        <svg width={cols * sz * gap} height={rows * sz * gap * 1.5} style={{ display: 'block' }}>
          {Array.from({ length: rows * cols }, (_, i) => {
            const cx = (i % cols + 0.5) * sz * gap, cy = (Math.floor(i / cols) + 0.5) * sz * gap * 1.5;
            const fill = i < k ? on.body : '#D9D2C7', stroke = i < k ? on.shade : '#B9B0A2';
            return (
              <g key={i}>
                <circle cx={cx} cy={cy - sz * 0.42} r={sz * 0.26} fill={fill} stroke={stroke} strokeWidth={Math.max(2, sz * 0.05)} />
                <path d={`M${cx - sz * 0.38} ${cy + sz * 0.55} Q ${cx - sz * 0.38} ${cy - sz * 0.1} ${cx} ${cy - sz * 0.1} Q ${cx + sz * 0.38} ${cy - sz * 0.1} ${cx + sz * 0.38} ${cy + sz * 0.55} Z`} fill={fill} stroke={stroke} strokeWidth={Math.max(2, sz * 0.05)} strokeLinejoin="round" />
              </g>
            );
          })}
        </svg>
      );
    }
    case 'ticket':
      // 折扣券：左边券号，右边内容，两侧半圆缺口；绿色 = 省回来的钱
      return (
        <div style={{ display: 'flex', alignItems: 'stretch', background: c.pill, color: '#fff', fontFamily: FONT, fontWeight: 900, borderRadius: 18, WebkitMaskImage: 'radial-gradient(circle 20px at 0 50%, transparent 97%, #000), radial-gradient(circle 20px at 100% 50%, transparent 97%, #000)', WebkitMaskComposite: 'source-in', maskComposite: 'intersect', whiteSpace: 'pre', lineHeight: 1.25 }}>
          <div style={{ padding: '16px 26px 16px 40px', fontSize: o.stubSize ?? 40, display: 'flex', alignItems: 'center', borderRight: '4px dashed rgba(255,255,255,0.7)' }}>{o.stub}</div>
          <div style={{ padding: '16px 46px 18px 28px', fontSize: o.size ?? 40, textAlign: 'center' }}>{value}</div>
        </div>
      );
    case 'grid': {
      // 表格：cols 列名，rows 每行的格子，st.n 是出现了几行（可以小数，逐行淡入），st.hl 标亮的行，st.hlCol 标亮的列；最后一行写 total: true 时加粗
      const widths: number[] = o.colW, n = st.n ?? (o.rows as string[][]).length, hl: number[] = st.hl ?? [], hc: number = st.hlCol ?? -1;
      const rowH = o.rowH ?? 82, fs = o.size ?? 36;
      const cell = (t: string, i: number, bg: string, color: string, weight: number): React.ReactNode => <div key={i} style={{ width: widths[i], height: rowH, display: 'flex', alignItems: 'center', justifyContent: i === 0 ? 'flex-start' : 'center', padding: i === 0 ? '0 0 0 24px' : 0, boxSizing: 'border-box', background: bg, color, fontWeight: weight, whiteSpace: 'pre', fontVariantNumeric: 'tabular-nums', borderLeft: i ? '3px solid #D9D2C7' : 'none' }}>{t}</div>;
      return (
        <div style={{ background: '#fff', border: '5px solid #5A4A42', borderRadius: 20, overflow: 'hidden', fontFamily: FONT, fontSize: fs, boxShadow: '0 10px 0 rgba(90,74,66,0.12)' }}>
          <div style={{ display: 'flex' }}>{(o.cols as string[]).map((t, i) => cell(t, i, i === hc ? '#22305A' : '#3A4A6B', '#fff', 900))}</div>
          {(o.rows as string[][]).map((r, ri) => {
            const a = Math.max(0, Math.min(1, n - ri)), total = o.total && ri === o.rows.length - 1;
            return <div key={ri} style={{ display: 'flex', opacity: a, borderTop: '3px solid #D9D2C7' }}>{r.map((t, i) => cell(t, i, hl.includes(ri) || i === hc ? '#FFF3C4' : total ? '#F6F2EA' : '#fff', C.ink, total || i === hc ? 900 : 700))}</div>;
          })}
        </div>
      );
    }
    case 'calendar': return <Calendar size={o.size ?? 170} label={label ?? '明年'} />;
    case 'slip': return <TaxSlip size={o.size ?? 190} />;
    case 'emoji': return <div style={{ fontSize: o.size ?? 140, lineHeight: 1, fontFamily: '"Apple Color Emoji"' }}>{text}</div>;
    case 'stamp':
      return <div style={{ border: `7px solid ${c.pill}`, color: c.pill, background: 'rgba(255,255,255,0.88)', borderRadius: 16, padding: '4px 18px', fontFamily: FONT, fontSize: o.size ?? 52, fontWeight: 900, whiteSpace: 'nowrap' }}>{text}</div>;  // 盖章的 −10° 斜放在外层做，老师指向时的橙框跟着一起斜
    case 'card':
      return (
        <div style={{ background: '#fff', borderRadius: 28, border: `5px solid ${c.body}`, boxShadow: '0 10px 30px rgba(31,42,68,0.10)', padding: '22px 34px', fontFamily: FONT, textAlign: 'center', minWidth: o.minW ?? 0 }}>
          {label ? <div style={{ fontSize: o.labelSize ?? 32, fontWeight: 700, color: C.sub }}>{label}</div> : null}
          <div style={{ fontSize: o.size ?? 54, fontWeight: 900, color: o.valueColor ?? c.pill, whiteSpace: 'pre', lineHeight: 1.2 }}>{value}</div>
        </div>
      );
    default: return null;
  }
};

// 场景状态（scenes.mjs 里的 states）：当前状态写了 point，就给那个对象套一圈橙色指示框（老师同时做指向手势，见 EpisodeVideo 的 cast）
const pointedAt = (data: any, frame: number): { id: string; since: number } | null => {
  let cur: any = null;
  for (const s of (data.states ?? []) as { f: number; point?: string }[]) if (frame >= s.f) cur = s;
  return cur?.point ? { id: cur.point, since: cur.f } : null;
};

export const Scene: React.FC<{ data: any; frame: number }> = ({ data, frame }) => {
  const pt = pointedAt(data, frame);
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {(data.objects as Obj[]).map((o, i) => {
        const st = stateAt(o, frame);
        if (!st || st.o <= 0.001) return null;
        const anchorLeft = o.kind === 'bar' || o.anchor === 'left';  // 长条和左对齐的文字：x 是左边缘
        const pulse = st.pulse ? 1 + 0.12 * st.pulse : 1;
        const ring = pt && o.id === pt.id ? interpolate(frame, [pt.since, pt.since + 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 0;
        return (
          <div key={o.id ?? i} style={{ position: 'absolute', left: st.x, top: st.y, translate: anchorLeft ? '0 -50%' : o.kind === 'arrow' || o.kind === 'line' ? '0 0' : '-50% -50%', scale: `${st.s * pulse}`, rotate: `${st.r + (o.kind === 'stamp' ? -10 : 0)}deg`, opacity: st.o, transformOrigin: anchorLeft ? 'left center' : 'center', borderRadius: 24, outline: ring ? `7px solid rgba(232,116,59,${0.9 * ring})` : undefined, outlineOffset: 10 }}>
            <Thing o={o} st={st} />
          </div>
        );
      })}
    </div>
  );
};
