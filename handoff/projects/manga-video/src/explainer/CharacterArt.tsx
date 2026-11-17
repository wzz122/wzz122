/* 代码绘制的角色（精修版占位）：牛丼老师半身、芝士圆头像。
   正式版换成统一画风的生成图；这里尽量做到手、袖口、衣领、表情都像样。 */
import React from 'react';

const OL = '#4A3B34';
const SKIN = '#FADCC2';
const SKIN_SH = '#EDBF9F';
const HAIR = '#2B2421';
const HAIR_HI = '#4A3F3A';

/* 一只手：默认指向 +x 方向（握拳伸出食指）。用 transform 旋转、翻转。 */
/* 画一块皮肤：fill 用闭合路径，描边用开放路径（接缝处不画线，和相邻部分自然连上） */
const Part: React.FC<{ fill: string; line: string; w?: number }> = ({ fill, line, w = 3.4 }) => (
  <g>
    <path d={fill} fill={SKIN} />
    <path d={line} fill="none" stroke={OL} strokeWidth={w} strokeLinejoin="round" strokeLinecap="round" />
  </g>
);

/* 指向左边的手（参照 👈）：原点在手腕，手朝 -x。食指在上方伸直，拇指从手背翘起，其余三指弯在下面。 */
const PointingHand: React.FC<{ transform: string }> = ({ transform }) => (
  <g transform={transform}>
    {/* 手掌（侧面）：右边接袖口，不描边 */}
    <Part fill="M4 -18 L-30 -18 Q-46 -18 -50 -6 Q-54 8 -48 18 Q-42 24 -28 24 L4 24 Z"
          line="M4 -18 L-30 -18 Q-46 -18 -50 -6 Q-54 8 -48 18 Q-42 24 -28 24 L4 24" />
    {/* 食指：根部插进手掌，不描根部 */}
    <Part fill="M-30 -18 L-88 -18 Q-96 -18 -96 -11 Q-96 -4 -88 -4 L-30 -4 Z"
          line="M-38 -18 L-88 -18 Q-96 -18 -96 -11 Q-96 -4 -88 -4 L-44 -4" />
    {/* 弯起的三根手指：食指下面两道折线 */}
    <path d="M-50 4 Q-43 6 -36 3 M-48 14 Q-41 16 -34 13" stroke={OL} strokeWidth={2.8} fill="none" strokeLinecap="round" />
    {/* 拇指：从手背翘起，指尖朝左上；根部融进手背 */}
    <Part fill="M-10 -14 Q-16 -30 -31 -35 Q-41 -38 -42 -31 Q-42 -25 -34 -22 Q-28 -19 -28 -12 Z"
          line="M-10 -18 Q-16 -30 -31 -35 Q-41 -38 -42 -31 Q-42 -25 -34 -22 Q-28 -19 -28 -15" w={3.2} />
  </g>
);

/* 举起的手（参照 ☝️，手心朝外）：原点在手腕，向上为 -y。
   食指在靠拇指一侧（画面右侧）竖起；其余三指弯下，顶端是三个并排的圆头；拇指横压在它们下半截。 */
const HandUp: React.FC<{ transform: string }> = ({ transform }) => (
  <g transform={transform}>
    {/* 弯下去的中指、无名指、小指：三个并排的圆头（先画，下半截被手掌和拇指盖住） */}
    <rect x={-24} y={-48} width={11} height={22} rx={5.5} fill={SKIN} stroke={OL} strokeWidth={3} />
    <rect x={-13} y={-51} width={11} height={24} rx={5.5} fill={SKIN} stroke={OL} strokeWidth={3} />
    <rect x={-2} y={-51} width={11} height={24} rx={5.5} fill={SKIN} stroke={OL} strokeWidth={3} />
    {/* 手掌 + 食指：一整块轮廓，食指根部和手掌之间不画线 */}
    <Part fill="M-24 -34 Q-26 -6 -14 2 L14 2 Q26 -4 25 -22 L23 -34 L23 -72 Q23 -79 17.5 -79 Q12 -79 12 -72 L12 -34 Z"
          line="M-24 -34 Q-26 -6 -14 2 M14 2 Q26 -4 25 -22 L23 -34 L23 -72 Q23 -79 17.5 -79 Q12 -79 12 -72 L12 -36" />
    {/* 拇指：从右侧横压过来，指尖朝左；右端融进手掌 */}
    <Part fill="M24 -28 Q20 -33 10 -33 L-6 -33 Q-13 -33 -13 -26.5 Q-13 -20 -6 -20 L10 -20 Q18 -20 24 -14 Z"
          line="M23 -29 Q20 -33 10 -33 L-6 -33 Q-13 -33 -13 -26.5 Q-13 -20 -6 -20 L10 -20 Q18 -20 23 -15" w={3.2} />
    <path d="M-12 -7 Q0 -2 12 -6" stroke={SKIN_SH} strokeWidth={2.6} fill="none" strokeLinecap="round" />
  </g>
);

