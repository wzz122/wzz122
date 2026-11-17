# 把某镜头的检查帧（每秒 2 帧）拼成复查图：每 2 帧取 1（1 秒 1 张），命中人体/人脸检查的帧加红框
import json, sys
from pathlib import Path
from PIL import Image, ImageDraw
sys.path.insert(0, str(Path(__file__).resolve().parent))
from 实拍设置 import OUT
CHK = OUT / '检查帧'
OUT = Path(__file__).resolve().parent / '人脸复查'; OUT.mkdir(exist_ok=True)
for sid in sys.argv[1:]:
    rec = json.loads((Path(__file__).resolve().parent / '记录' / f'{sid}.json').read_text())
    hits = {x.split()[0] for x in rec.get('personcheck命中', []) + rec.get('facecheck命中', []) + rec.get('yolo命中', [])}
    fs = sorted(p for p in (CHK / sid).glob('*.jpg') if not p.name.startswith('._'))
    pick = [p for i, p in enumerate(fs) if i % 2 == 0 or p.name in hits]
    w, h, cols = 384, 202, 6
    rows = (len(pick) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * w, rows * h), 'black'); d = ImageDraw.Draw(sheet)
    for k, p in enumerate(pick):
        im = Image.open(p).convert('RGB').resize((w, h)); x, y = (k % cols) * w, (k // cols) * h
        sheet.paste(im, (x, y))
        if p.name in hits: d.rectangle([x, y, x + w - 1, y + h - 1], outline='red', width=5)
        d.text((x + 4, y + 2), f'{(int(p.stem) - 1) / 2:.1f}s', fill='yellow')
    sheet.save(OUT / f'{sid}.jpg', quality=82); print(sid, len(pick), '张，命中', len(hits))
