/* 效果音（共用）：用 ffmpeg 现场合成，不依赖外部素材、不花钱。
   想换成真实音效：把同名 wav 放进 public/sfx/ 即可，存在就不会覆盖。 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const RECIPES = {
  pop: ['aevalsrc=0.55*sin(2*PI*(500+1600*t)*t)*exp(-28*t):d=0.16'],
  tick: ['aevalsrc=0.35*sin(2*PI*2400*t)*exp(-90*t):d=0.05'],
  ding: ['aevalsrc=0.45*sin(2*PI*1568*t)*exp(-5*t)+0.25*sin(2*PI*2349*t)*exp(-7*t)+0.15*sin(2*PI*3136*t)*exp(-9*t):d=1.1'],
  whoosh: ['anoisesrc=d=0.45:c=pink:a=0.6', 'highpass=f=700,lowpass=f=6000,afade=t=in:d=0.18,afade=t=out:st=0.18:d=0.27'],
  buzz: ['aevalsrc=0.3*sin(2*PI*330*t)*exp(-4*t)+0.3*sin(2*PI*262*t)*exp(-4*t)*gte(t\\,0.14):d=0.6'],
};

export function ensureSfx(dir) {
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, [src, af]] of Object.entries(RECIPES)) {
    const out = path.join(dir, `${name}.wav`);
    if (fs.existsSync(out)) continue;
    const args = ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', src];
    if (af) args.push('-af', af);
    args.push('-ac', '1', '-ar', '48000', out);
    execFileSync('ffmpeg', args);
  }
  return Object.fromEntries(Object.keys(RECIPES).map(n => [n, path.join(dir, `${n}.wav`)]));
}