/* 袖子：从肩到手腕，外描边 + 白色 + 阴影 + 袖口 */
const Sleeve: React.FC<{ d: string; fill?: string; shade?: string }> = ({ d, fill = '#FFFFFF', shade = '#E6ECF4' }) => (
  <g>
    <path d={d} stroke={OL} strokeWidth={54} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d={d} stroke={fill} strokeWidth={46} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d={d} stroke={shade} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={0.75} transform="translate(4 9)" />
  </g>
);

/* 袖口：画在手之后，盖住手腕 */
const Cuff: React.FC<{ x: number; y: number; angle: number }> = ({ x, y, angle }) => (
  <g transform={`translate(${x} ${y}) rotate(${angle})`}>
    <rect x={-9} y={-24} width={20} height={48} rx={8} fill="#FFFFFF" stroke={OL} strokeWidth={4} />
    <circle cx={1} cy={13} r={3} fill="#B9C3D2" />
  </g>
);

export const TeacherArt: React.FC<{ expr: string; mouth: number; blink: boolean; outfit?: 'suit' }> = ({ expr, mouth, blink, outfit }) => {
  // suit：不动产线的素色藏青西装 + 素色深绿领带，不戴胸牌、徽章（白底红橙图形像日本国旗，面向中国观众），不写就是白衬衫蓝领带
  const suit = outfit === 'suit';
  const sleeve = suit ? { fill: '#2C3E63', shade: '#33486F' } : {};
  const smile = expr === 'smile';
  const serious = expr === 'serious';
  const surprised = expr === 'surprised';
  const point = expr === 'point';
  const pointLeft = expr === 'pointLeft';
  const eyeY = 268;
  const eye = (cx: number) => {
    if (blink) return <path d={`M${cx - 13} ${eyeY + 2} Q${cx} ${eyeY + 8} ${cx + 13} ${eyeY + 2}`} stroke={OL} strokeWidth={5} fill="none" strokeLinecap="round" />;
    if (smile) return <path d={`M${cx - 13} ${eyeY + 4} Q${cx} ${eyeY - 10} ${cx + 13} ${eyeY + 4}`} stroke={OL} strokeWidth={5.5} fill="none" strokeLinecap="round" />;
    const rx = surprised ? 10 : 8, ry = surprised ? 13 : 10.5;
    return (
      <g>
        <ellipse cx={cx} cy={eyeY} rx={rx} ry={ry} fill="#231C1A" />
        <circle cx={cx + 3} cy={eyeY - 4} r={3.2} fill="#FFFFFF" />
      </g>
    );
  };
  const brow = (cx: number, side: 1 | -1) => {
    const inner = cx + side * 18, outer = cx - side * 18;
    let yi = 228, yo = 226;
    if (serious) { yi = 236; yo = 222; }
    if (surprised) { yi = 212; yo = 214; }
    if (smile) { yi = 224; yo = 224; }
    return <path d={`M${outer} ${yo} Q${cx} ${Math.min(yi, yo) - 6} ${inner} ${yi}`} stroke={HAIR} strokeWidth={8} fill="none" strokeLinecap="round" />;
  };
  const open = mouth >= 2;
  const mh = 8 + mouth * 2.4;

  return (
    <svg viewBox="0 0 470 660" width="100%" height="100%" style={{ overflow: 'visible' }}>
      <defs>
        <clipPath id="tie-clip"><path d="M225 472 L213 600 L235 626 L257 600 L245 472 Z" /></clipPath>
      </defs>

      {/* ---------- 身体：斜肩，肩宽和头差不多 ---------- */}
      <path d="M92 660 L98 532 Q102 470 132 450 Q166 424 206 416 L264 416 Q304 424 338 450 Q368 470 372 532 L378 660 Z" fill="#FFFFFF" stroke={OL} strokeWidth={4.5} strokeLinejoin="round" />
      {/* 两侧手臂的阴影和袖缝（手臂抬起的那一侧不画） */}
      {!point && !pointLeft ? (
        <g>
          <path d="M98 532 Q102 470 132 450 L140 462 Q116 480 114 532 L108 660 L92 660 Z" fill="#E6ECF4" />
          <path d="M144 498 Q138 580 136 660" stroke="#B8C3D1" strokeWidth={3.5} fill="none" strokeLinecap="round" />
        </g>
      ) : null}
      <path d="M372 532 Q368 470 338 450 L330 462 Q354 480 356 532 L362 660 L378 660 Z" fill="#E6ECF4" />
      <path d="M326 498 Q332 580 334 660" stroke="#B8C3D1" strokeWidth={3.5} fill="none" strokeLinecap="round" />
      {/* 纽扣线 */}
      <path d="M235 474 L235 660" stroke="#D5DCE6" strokeWidth={3} />
      {[520, 580, 640].map(y => <circle key={y} cx={235} cy={y} r={3.5} fill="#D0D8E3" />)}
      {/* 脖子 */}
      <path d="M208 360 L208 422 L262 422 L262 360 Z" fill={SKIN} stroke={OL} strokeWidth={4.5} />
      <path d="M210 392 Q235 408 260 392 L260 414 L210 414 Z" fill={SKIN_SH} />
      {/* 领带（先画）：领带结塞在衣领下面，结的下沿和领带上沿一样宽 */}
      <path d="M225 472 L213 600 L235 626 L257 600 L245 472 Z" fill={suit ? '#2F6B55' : '#22305A'} stroke={OL} strokeWidth={4} strokeLinejoin="round" />
      {suit ? null : (
        <g clipPath="url(#tie-clip)">
          {[486, 516, 546, 576, 606].map(y => <path key={y} d={`M200 ${y + 14} L270 ${y - 14}`} stroke="#3C5290" strokeWidth={7} />)}
        </g>
      )}
      <path d="M220 442 L250 442 L245 474 L225 474 Z" fill={suit ? '#285E4B' : '#2B3B6B'} stroke={OL} strokeWidth={4} strokeLinejoin="round" />
      {/* 西装外套：画在领带之后、衣领之前 */}
      {suit ? (
        <g stroke={OL} strokeWidth={4.5} strokeLinejoin="round">
          <path d="M92 660 L98 532 Q102 470 132 450 Q160 428 192 418 L233 596 L233 660 Z" fill="#2C3E63" />
          <path d="M378 660 L372 532 Q368 470 338 450 Q310 428 278 418 L237 596 L237 660 Z" fill="#2C3E63" />
          <path d="M192 418 L148 474 L176 492 L164 512 L233 596 Z" fill="#33486F" />
          <path d="M278 418 L322 474 L294 492 L306 512 L237 596 Z" fill="#33486F" />
          <circle cx={247} cy={622} r={6} fill="#1F2D4A" />
        </g>
      ) : null}
      {/* 衣领（后画，压住领带结两角） */}
      <path d="M204 410 L236 450 L198 466 L182 424 Z" fill="#FFFFFF" stroke={OL} strokeWidth={4} strokeLinejoin="round" />
      <path d="M266 410 L234 450 L272 466 L288 424 Z" fill="#FFFFFF" stroke={OL} strokeWidth={4} strokeLinejoin="round" />

      {/* ---------- 手势 ---------- */}
      {point ? (
        <g>
          {/* 手肘在下，前臂竖起，食指朝上 */}
          <Sleeve d="M138 478 Q88 520 86 586 Q86 530 88 466" {...sleeve} />
          <HandUp transform="translate(88 455) scale(1.15)" />
          <Cuff x={88} y={460} angle={90} />
        </g>
      ) : null}
      {pointLeft ? (
        <g>
          {/* 手臂微弯平伸，手背朝外，食指指向左边 */}
          <Sleeve d="M140 478 Q84 506 20 471" {...sleeve} />
          <PointingHand transform="translate(10 471) scale(1.15)" />
          <Cuff x={14} y={470} angle={-6} />
        </g>
      ) : null}

      {/* ---------- 头 ---------- */}
      {/* 耳朵 */}
      <g>
        <ellipse cx={110} cy={276} rx={22} ry={30} fill={SKIN} stroke={OL} strokeWidth={4.5} />
        <path d="M112 262 Q100 276 112 292" stroke={SKIN_SH} strokeWidth={5} fill="none" strokeLinecap="round" />
        <ellipse cx={360} cy={276} rx={22} ry={30} fill={SKIN} stroke={OL} strokeWidth={4.5} />
        <path d="M358 262 Q370 276 358 292" stroke={SKIN_SH} strokeWidth={5} fill="none" strokeLinecap="round" />
      </g>
      <ellipse cx={235} cy={266} rx={126} ry={128} fill={SKIN} stroke={OL} strokeWidth={4.5} />
      {/* 头发：有厚度的短发、七三分、发旋 */}
      <path d="M106 270 Q92 196 128 156 Q170 112 238 110 Q312 110 350 156 Q380 196 364 270 Q360 232 344 210 Q338 190 316 186 Q300 198 272 194 Q230 188 196 178 Q186 196 162 204 Q130 214 120 246 Z" fill={HAIR} stroke={OL} strokeWidth={4} strokeLinejoin="round" />
      <path d="M190 132 Q236 118 286 128" stroke={HAIR_HI} strokeWidth={7} fill="none" strokeLinecap="round" />
      <path d="M196 178 Q214 156 246 148" stroke={HAIR_HI} strokeWidth={4} fill="none" strokeLinecap="round" />
      <path d="M318 186 Q330 172 330 154" stroke={HAIR_HI} strokeWidth={4} fill="none" strokeLinecap="round" />
      {/* 眉毛、眼睛 */}
      {brow(186, 1)}
      {brow(284, -1)}
      {eye(186)}
      {eye(284)}
      {/* 圆眼镜：细框 + 镜片反光 */}
      <g fill="none" stroke="#34302D" strokeWidth={5}>
        <circle cx={186} cy={268} r={36} fill="rgba(220,235,255,0.22)" />
        <circle cx={284} cy={268} r={36} fill="rgba(220,235,255,0.22)" />
        <path d="M222 264 Q235 254 248 264" />
        <path d="M150 262 L114 254 M320 262 L356 254" />
      </g>
      <path d="M160 248 L172 240 M258 248 L270 240" stroke="#FFFFFF" strokeWidth={4} strokeLinecap="round" opacity={0.8} />
      {/* 腮红 */}
      <ellipse cx={150} cy={322} rx={22} ry={12} fill="#F4A3A0" opacity={0.5} />
      <ellipse cx={320} cy={322} rx={22} ry={12} fill="#F4A3A0" opacity={0.5} />
      {/* 鼻子 */}
      <path d="M232 292 Q226 308 236 312" stroke={OL} strokeWidth={3.6} fill="none" strokeLinecap="round" />
      {/* 嘴 */}
      {open ? (
        <g>
          <path d={`M${213} 340 Q235 ${340 + mh * 2.2} 257 340 Q235 ${334} 213 340 Z`} fill="#8A3631" stroke={OL} strokeWidth={4} strokeLinejoin="round" />
          <ellipse cx={235} cy={340 + mh * 0.95} rx={11} ry={Math.max(3, mh * 0.4)} fill="#E57F7B" />
        </g>
      ) : surprised ? (
        <ellipse cx={235} cy={344} rx={11} ry={13} fill="#8A3631" stroke={OL} strokeWidth={4} />
      ) : serious ? (
        <path d="M216 344 Q235 340 254 344" stroke={OL} strokeWidth={5} fill="none" strokeLinecap="round" />
      ) : smile ? (
        <path d="M210 334 Q235 368 260 334 Q235 342 210 334 Z" fill="#8A3631" stroke={OL} strokeWidth={4} strokeLinejoin="round" />
      ) : (
        <path d="M214 336 Q235 356 256 336" stroke={OL} strokeWidth={5} fill="none" strokeLinecap="round" />
      )}
      {/* 吃惊时的小线条 */}
      {surprised ? <path d="M96 196 L80 180 M90 214 L70 208 M374 196 L390 180 M380 214 L400 208" stroke={OL} strokeWidth={4} strokeLinecap="round" /> : null}
    </svg>
  );
};

