import { decodeMono } from "./audio.ts";

export type MouthOptions = {
  /** 归一化音量超过它就张嘴 */
  openThreshold?: number;
  /** 低于它才闭嘴（滞回：开和关用两个阈值，避免嘴巴抖） */
  closeThreshold?: number;
  /** 张嘴至少保持几帧 */
  minOpenFrames?: number;
  /** 闭嘴至少保持几帧（更短的闭嘴空隙会被填平） */
  minClosedFrames?: number;
  /** 张着嘴时音量掉到峰值的这个比例以下，算音节之间的低谷，闭一下嘴 */
  dipRatio?: number;
  /** 闭嘴后音量要比低谷高出这么多才重新张嘴 */
  riseAmount?: number;
  /** 连续张嘴最多几帧，超过就插一次闭嘴 */
  maxOpenFrames?: number;
};

export type MouthResult = {
  durationSec: number;
  frames: number;
  /** 每帧一个值，0..1（按这句的第 95 百分位归一化） */
  rms: number[];
  /** 张嘴区间，相对这一句开头，左闭右开 */
  open: [number, number][];
};

const SAMPLE_RATE = 16000;

/** 按帧算音量包络（RMS），阈值加滞回判断张嘴、闭嘴 */
export function analyzeMouth(audioPath: string, fps: number, opts: MouthOptions = {}): MouthResult {
  const {
    openThreshold = 0.32,
    closeThreshold = 0.18,
    minOpenFrames = 2,
    minClosedFrames = 2,
    dipRatio = 0.62,
    riseAmount = 0.12,
    maxOpenFrames = 8,
  } = opts;
  const pcm = decodeMono(audioPath, SAMPLE_RATE);
  const durationSec = pcm.length / SAMPLE_RATE;
  const frames = Math.max(1, Math.ceil(durationSec * fps));
  const hop = SAMPLE_RATE / fps;

  const raw: number[] = [];
  for (let f = 0; f < frames; f++) {
    const a = Math.floor(f * hop);
    const b = Math.min(pcm.length, Math.floor((f + 1) * hop));
    let sum = 0;
    for (let i = a; i < b; i++) sum += pcm[i] * pcm[i];
    raw.push(b > a ? Math.sqrt(sum / (b - a)) : 0);
  }

  // 用第 95 百分位做参照，这样不同音量的配音用同一套阈值
  const sorted = [...raw].sort((x, y) => x - y);
  const ref = Math.max(sorted[Math.floor(sorted.length * 0.95)] ?? 0, 1e-4);
  const rms = raw.map((v) => Math.min(1, v / ref));

  // 滞回判定：
  //   张嘴：音量 ≥ openThreshold，并且比刚才闭嘴时的最低点高出一截（音节的开头）
  //   闭嘴：音量 < closeThreshold，或者比这次张嘴以来的峰值掉了很多（音节之间的低谷）
  //   一直张着超过 maxOpenFrames 帧时插一次闭嘴，避免长句嘴巴「卡住」
  const state: boolean[] = [];
  let isOpen = false;
  let peak = 0;
  let trough = 1;
  let run = 0;
  for (const v of rms) {
    run++;
    if (isOpen) {
      peak = Math.max(peak, v);
      const dip = run >= minOpenFrames && v < peak * dipRatio;
      if (v < closeThreshold || dip || run >= maxOpenFrames) {
        isOpen = false;
        // 强制插入的闭嘴不是真低谷，闭够帧数就可以再张开
        trough = run >= maxOpenFrames && !dip ? 0 : v;
        run = 1;
      }
    } else {
      trough = Math.min(trough, v);
      if (run > minClosedFrames && v >= openThreshold && v >= trough + riseAmount) {
        isOpen = true;
        peak = v;
        run = 1;
      }
    }
    state.push(isOpen);
  }

  // 填平太短的闭嘴空隙，再去掉太短的张嘴
  fillShortRuns(state, false, minClosedFrames);
  fillShortRuns(state, true, minOpenFrames);

  const open: [number, number][] = [];
  let start = -1;
  state.forEach((s, i) => {
    if (s && start < 0) start = i;
    if (!s && start >= 0) {
      open.push([start, i]);
      start = -1;
    }
  });
  if (start >= 0) open.push([start, state.length]);

  return { durationSec, frames, rms: rms.map((v) => Math.round(v * 1000) / 1000), open };
}

/** 把长度小于 minLen 的 value 段改成相反值（两头的段不动） */
function fillShortRuns(state: boolean[], value: boolean, minLen: number): void {
  let i = 0;
  while (i < state.length) {
    if (state[i] !== value) {
      i++;
      continue;
    }
    let j = i;
    while (j < state.length && state[j] === value) j++;
    const touchesEdge = i === 0 || j === state.length;
    if (j - i < minLen && !(touchesEdge && !value)) {
      for (let k = i; k < j; k++) state[k] = !value;
    }
    i = j;
  }
}
