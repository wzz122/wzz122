# -*- coding: utf-8 -*-
"""YOLO 人体检测（找画面里的人，尤其远处很小的人）：逐张输出「文件<TAB>人数<TAB>最大置信度<TAB>最小框高占比」。
补 facecheck / personcheck（macOS Vision）的短板——两期实测 Vision 对远处小人、背影、玻璃反光基本漏检。
用法（在 ~/.venvs/av 里跑）：~/.venvs/av/bin/python yolo人检.py 图1.jpg 图2.jpg …
模型 yolo11m（首次自动下载约 40 MB，存在 ~/.local/share/yolo/），imgsz 1280 看小目标；置信度门限 0.25（宁可多报，人眼复查）。"""
import os, sys
from pathlib import Path

MODEL_DIR = Path.home() / '.local/share/yolo'
MODEL_DIR.mkdir(parents=True, exist_ok=True)
os.environ.setdefault('YOLO_CONFIG_DIR', str(MODEL_DIR))
from ultralytics import YOLO  # noqa: E402

imgs = [a for a in sys.argv[1:] if not Path(a).name.startswith('._')]
if not imgs:
    sys.exit(0)
m = YOLO(str(MODEL_DIR / 'yolo11m.pt'))
dev = 'mps'
try:
    import torch
    if not torch.backends.mps.is_available():
        dev = 'cpu'
except Exception:
    dev = 'cpu'
for i in range(0, len(imgs), 16):
    batch = imgs[i:i + 16]
    for path, r in zip(batch, m.predict(batch, imgsz=1280, conf=0.25, classes=[0], device=dev, verbose=False)):
        b = r.boxes
        n = 0 if b is None else len(b)
        if n:
            h = float((b.xywhn[:, 3]).min())
            print(f'{path}\t{n}\t{float(b.conf.max()):.2f}\t{h:.3f}')
        else:
            print(f'{path}\t0\t0\t0')
