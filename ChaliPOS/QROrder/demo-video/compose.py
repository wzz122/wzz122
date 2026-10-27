"""把录屏帧 + 幻灯片 + 字幕合成 1080p 视频，再混上配乐和「叮咚」。
用法：python3 compose.py <工作目录> <输出.mp4> [配乐1.mp3 配乐2.mp3] [叮咚.wav]
  录屏帧：<工作目录>/rec（record.js）  画面素材：<工作目录>/assets（assets.js）
"""
import bisect
import json
import math
import os
import subprocess
import sys
from functools import lru_cache

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.abspath(sys.argv[1])
OUT = os.path.abspath(sys.argv[2])
BGM = [a for a in sys.argv[3:] if a.endswith('.mp3')]
DING = next((a for a in sys.argv[3:] if a.endswith('.wav')), None)
FF = os.environ.get('FFMPEG', 'ffmpeg')
REC = os.path.join(WORK, 'rec')
A = os.path.join(WORK, 'assets')
W, H, FPS = 1920, 1080, 30
FADE = 0.4                      # 幻灯片和录屏之间的淡入淡出（秒）
ORANGE = (224, 123, 57)

cfg = json.load(open(os.path.join(HERE, 'video.json')))
PH, TB = cfg['layout']['PH'], cfg['layout']['TB']
man = json.load(open(os.path.join(A, 'manifest.json')))
tl = json.load(open(os.path.join(REC, 'timeline.json')))
M = {m['name']: m['t'] for m in tl['markers']}
scenes = cfg['scenes']

# ---------------------------------------------------------------------------
# 时间线：录屏镜头从自己的时间点播到下一个镜头的时间点（真实速度），幻灯片固定时长
# ---------------------------------------------------------------------------
rec_idx = [i for i, s in enumerate(scenes) if 'at' in s]
segs = []
t = 0.0
for i, s in enumerate(scenes):
    if 'at' in s:
        later = [j for j in rec_idx if j > i]
        end = M[scenes[later[0]]['at']] if later else M['end']
        play = (end - M[s['at']]) / 1000
        segs.append(dict(i=i, o=t, play=play, hold=s.get('hold', 0), w0=M[s['at']]))
    else:
        segs.append(dict(i=i, o=t, play=s['dur'], hold=0, w0=None))
    t += segs[-1]['play'] + segs[-1]['hold']
TOTAL = t


def locate(t):
    for sg in segs:
        if t < sg['o'] + sg['play'] + sg['hold']:
            return sg
    return segs[-1]


# ---------------------------------------------------------------------------
# 素材
# ---------------------------------------------------------------------------
def img(name):
    return Image.open(os.path.join(A, name)).convert('RGBA')


SLIDES = {n: Image.open(os.path.join(A, f'slide-{n}.png')).convert('RGB') for n in {s['slide'] for s in scenes if 'slide' in s}}
BG = [Image.open(os.path.join(A, f'bg-{k}.png')).convert('RGB') for k in range(len(man['chapters']))]
CAPS = {int(k): img(v) for k, v in man['caps'].items()}
FX = {k: img(f'fx-{k}.png') for k in ['arrow', 'ding', 'bubble', 'pos']}


def rounded_mask(w, h, r):
    m = Image.new('L', (w, h), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, w - 1, h - 1), r, fill=255)
    return m


MASK_PH = rounded_mask(PH['w'], PH['h'], 38)
MASK_TB = rounded_mask(TB['w'], TB['h'], 16)
SRC = {k: ([f['t'] for f in tl[k]], tl[k]) for k in ['phone', 'tablet']}


@lru_cache(maxsize=64)
def load(name, idx, w, h):
    return Image.open(os.path.join(REC, SRC[name][1][idx]['file'])).convert('RGB').resize((w, h), Image.LANCZOS)


def frame_at(name, wall, box):
    ts = SRC[name][0]
    idx = max(0, bisect.bisect_right(ts, wall) - 1)
    return load(name, idx, box['w'], box['h'])


def paste(im, ov, x, y, alpha=1.0):
    if alpha <= 0:
        return
    if alpha < 1:
        ov = ov.copy()
        ov.putalpha(ov.getchannel('A').point(lambda v: int(v * alpha)))
    im.paste(ov, (int(x), int(y)), ov)


def ease(x):
    x = min(1, max(0, x))
    return 1 - (1 - x) ** 3


