"""每个镜头每一段抽一帧（段内 75% 处），拼总览，给人工 / 助手检查。用法：python3 抽段帧.py [S01,S02…]"""
import json, glob, os, subprocess, sys
import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFont
FF = imageio_ffmpeg.get_ffmpeg_exe()
sb = json.load(open('工程/.work/storyboard.json'))
only = set(sys.argv[1].split(',')) if len(sys.argv) > 1 and sys.argv[1] else None
out = '/private/tmp/claude-501/-Users-wzz122/eb1cc2f6-10f7-46b1-adc9-a8964efc4c91/scratchpad/qa'
os.makedirs(out + '/f', exist_ok=True)
man = json.load(open('镜头/manifest.json'))
files = {}
for k, v in (man.get('shots') or man).items() if isinstance(man, dict) else []:
    pass
shots = []
for sc in sb['scenes']:
    sid = sc['stable_id']
    if only and sid not in only: continue
    dur = sc['t1'] - sc['t0']
    ts = sorted(set([0.0] + [round(e.get('delay', 0), 2) for e in sc['elements'] if e['type'] == 'eyebrow']))
    mp4 = sorted(glob.glob(f'镜头/{sid}-*.mp4'), key=os.path.getmtime)[-1]
    for i, a in enumerate(ts):
        b = ts[i + 1] if i + 1 < len(ts) else dur
        if b - a < .8: continue
        t = min(a + (b - a) * .78, dur - .15)
        f = f'{out}/f/{sid}-{t:06.2f}.jpg'
        subprocess.run([FF, '-y', '-v', 'error', '-ss', f'{t:.2f}', '-i', mp4, '-frames:v', '1', '-vf', 'scale=640:-1', '-q:v', '4', f])
        shots.append((sid, t, f))
font = ImageFont.truetype('/System/Library/Fonts/STHeiti Medium.ttc', 18)
C, R, W, H = 3, 4, 520, 293
tag = sys.argv[2] if len(sys.argv) > 2 else 'q'
for p in range(0, len(shots), C * R):
    im = Image.new('RGB', (C * W, R * H), 'black'); d = ImageDraw.Draw(im)
    for k, (sid, t, f) in enumerate(shots[p:p + C * R]):
        if not os.path.exists(f): continue
        x, y = (k % C) * W, (k // C) * H
        im.paste(Image.open(f).convert('RGB').resize((W - 2, H - 2)), (x + 1, y + 1))
        d.rectangle([x + W - 118, y + 2, x + W - 2, y + 24], fill='black'); d.text((x + W - 114, y + 3), f'{sid} {t:.0f}s', fill='yellow', font=font)
    im.save(f'{out}/{tag}-{p // (C * R) + 1:02d}.jpg', quality=80)
print(len(shots), '帧', (len(shots) + C * R - 1) // (C * R), '张总览')
