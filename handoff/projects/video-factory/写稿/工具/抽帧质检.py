# 抽帧质检：python3 抽帧质检.py 视频.mp4 timeline.js 输出目录 v|h（v=竖屏 h=横屏；timeline.js 在 视频工厂/.work/，渲染完立刻复制一份，下一次渲染会覆盖）
# 1) 每屏结束前 0.6 秒一帧（元素全部出现，带字幕）→ scene/NN.jpg 和拼图 scenes-*.jpg
# 2) 每句字幕中间一帧，只截字幕区 → subs/NNN.jpg 和拼图 subs-*.jpg（每张 24 条，左上角标句号和原文）
import sys, json, os, subprocess
import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFont

FF = imageio_ffmpeg.get_ffmpeg_exe()
V, TL, OUT, mode = sys.argv[1:5]
s = open(TL, encoding='utf-8').read()
d = json.loads(s[s.index('{'):s.rindex('}') + 1])
os.makedirs(f'{OUT}/scene', exist_ok=True); os.makedirs(f'{OUT}/subs', exist_ok=True)
F = ImageFont.truetype('/System/Library/Fonts/Hiragino Sans GB.ttc', 22, index=2)

def grab(t, path, crop=None):
    subprocess.run([FF, '-y', '-v', 'error', '-ss', f'{t:.3f}', '-i', V, '-frames:v', '1', '-q:v', '3', path], check=True)
    if crop:
        Image.open(path).crop(crop).save(path, quality=90)

for i, sc in enumerate(d['scenes']):
    grab(max(sc['t0'] + 0.5, sc['t1'] - 0.6), f'{OUT}/scene/{i:02d}.jpg')

W, H = (d['meta']['vw'], d['meta']['vh'])
crop = (0, 1180, 1080, 1620) if mode == 'v' else (0, 700, 1920, 1080)   # 字幕区（含上方内容下沿）
said = [(k, b) for k, b in enumerate(d['beats']) if b.get('say')]
for k, b in said:
    grab((b['t0'] + b['t1']) / 2, f'{OUT}/subs/{k:03d}.jpg', crop)

def sheet(files, labels, cols, tw, name):
    ims = [Image.open(f).convert('RGB') for f in files]
    ims = [im.resize((tw, round(im.height * tw / im.width))) for im in ims]
    th = max(im.height for im in ims) + 30
    rows = (len(ims) + cols - 1) // cols
    S = Image.new('RGB', (cols * (tw + 8) + 8, rows * (th + 8) + 8), (50, 50, 50)); dr = ImageDraw.Draw(S)
    for n, (im, lb) in enumerate(zip(ims, labels)):
        x = 8 + (n % cols) * (tw + 8); y = 8 + (n // cols) * (th + 8)
        dr.text((x, y), lb, fill=(255, 230, 0), font=F); S.paste(im, (x, y + 28))
    S.save(name, quality=88)

sc_files = [f'{OUT}/scene/{i:02d}.jpg' for i in range(len(d['scenes']))]
per = 12 if mode == 'v' else 9
for n in range(0, len(sc_files), per):
    sheet(sc_files[n:n + per], [f'屏{i:02d}' for i in range(n, min(n + per, len(sc_files)))],
          6 if mode == 'v' else 3, 300 if mode == 'v' else 600, f'{OUT}/scenes-{n // per}.jpg')
sub_files = [f'{OUT}/subs/{k:03d}.jpg' for k, _ in said]
sub_lab = [f'句{k} 屏{b["scene"]:02d}' for k, b in said]
per = 24 if mode == 'v' else 16
for n in range(0, len(sub_files), per):
    sheet(sub_files[n:n + per], sub_lab[n:n + per], 4, 420 if mode == 'v' else 600, f'{OUT}/subs-{n // per}.jpg')
json.dump([{'beat': k, 'scene': b['scene'], 'say': b['say'], 'sub': b.get('sub', ''), 't0': b['t0'], 't1': b['t1']} for k, b in said],
          open(f'{OUT}/subs.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print(len(sc_files), 'scenes,', len(sub_files), 'subs →', OUT)
