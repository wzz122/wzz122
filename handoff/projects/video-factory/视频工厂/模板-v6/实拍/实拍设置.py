# -*- coding: utf-8 -*-
"""实拍满屏工具共用的设置：全部从 画面v6/项目.json「实拍」读，脚本本身不写死任何一期的路径。

项目.json 例（夕张、311 两期的实际做法）：
  "实拍": {
    "工作区": "/Volumes/Extreme SSD/视频工作区/2026-12-311",     原片大文件都放 SSD，不放内置盘
    "原片目录": ["原片-DJI-1230"],                              相对工作区；按 <编号>_*.MP4 或原文件名找（复制原片到SSD.py 的命名）
    "照片目录": ["手机导出", "Sony-JPG"],                       相对工作区；按文件名（不含扩展名）递归找，跳过 ._ 开头的文件
    "片段目录": "实拍片段",                                     做好的满屏底片 <镜头号>.mp4 / 原声 <镜头号>.wav 放这里
    "索引": "~/Desktop/写稿/资料/2026-10-夕张与东北视频整理/04-给Claude-索引数据.json",   原片不在 SSD 时，按 clip_id 找云盘原址和代理 LRF
    "标签": "实拍 2025年12月",                                  左下角小标；null 不标
    "原声": {"相对dB": 0, "闪避dB": 12}                         总装混实拍原声：整体增益、说话时再压多少
  }
"""
import json, os, sys
from pathlib import Path

V6 = Path(__file__).resolve().parent.parent          # 画面v6/
PJ = V6 / '项目.json'
P = json.loads(PJ.read_text(encoding='utf-8')) if PJ.exists() else {}
CFG = P.get('实拍', {})


def _abs(p, base=None):
    p = Path(os.path.expanduser(str(p)))
    return p if p.is_absolute() else (base or V6) / p


if not CFG.get('工作区'):
    sys.exit('项目.json 没写「实拍.工作区」（例 /Volumes/Extreme SSD/视频工作区/<期>）——先在 项目.json 里填好再跑')
WS = _abs(CFG['工作区'])
SRC_DIRS = [_abs(d, WS) for d in CFG.get('原片目录', ['原片'])]
PHOTO_DIRS = [_abs(d, WS) for d in CFG.get('照片目录', ['照片'])]
OUT = _abs(CFG.get('片段目录', '实拍片段'), WS)
TMP = WS / '临时'
INDEX = _abs(CFG['索引']) if CFG.get('索引') else None
LABEL = CFG.get('标签', '实拍')
HERE = Path(__file__).resolve().parent
TOOLS = HERE / '工具'
TL = V6 / P.get('时间轴', '工程/.work/storyboard-audio.json')
VENV_PY = Path.home() / '.venvs/av/bin/python'        # YOLO 人体检测在这个环境里（没有就跳过这一项检查）


def need_ws():
    if not WS.exists():
        sys.exit(f'工作区不在：{WS}（SSD 没挂载？——停下报告，不在内置盘生成替代大文件）')


_index = None


def index_clip(cid):
    """素材索引里的一条（clip_id → source_path / proxy_path / filename）。"""
    global _index
    if INDEX is None or not INDEX.exists():
        return None
    if _index is None:
        _index = {x['clip_id']: x for x in json.loads(INDEX.read_text())['clips']}
    return _index.get(cid)


def src_path(cid, allow_cloud=False):
    """原片：先在 原片目录 找 <编号>_*.MP4 / 原文件名；找不到时（allow_cloud）用索引里的云盘原址（会边读边下载，慢）。"""
    need_ws()
    for d in SRC_DIRS:
        c = sorted(x for x in d.glob(f'{cid}_*') if not x.name.startswith('._')) + sorted(d.glob(cid)) if d.exists() else []
        if c:
            return c[0]
    x = index_clip(cid)
    if x:
        for d in SRC_DIRS:
            f = d / x['filename']
            if f.exists():
                return f
        if allow_cloud and Path(x['source_path']).exists():
            return Path(x['source_path'])
    raise FileNotFoundError(f'{cid} 原片不在 {", ".join(map(str, SRC_DIRS))}（先复制到 SSD）')


def photo_path(name):
    need_ws()
    for d in PHOTO_DIRS:
        if not d.exists():
            continue
        c = sorted(p for p in d.rglob(f'*{name}.*') if not p.name.startswith('._') and p.suffix.lower() in ('.jpg', '.jpeg', '.png', '.heic', '.tif', '.tiff'))
        if c:
            return c[0]
    raise FileNotFoundError(f'照片找不到：{name}（在 {", ".join(map(str, PHOTO_DIRS))} 里递归找）')
