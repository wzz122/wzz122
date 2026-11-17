# 模板-v6 实拍：每段代理文件（LRF）每 2 秒抽一帧，拼成带时间码的选段图（定入点出点、看人脸用）。
# 用法：python3 实拍/选段图.py YZ-004 YZ-005 …（不给就画索引里全部有代理的）；输出 实拍/选段图/<编号>.jpg
import json, subprocess, sys, os, io
from PIL import Image, ImageDraw, ImageFont
import imageio_ffmpeg
FF = imageio_ffmpeg.get_ffmpeg_exe()
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from 实拍设置 import INDEX, HERE
if INDEX is None: sys.exit('项目.json 没写「实拍.索引」')
d = json.load(open(INDEX)); clips = {x['clip_id']: x for x in d['clips'] if x.get('proxy_path')}
os.makedirs(HERE / '选段图', exist_ok=True); os.chdir(HERE)
ids = sys.argv[1:] or sorted(clips)
step = 2.0
font = ImageFont.truetype('/System/Library/Fonts/Menlo.ttc', 20)
for cid in ids:
    out = f'选段图/{cid}.jpg'
    if os.path.exists(out): continue
    p = clips[cid]['proxy_path']
    r = subprocess.run([FF, '-v', 'error', '-i', p, '-vf', f'fps=1/{step},scale=320:-2', '-f', 'image2pipe', '-c:v', 'mjpeg', '-q:v', '4', '-'], capture_output=True)
    data = r.stdout; frames = []
    i = 0
    while True:
        a = data.find(b'\xff\xd8', i)
        if a < 0: break
        b = data.find(b'\xff\xd9', a)
        if b < 0: break
        frames.append(Image.open(io.BytesIO(data[a:b+2])).convert('RGB')); i = b + 2
    if not frames: print(cid, '无帧'); continue
    w, h = frames[0].size; cols = 6 if w > h else 10
    rows = (len(frames) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * w, rows * h), 'black'); dr = ImageDraw.Draw(sheet)
    for k, f in enumerate(frames):
        x, y = (k % cols) * w, (k // cols) * h
        sheet.paste(f, (x, y)); dr.rectangle([x, y, x + 70, y + 24], fill='black'); dr.text((x + 3, y + 1), f'{k*step:.0f}s', fill='yellow', font=font)
    sheet.save(out, quality=80); print(cid, len(frames), '帧')
