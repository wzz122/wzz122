import { continueRender, delayRender, Easing, interpolate, spring, staticFile } from 'remotion';

export const C = {
  bg: '#FBF7EF',
  dot: '#EFE6D6',
  card: '#FFFFFF',
  ink: '#1F2A44',
  sub: '#6B7287',
  line: '#E8DFCF',
  accent: '#E8743B', // 牛丼橙，与角色表一致
  accentSoft: '#FDEBDD',
  yellow: '#FFD54A',
  yellowSoft: '#FFF3C4',
  teal: '#2A9D8F',
  tealSoft: '#DDF2EE',
  red: '#E04F4F',
  redSoft: '#FDE4E2',
  gray: '#9AA1B2',
};

export const FONT = '"Noto Sans SC", "Noto Sans JP", sans-serif';
export const SHADOW = '0 10px 30px rgba(31, 42, 68, 0.10), 0 2px 6px rgba(31, 42, 68, 0.06)';

let fontsLoaded = false;
export function loadFonts() {
  if (fontsLoaded || typeof document === 'undefined') return;
  fontsLoaded = true;
  const handle = delayRender('Noto 字体');
  const faces = [
    new FontFace('Noto Sans SC', `url(${staticFile('fonts/NotoSansSC.ttf')})`, { weight: '100 900' }),
    new FontFace('Noto Sans JP', `url(${staticFile('fonts/NotoSansJP.ttf')})`, { weight: '100 900' }),
  ];
  Promise.all(faces.map(f => f.load().then(l => document.fonts.add(l))))
    .then(() => continueRender(handle))
    .catch(err => { console.error(err); continueRender(handle); });
}

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

// 0→1 的弹出（带一点回弹）
export const pop = (frame: number, at: number | undefined, fps = 30, damping = 12) =>
  at == null || frame < at ? 0 : spring({ frame: frame - (at as number), fps, config: { damping, stiffness: 170, mass: 0.8 } });

// 0→1 的平滑进度
export const ease = (frame: number, at: number, dur = 12) =>
  interpolate(frame, [at, at + dur], [0, 1], { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) });

export const lin = (frame: number, a: number, b: number, from = 0, to = 1) => interpolate(frame, [a, b], [from, to], clamp);

export const shown = (frame: number, at: number | undefined) => at != null && frame >= at;