# ---------------------------------------------------------------------------
# 一帧
# ---------------------------------------------------------------------------
def device_frame(sg, t):
    s = scenes[sg['i']]
    age = t - sg['o']
    wall = sg['w0'] + min(age, sg['play']) * 1000
    im = BG[man['chapters'].index(s['chapter'])].copy()
    im.paste(frame_at('phone', wall, PH), (PH['x'], PH['y']), MASK_PH)
    im.paste(frame_at('tablet', wall, TB), (TB['x'], TB['y']), MASK_TB)
    fx = s.get('fx', [])
    dr = ImageDraw.Draw(im, 'RGBA')
    if 'arrow' in fx and age < 2.6:
        k = ease(age / 0.5) * (1 - max(0, age - 2.1) / 0.5)
        x0, x1, y = PH['x'] + PH['w'] + 22, TB['x'] - 30, PH['y'] + 250
        xe = x0 + (x1 - x0) * ease(age / 0.6)
        dr.line((x0, y, xe, y), fill=(*ORANGE, int(255 * k)), width=10)
        dr.polygon([(xe, y - 20), (xe + 28, y), (xe, y + 20)], fill=(*ORANGE, int(255 * k)))
        a = FX['arrow']
        paste(im, a, (x0 + x1) / 2 - a.width / 2 + 6, y - a.height - 16, k)
    if 'ding' in fx and age < 3.0:
        k = 1 - max(0, age - 2.4) / 0.6
        p = (math.sin(age * 9) + 1) / 2
        dr.rounded_rectangle((TB['x'] - 30, TB['y'] - 30, TB['x'] + TB['w'] + 30, TB['y'] + TB['h'] + 30), 44,
                             outline=(*ORANGE, int(230 * k * (0.35 + 0.65 * p))), width=9)
        d = FX['ding']
        paste(im, d, TB['x'] + TB['w'] - d.width - 30, TB['y'] + TB['h'] - d.height - 30, k * ease(age / 0.3))
    if 'bubble' in fx:
        b = FX['bubble']
        paste(im, b, PH['x'] + 24, PH['y'] + PH['h'] - b.height - 40 - (1 - ease(age / 0.4)) * 20, ease(age / 0.4))
    if 'pos' in fx and age > 1.0:
        p = FX['pos']
        k = ease((age - 1.0) / 0.4)
        paste(im, p, TB['x'] + TB['w'] * 0.62 - p.width / 2, TB['y'] + TB['h'] * 0.5 - p.height / 2 + (1 - k) * 30, k)
    cap = CAPS.get(sg['i'])
    if cap is not None:
        k = ease(age / 0.35)
        paste(im, cap, (W - cap.width) / 2, 1000 - cap.height / 2 + (1 - k) * 20, k)
    return im


def frame(t):
    sg = locate(t)
    s = scenes[sg['i']]
    im = SLIDES[s['slide']].copy() if 'slide' in s else device_frame(sg, t)
    # 和上一个镜头类型不同（幻灯片 ↔ 录屏、幻灯片 ↔ 幻灯片）就淡入
    age = t - sg['o']
    if sg['i'] > 0 and age < FADE:
        prev = segs[sg['i'] - 1]
        ps = scenes[prev['i']]
        if 'slide' in s or 'slide' in ps:
            pim = SLIDES[ps['slide']].copy() if 'slide' in ps else device_frame(prev, prev['o'] + prev['play'] + prev['hold'] - 0.001)
            im = Image.blend(pim, im, ease(age / FADE))
    if t > TOTAL - 0.6:
        im = Image.blend(im, Image.new('RGB', (W, H), 'black'), (t - (TOTAL - 0.6)) / 0.6)
    return im


def main():
    tmp = OUT + '.video.mp4'
    n = int(TOTAL * FPS)
    p = subprocess.Popen([FF, '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                          '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', tmp], stdin=subprocess.PIPE)
    for k in range(n):
        p.stdin.write(frame(k / FPS).tobytes())
        if k % (FPS * 10) == 0:
            print(f'{k / FPS:5.1f}s / {TOTAL:.1f}s', flush=True)
    p.stdin.close()
    p.wait()

    # 声音：两首配乐接起来（3 秒交叉），在「叮咚」镜头放提示音，整体 -16 LUFS
    dings = [segs[i]['o'] + 0.05 for i, s in enumerate(scenes) if 'ding' in s.get('fx', [])]
    if not BGM:
        os.replace(tmp, OUT)
        return
    ins, filt = [], []
    for b in BGM:
        ins += ['-i', b]
    for j in range(len(BGM)):
        filt.append(f'[{j}:a]loudnorm=I=-21:TP=-3:LRA=11,aresample=48000[b{j}]')
    chain = '[b0]'
    for j in range(1, len(BGM)):
        filt.append(f'{chain}[b{j}]acrossfade=d=3[x{j}]')
        chain = f'[x{j}]'
    filt.append(f'{chain}atrim=0:{TOTAL:.2f},afade=t=in:d=1,afade=t=out:st={TOTAL - 3:.2f}:d=3[bg]')
    mix = ['[bg]']
    if DING:
        for k, at in enumerate(dings):
            ins += ['-i', DING]
            idx = len(BGM) + k
            ms = int(at * 1000)
            filt.append(f'[{idx}:a]aresample=48000,pan=stereo|c0=c0|c1=c0,volume=0.8,adelay={ms}|{ms}[d{k}]')
            mix.append(f'[d{k}]')
    filt.append(f'{"".join(mix)}amix=inputs={len(mix)}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[out]')
    wav = OUT + '.audio.wav'
    subprocess.run([FF, '-loglevel', 'error', '-y', *ins, '-filter_complex', ';'.join(filt), '-map', '[out]', '-t', f'{TOTAL:.2f}', '-c:a', 'pcm_s16le', wav], check=True)
    subprocess.run([FF, '-loglevel', 'error', '-y', '-i', tmp, '-i', wav, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', OUT], check=True)
    os.remove(tmp)
    os.remove(wav)
    print('done', OUT, f'{TOTAL:.1f}s')


if __name__ == '__main__':
    # STILLS=1：只导出每个镜头中间的一帧（检查用）
    if os.environ.get('STILLS'):
        os.makedirs(OUT, exist_ok=True)
        for sg in segs:
            frame(sg['o'] + min(sg['play'] * 0.6, sg['play'] - 0.05)).save(os.path.join(OUT, f"{sg['i']:02d}.jpg"), quality=85)
        print('stills', OUT, f'{TOTAL:.1f}s')
    else:
        main()