/* 芝士：圆形头像，露出肩膀；粗框眼镜、蓝色卫衣、胸牌。ph.body / ph.hood 换卫衣颜色，ph.key 把帽绳换成挂绳和钥匙（不动产线） */
export const CheeseArt: React.FC<{ mouth: number; blink: boolean; ph: Record<string, any>; size?: number }> = ({ mouth, blink, ph, size = 210 }) => {
  const skin = ph.skin ?? '#F8DCC4', hair = ph.hair ?? '#2B2B2B', body = ph.body ?? '#7FA7D9', hood = ph.hood ?? '#6B93C6';
  const open = mouth >= 2;
  const mh = 5 + mouth * 1.6;
  const eye = (cx: number) => blink
    ? <path d={`M${cx - 9} 106 Q${cx} 111 ${cx + 9} 106`} stroke={OL} strokeWidth={4} fill="none" strokeLinecap="round" />
    : <g><ellipse cx={cx} cy={105} rx={5.5} ry={7} fill="#231C1A" /><circle cx={cx + 2} cy={102} r={2} fill="#fff" /></g>;
  return (
    <svg viewBox="0 0 210 210" width={size} height={size}>
      <defs><clipPath id="cheese-clip2"><circle cx={105} cy={105} r={100} /></clipPath></defs>
      <circle cx={105} cy={105} r={100} fill="#FFF3C4" />
      <g clipPath="url(#cheese-clip2)">
        {/* 卫衣 + 帽绳 + 胸牌 */}
        <path d="M14 215 Q18 168 70 156 L140 156 Q192 168 196 215 Z" fill={body} stroke={OL} strokeWidth={4} strokeLinejoin="round" />
        <path d="M78 156 Q105 176 132 156" fill={hood} stroke={OL} strokeWidth={3.5} />
        {ph.key ? (
          <g>
            <path d="M90 164 L105 176 L120 164" stroke="#FFFFFF" strokeWidth={3.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M105 184 L105 204 M105 195 L112 195 M105 201 L111 201" stroke="#E0AE2B" strokeWidth={4.5} fill="none" strokeLinecap="round" />
            <circle cx={105} cy={181} r={6.5} fill={body} stroke="#E0AE2B" strokeWidth={4.5} />
          </g>
        ) : <path d="M94 168 L92 196 M116 168 L118 196" stroke="#FFFFFF" strokeWidth={3.5} strokeLinecap="round" />}
        {ph.badge ? <g><rect x={136} y={176} width={32} height={22} rx={4} fill="#FFFFFF" stroke={OL} strokeWidth={3} /><rect x={141} y={184} width={20} height={4} rx={2} fill="#C9D2DE" /></g> : null}
        {/* 脖子、头 */}
        <rect x={92} y={140} width={26} height={22} fill={skin} stroke={OL} strokeWidth={3.5} />
        <ellipse cx={47} cy={108} rx={10} ry={14} fill={skin} stroke={OL} strokeWidth={3.5} />
        <ellipse cx={163} cy={108} rx={10} ry={14} fill={skin} stroke={OL} strokeWidth={3.5} />
        <ellipse cx={105} cy={104} rx={58} ry={60} fill={skin} stroke={OL} strokeWidth={4} />
        {/* 蓬松短发 + 一撮翘毛 */}
        <path d="M46 108 Q38 58 76 40 Q104 28 134 40 Q172 56 164 108 Q160 84 146 74 Q136 82 120 76 Q104 84 86 76 Q70 84 58 80 Q50 90 46 108 Z" fill={hair} stroke={OL} strokeWidth={3.5} strokeLinejoin="round" />
        <path d="M104 34 Q108 18 122 16" stroke={hair} strokeWidth={5} fill="none" strokeLinecap="round" />
        {/* 眉毛、眼睛、粗框眼镜 */}
        <path d="M70 84 Q82 80 94 84 M116 84 Q128 80 140 84" stroke={hair} strokeWidth={4.5} fill="none" strokeLinecap="round" />
        {eye(83)}
        {eye(127)}
        <rect x={63} y={90} width={40} height={32} rx={10} fill="rgba(220,235,255,0.2)" stroke="#262220" strokeWidth={6} />
        <rect x={107} y={90} width={40} height={32} rx={10} fill="rgba(220,235,255,0.2)" stroke="#262220" strokeWidth={6} />
        <path d="M103 102 L107 102" stroke="#262220" strokeWidth={5} />
        <ellipse cx={66} cy={132} rx={10} ry={6} fill="#F4A3A0" opacity={0.5} />
        <ellipse cx={144} cy={132} rx={10} ry={6} fill="#F4A3A0" opacity={0.5} />
        {open ? (
          <g>
            <path d={`M93 138 Q105 ${138 + mh * 2} 117 138 Q105 134 93 138 Z`} fill="#8A3631" stroke={OL} strokeWidth={3.2} strokeLinejoin="round" />
            <ellipse cx={105} cy={138 + mh * 0.9} rx={6} ry={Math.max(2, mh * 0.35)} fill="#E57F7B" />
          </g>
        ) : (
          <path d="M95 138 Q105 146 115 138" stroke={OL} strokeWidth={4} fill="none" strokeLinecap="round" />
        )}
      </g>
      <circle cx={105} cy={105} r={100} fill="none" stroke={OL} strokeWidth={5} />
    </svg>
  );
};
