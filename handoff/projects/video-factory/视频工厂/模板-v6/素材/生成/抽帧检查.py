"""抽 5 帧拼成一张检查图：python3 抽帧检查.py AI-A-停车场新员工.mp4 [检查-A.jpg]
时间点 0.3 / 1.5 / 2.5 / 3.5 / 4.7 秒；另报告四边黑边（每边平均亮度）。"""
import subprocess, sys, tempfile, os, json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()
src = Path(sys.argv[1])
dst = Path(sys.argv[2]) if len(sys.argv) > 2 else src.with_name('检查-' + src.stem.split('-')[1] + '.jpg')
times = [0.3, 1.5, 2.5, 3.5, 4.7]
font = ImageFont.truetype('/System/Library/Fonts/Hiragino Sans GB.ttc', 22)
tiles = []
with tempfile.TemporaryDirectory() as td:
    for t in times:
        p = os.path.join(td, f'{t}.png')
        subprocess.run([FF, '-v', 'error', '-ss', str(t), '-i', str(src), '-frames:v', '1', p, '-y'], check=True)
        tiles.append(Image.open(p).convert('RGB'))
w, h = tiles[0].size
# 黑边检测：取第 3 帧四边 4px 平均亮度
g = tiles[2].convert('L')
def mean(box):
    c = g.crop(box); px = list(c.getdata()); return round(sum(px) / len(px), 1)
edges = {'上': mean((0, 0, w, 4)), '下': mean((0, h - 4, w, h)), '左': mean((0, 0, 4, h)), '右': mean((w - 4, 0, w, h))}
cols, sc = 3, 1.0
rows = 2
W, H = int(w * sc), int(h * sc)
sheet = Image.new('RGB', (cols * W, rows * (H + 30)), (40, 40, 40))
d = ImageDraw.Draw(sheet)
for i, (t, im) in enumerate(zip(times, tiles)):
    x, y = (i % cols) * W, (i // cols) * (H + 30)
    sheet.paste(im.resize((W, H)), (x, y + 30))
    d.text((x + 8, y + 3), f'{src.stem} {t}s {w}x{h}', fill=(255, 220, 0), font=font)
d.text((2 * W + 8, H + 33), '四边亮度 ' + json.dumps(edges, ensure_ascii=False), fill=(255, 220, 0), font=font)
sheet.save(dst, quality=88)
print(dst, f'{w}x{h}', edges)
