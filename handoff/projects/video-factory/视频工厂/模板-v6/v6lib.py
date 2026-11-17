"""v6lib —— v6 镜头脚本分镜帮助库（通用模板版，2026-10-07 从 T009《大阪USJ有多牛逼》v6 固化）

一句话：每个镜头写一个 镜头脚本/<镜头号>.py，里面 def build(): begin('S05', …) 然后调用组件函数；
最后 build_storyboard() 把全部镜头按 storyboard-audio.json 的顺序和时间拼成 .work/storyboard.json + timeline.js。

每期不同的东西（章名、素材目录、证据卡、时间轴位置……）都写在同目录的 项目.json 里，本文件不改。
规矩：
  - 坐标一律 1920×1008 画布像素；时间一律「镜头内秒数」（本镜头第 0 帧 = 0）。T(句号)、Tw('词') 给出旁白时刻。
  - 镜头顺序、t0/t1、beats 原样来自 项目.json「时间轴」（默认 工程/.work/storyboard-audio.json），本库绝不改时间（build_storyboard 末尾会断言）。
  - 安全区：内容 y ≤ 870；出处条 881–921（begin 自动放）；字幕 925–990（总装烧）；1008 以下底栏（总装拼）。
    左右暗角：正文、数字放在 x 150–1770 之间。
  - 数字、引语只按本期证据卡（项目.json「证据卡」）。
  - 渲染是重任务：render() 自动套 mac-heavy-job.py，退出码 75 自动等 30 秒重试，不绕过锁。
详细参数见同目录 v6lib-接口说明.md。
"""
from __future__ import annotations

import copy
import importlib.util
import json
import math
import os
import re
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import unquote

from PIL import Image

# ---------------------------------------------------------------- 路径与常量
_FLAT_TYPES = {'photocard', 'docpage', 'videocard', 'panel', 'note2', 'quotecard', 'pop'}   # v7b 2026-11-07
V6 = Path(__file__).resolve().parent
PROJECT_JSON = V6 / '项目.json'                        # 每期设置（新建一期.py 写骨架；字段见 模板-v6/README.md）
P = json.loads(PROJECT_JSON.read_text(encoding='utf-8')) if PROJECT_JSON.exists() else {}


def _p(v):
    """项目.json 里的路径：绝对路径照用，相对路径按 画面v6/ 目录算。"""
    v = Path(str(v)).expanduser()
    return v if v.is_absolute() else V6 / v


PROJ = V6 / '工程'
WORK = PROJ / '.work'
AUDIO_JSON = _p(P.get('时间轴', '工程/.work/storyboard-audio.json'))
SHOT_DIR = V6 / '镜头脚本'
CACHE_DIR = V6 / '镜头'
SELFTEST_DIR = V6 / '自测'
V5_STORYBOARD = _p(P.get('兜底分镜', '工程/.work/storyboard-旧画面参考.json'))   # 没写脚本的镜头拿它预览（可以没有）
def _node_bin():
    """Node 24 所在目录：优先 nvm 里最新的 v24（两台电脑小版本可能不同），没有就用 PATH 里的 node。"""
    import shutil
    vs = sorted((Path.home() / '.nvm' / 'versions' / 'node').glob('v24*/bin'),
                key=lambda p: [int(x) if x.isdigit() else 0 for x in p.parent.name[1:].split('.')])
    if vs:
        return str(vs[-1])
    n = shutil.which('node')
    return str(Path(n).parent) if n else '/usr/local/bin'


NODE_BIN = _node_bin()
HEAVY_JOB = Path.home() / '.local' / 'bin' / 'mac-heavy-job.py'      # 16 GB 机器的重任务锁（两台电脑各装一份）
HEAVY = ['/usr/bin/python3', str(HEAVY_JOB), '--']
ASSET_DIRS = [_p(d) for d in P.get('素材目录', ['素材'])]                 # 图片：按顺序找（素材/帧/x.png 写成 '帧/x.png'）
SEQ_DIR = V6 / '素材' / '序列'                          # videocard 的 JPG 序列缓存（按源文件哈希命名）
VIDEO_DIRS = [_p(d) for d in P.get('视频目录', ['素材', '素材/生成'])]     # 视频：按顺序找

W, H, FPS = 1920, 1008, 30
SAFE = dict(x0=150, x1=1770, y0=60, y1=870)          # 正文安全区
SOURCE_BOX = (150, 884, 1560, 34)                     # 左下出处
CHAPTER_BOX = (1170, 50, 600, 80)                      # 右上章标（右对齐到 x=1770）
TITLE_BOX = (150, 70, 1000, 120)                       # 默认标题框（右边留给章标）

# 色板（与 stage.css :root 同名变量一致）；项目.json「色板」可以改个别颜色（同时改 stage.css，= 全片重渲）
C = dict(paper='#EAE6D9', ink='#1E1C18', soft='#3A3732', muted='#6B6760', muted2='#9C978C',
         red='#B03A33', red_hi='#D04533', green='#326c59', green_hi='#3f8a71', gold='#dec777',
         hl='#f2dd4e', navy='#34486C', white='#fbf8f1', pen='#c0392b')
C.update(P.get('色板') or {})

# 章名：项目.json「章名」{章号: 章名}（≤10 字，与稿子 ## 一致）；没写的章用时间轴里的章名。
# 「章标覆盖」{镜头号: 章号}：某镜头的右上章标显示别的章（USJ：S52、S53a 显示第 14 章）。「章号文字」{章号: '引子'} 改「第 N 章」那一行。
CHAPTERS = {int(k): v for k, v in (P.get('章名') or {}).items()}
CHAPTER_DISPLAY = {k: int(v) for k, v in (P.get('章标覆盖') or {}).items()}
CHAPTER_KICKER = {int(k): v for k, v in (P.get('章号文字') or {}).items()}

# 中、重档音效（总装 05 对照表：快门、连拍、盖章、冲击、嗖、riser、胶片、低频咚），build_storyboard 查它们的间隔
MID_HEAVY_SFX = {'shutter', '快门', 'camera', 'burst', 'shutter-burst', '连拍', '快门-连拍', 'stamp', '盖章', 'stamp2', 'stamp1', '盖章-单下',
                 'hit', 'hit-light', 'hit-轻', 'impact', 'hit-heavy', 'hit-重', 'heavy', 'whoosh', '嗖', 'swoosh', 'riser', 'riser-1.2',
                 'riser-1.5', 'riser15', 'film', '胶片', '胶片噪声', 'boom', '咚', 'dong'}

# 节拍表（2026-11-06，手法库卡 07/11）：画面v6/节拍表.json，配音对齐后、写镜头脚本前填；没有这个文件就不做下面的节奏检查（旧期不受影响）
BEATS_JSON = V6 / '节拍表.json'
STRENGTHS = ('强', '中', '松')
HEAVY_FX = {'bigstamp', 'seal', 'focuslines', 'onoma'}       # 重效果：只放强段
RELAX_GAP = 8.05                                             # 松段允许的最长静止（普通镜头 4.05）
BEAT_FLAT_CV = .20                                           # 每 30 秒动作数的变异系数低于它算「太匀」（近 11 期实测 0.17–0.32，USJ v6 0.23）


def _load_beats():
    if not BEATS_JSON.exists():
        return {}
    rows = json.loads(BEATS_JSON.read_text(encoding='utf-8')).get('镜头') or {}
    for sid, r in rows.items():
        if r.get('强弱') and r['强弱'] not in STRENGTHS:
            raise ValueError(f'节拍表.json {sid} 的强弱「{r["强弱"]}」认不出（只有 强 / 中 / 松）')
    return rows


# 「全幅」组件：元素框是整个画布，内容自己定位，不参与安全区检查
FULLCANVAS = {'lens', 'highlighter', 'circle', 'arrow', 'focuslines', 'speedlines', 'maphl',
              'mapline', 'mappins', 'bigchapter', 'songtitle', 'maptint', 'mapflow', 'mapimage', 'chapterover'}          # 后四个：地图舞台（2026-10-27）
TEXTY = {'title', 'label', 'caption', 'smalllabel', 'panel', 'metric', 'statbar', 'counter', 'quotecard', 'rankboard',
         'timeline', 'note2', 'bigquote', 'pop'}

# ---------------------------------------------------------------- 时间轴
_AUD = json.loads(AUDIO_JSON.read_text())
_ORDER = [s['stable_id'] for s in _AUD['scenes']]
_BY = {s['stable_id']: (i, s) for i, s in enumerate(_AUD['scenes'])}
for _s in _AUD['scenes']:                                # 项目.json 没写的章名，用时间轴里的（来自稿子 ##）
    CHAPTERS.setdefault(_s['no'], _s.get('chapter') or f'第{_s["no"]}章')


def _kicker(no):
    return CHAPTER_KICKER.get(no, f'第 {no} 章')


def frames_of(sc):
    return round(sc['t1'] * FPS) - round(sc['t0'] * FPS)


class Shot:
    """一个镜头。begin() 返回它；组件函数默认加到「当前镜头」。"""

    def __init__(self, sid: str):
        if sid not in _BY:
            raise KeyError(f'没有镜头 {sid}；可用：{", ".join(_ORDER)}')
        i, sc = _BY[sid]
        self.id, self.index, self.no = sid, i, sc['no']
        self.t0, self.t1 = sc['t0'], sc['t1']
        self.frames = frames_of(sc)
        self.dur = self.frames / FPS                       # 渲染用的镜头时长（帧对齐）
        self.chapter_no = CHAPTER_DISPLAY.get(sid, sc['no'])
        self.chapter = CHAPTERS[self.chapter_no]
        self.beats = [dict(n=b['original_beat'], t0=round(b['t0'] - sc['t0'], 3), t1=round(b['t1'] - sc['t0'], 3), say=b['say'])
                      for b in _AUD['beats'] if b['scene'] == i]
        self.elements: list[dict] = []
        self.sfx: list[dict] = []
        self.dark = False
        self.vig = None
        self.motion = None
        self.bgvideo = None   # 模板·实拍底片
        self._n = 0

    # ---- 时间 ----
    def T(self, n: int, end: bool = False) -> float:
        """旁白句号 n（original_beat）在本镜头内的开始秒数；end=True 取结束秒数。"""
        for b in self.beats:
            if b['n'] == n:
                return b['t1'] if end else b['t0']
        raise KeyError(f'{self.id} 里没有第 {n} 句；本镜头句号：{[b["n"] for b in self.beats]}')

    def Tw(self, word: str, nth: int = 0, end: bool = False) -> float:
        """估算旁白念到某个词的秒数（按字数在该句内线性插值，误差约 ±0.3 秒）。end=True 取念完这个词的时刻。"""
        k = 0
        for b in self.beats:
            say = b['say']
            for m in re.finditer(re.escape(word), say):
                if k == nth:
                    pos = m.end() if end else m.start()
                    return round(b['t0'] + (b['t1'] - b['t0']) * pos / max(1, len(say)), 3)
                k += 1
        raise KeyError(f'{self.id} 旁白里找不到「{word}」（第 {nth} 次）')

    def say(self):
        """打印本镜头每句旁白的时刻，写分镜时对照用。"""
        print(f'{self.id} 第{self.no}章 {self.dur:.2f}s')
        for b in self.beats:
            print(f'  句{b["n"]:>3}  {b["t0"]:6.2f}–{b["t1"]:6.2f}  {b["say"]}')

    # ---- 元素 ----
    def add(self, typ: str, x=0, y=0, w=None, h=None, at=0.0, **kw) -> dict:
        self._n += 1
        e = dict(id=f'{self.id}_{self._n}', type=typ, x=round(x, 2), y=round(y, 2))
        if w is not None:
            e['w'] = round(w, 2)
        if h is not None:
            e['h'] = round(h, 2)
        if at < 0:
            print(f'[提示] {self.id} {typ} 出现时间 {at:.2f} < 0，按 0 处理')
            at = 0.0
        if at < .2 and typ not in ('bigstamp', 'seal', 'eyebrow', 'source'):   # v7b：镜头一开头的元素硬切出现（原来 0.3–0.5 秒淡入，切点闪一下空纸）
            at = 0.0
            if typ in ('label', 'caption', 'title', 'smalllabel', 'bigquote', 'panel', 'note2', 'scrim', 'metric', 'pill'):
                kw['dur'] = .02
            if typ in ('photocard', 'docpage', 'videocard', 'quotecard'):
                kw['enter'] = 'none'
            if typ == 'parallax' and kw.get('enter') == 'fade':
                kw['enter'] = 'none'
        e['delay'] = round(at, 3)
        keep_rot = kw.pop('keep_rot', False)            # 2026-11-17：深色底原文屏要斜放原件（版式速查「原文上屏」），用 keep_rot=True 保留 rot
        if typ in _FLAT_TYPES:                          # v7b：卡片不倾斜、不「落下」（去 AI 模板味：倾斜卡片 + 落下 + 胶带）
            kw['rot'] = kw.get('rot') if keep_rot else None
            if kw.get('dropRot') is not None:
                kw['dropRot'] = 0
            if kw.get('enter') == 'drop':
                kw['enter'] = 'fade'
            if kw.get('anim') == 'drop':
                kw['anim'] = 'up'
            if typ == 'quotecard':
                kw['tape'] = False
        for k, v in kw.items():
            if v is not None:
                e[k] = v
        self.elements.append(e)
        return e

    def sound(self, kind: str, at: float, gain: float | None = None, el: dict | None = None):
        """登记一个音效事件（镜头内秒数）。kind：stamp 咚 / paper 纸张啪 / click 嗒 / tick 计数咔 / whoosh 嗖 / pop 弹出 / shutter 快门"""
        ev = dict(kind=kind, at=round(at, 3), shot=self.id)
        if gain is not None:
            ev['gain'] = gain
        if el is not None:
            ev['el'] = el['id']
        self.sfx.append(ev)
        return ev


_CUR: Shot | None = None
_SHOTS: dict[str, Shot] = {}


def _S(shot=None) -> Shot:
    s = shot or _CUR
    if s is None:
        raise RuntimeError('先调用 begin(镜头号)')
    return s


def T(n, end=False, shot=None):
    return _S(shot).T(n, end)


def Tw(word, nth=0, end=False, shot=None):
    return _S(shot).Tw(word, nth, end)


def shot_info(sid):
    """不开始写镜头，只查看某镜头的时长和旁白时刻。"""
    s = Shot(sid)
    s.say()
    return s


# ---------------------------------------------------------------- 素材
def asset(name: str):
    """按名字找素材，返回 (file:// URI, 宽, 高)。查找顺序：项目.json「素材目录」逐个找（默认 画面v6/素材）→ 绝对路径。"""
    p = Path(name)
    cands = [p] if p.is_absolute() else [d / name for d in ASSET_DIRS]
    for c in cands:
        if c.exists():
            c = c.resolve()
            if not os.access(c, os.R_OK):
                raise PermissionError(f'素材不可读（SSD 未挂载？）：{c}')
            iw, ih = Image.open(c).size
            return c.as_uri(), iw, ih
    raise FileNotFoundError(f'找不到素材 {name}；查过：' + ' | '.join(str(c) for c in cands))


def _ref_id(ref):
    return ref['id'] if isinstance(ref, dict) else ref


# ---------------------------------------------------------------- 开镜头
def begin(sid: str, title: str | None = None, source: str | None = None, dark: bool = False, *,
          title_box=TITLE_BOX, title_size=74, title_at=0.0, title_anim='fade', title_color=None, title_cls=None,
          chapter_mark=True, source_at=0.0, onphoto=False, vig=None, motion=None) -> Shot:
    """开始写一个镜头：放右上章标、（可选）标题、（可选）左下出处。返回 Shot。
    dark=True 用深色纸；onphoto=True 角标和标题改浅色（满屏照片上用）；vig=0.3 减弱暗角（满屏照片）。"""
    global _CUR
    if sid in _SHOTS:
        raise RuntimeError(f'{sid} 已经 begin 过一次（每个镜头只能有一个脚本）')
    s = Shot(sid)
    s.dark, s.vig, s.motion = dark, vig, motion
    _SHOTS[sid] = s
    _CUR = s
    if chapter_mark:
        x, y, w, h = CHAPTER_BOX
        s.add('eyebrow', x, y, w, h, at=0, text=s.chapter, kicker=_kicker(s.chapter_no), anim='fade', fixed=True, z=70,
              cls='onphoto' if onphoto else None)
    if title:
        x, y, w, h = title_box
        s.add('title', x, y, w, h, at=title_at, text=title, size=title_size, anim=title_anim, dur=.45, z=20,
              color=title_color, cls=title_cls or ('onphoto' if onphoto else None), fixed=True if title_anim == 'none' else None)
    if source:
        x, y, w, h = SOURCE_BOX
        s.add('source', x, y, w, h, at=source_at, text=source, anim='fade', dur=.3, z=70, fixed=True if source_at == 0 else None,
              cls='onphoto' if onphoto else None)
    return s


# ---------------------------------------------------------------- 基础文字与卡片（沿用舞台已有类型，样式已换成档案纸）
def text(t, x=150, y=300, w=1620, h=None, size=44, at=0.0, kind='label', color=None, anim='up', dur=.4, z=20, cls=None, hideAt=None, **kw):
    """一段文字。kind：label / caption / smalllabel / bigquote。支持 ==荧光== **红字** \\n 换行。"""
    return _S().add(kind, x, y, w, h if h is not None else round(size * 1.5 * (t.count('\n') + 1)), at=at, text=t, size=size,
                    color=color, anim=anim, dur=dur, z=z, cls=cls, hideAt=hideAt, **kw)


def title(t, x=TITLE_BOX[0], y=TITLE_BOX[1], w=TITLE_BOX[2], h=TITLE_BOX[3], size=74, at=0.0, anim='fade', color=None, cls=None, **kw):
    """额外的大标题（begin 已经放过一个时一般不用）。特粗宋体。"""
    return _S().add('title', x, y, w, h, at=at, text=t, size=size, anim=anim, dur=.45, z=20, color=color, cls=cls, **kw)


def panel(t, body='', x=150, y=300, w=760, h=340, at=0.0, kind='', rot=0, tape=False, clip=False, anim='drop', dur=.5,
          kicker=None, hideAt=None, z=15, sfx=None, **kw):
    """档案卡：浅纸色、左边粗色边、浅投影。kind：''（绿边）/'red'/'navy'/'dark'/'plain'；tape=True 顶部胶带、tape=2 两角胶带；clip=True 回形针。
    anim 默认 'drop'（从上方落下略过头），也可 'up'/'fade'/'pop'。sfx='paper' 落定（at+0.25）配纸张声。"""
    if clip and tape == 2:
        tape = True                                     # 两角胶带的右角和回形针共用一个伪元素，同时要时改成顶部单条胶带
    cls = ' '.join(c for c in [kind, 'tape' if tape is True else 'tape2' if tape == 2 else '', 'clip' if clip else ''] if c)
    s = _S()
    e = s.add('panel', x, y, w, h, at=at, text=t, body=body, cls=cls or None, rot=rot or None, anim=anim, dur=dur,
              kicker=kicker, hideAt=hideAt, z=z, **kw)
    if sfx:                                             # 模板版：直接登记（USJ 镜头脚本里的 _card_sfx 不再需要，留着也不会重复）
        s.sound(sfx, at + .25, el=e)
    return e


def note(t, x=150, y=700, w=900, h=None, size=38, at=0.0, rot=-1, anim='drop', hideAt=None, z=22, sfx=None, **kw):
    """便签条：浅黄纸 + 左侧绿竖线。sfx='paper' 落定（at+0.25）配纸张声。"""
    s = _S()
    e = s.add('note2', x, y, w, h if h is not None else round(size * 1.45 * (t.count('\n') + 1) + 44), at=at, text=t, size=size,
              rot=rot, anim=anim, dur=.45, hideAt=hideAt, z=z, **kw)
    if sfx:
        s.sound(sfx, at + .25, el=e)
    return e


def metric(value, label, x=150, y=330, w=760, h=300, at=0.0, color=None, cls=None, anim='up', **kw):
    """静态大数字 + 说明（数字已经出现过、不该再滚时用；第一次出现用 counter）。"""
    return _S().add('metric', x, y, w, h, at=at, text=label, value=value, color=color or C['green'], cls=cls, anim=anim, dur=.4, **kw)


def statbar(label, value, y, maximum, at=0.0, color=None, shown=None, count=True, x=150, w=1620, label_w=420, track_w=900,
            static=False, grow=.65, grow_at=None, unit_suffix='', decimals=0, thick=54, value_color=None, sfx=None, **kw):
    """立体横条（有顶面和侧面）。count=True 时数值跟着条一起滚（第一次出现的数字）；static=True 直接显示终值（重复出现的数字）。
    shown 是最终显示的文字（如 '1600万'）；滚动时显示 数值+unit_suffix。
    grow_at：标签在 at 先出现（先摆好），条子到 grow_at 才长、数字才滚（念到那个数的时刻）。
    sfx='tick'：条子长满（grow_at 或 at，再加 grow 秒）那一刻登记落定声（总装配「叮-落定」）。"""
    css = f'--lw:{label_w}px;--tw:{track_w}px;--th:{thick}px'
    if shown and str(shown)[:1] in '−-' and 'prefix' not in kw:   # v7b 修：跌幅条滚动时也带负号（原来只有落定后才有「−」）
        kw['prefix'] = '−'
    s = _S()
    e = s.add('statbar', x, y, w, thick + 46, at=at, valueColor=value_color, text=label, pct=round(100 * value / maximum, 3), value=value,
              valueText=shown or str(value), fill=color or C['green'], count=(count and not static) or None,
              suffix=unit_suffix or None, decimals=decimals or None, staticBar=static or None, fixed=static or None,
              growDur=grow, growAt=grow_at, css=css, anim='fade', dur=.3, **kw)
    if sfx:
        s.sound(sfx, at if static else (grow_at if grow_at is not None else at) + grow, el=e)
    return e


def stamp(t, x, y, at, rot=-8, size=96, kind='bigstamp', sfx='stamp', z=60, hideAt=None, **kw):
    """盖章：红框印（kind='bigstamp'）或 2×2 方印（kind='seal'）。x,y 是中心点。
    砸入：160%、40% 不透明 → 0.15 秒落到 100%，落定抖 3px。落地时刻 = at+0.15，自动登记音效（sfx=None 不登记）。
    次数：每 10 分钟 3–5 枚，一章最多 1 枚。"""
    s = _S()
    e = s.add(kind, x, y, at=at, text=t, size=size, rot=rot, center=True, anim='stamp2', dur=.3, z=z, hideAt=hideAt, **kw)
    e['event'] = round(at + .15, 3)
    if sfx:
        s.sound(sfx, at + .15, el=e)
    return e


def pop(t, x, y, at, color='y', size=52, rot=-3, hideAt=None, z=50, sfx=None, **kw):
    """贴纸弹字（圆角粗描边小牌子）。color：w 白 / y 黄 / r 红 / k 黑。一屏 ≤ 2 个。sfx='pop' 出现 +0.05 秒配弹出声。"""
    s = _S()
    e = s.add('pop', x, y, at=at, text=t, size=size, rot=rot, center=True, cls={'w': 'pw', 'y': 'py', 'r': 'pr', 'k': 'pk'}[color],
              anim='bounce', dur=.45, z=z, hideAt=hideAt, **kw)
    if sfx:
        s.sound(sfx, at + .05, el=e)
    return e


# ---------------------------------------------------------------- fx.js 组件
def _fit_h(view, w, pad_x, pad_top, pad_bottom=None):
    pad_bottom = pad_top if pad_bottom is None else pad_bottom
    return round((w - 2 * pad_x) * view[3] / view[2] + pad_top + pad_bottom, 2)


def docpage(name, view=None, x=150, y=200, w=1000, h=None, at=0.0, rot=-1.0, pad=26, views=None, enter='drop', enter_dur=.55,
            tape=None, clip=False, fold=False, label=None, tilt=None, lift=None, sfx=None, hideAt=None, z=10, **kw):
    """原件纸页：白纸 + 投影 + 轻微倾斜（rot 度；tilt={'rx':4,'ry':-6} 加 3D 透视，但上面要叠放大镜/荧光笔时别用 tilt）。
    view = 原图取景 [x,y,w,h]（原图像素，默认整张）；views=[{'at':秒,'dur':1,'view':[…]}] 推近关键句。h 省略时按取景比例算。
    enter：drop 落下 / slide 右侧滑入 / fade / pop / none。sfx='paper' 落地配纸张声。"""
    uri, iw, ih = asset(name)
    view = view or [0, 0, iw, ih]
    if h is None:
        h = _fit_h(view, w, pad, pad)
    s = _S()
    e = s.add('docpage', x, y, w, h, at=at, src=uri, iw=iw, ih=ih, view=view, views=views, rot=rot or None, pad=pad, enter=enter,
              enterDur=enter_dur, tape=tape, clip=clip or None, fold=fold or None, label=label, tilt=tilt, lift=lift, hideAt=hideAt, z=z, **kw)
    if sfx:
        s.sound(sfx, at + enter_dur * .55, el=e)
    return e


def photocard(name, view=None, x=150, y=200, w=900, h=None, at=0.0, rot=-2.0, border=14, caption=None, style='photo', tv_label=None,
              tape=None, clip=False, enter='drop', enter_dur=.55, drop_y=-90, drop_rot=-6, views=None, lift=None, dim=None,
              sfx=None, hideAt=None, z=12, **kw):
    """照片卡：白边 + 投影 + 胶带（默认左上右上两条）+ 从上方落下；style='tv' 是深色电视框（新闻画面），'plain' 无边。
    view 裁掉电视台字幕条、台标角；caption 写在白边下方（自动加宽下边）。lift=[{'at':秒}] 讲到哪张哪张浮起；dim=[{'at':秒,'to':.4}] 压暗。
    多张叠放：多次调用，后调用的在上面（或给 z）。"""
    uri, iw, ih = asset(name)
    view = view or [0, 0, iw, ih]
    bottom = 64 if caption else (border + 26 if style == 'tv' and tv_label else border)
    if h is None:
        h = _fit_h(view, w, border, border, bottom)
    s = _S()
    e = s.add('photocard', x, y, w, h, at=at, src=uri, iw=iw, ih=ih, view=view, views=views, rot=rot or None, border=border,
              bottom=bottom, caption=caption, style=style, tvLabel=tv_label, tape=tape, clip=clip or None, enter=enter,
              enterDur=enter_dur, dropY=drop_y, dropRot=drop_rot, lift=lift, dim=dim, hideAt=hideAt, z=z, **kw)
    if sfx:
        s.sound(sfx, at + enter_dur * .55, el=e)
    return e


def _media_run(cmd, **kw):
    """所有抽帧/探测走同一重任务锁；75 只等待，不删锁。"""
    if not HEAVY_JOB.is_file():
        raise RuntimeError(f'缺重任务锁脚本：{HEAVY_JOB}')
    for _ in range(120):
        r = subprocess.run(HEAVY + [str(x) for x in cmd], **kw)
        if r.returncode == 75:
            print('[memory guard] 抽帧等待重任务锁，30 秒后重试', flush=True)
            time.sleep(30)
            continue
        r.check_returncode()
        return r
    raise RuntimeError('抽帧等待重任务锁超时，请稍后重试')


def _ffmpeg():
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def _find_video(name: str) -> Path:
    """按名字找视频：项目.json「视频目录」逐个找（默认 素材 → 素材/生成）→ 绝对路径。不可读（SSD 未挂载）直接报错。"""
    p = Path(name)
    cands = [p] if p.is_absolute() else [d / name for d in VIDEO_DIRS]
    for c in cands:
        if c.exists() or c.is_symlink():
            r = c.resolve()
            if not r.exists() or not os.access(r, os.R_OK):
                raise PermissionError(f'视频不可读（SSD 未挂载？）：{c} → {r}')
            return r
    raise FileNotFoundError(f'找不到视频 {name}；查过：' + ' | '.join(str(c) for c in cands))


def _probe(src: Path) -> dict:
    """ffmpeg -i 读时长、宽高、帧率（不依赖 ffprobe）。"""
    r = _media_run([_ffmpeg(), '-hide_banner', '-nostdin', '-i', str(src), '-map', '0:v:0', '-c', 'copy', '-f', 'null', '-'], capture_output=True, text=True)
    err = r.stderr
    m = re.search(r'Duration:\s*(\d+):(\d+):([\d.]+)', err)
    v = re.search(r'Stream #\S+.*?Video:.*?,\s*(\d{2,5})x(\d{2,5})[\s,\[]', err)
    f = re.search(r'([\d.]+)\s*fps', err)
    if not (m and v):
        raise RuntimeError(f'读不出视频信息：{src}\n{err[-600:]}')
    counts = re.findall(r'frame=\s*(\d+)', err)
    return dict(n=int(counts[-1]) if counts else None, dur=int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3]), w=int(v[1]), h=int(v[2]), fps=float(f[1]) if f else None)


_SRC_SHA: dict = {}


def _src_sha(src: Path) -> str:
    """源视频哈希：同一进程内记住；跨进程按 路径+大小+修改时间 记在 素材/序列/.源哈希.json（长视频不必每次重算）。"""
    st = src.stat()
    k = f'{src}|{st.st_size}|{st.st_mtime_ns}'
    if k in _SRC_SHA:
        return _SRC_SHA[k]
    memo_p = SEQ_DIR / '.源哈希.json'
    try:
        memo = json.loads(memo_p.read_text())
    except Exception:
        memo = {}
    if k not in memo:
        memo[k] = _sha256(src)
        SEQ_DIR.mkdir(parents=True, exist_ok=True)
        memo_p.write_text(json.dumps(memo, ensure_ascii=False, indent=1))
    _SRC_SHA[k] = memo[k]
    return memo[k]


def _sha256(path: Path) -> str:
    import hashlib
    h = hashlib.sha256()
    with open(path, 'rb') as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def vseq(name, t_in=0.0, t_out=None, max_w=1280, quiet=False) -> dict:
    """把视频的 [t_in, t_out) 抽成 30fps JPG 序列，缓存在 素材/序列/<文件名>-<源文件哈希12位>-<in>-<out>-<宽>w/。
    已有且每帧哈希对得上就直接复用（秒级）；源文件变了哈希就变、目录名跟着变。返回 dict(dir, frames[Path], n, w, h, fps, src, sha256)。
    ffmpeg 抽帧走 mac-heavy-job；宽度超过 max_w 才缩小（lanczos）。"""
    import shutil
    src = _find_video(name)
    info = _probe(src)
    t_out = info['dur'] if t_out is None else min(float(t_out), info['dur'])
    t_in = max(0.0, float(t_in))
    if t_out - t_in < 1 / FPS:
        raise ValueError(f'{name}：in={t_in} out={t_out} 太短')
    sha = _src_sha(src)
    ow = min(info['w'], max_w)
    ow -= ow % 2
    d = SEQ_DIR / f'{src.stem}-{sha[:12]}-{t_in:.3f}-{t_out:.3f}-{ow}w'
    meta_p = d / 'seq.json'
    if meta_p.exists():
        try:
            meta = json.loads(meta_p.read_text())
            frames = [d / f['name'] for f in meta['frames']]
            if meta['source_sha256'] == sha and all(fp.exists() and _sha256(fp) == f['sha256'] for fp, f in zip(frames, meta['frames'])):
                return dict(dir=d, frames=frames, n=len(frames), w=meta['w'], h=meta['h'], fps=meta['fps'], src=src, sha256=sha)
        except Exception as ex:                                     # 坏缓存：重抽
            print(f'[vseq] 缓存不完整，重抽：{d.name}（{ex}）')
    n_want = round((t_out - t_in) * FPS)
    tmp = SEQ_DIR / f'.tmp-{d.name}-{os.getpid()}'
    if tmp.exists():
        shutil.rmtree(tmp)
    tmp.mkdir(parents=True)
    vf = f'fps={FPS}' + (f',scale={ow}:-2:flags=lanczos' if ow < info['w'] else '') + ',format=yuvj420p'
    cmd = [_ffmpeg(), '-nostdin', '-y', '-v', 'error', '-ss', f'{t_in:.3f}', '-i', str(src), '-t', f'{t_out - t_in:.3f}', '-an', '-sn',
           '-vf', vf, '-fps_mode', 'passthrough', '-frames:v', str(n_want), '-q:v', '2', '-threads', '2', '-start_number', '0',
           str(tmp / 'f%05d.jpg')]
    _media_run(cmd)
    names = sorted(x.name for x in tmp.glob('f*.jpg'))
    if not names:
        raise RuntimeError(f'{name} 抽帧失败（0 帧）')
    w, h = Image.open(tmp / names[0]).size
    meta = dict(source=str(src), source_sha256=sha, t_in=t_in, t_out=t_out, fps=FPS, w=w, h=h, n=len(names),
                source_info=info, ffmpeg=Path(cmd[0]).name, vf=vf,
                frames=[dict(name=nm, sha256=_sha256(tmp / nm)) for nm in names])
    (tmp / 'seq.json').write_text(json.dumps(meta, ensure_ascii=False, indent=1))
    if d.exists():                                                 # 只会是本函数以前生成的坏缓存
        shutil.rmtree(d)
    tmp.rename(d)
    if not quiet:
        print(f'[vseq] 抽帧 {src.name} {t_in:.2f}–{t_out:.2f}s → {len(names)} 帧 {w}×{h}（{d.name}）' +
              (f'；少于预期 {n_want} 帧' if len(names) < n_want else ''))
    return dict(dir=d, frames=[d / nm for nm in names], n=len(names), w=w, h=h, fps=FPS, src=src, sha256=sha)


def _is_generated(src: Path) -> bool:
    return '生成' in src.parts or src.name.startswith(('AI-', '生成-'))


def videocard(name, view=None, x=150, y=200, w=900, h=None, at=0.0, t_in=0.0, t_out=None, play_at=None, speed=1.0, reverse=False,
              badge='auto', rot=-2.0, border=14, caption=None, style='photo', tv_label=None, scan=None, tape=None, clip=False,
              enter='drop', enter_dur=.55, drop_y=-90, drop_rot=-6, views=None, lift=None, dim=None, max_w=1280,
              sfx=None, hideAt=None, z=12, **kw):
    """视频卡：相片卡里放一段短视频（Seedance 寓意小动画 864×496 / 必要时的新闻实拍片段）。外观同 photocard
    （白边、投影、左上右上胶带、轻倾斜、落下入场；style='tv' 电视框 + tv_label，默认带扫描线）。
    t_in/t_out = 取原片哪一段（秒）；先抽成 30fps JPG 序列（vseq，缓存），舞台按 floor((t−play_at)×30×speed) 逐帧换图并等解码。
    play_at：开始播放的镜头内秒数（默认 = at，卡片一出现就播）；speed：0.5 慢放 / 2 快放；reverse=True 倒放。
    不循环：播完停在最后一帧。badge='auto'（默认）→ 不标（2026-10-09 用户要求去掉「AI 示意」）；要标就写具体的字，如 badge='AI 示意'。
    返回元素 dict，额外字段 playEnd = 播完的镜头内秒数（排后续动作用）。"""
    q = vseq(name, t_in, t_out, max_w=max_w)
    iw, ih = q['w'], q['h']
    view = view or [0, 0, iw, ih]
    if badge == 'auto':
        badge = None  # 2026-10-09 用户：Seedance 片段不再自动标「AI 示意」
    bottom = 64 if caption else (border + 26 if style == 'tv' and tv_label else border)
    if h is None:
        h = _fit_h(view, w, border, border, bottom)
    if speed <= 0:
        raise ValueError('speed 必须 > 0')
    frames = [f.as_uri() for f in q['frames']]
    pa = at if play_at is None else play_at
    s = _S()
    e = s.add('videocard', x, y, w, h, at=at, src=frames[0], frames=frames, fps=q['fps'], iw=iw, ih=ih, view=view, views=views,
              playAt=round(pa, 3) if play_at is not None else None, speed=speed if speed != 1 else None, reverse=reverse or None,
              badge=badge or None, scan=scan, rot=rot or None, border=border, bottom=bottom, caption=caption, style=style,
              tvLabel=tv_label, tape=tape, clip=clip or None, enter=enter, enterDur=enter_dur, dropY=drop_y, dropRot=drop_rot,
              lift=lift, dim=dim, hideAt=hideAt, z=z, **kw)
    e['playEnd'] = round(pa + q['n'] / (q['fps'] * speed), 3)
    if sfx:
        s.sound(sfx, at + enter_dur * .55, el=e)
    return e


def parallax(name, view=None, x=0, y=0, w=1920, h=1008, at=0.0, amp=.024, dir=(1, -.35), zoom=(1.0, 1.03), inset=.06, blur=26,
             frame=None, fg=None, deco='bokeh', start=None, end=None, enter='fade', enter_dur=.5, hideAt=None, z=5, **kw):
    """2–3 层视差：同图模糊放大底层（动得最少）+ 主体层（inset 内缩成浮起的照片，0 = 满框）+ 前景（fg 抠图或 deco 光斑，动得最多）。
    amp = 总位移占框宽比例，≤0.03（库里会截到 0.03）；一次性从 start 漂到 end（默认整个镜头），不循环。持续运动 → 整段逐帧截。
    fg={'name':'xx-抠图.png','x':..,'y':..,'w':..,'h':..,'depth':1.7}（框内坐标）。"""
    uri, iw, ih = asset(name)
    view = view or [0, 0, iw, ih]
    if amp > .03:
        print(f'[提示] parallax amp={amp} 超过 0.03，按 0.03')
        amp = .03
    fgs = None
    if fg:
        fu, fw, fh = asset(fg['name'])
        fgs = dict(src=fu, iw=fw, ih=fh, x=fg.get('x', 0), y=fg.get('y', 0), w=fg.get('w', fw), h=fg.get('h', fh), depth=fg.get('depth', 1.7))
    return _S().add('parallax', x, y, w, h, at=at, src=uri, iw=iw, ih=ih, view=view, amp=amp, dir=list(dir), zoom=list(zoom),
                    inset=inset, blur=blur, frame=frame, fg=fgs, deco=deco, start=start, end=end, enter=enter, enterDur=enter_dur,
                    motion='continuous', hideAt=hideAt, z=z, **kw)


def fullbleed(name, view=None, at=0.0, amp=.014, dir=(1, -.3), zoom=(1.0, 1.025), scrim_h=260, vig=.3, z=3, **kw):
    """满屏照片 / 新闻画面：视差主体层铺满（inset=0、无白边、无光斑），顶部加压暗渐变保证标题可读，并把本镜头暗角降到 vig（默认 0.3）。
    配合 begin(…, onphoto=True) 使用（角标、标题改浅色）。每屏 2–3 秒、连用 3–4 镜就回纸面。"""
    s = _S()
    s.vig = vig
    e = parallax(name, view=view, x=0, y=0, w=W, h=H, at=at, amp=amp, dir=dir, zoom=zoom, inset=0, frame=0, deco='none', z=z, **kw)
    if scrim_h:
        s.add('scrim', 0, 0, W, scrim_h, at=at, anim='fade', dur=.3, z=z + 1)
    return e


def flash(name, at, view=None, dur=.35, sfx='shutter', z=80, **kw):
    """极短插镜（2026-11-06，手法库卡 11）：一张图硬切满屏 dur 秒（0.2–0.6）后硬切回来，盖住纸面和角标；字幕、底部导航在总装里，不受影响。
    用法：强段里「讲到一个具体东西」时闪一下，之后停 2 秒以上不加新动作，让观众看清留下的画面（检查报告会查）。
    连闪几张：at 间隔 ≤ 0.6 秒，只查最后一张后面的停留。不改引擎，用 parallax 满框（amp=0）实现。"""
    raise RuntimeError('flash 极短插镜已停用（2026-11-07 用户审片：图片不许一闪而过；图片 ≥2 秒、带字 ≥3.5 秒）。用 fullbleed / photocard 正常停留')
    s = _S()
    e = parallax(name, view=view, x=0, y=0, w=W, h=H, at=at, amp=0, zoom=(1.0, 1.0), inset=0, frame=0, deco='none', enter='none', enter_dur=.01,
                 hideAt=round(at + dur, 3), hideDur=.01, z=z, flash=True, **kw)
    if sfx:
        s.sound(sfx, at, el=e)
    return e


def lens(ref, target, at, ja=None, zh=None, note=None, card=None, shape='bar', zoom=2.0, r=150, pad=(30, 22), travel=.7, sweep=0,
         dim=.28, lensOutAt=None, hideAt=None, from_=None, lift=None, cardAt=None, box=True, sfx=None, z=45, **kw):
    """放大镜 + 引线 + 中文译文卡。ref = docpage/photocard/evidence 元素（或其 id）；target = 要放大的那句在原图里的矩形 [x,y,w,h]。
    镜片里是它压着的那块原件 × zoom（相对原件当前显示倍率）。shape='bar' 长条读句镜（整句），'circle' 圆镜（可 sweep 秒从句首扫到句尾）。
    译文卡：ja 日文原句（小字在上）、zh 中文（大字在下，≥44px）、note 出处小字；card={'x','y','w'} 位置（默认在目标下方）。
    时间：at 镜子出现 → +travel 到位 → (+sweep) → 卡片 cardAt（默认到位后 0.15 秒）；lensOutAt 镜子先撤（卡片留下）；hideAt 全部退场。
    放大镜出现期间别让 ref 推近（views），引线不会跟着重算得那么漂亮。"""
    s = _S()
    e = s.add('lens', 0, 0, W, H, at=at, ref=_ref_id(ref), target=list(target), ja=ja, zh=zh, note=note, card=card, shape=shape,
              zoom=zoom, r=r, pad=list(pad), travel=travel, sweep=sweep or None, dim=dim, lensOutAt=lensOutAt, hideAt=hideAt,
              **{'from': list(from_) if from_ else None}, lift=list(lift) if lift else None, cardAt=cardAt, box=None if box else False, z=z, **kw)
    if sfx:
        s.sound(sfx, at + travel, el=e)
    return e


def highlighter(ref=None, target=None, at=0.0, targets=None, rect=None, rects=None, dur=.45, gap=.08, color='#f2d84a', alpha=.62,
                pad=(6, 4), sfx=None, hideAt=None, z=30, **kw):
    """荧光笔从左往右划过。ref+target（原图像素）跟着原件走；或 rect=[x,y,w,h] 画布像素。多行：targets=[…] / rects=[…]，逐行划。"""
    s = _S()
    e = s.add('highlighter', 0, 0, W, H, at=at, ref=_ref_id(ref) if ref is not None else None, target=list(target) if target else None,
              targets=targets, rect=list(rect) if rect else None, rects=rects, dur=dur, gap=gap, color=color, alpha=alpha, pad=list(pad),
              hideAt=hideAt, z=z, **kw)
    if sfx:
        s.sound(sfx, at, el=e)
    return e


def circle(ref=None, target=None, at=0.0, rect=None, shape='ellipse', dur=.6, color=C['pen'], width=5, pad=14, loops=1.12, seed=None,
           strokes=1, sfx=None, hideAt=None, z=32, **kw):
    """红笔圈注：shape='ellipse' 手绘椭圆（略多绕一点）/ 'underline' 波浪下划线 / 'box' 手绘方框 / 'strike' 删除线（strokes=1 或 2）。目标同 highlighter。"""
    if shape not in ('ellipse', 'underline', 'box', 'strike') or not math.isfinite(dur) or dur <= 0 or strokes not in (1, 2):
        raise ValueError('circle：shape 无效、dur 必须 > 0、strokes 只能 1 或 2')
    s = _S()
    e = s.add('circle', 0, 0, W, H, at=at, ref=_ref_id(ref) if ref is not None else None, target=list(target) if target else None,
              rect=list(rect) if rect else None, shape=shape, dur=dur, color=color, width=width, pad=pad, loops=loops, seed=seed, strokes=strokes,
              hideAt=hideAt, z=z, **kw)
    if sfx:
        s.sound(sfx, at, el=e)
    return e


def counter(value, x, y, w=700, h=None, at=0.0, dur=.9, from_=0, decimals=0, group=False, prefix=None, suffix=None, unit=None,
            size=140, color=None, font=None, align='left', label=None, static=False, sfx=None, hideAt=None, z=25, **kw):
    """数字滚动（机械计数器逐位滚），在 at+dur 落定并轻轻一顿。只给第一次出现的数字用；重复出现的数字 static=True 直接显示。
    例：counter(1270, 1180, 300, unit='万', label='2014年度入园人数', at=T(243))。prefix='+' 之类放数字前；unit 小一号放后面。"""
    s = _S()
    if not from_ and not static and abs(value) >= 10:      # v7b：滚动从同位数的最小值起（原来从 0 滚，高位露出「063」「0,813」这种前导 0）
        from_ = 10 ** (len(str(int(abs(value)))) - 1)
    hh = h if h is not None else round(size * 1.15 + (50 if label else 0))
    e = s.add('counter', x, y, w, hh, at=at, value=value, **{'from': from_ or None}, decimals=decimals or None, group=group or None,
              prefix=prefix, suffix=suffix, unit=unit, dur=dur, size=size, color=color, font=font, align=align, label=label,
              static=static or None, hideAt=hideAt, z=z, **kw)
    e['event'] = round(at + (0 if static else dur), 3)
    if sfx:
        s.sound(sfx, e['event'], el=e)
    return e


def focuslines(cx, cy, at, hold=1.0, rx=300, ry=190, n=110, color=C['ink'], alpha=.85, fps=12, wmin=2, wmax=8, exit=.3,
               clip=(0, 180, W, 700), feather=50, sfx=None, z=18, **kw):
    """漫画集中线：从四周射向 (cx,cy)，中间椭圆 rx×ry 留空给主体；0.2 秒收拢，停 hold 秒，exit 秒淡出；12fps 抖动。
    照片上用 color='#ffffff'。全片 ≤5 次（每 10 分钟约 4 次），只给正面高点。
    默认 z=18：压在照片（z 5–12）上面、标题（20）和数字（25）下面；clip 默认 y 180–880（让开标题和出处，上下羽化），
    clip=None 铺满整幅（无标题的满屏照片镜头用）。"""
    s = _S()
    e = s.add('focuslines', 0, 0, W, H, at=at, cx=cx, cy=cy, rx=rx, ry=ry, n=n, color=color, alpha=alpha, fps=fps, wmin=wmin,
              wmax=wmax, hold=hold, exit=exit, clip=list(clip) if clip else None, feather=feather, z=z, **kw)
    if sfx:
        s.sound(sfx, at, el=e)
    return e


def speedlines(x=0, y=0, w=W, h=H, at=0.0, dur=None, angle=0, n=36, speed=1800, length=(140, 460), thick=(2, 6), color=C['ink'],
               alpha=.45, reverseAt=None, reverseDur=.7, fade=.2, sfx=None, z=8, **kw):
    """速度线：平行细线持续流过（angle=运动方向，度，0 = 向右）；reverseAt 平滑减速、停住、反向（S30 倒着开）。
    持续运动 → 整段逐帧截。全片 ≤3 次。"""
    s = _S()
    e = s.add('speedlines', x, y, w, h, at=at, dur=dur, angle=angle, n=n, speed=speed, len=list(length), thick=list(thick),
              color=color, alpha=alpha, reverseAt=reverseAt, reverseDur=reverseDur, fade=fade, z=z, **kw)
    if sfx:
        s.sound(sfx, at, el=e)
    return e


def onoma(t, x, y, at, size=150, font='Hannotate SC', color='#FFE15A', stroke=C['ink'], stroke_w=12, depth=7, rot=-8,
          stagger=.06, hold=.9, exit=.25, shake=None, sfx=None, z=55, **kw):
    """拟声字：描边 + 立体厚度，逐字弹出、衰减抖动，停 hold 秒后放大淡出。只做装饰，不承载数字或事实；全片 ≤4 次。
    字体可选 'Hannotate SC'（手札体）/ 'Yuanti SC'（圆体）/ 'HanziPen SC'（钢笔）/ 'Xingkai SC'（行楷）。"""
    s = _S()
    e = s.add('onoma', x, y, 0, 0, at=at, text=t, size=size, font=font, color=color, stroke=stroke, strokeW=stroke_w, depth=depth,
              rot=rot, stagger=stagger, hold=hold, exit=exit, shake=shake, z=z, **kw)
    if sfx:
        s.sound(sfx, at, el=e)
    return e


def particles(kind='dust', n=60, at=0.0, alpha=.22, x=0, y=0, w=W, h=H, color=None, speed=1.0, size=1.0, z=7, hideAt=None, **kw):
    """极淡环境层：dust 纸屑 / sparkle 光点闪烁 / confetti 彩纸飘落。持续运动 → 整段逐帧截（较慢），可省就省。"""
    return _S().add('particles', x, y, w, h, at=at, kind=kind, n=n, alpha=alpha, color=color, speed=speed, size=size,
                    motion='continuous', z=z, hideAt=hideAt, **kw)


def maphl(regions, ref=None, at=0.0, z=28, hideAt=None, **kw):
    """地图逐区高亮。regions=[{'pts':[[x,y],…], 'at':秒, 'dur':.5, 'fill':'#ad4d38', 'fillAlpha':.26, 'hatch':True,
    'dash':True, 'label':'约6万㎡', 'lx':..,'ly':.., 'labelAt':秒}]。ref 给出时 pts 用该原图像素；否则画布像素。
    地图只用线稿/示意，角上注明「示意」。"""
    regs = []
    for r in regions:
        r = dict(r)
        r['pts'] = [list(p) for p in r['pts']]
        regs.append(r)
    return _S().add('maphl', 0, 0, W, H, at=at, regions=regs, ref=_ref_id(ref) if ref is not None else None, z=z, hideAt=hideAt, **kw)


def arrow(pts, at, dur=.5, color='#ad4d38', width=6, head=24, wobble=2.5, dash=False, seed=None, z=33, hideAt=None, sfx=None, **kw):
    """手绘箭头：沿 pts（画布像素，≥2 点，平滑曲线穿过）描出，末端箭头最后长出。"""
    s = _S()
    e = s.add('arrow', 0, 0, W, H, at=at, pts=[list(p) for p in pts], dur=dur, color=color, width=width, head=head, wobble=wobble,
              dash=dash or None, seed=seed, z=z, hideAt=hideAt, **kw)
    if sfx:
        s.sound(sfx, at, el=e)
    return e


def quotecard(text_=None, x=150, y=560, w=1000, at=0.0, segs=None, ja=None, who=None, cps=9, size=56, style='paper', rot=-1,
              tape=True, align='left', type_at=None, enter='drop', hideAt=None, sfx=None, z=26, over=None, gap=14, **kw):
    """金句 / 引语打字卡：卡片落下，文字逐字出现（cps 字/秒）。分段卡在旁白念到的时刻：segs=[{'text':'这家公司，','at':T(113)}, …]。
    ja 日文原文小字（有原文才放）；who 出处行。style：paper / note / dark。每 10 分钟 2–3 张。"""
    s = _S()
    if not math.isfinite(cps) or cps <= 0:
        raise ValueError('quotecard：cps 必须是正数')
    if segs:
        segs = [dict(g, at=round(g['at'], 3)) for g in segs]
        for g in segs:
            n = len(re.sub(r'==|\*\*|\n', '', g['text']))
            if n == 0 or not math.isfinite(g['at']) or g['at'] < at or not math.isfinite(g.get('cps', cps)) or g.get('cps', cps) <= 0:
                raise ValueError('quotecard：段文字不能为空，字速须 >0，段开始不能早于卡出现')
            if g.get('end') is not None:
                if not math.isfinite(g['end']) or g['end'] <= g['at']:
                    raise ValueError('quotecard：end 必须晚于 at')
                g['cps'] = max(1, n - 1) / (g['end'] - g['at'])
            if g.get('times') is not None and (len(g['times']) != n or any(not math.isfinite(t) or t < g['at'] for t in g['times']) or g['times'] != sorted(g['times'])):
                raise ValueError('quotecard：times 必须逐字对应且递增')
    hh = None
    if over is not None:
        ref = over if isinstance(over, dict) else next((e for e in s.elements if e['id'] == over), None)
        if not ref or ref['type'] not in ('videocard', 'photocard'):
            raise ValueError('quotecard(over=)：需要本镜头 videocard 或 photocard 元素')
        x, y, w = ref['x'], ref['y'] + ref['h'] + gap, ref['w']
        content = ''.join(g['text'] for g in segs) if segs else text_ or ''
        if not content or '\n' in content or _text_w(content, size) > w - 48 or any(txt and ('\n' in txt or _text_w(txt, sz) > w - 48) for txt, sz in [(ja, 26), (who, 24)]):
            raise ValueError('视频引语必须一行放得下：缩短文字、减 size 或加宽视频卡')
        hh = math.ceil(size * 1.36 + 40 + (39 if ja else 0) + (38 if who else 0))
        if x < SAFE['x0'] or x + w > SAFE['x1'] or y + hh > SAFE['y1']:
            raise ValueError(f'视频引语越过安全区：x={x}、y={y}、下沿={y + hh}；请缩小或上移视频卡')
        rot, tape, enter = 0, False, 'fade'
    e = s.add('quotecard', x, y, w, hh, at=at, text=text_, segs=segs, ja=ja, who=who, cps=cps, size=size, style=style, rot=rot or None,
              tape=None if tape else False, align=align, typeAt=type_at, enter=enter, hideAt=hideAt, z=z, over=_ref_id(over) if over is not None else None, **kw)
    if sfx:
        s.sound(sfx, at, el=e)
    return e



def chaptercard(no, name, keywords=None, at=0, sfx='paper', *, hold=None, stagger=.35, hideAt=None, z=65):
    """档案纸关键词章卡；hold=2.8 用于开头，None 留到镜头末尾。keywords 省略从项目「章卡」按镜头号读。"""
    s = _S()
    words = keywords if keywords is not None else (P.get('章卡') or {}).get(s.id)
    if not isinstance(words, (list, tuple)) or len(words) not in (3, 4) or any(not isinstance(k, str) or not k.strip() or len(k) > 8 for k in words):
        raise ValueError(f'{s.id} chaptercard：需要 3–4 个非空关键词，每个 ≤8 字（可写项目.json「章卡」）')
    if not str(name).strip() or len(str(name)) > 16 or not math.isfinite(stagger) or stagger < .3:
        raise ValueError('chaptercard：章名 1–16 字、stagger ≥0.3 秒')
    end = hideAt if hideAt is not None else at + hold if hold is not None else None
    reveal = at + (len(words) - 1) * stagger + .5
    if at < 0 or reveal + .3 > (end if end is not None else s.dur) or (end is not None and end > s.dur):
        raise ValueError('chaptercard：镜头/hold 太短，关键词和章名没有显示完整')
    e = s.add('chaptercard', 150, 150, 1620, 650, at=at, no=str(no), name=str(name), keywords=list(words),
              stagger=stagger, titleAt=reveal, hideAt=end, z=z)
    if sfx:
        for i in range(len(words)):
            s.sound(sfx, at + i * stagger + .25, el=e)
    return e


def recapwall(shots, conclusion, focus=None, at=0, *, count=32, zoom=2.4, zoom_dur=2.4, focus_at=None,
              step=.9, line_dur=.5, sfx='marker', zoom_sfx=None, hideAt=None, z=18):
    """已渲染镜头抽帧铺墙。shots=[('S01',1),…]；focus 是输入列表的 0 起下标（4–6 个），不是墙上重复卡号。"""
    s = _S()
    pairs = list(shots)
    chosen = list(range(min(6, len(pairs)))) if focus is None else list(focus)
    if not pairs or type(count) is not int or not 20 <= count <= 40 or len(pairs) > count:
        raise ValueError('recapwall：需要 1–count 个来源，count 为 20–40')
    if not 4 <= len(chosen) <= 6 or len(set(chosen)) != len(chosen) or any(type(i) is not int or not 0 <= i < len(pairs) for i in chosen):
        raise ValueError('recapwall：focus 需要 4–6 个不同的输入列表下标（从 0 起）')
    if not conclusion or len(conclusion) > 28 or '\n' in conclusion or not 1 <= zoom <= 4 or zoom_dur <= 0 or line_dur <= 0 or step < line_dur + .25:
        raise ValueError('recapwall：结论一行 ≤28 字，zoom 1–4、动作时长 >0、step ≥line_dur+0.25')
    fa = at + zoom_dur + .25 if focus_at is None else focus_at
    end = hideAt if hideAt is not None else s.dur
    if at < 0 or fa < at + zoom_dur or fa + (len(chosen) - 1) * step + .25 + line_dur + .4 > end:
        raise ValueError('recapwall：镜头太短，或 focus_at 早于拉远完成')
    images = []
    for sid, sec in pairs:
        if sid == s.id:
            raise ValueError('recapwall：不能从自身镜头抽帧，请先渲染来源镜头')
        try:
            mp = latest_mp4(sid)
        except FileNotFoundError as ex:
            raise FileNotFoundError(f'recapwall 来源镜头 {sid} 缺 mp4；请先 render(["{sid}"])；目录：{CACHE_DIR}') from ex
        tag = f'{sid}-{_src_sha(mp)[:12]}'
        dest = V6 / '素材' / '回顾墙'
        paths = grab(sid, [sec], out_dir=dest, prefix=tag)
        images.append(paths[0].resolve().as_uri())
    # 在重复墙上分散选中卡，避免只高亮左上角一小片。
    tiles = []
    for j, i in enumerate(chosen):
        candidates = list(range(i, count, len(images)))
        target = (j + .5) * count / len(chosen)
        tiles.append(min(candidates, key=lambda k: abs(k - target)))
    events = [dict(tile=k, at=round(fa + j * step, 3)) for j, k in enumerate(tiles)]
    e = s.add('recapwall', 150, 185, 1620, 675, at=at, images=images, count=count, focus=events,
              conclusion=conclusion, zoom=zoom, zoomDur=zoom_dur, lineDur=line_dur, hideAt=hideAt, z=z)
    if zoom_sfx:
        s.sound(zoom_sfx, at, el=e)
    if sfx:
        for f in events:
            s.sound(sfx, f['at'] + .25, el=e)
    return e


def rankboard(rows, x=150, y=260, w=1400, at=0.0, row_h=88, stagger=.3, focus=None, bars=True, maximum=None, bar_color=None,
              value_w=230, hideAt=None, z=20, **kw):
    """排行榜：逐行出现（先灰），focus=[{'at':秒,'row':下标}] 点名那行变墨色 + 荧光底，其余压淡。
    rows=[{'rank':1,'name':'佛州魔法王国','value':1784,'valueText':'1784万','note':'美国','at':可选}]。"""
    return _S().add('rankboard', x, y, w, row_h * len(rows), at=at, rows=rows, rowH=row_h, stagger=stagger, focus=focus,
                    bars=None if bars else False, max=maximum, barColor=bar_color, valueW=value_w, hideAt=hideAt, z=z, **kw)


def timeline(points, x=200, y=620, w=1400, at=0.0, axis_dur=.6, dim_prev=True, cursor=False, ticks=0,
             photo_w=440, photo_h=280, photo_gap=70, hideAt=None, z=20, sfx=None, **kw):
    """时间线：轴线从左描出，节点逐个弹出（年份在下、说明在上），新节点出现时旧节点变灰。
    points=[{'label':'2014','text':'哈利波特园区开业','at':秒,'pos':0–1 可省,'color':'#B03A33','side':'up'|'down',
             'photo':'素材名.jpg'(可省),'photo_cap':'照片下小字'(可省)}]。y 是轴线高度。
    2026-10-23 加：cursor=True 红色游标从上一个点滑到当前点；ticks=40 轴上刻度（每 5 格一长）；
    点带 photo 时，照片卡在轴上方跟着游标走，换点时旧卡淡出、新卡落下（带 photo 的点说明文字自动放到轴下）。
    sfx='tick' 每个点出现配一声。"""
    pts = []
    for pt in points:
        pt = dict(pt)
        if pt.get('photo'):
            pt['photo'] = asset(pt['photo'])[0]
            pt.setdefault('side', 'down')
            if 'photo_cap' in pt:
                pt['photoCap'] = pt.pop('photo_cap')
        pts.append(pt)
    has_ph = any(p_.get('photo') for p_ in pts)
    if has_ph and y - photo_h - photo_gap - 24 < 150:
        print(f'[提示] timeline：照片卡上沿 y≈{y - photo_h - photo_gap - 24:.0f}，会压到标题区；把轴线 y 下移或减小 photo_h')
    e = _S().add('timeline', x, y, w, 10, at=at, points=pts, axisDur=axis_dur, dimPrev=None if dim_prev else False,
                 cursor=True if cursor else None, ticks=ticks or None,
                 photoW=photo_w if has_ph else None, photoH=photo_h if has_ph else None, photoGap=photo_gap if has_ph else None,
                 hideAt=hideAt, z=z, **kw)
    if sfx:
        for p_ in pts:
            _S().sound(sfx, p_['at'], el=e)
    return e


def pill(text, x, y, at=0.0, tone='neutral', size=28, solid=False, dot=True, dur=.4,
         w=620, h=64, hideAt=None, z=22, sfx=None, **kw):
    """圆角胶囊标签：挂年份、增量、概率。tone='up'(绿,正向)|'down'(红,负向)|'warn'(黄)|'neutral'(灰)。
    例：pill('+450亿 · 比上一年', 1180, 430, at=3.2, tone='up')
        pill('1945 · 收归国有', 300, 700, at=1.0)
        pill('更可能', 900, 500, at=5.0, tone='warn')"""
    e = _S().add('pill', x, y, w, h, at=at, text=text, tone=tone, size=size,
                 solid=None if not solid else True, dot=None if dot else False,
                 dur=dur, hideAt=hideAt, z=z, sfx=sfx, **kw)
    if sfx:                                            # sfx: 每个动作一个
        _S().sound(sfx, at, el=e)
    return e


def linechart(points, x=260, y=250, w=1400, h=560, at=0.0, dur=2.2, y_max=None, y_min=None,
              curve=None, peak=True, area=False, cap=None, grid=3, val_fmt=None, y_fmt=None,
              val_size=44, peak_size=92, hideAt=None, z=20, sfx=None, **kw):
    """趋势折线：线自己画出来，**线头一个墨点跟着走**，末点标红、数字滚上去。
    points=[{'label':'1999','value':281,'text':'281万'(可省)}, ...]
    curve='straight' 走直线段，默认平滑（d3 curveMonotoneX，不会过冲）。
    最后一句旁白讲最后一个数时用：配 `sfx='tick-滚动'`，落定处再 `sound('叮-落定', …)`。"""
    e = _S().add('linechart', x, y, w, h, at=at, points=points, dur=dur, yMax=y_max, yMin=y_min,
                 curve=curve, peak=None if peak else False, area=None if not area else True,
                 cap=cap, grid=grid, valFmt=val_fmt, yFmt=y_fmt, valSize=val_size,
                 peakSize=peak_size, hideAt=hideAt, z=z, sfx=sfx, **kw)
    if sfx:
        _S().sound(sfx, at, el=e)
    return e


def forkpaths(branches, x=200, y=240, w=1560, h=560, at=0.0, stagger=.5, dur=.8,
              ox=70, end_pad=440, seed=None, hideAt=None, z=20, sfx=None, **kw):
    """分叉路径：一个点分出几条曲线通向不同结局，末端画 ❌/✓，中途挂概率胶囊。
    branches=[{'text':'走通了','note':'一句话说明','mark':'v'|'x'|None,
               'prob':'更可能','probTone':'warn','y':可省(默认均分)}]
    ❌/✓ 用 rough.js 手绘（seed 固定，逐帧不抖）。讲「几种结局」的那一屏用这个，别用文字列。"""
    e = _S().add('forkpaths', x, y, w, h, at=at, branches=branches, stagger=stagger, dur=dur,
                 ox=ox, endPad=end_pad, seed=seed, hideAt=hideAt, z=z, sfx=sfx, **kw)
    if sfx:
        for i, b in enumerate(branches):
            _S().sound(sfx, at + .25 + i * stagger, el=e)
            if b.get('mark'):
                _S().sound('tick', at + .25 + i * stagger + dur * .9, el=e)
    return e


def branchmap(head, items, x=200, y=240, w=1520, h=520, at=0.0, stagger=.35, dur=.5,
              head_size=104, hy=150, iy=None, hideAt=None, z=20, sfx=None, **kw):
    """分支发散：主体在上（常是一个大数字），向下连线到 N 个子项，逐条点亮。
    head={'text':'4,340亿','sub':'净投资组合 · 截至2025财年'}
    items=[{'text':'星展银行','note':'可省'}, ...]（3–5 个最好看）"""
    e = _S().add('branchmap', x, y, w, h, at=at, head=head, items=items, stagger=stagger,
                 dur=dur, headSize=head_size, hy=hy, iy=iy, hideAt=hideAt, z=z, sfx=sfx, **kw)
    if sfx:
        for i, _it in enumerate(items):
            _S().sound(sfx, at + .6 + i * stagger + dur * .8, el=e)
    return e


def iconrow(items, x=260, y=560, w=1400, h=200, at=0.0, stagger=.6, dim=.26, hot=True,
            icon_size=72, text_size=40, mono=True, hideAt=None, z=20, sfx=None, **kw):
    """一排图标 + 标签，**逐个点亮**（整排先压淡出现，再一个个升到满并变红），不是逐个淡入。
    items=[{'icon':'🚆'(可省),'text':'失业','at':可省}, ...]
    ⚠️ 彩色 emoji 跟格子纸的墨+纸单色体系打架，默认 mono=True 压成灰；
       要彩色就写 mono=False，但整屏只留这一处彩色。不放图标（只留词）往往更干净。
    参考做法：先让观众看见"有几样东西"，再逐个点名。"""
    e = _S().add('iconrow', x, y, w, h, at=at, items=items, stagger=stagger, dim=dim,
                 hot=None if hot else False, iconSize=icon_size, textSize=text_size,
                 mono=None if not mono else True, hideAt=hideAt, z=z, sfx=sfx, **kw)
    if sfx:
        for i, it in enumerate(items):
            _S().sound(sfx, it.get('at', at + .5 + i * stagger), el=e)
    return e


# ---------------------------------------------------------------- AI 片组件（2026-10-23）
def _nchars(t):
    return len(re.sub(r'==|\*\*|\n', '', t or ''))


def _ai_icon_names():
    """AI 线稿图标名单：直接从引擎 fx.js 的 ICONS 表里读（只有一份定义）。"""
    src = (Path(__file__).resolve().parent / '工程' / 'engine' / 'fx.js').read_text(encoding='utf-8')
    if 'const ICONS = FX.ICONS = {' not in src:          # 旧引擎快照（2026-10-23 之前建的期）没有图标库
        return {}
    blk = src[src.index('const ICONS = FX.ICONS = {'):]
    blk = blk[:blk.index('\n  };')]
    return dict(re.findall(r"^\s{4}(\w+):\s*\{\s*zh:\s*'([^']+)'", blk, re.M))


AI_ICONS = _ai_icon_names() if (Path(__file__).resolve().parent / '工程' / 'engine' / 'fx.js').exists() else {}


def aiicon(name, x, y, size=120, at=0.0, label=None, draw_dur=.7, rough=True, sw=5, hot_at=None, color=None,
           hideAt=None, z=20, sfx='marker', **kw):
    """AI 线稿图标：逐笔画出（一次加一个元素的线稿图解就靠它），hot_at 时刻变红「点亮」；label=True 用默认中文名。
    name 见 AI_ICONS：model 模型 / gpu 显卡 / chip 芯片 / data 数据 / agent 智能体 / tool 工具 / terminal 终端 / code 代码 /
    doc 文档 / chat 对话 / server 服务器 / cloud 云端 / user 用户 / lock 加密 / key 钥匙 / globe 网页 / gear 设置 /
    bolt 算力 / search 搜索 / memory 内存 / eye 视觉 / game 游戏 / book 论文 / phone 手机。
    图标之间连线用 arrow()，说明用 note()/pill()。rough=False 出干净直线。iconrow 的 icon 写 'ai:gpu' 也能用。"""
    if AI_ICONS and name not in AI_ICONS:
        raise ValueError(f'aiicon：没有图标 {name}；可用：{" ".join(AI_ICONS)}')
    if label is True:
        label = AI_ICONS.get(name, name)
    h = size + (size * .26 * 1.2 + 14 if label else 0)
    e = _S().add('aiicon', x, y, size, round(h, 1), at=at, name=name, label=label, drawDur=draw_dur,
                 rough=None if rough else False, sw=sw, hotAt=hot_at, color=color, hideAt=hideAt, z=z, **kw)
    if sfx:
        _S().sound(sfx, at, el=e)
    if hot_at is not None:
        _S().sound('pop', hot_at, el=e)
    return e


def specgrid(cols, rows, x=150, y=220, w=1400, at=0.0, row_h=76, label_w=260, stagger=.35, focus=None, size=34, cap=None,
             enter='drop', hideAt=None, z=20, sfx='paper', **kw):
    """参数对比卡：表头先出，每行从左滑入；focus 的格子变红 + 荧光笔一扫。只放同口径的数。
    cols=['', 'PS5', 'RX 6700']（第一个是行名那一列的表头，可空）
    rows=[{'label':'计算单元','vals':['36 CU','36 CU'],'note':'小字(可省)','at':可省}]
    focus=[{'row':0,'col':0,'at':Tw('36')}]（row、col 从 0 数，col 是 vals 的下标）。cap 左上小标题（写口径 / 出处）。"""
    nv = len(cols) - 1
    if nv < 1 or any(len(r['vals']) != nv for r in rows):
        raise ValueError('specgrid：每行 vals 个数要等于表头列数 - 1')
    if len(rows) > 8:
        raise ValueError('specgrid：一张最多 8 行')
    cw = (w - label_w - 48) / nv
    for r in rows:
        for v in r['vals']:
            if _text_w(v, size) > cw - 16:
                print(f'[提示] specgrid：「{v}」可能比一格（{cw:.0f}px）宽；减 size、减 label_w 或加宽')
    h = round(24 + row_h * (len(rows) + 1) + 18)
    e = _S().add('specgrid', x, y, w, h, at=at, cols=cols, rows=rows, rowH=row_h, labelW=label_w, stagger=stagger,
                 focus=focus, size=size, cap=cap, enter=enter, hideAt=hideAt, z=z, **kw)
    if sfx:
        _S().sound(sfx, at + .25, el=e)
    for f in focus or []:
        _S().sound('marker', f['at'], el=e)
    return e


def chatui(windows, x=150, y=150, w=1620, h=700, at=0.0, gap=28, badge=None, enter='drop', enter_dur=.5,
           type_cps=9, reply_cps=22, think=.9, hideAt=None, z=20, sfx=True, **kw):
    """仿真聊天界面：1–3 个窗口并排。用户消息先在输入框逐字打出、再发送进对话；AI 先显示「思考」三点，再逐字吐字。
    windows=[{'name':'Claude','accent':'#c96442','sub':'示意','hello':'今天想做点什么？','msgs':[
        {'role':'user','text':'帮我把这个游戏移植到 PC','at':T(5),'file':'GTA6.iso','cps':可省},
        {'role':'ai','text':'**您的账户已被封禁**','at':T(6),'style':'error','think':可省,'cps':可省},
        {'role':'sys','text':'已上传 1 个文件','at':…}]}]
    · user 的 at = 开始打字；打完停 0.25 秒自动发送。ai 的 at = 出现思考三点，think 秒后开始吐字。
    · 界面自己画，不贴真实产品截图；虚构的回复（玩笑）要一眼看得出，否则 badge='示意'。
    · sfx=True：打字配逐字打字声、发送配 click、回复出现配 pop；sfx=False 不配。"""
    s = _S()
    if not 1 <= len(windows) <= 3:
        raise ValueError('chatui：窗口 1–3 个')
    out, runs = [], []
    for W in windows:
        ms = []
        for m in W.get('msgs', []):
            m = dict(m)
            role, n, a = m.get('role', 'user'), _nchars(m.get('text')), float(m['at'])
            if role not in ('user', 'ai', 'sys') or n == 0:
                raise ValueError('chatui：role 只能 user/ai/sys，text 不能为空')
            if a < at:
                raise ValueError(f'chatui：消息「{m["text"][:8]}」早于窗口出现')
            if role == 'user':
                cps = m.pop('cps', type_cps)
                t0 = a + (.35 if m.get('file') else 0)
                m.update(typeAt=round(a, 3), cps=cps, sendAt=round(t0 + n / cps + .25, 3))
                runs.append(dict(at=round(t0, 3), n=n, cps=cps))
            else:
                cps = m.pop('cps', reply_cps)
                th = m.pop('think', think if role == 'ai' else 0)
                m.update(showAt=round(a, 3), textAt=round(a + th, 3), cps=cps, textEnd=round(a + th + n / cps, 3))
            m.pop('at', None)
            ms.append(m)
        out.append(dict(W, msgs=ms))
    e = s.add('chatui', x, y, w, h, at=at, windows=out, gap=gap, badge=badge, enter=enter, enterDur=enter_dur,
              hideAt=hideAt, z=z, typeRuns=runs, **kw)
    if sfx:
        s.sound('paper', at + .3, el=e)
        for W in out:
            for m in W['msgs']:
                if m['role'] == 'user':
                    s.sound('type', m['typeAt'] + (.35 if m.get('file') else 0), el=e)
                    s.sound('click', m['sendAt'], el=e)
                elif m['role'] == 'ai':
                    s.sound('pop', m['textAt'], el=e)
    return e


_KW = set('''and as async await break case catch class const continue def default del do elif else enum export extends false
finally for fn from func function if impl import in interface is lambda let loop match mut new nil none None not null or pass pub
raise return self static struct super switch this throw true True False try type var void while with yield int float bool char long
unsigned uint8_t uint32_t u8 u32 i32 i64 string auto'''.split())
_TOK = re.compile(r'(?P<com>#[^\n]*|//[^\n]*|--[^\n]*)|(?P<str>"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\')|(?P<num>\b0x[0-9a-fA-F]+\b|\b\d+(?:\.\d+)?\b)'
                  r'|(?P<id>[A-Za-z_]\w*)|(?P<p>.)')


def _code_tokens(line, hot=()):
    out = []
    for m in _TOK.finditer(line):
        k, t = m.lastgroup, m.group()
        if k == 'id':
            nxt = line[m.end():m.end() + 1]
            k = 'hot' if t in hot else 'kw' if t in _KW else 'fn' if nxt == '(' else 'p'
        if out and out[-1][1] == k and k in ('p', 'com'):
            out[-1][0] += t
        else:
            out.append([t, k])
    return out


def codecard(code, x=150, y=180, w=1100, h=None, at=0.0, title='main.py', lang=None, type_at=None, cps=24, line_at=None,
             line_pause=.12, static=False, focus=None, hot=(), size=30, style='dark', enter='drop', hideAt=None, z=20, sfx=True, **kw):
    """编辑器卡：标题栏 + 行号，代码逐字打出，语法颜色自动切（关键字 / 字符串 / 数字 / 注释 / 函数名）。注释可以写中文。
    code：多行字符串（缩进照写）。type_at：开始打字（默认卡落定后 0.4 秒）；cps 每秒字数。
    line_at={3: T(12)}：第 3 行（从 1 数）不早于这个时刻开始打，用来卡旁白。static=True 不打字，直接全显示。
    focus=[{'line':2,'at':T(14),'until':可省}]：某行打黄底高亮。hot=['GivePlayerMoney']：这些名字反白红底强调。
    style='dark'|'light'。行数 ≤ 14、每行 ≤ 60 个字符最好读。"""
    s = _S()
    lines = code.strip('\n').split('\n')
    if len(lines) > 18:
        raise ValueError('codecard：超过 18 行，拆成两张或只放关键几行')
    toks = [_code_tokens(ln, set(hot)) for ln in lines]
    lh = size * 1.6
    hh = h if h is not None else round(52 + 40 + lh * len(lines))
    longest = max(sum((.6 if ord(c) < 0x2E80 else 1.05) for c in ln) for ln in lines)
    if size * (2.6 + longest * 1.0) + 40 > w:
        print(f'[提示] codecard：最长一行约需 {size * (2.6 + longest) + 40:.0f}px，比卡宽 {w}px 宽，会被裁掉；加宽或减 size')
    t = (at + .4) if type_at is None else type_at
    lt, runs = [], []
    for i, ln in enumerate(lines):
        if static:
            lt.append([round(at, 3), 0])
            continue
        if line_at and (i + 1) in line_at:
            t = max(t, line_at[i + 1])
        n = len(ln)
        lt.append([round(t, 3), cps])
        ts = [round(t + j / cps, 3) for j, ch in enumerate(ln) if not ch.isspace()]
        if ts:                                          # 连续打字（行间停顿 < 0.4 秒）算一段打字声，每个字的时刻写准
            if runs and ts[0] - runs[-1]['times'][-1] < .4:
                runs[-1]['times'] += ts
            else:
                runs.append(dict(at=ts[0], times=ts))
        t += n / cps + line_pause
    for r in runs:
        r.update(n=len(r['times']), cps=cps)
    e = s.add('codecard', x, y, w, hh, at=at, title=title, lang=lang, lines=toks, lineT=lt, focus=focus, size=size, style=style,
              enter=enter, hideAt=hideAt, z=z, typeRuns=runs or None, **kw)
    if sfx:
        s.sound('paper', at + .25, el=e)
        for r in runs:
            s.sound('type', r['at'], el=e)
        for f in focus or []:
            s.sound('marker', f['at'], el=e)
    return e


def termcard(items, x=150, y=220, w=1100, at=None, size=96, list_size=44, hideAt=None, z=30, sfx='marker', **kw):
    """术语大字：取景角收拢、荧光笔一扫、字从左往右露出。下一个术语进来时，前面的自动缩成小号清单（打勾、变淡）。
    items=[{'text':'静态重编译','sub':'把整个程序提前翻译好','at':Tw('静态重编译') - .2}, …]（at 必填，递增）
    和拟声字 onoma 不同：术语可以承载事实；一屏 ≤ 5 条。sfx 每条出现时配一次（默认 marker 划线声）。"""
    s = _S()
    its = [dict(it, at=round(float(it['at']), 3)) for it in items]
    if not its or any(b['at'] <= a['at'] for a, b in zip(its, its[1:])):
        raise ValueError('termcard：items 至少 1 条，at 必须递增')
    if len(its) > 5:
        raise ValueError('termcard：一屏最多 5 条')
    for it in its:
        if _text_w(it['text'], size) + size * .6 > w:
            raise ValueError(f'termcard：「{it["text"]}」{size}px 放不下 {w}px 宽；减 size 或加宽')
    n = len(its)
    hh = round(size * 1.45 + (size * .32 if its[-1].get('sub') else 0) + (n - 1) * list_size * 1.45 + 40)
    first = its[0]['at'] if at is None else at
    e = s.add('termcard', x, y, w, hh, at=first, items=its, size=size, listSize=list_size, hideAt=hideAt, z=z, **kw)
    if sfx:
        for it in its:
            s.sound(sfx, it['at'], el=e)
    return e


# ---------------------------------------------------------------- 地图舞台（2026-10-27，学 Wendao「一张底图贯穿全片」）
# 底图用 模板-v6/地图/做底图.py 画（OSM 数据，米色纸感 SVG + 同名 .json 投影参数），放在素材目录（建议 素材/地图/）。
# 坐标：LL(经度, 纬度) → 底图像素；镜头推拉用 cam()/views；线、点、标签跟着底图走，字号线宽按屏幕像素恒定。
_MAPS: dict[str, dict] = {}
_ASPECT = W / H


def mapmeta(name='底图'):
    """读底图投影参数（素材目录里找 <name>.json，与 <name>.svg 同目录）。"""
    if name in _MAPS:
        return _MAPS[name]
    for d in ASSET_DIRS:
        for c in (d / f'{name}.json', d / '地图' / f'{name}.json'):
            if c.exists():
                m = json.loads(c.read_text(encoding='utf-8'))
                m['_svg'] = (c.parent / m['svg']).resolve()
                _MAPS[name] = m
                return m
    raise FileNotFoundError(f'找不到底图 {name}.json（先跑 地图/做底图.py，输出放进 素材/地图/）')


def _mpx(lon, lat, m):
    s_ = 256 * 2 ** m['z']
    x = (lon + 180) / 360 * s_
    r = math.radians(lat)
    y = (1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * s_
    return [round(x - m['x0'], 2), round(y - m['y0'], 2)]


def LL(lon, lat=None, m='底图'):
    """经纬度 → 底图像素 [x, y]。LL(135.5059, 34.6687) 或 LL((135.5059, 34.6687))。"""
    if lat is None:
        lon, lat = lon
    return _mpx(lon, lat, mapmeta(m) if isinstance(m, str) else m)


def LLs(pts, m='底图'):
    """一串经纬度 → 底图像素折线。"""
    return [LL(p, m=m) for p in pts]


def osmline(name, m='底图', axis='y', step=24, lo=None, hi=None, kinds=('highway', 'waterway', 'natural', 'railway')):
    """按名字从底图的 OSM 缓存（<底图>.osm.json）取一条路/河的中心线 → 底图像素折线。
    双向分开画的大路会被合成一条：沿 axis（'y' 南北向的路，'x' 东西向）每 step 像素取平均。lo/hi：只要这一段（底图像素坐标范围）。"""
    mm = mapmeta(m) if isinstance(m, str) else m
    osm = json.loads((mm['_svg'].parent / (mm['_svg'].stem + '.osm.json')).read_text())
    pts = []
    for e in osm['elements']:
        t = e.get('tags', {})
        if t.get('name') == name and any(k in t for k in kinds) and e.get('geometry'):
            pts += [_mpx(q['lon'], q['lat'], mm) for q in e['geometry']]
    if not pts:
        raise KeyError(f'底图数据里没有名字叫「{name}」的路/河')
    i, j = (1, 0) if axis == 'y' else (0, 1)
    bins: dict[int, list] = {}
    for q in pts:
        if (lo is not None and q[i] < lo) or (hi is not None and q[i] > hi):
            continue
        bins.setdefault(int(q[i] // step), []).append(q)
    out = []
    for b in sorted(bins):
        g = bins[b]
        out.append([round(sum(q[0] for q in g) / len(g), 1), round(sum(q[1] for q in g) / len(g), 1)])
    return out


def osmroute(name, start=None, m='底图', clip=600):
    """按线路名（OSM route 关系的 name，完全一致）取整条线 → 底图像素折线（把成员路段首尾拼起来，取最长的一段）。
    start=(经,纬)：从离它近的一端开始（线路从这里往外长）。clip：只留底图范围外 clip 像素以内的点。"""
    mm = mapmeta(m) if isinstance(m, str) else m
    osm = json.loads((mm['_svg'].parent / (mm['_svg'].stem + '.osm.json')).read_text())
    rel = [e for e in osm['elements'] if e['type'] == 'relation' and e.get('tags', {}).get('name') == name]
    if not rel:
        raise KeyError(f'底图数据里没有线路「{name}」')
    segs = [[(round(q['lon'], 7), round(q['lat'], 7)) for q in mb['geometry']] for mb in rel[0].get('members', [])
            if mb.get('type') == 'way' and mb.get('geometry') and mb.get('role', '') in ('', 'forward', 'backward', 'main')]
    paths = []
    while segs:
        cur = segs.pop(0)
        grown = True
        while grown:
            grown = False
            for i, sg in enumerate(segs):
                if sg[0] == cur[-1]: cur += sg[1:]
                elif sg[-1] == cur[-1]: cur += sg[::-1][1:]
                elif sg[-1] == cur[0]: cur = sg[:-1] + cur
                elif sg[0] == cur[0]: cur = sg[::-1][:-1] + cur
                else: continue
                segs.pop(i); grown = True; break
        paths.append(cur)
    best = max(paths, key=len)
    if start is not None:
        d0 = (best[0][0] - start[0]) ** 2 + (best[0][1] - start[1]) ** 2
        d1 = (best[-1][0] - start[0]) ** 2 + (best[-1][1] - start[1]) ** 2
        if d1 < d0:
            best = best[::-1]
    px = [_mpx(lo, la, mm) for lo, la in best]
    keep = [q for q in px if -clip <= q[0] <= mm['w'] + clip and -clip <= q[1] <= mm['h'] + clip]
    return keep


def osmstation(name, m='底图', near=None):
    """车站坐标 (经, 纬)（OSM railway=station 节点，名字完全一致；同名多个时取离 near 最近的）。"""
    mm = mapmeta(m) if isinstance(m, str) else m
    osm = json.loads((mm['_svg'].parent / (mm['_svg'].stem + '.osm.json')).read_text())
    c = [(e['lon'], e['lat']) for e in osm['elements'] if e['type'] == 'node' and e.get('tags', {}).get('name') == name]
    if not c:
        raise KeyError(f'底图数据里没有车站「{name}」')
    if near:
        c.sort(key=lambda q: (q[0] - near[0]) ** 2 + (q[1] - near[1]) ** 2)
    return c[0]


def ringll(center, radius_m, n=48):
    """以 center=(经,纬) 为圆心、radius_m 米的圆 → 经纬度多边形（给 maparea 画范围圆）。"""
    lo, la = center
    return [(lo + radius_m * math.cos(2 * math.pi * k / n) / (111320 * math.cos(math.radians(la))),
             la + radius_m * math.sin(2 * math.pi * k / n) / 110540) for k in range(n)]


def cam(center, width_m=1500, m='底图', dx=0, dy=0):
    """镜头取景 [x,y,w,h]（底图像素，16:8.4 画幅）：center=(经度,纬度) 或底图像素 [x,y]；width_m = 画面横向覆盖多少米。
    dx/dy：画面中心再偏移（底图像素，正 = 往右/下看）。"""
    mm = mapmeta(m) if isinstance(m, str) else m
    c = LL(center, m=mm) if isinstance(center, tuple) else list(center)
    w = width_m / mm['mpp']
    h = w / _ASPECT
    return [round(c[0] - w / 2 + dx, 2), round(c[1] - h / 2 + dy, 2), round(w, 2), round(h, 2)]


def mapbase(name='底图', view=None, views=None, at=0.0, enter='none', enter_dur=.6, z=3, hideAt=None, sfx=None, **kw):
    """满屏底图（photocard style='map'，叠一层纸纹）。view=cam(...)；views=[{'at':秒,'dur':3,'view':cam(...)}…] 推镜（缓入缓出）。
    推镜每次登记一个轻「嗖」要自己写 sfx（默认不登记）。返回元素，给 mapline/mappins/maphl 当 ref。"""
    mm = mapmeta(name)
    iw, ih = mm['w'], mm['h']
    view = view or [0, 0, iw, ih]
    s = _S()
    e = s.add('photocard', 0, 0, W, H, at=at, src=mm['_svg'].as_uri(), iw=iw, ih=ih, view=view, views=views, border=0, bottom=0,
              style='sat' if mm.get('kind') == '航拍' else 'map', enter=enter, enterDur=enter_dur, hideAt=hideAt, z=z, mapname=name, **kw)
    if sfx:
        s.sound(sfx, at, el=e)
    return e


def _map_of(ref):
    return mapmeta(ref.get('mapname', '底图')) if isinstance(ref, dict) else mapmeta('底图')


def _pt(q, mm):
    if 'll' in q:
        return LL(q.pop('ll'), m=mm)
    return list(q['pt'])


def _ease_io(p):
    return 4 * p * p * p if p < .5 else 1 - (-2 * p + 2) ** 3 / 2


def _view_at(ref, t):
    ks = ref.get('views') or [{'at': 0, 'view': ref['view']}]
    ki = 0
    for k in range(1, len(ks)):
        if t >= ks[k]['at']:
            ki = k
    a, b = ks[max(0, ki - 1)]['view'], ks[ki]['view']
    q = _ease_io(min(1, max(0, (t - ks[ki]['at']) / (ks[ki].get('dur') or .95)))) if ki else 1
    return [a[i] + (b[i] - a[i]) * q for i in range(4)]


def onmap(ref, ll, t=0.0):
    """地图上的点（经纬度元组或底图像素）在镜头内第 t 秒的画布坐标 [x, y]（盖章、箭头、圈注对位用；与 fx.js 同一套 cover 取景数学）。"""
    mm = _map_of(ref)
    px = LL(ll, m=mm) if isinstance(ll, tuple) else list(ll)
    v = _view_at(ref, t)
    zz = max(W / v[2], H / v[3])
    ox, oy = (W - v[2] * zz) / 2 - v[0] * zz, (H - v[3] * zz) / 2 - v[1] * zz
    return [round(ox + px[0] * zz, 1), round(oy + px[1] * zz, 1)]


def mapline(ref, lines, at=0.0, z=26, sfx='marker', hideAt=None, **kw):
    """线路生长。lines=[{'ll':[(经,纬)…] 或 'pts':[[x,y]…], 'at':秒, 'dur':1.6, 'color':'#C7372F', 'width':8,
    'casing':True/色/False, 'dash':[14,10]（虚线：已消失的河）, 'tip':True（生长头）, 'opacity':1, 'hideAt':秒}]。
    sfx='marker'：每条线开始画时登记一次笔划声（None 不登记）。"""
    mm = _map_of(ref)
    out = []
    for L in lines:
        L = dict(L)
        if 'll' in L:
            L['pts'] = LLs(L.pop('ll'), m=mm)
        L['pts'] = [list(p) for p in L['pts']]
        L.setdefault('at', at)
        out.append(L)
    s = _S()
    e = s.add('mapline', 0, 0, W, H, at=min(L['at'] for L in out), lines=out, ref=_ref_id(ref), z=z, hideAt=hideAt, **kw)
    if sfx:
        for L in out:
            s.sound(sfx, L['at'], el=e)
    return e


def mappins(ref, pins, at=0.0, z=30, sfx='pop', hideAt=None, **kw):
    """地图上的点和标签。pins=[{'ll':(经,纬) 或 'pt':[x,y], 'at':秒, 'kind':'num'|'dot'|'place'|'big', 'n':1,
    'label':'日本桥·官桥', 'sub':'第二行小字', 'dir':'r'|'l'|'u'|'d', 'dx':0,'dy':0, 'to':[画布x,y]（引线到照片卡）,
    'hideAt':秒, 'checkAt':秒（编号点打勾变绿）}]。sfx：num/dot/big 点出现时登记（place 地名不登记，免得太吵）。"""
    mm = _map_of(ref)
    if mm.get('kind') == '航拍':
        kw.setdefault('theme', 'sat')          # 航拍底：地名、大字区名改白字黑边
    out = []
    for q in pins:
        q = dict(q)
        q['pt'] = _pt(q, mm)
        q.setdefault('at', at)
        if q.get('to'):
            q['to'] = list(q['to'])
        out.append(q)
    s = _S()
    e = s.add('mappins', 0, 0, W, H, at=min(q['at'] for q in out), pins=out, ref=_ref_id(ref), z=z, hideAt=hideAt, **kw)
    if sfx:
        for q in out:
            if q.get('kind', 'num') != 'place':
                s.sound(sfx, q['at'] + .05, el=e)
            if q.get('checkAt') is not None:
                s.sound('tick', q['checkAt'], el=e)
    return e


def mapflow(ref, paths, at=0.0, z=29, **kw):
    """圆点沿路线流动（客流/列车示意，画面上注明「示意」）。paths=[{'pts' 或 'll', 'at', 'hideAt', 'n':10, 'period':4, 'color', 'r':7, 'reverse'}]。
    整段逐帧截（持续运动）。"""
    mm = _map_of(ref)
    out = []
    for P in paths:
        P = dict(P)
        if 'll' in P:
            P['pts'] = LLs(P.pop('ll'), m=mm)
        P.setdefault('at', at)
        out.append(P)
    return _S().add('mapflow', 0, 0, W, H, at=min(P['at'] for P in out), paths=out, ref=_ref_id(ref), z=z, **kw)


def mapimage(ref, name, ctrl, keys, z=4, **kw):
    """老地图按控制点原位贴到底图上：ctrl=[((图x,图y),(经,纬)), …] 三个点（图片像素 ↔ 经纬度），
    keys=[(秒, 透明度[, 渐变秒])…]。用最小二乘仿射（三点即精确）；跟着推镜走。"""
    import numpy as np
    uri, iw, ih = asset(name)
    mm = _map_of(ref)
    src = np.array([[x, y, 1.0] for (x, y), _ in ctrl])
    dst = np.array([LL(ll, m=mm) for _, ll in ctrl])
    M_, *_ = np.linalg.lstsq(src, dst, rcond=None)          # 3×2
    f = lambda x, y: [round(float(v), 2) for v in np.array([x, y, 1.0]) @ M_]
    corners = dict(tl=f(0, 0), tr=f(iw, 0), bl=f(0, ih))
    ks = [dict(at=k[0], alpha=k[1], **({'dur': k[2]} if len(k) > 2 else {})) for k in keys]
    return _S().add('mapimage', 0, 0, W, H, at=ks[0]['at'], src=uri, iw=iw, ih=ih, corners=corners, keys=ks, ref=_ref_id(ref), z=z, **kw)


def maparea(ref, ll, at=0.0, dur=.6, label=None, fill='#C7372F', alpha=.22, hatch=True, dash=True, width=4, z=24, hideAt=None, sfx='marker', **kw):
    """地图上一片区域（斜线网点 + 虚线框，从左擦入）：ll=[(经,纬)…] 多边形。是 maphl 的经纬度版。"""
    mm = _map_of(ref)
    reg = dict(pts=LLs(ll, m=mm), at=at, dur=dur, fill=fill, fillAlpha=alpha, hatch=hatch, dash=dash, width=width)
    if label:
        reg['label'] = label
    e = maphl([reg], ref=ref, at=at, z=z, hideAt=hideAt, **kw)
    if sfx:
        _S().sound(sfx, at, el=e)
    return e


def maptint(keys, z=4, **kw):
    """年代滤色（盖在底图上、线和点下面）：keys=[(秒, 浓度[, 颜色])…]，浓度 0 = 褪掉；默认旧纸黄 #C9A46A、0.35。
    例：maptint([(0, .35), (T(30), 0)])  讲江户→回到现代。z=4：只盖底图（z=3），照片卡、线、点都在它上面。"""
    ks = [dict(at=k[0], alpha=k[1], **({'color': k[2]} if len(k) > 2 else {})) if not isinstance(k, dict) else dict(k) for k in keys]
    return _S().add('maptint', 0, 0, W, H, at=ks[0]['at'], keys=ks, z=z, **kw)


def yeartag(keys, x=150, y=58, z=68, sfx='tick', **kw):
    """左上年份牌：keys=[(秒, '1891', '长屋建筑规则'), …] 或 [{'at','year','text'}]。换年份上翻；每次登记一个「咔」。"""
    ks = [dict(at=k[0], year=str(k[1]), text=k[2] if len(k) > 2 else '') if not isinstance(k, dict) else dict(k) for k in keys]
    s = _S()
    e = s.add('yeartag', x, y, 900, 84, at=ks[0]['at'], keys=ks, z=z, **kw)
    if sfx:
        for k in ks:
            s.sound(sfx, k['at'], el=e)
    return e


def bigchapter(no, name, years=None, stops=None, cur=0, at=0.0, z=64, sfx='paper', hideAt=None, **kw):
    """站卡：纸底盖满画面，左边红色「第一站」+ 粗宋站名（逐字由虚到实）+ 年代；右边竖向路线（stops，cur=当前站，0 起）。
    整镜头站卡不写 hideAt；放在镜头开头当片头用写 hideAt=秒。"""
    s = _S()
    e = s.add('bigchapter', 0, 0, W, H, at=at, no=no, name=name, years=years, stops=stops, cur=cur, z=z, hideAt=hideAt, **kw)
    if sfx:
        s.sound(sfx, at + .3, el=e)
    return e


def chapterover(kicker, numeral, name, years=None, at=0.0, hideAt=None, z=64, sfx='whoosh', **kw):
    """章节标题叠在地图上（纸色渐变 + 超大衬线数字 + 章名 + 年代）。开头 2.4 秒左右用 hideAt 退场。"""
    s = _S()
    e = s.add('chapterover', 0, 0, W, H, at=at, kicker=kicker, numeral=numeral, name=name, years=years, z=z, hideAt=hideAt, **kw)
    if sfx:
        s.sound(sfx, at + .1, el=e)
    return e


def songtitle(text_, sub=None, x=150, y=330, w=1620, size=120, at=0.0, scrim=True, stagger=.08, z=62, sfx='whoosh', hideAt=None, **kw):
    """宋体大标题逐字浮现（**红字**）+ 红短线 + 副标题；scrim=True 背景虚化压淡（叠在地图上用）。"""
    s = _S()
    e = s.add('songtitle', 0, 0, W, H, at=at, text=text_, sub=sub, tx=x, ty=y, tw=w, size=size, scrim=scrim, stagger=stagger, z=z, hideAt=hideAt, **kw)
    if sfx:
        s.sound(sfx, at + .15, el=e)
    return e


def sound(kind, at, gain=None):
    """手动登记音效事件（镜头内秒数）。"""
    return _S().sound(kind, at, gain)


# ---------------------------------------------------------------- 检查
def _events(e):
    """元素里所有「画面信息变化」的时刻（节拍检查用）。"""
    t = e['type']
    a = e.get('delay', 0)
    ev = [a]
    for v in (e.get('views') or [])[1:]:
        ev.append(v['at'])
    if t == 'lens':
        tr = e.get('travel', .7)
        ev += [a + tr, e.get('cardAt') or a + tr + (e.get('sweep') or 0) + .15]
    if t == 'highlighter':
        n = len(e.get('targets') or e.get('rects') or [1])
        ev += [a + i * (e.get('dur', .45) + e.get('gap', .08)) for i in range(n)]
    if t == 'chaptercard':
        ev += [a + i * e['stagger'] for i in range(len(e['keywords']))] + [e['titleAt']]
    if t == 'recapwall':
        ev += [a + e['zoomDur']] + [f['at'] for f in e['focus']]
    if t == 'quotecard' and e.get('segs'):
        ev += [g['at'] for g in e['segs']]
    if t == 'rankboard':
        ev += [r.get('at', a + i * e.get('stagger', .3)) for i, r in enumerate(e['rows'])] + [f['at'] for f in e.get('focus') or []]
    if t == 'timeline':
        ev += [p['at'] for p in e['points']]
    if t == 'linechart':
        ev += [a + e.get('dur', 2.2)]
    if t == 'forkpaths':
        _st, _d = e.get('stagger', .5), e.get('dur', .8)
        for i, _b in enumerate(e['branches']):
            ev += [a + .25 + i * _st, a + .25 + i * _st + _d * .75]
            if _b.get('mark'):
                ev.append(a + .25 + i * _st + _d * .9)
    if t == 'branchmap':
        _st, _d = e.get('stagger', .35), e.get('dur', .5)
        ev += [a + .6 + i * _st + _d * .8 for i, _ in enumerate(e['items'])]
    if t == 'iconrow':
        ev += [it.get('at', a + .5 + i * e.get('stagger', .6)) for i, it in enumerate(e['items'])]
    if t == 'chatui':
        for W in e['windows']:
            for m in W['msgs']:
                ev += [m['typeAt'], m['sendAt']] if m['role'] == 'user' else [m['showAt'], m['textAt'], m['textEnd']]
    if t == 'codecard':
        ev += [a_ for a_, _ in e['lineT']] + [f['at'] for f in e.get('focus') or []]
    if t == 'termcard':
        ev += [it['at'] for it in e['items']]
    if t == 'aiicon' and e.get('hotAt') is not None:
        ev.append(e['hotAt'])
    if t == 'specgrid':
        ev += [r.get('at', a + .45 + i * e.get('stagger', .35)) for i, r in enumerate(e['rows'])] + [f['at'] for f in e.get('focus') or []]
    if t == 'maphl':
        ev += [r.get('at', a) for r in e['regions']] + [r['labelAt'] for r in e['regions'] if r.get('labelAt') is not None]
    if t == 'mapline':
        ev += [L.get('at', a) for L in e['lines']] + [L.get('at', a) + L.get('dur', 1.6) for L in e['lines']]
    if t == 'mappins':
        ev += [q.get('at', a) for q in e['pins']] + [q['checkAt'] for q in e['pins'] if q.get('checkAt') is not None] + \
              [q['toAt'] for q in e['pins'] if q.get('toAt') is not None] + [q['hideAt'] for q in e['pins'] if q.get('hideAt') is not None]
    if t == 'chapterover':
        ev += [a + .6]
    if t == 'mapimage':
        ev += [k['at'] for k in e['keys']]
    if t == 'mapflow':
        ev += [P.get('at', a) for P in e['paths']]
    if t in ('yeartag', 'maptint'):
        ev += [k['at'] for k in e['keys']]
    if t == 'bigchapter':
        ev += [a + .45, a + .45 + len(e.get('name', '')) * .07 + .3]
    if t == 'songtitle':
        ev += [a + .2 + len(e.get('text', '').replace('**', '')) * e.get('stagger', .08) + .3]
    if t == 'statbar' and e.get('growAt') is not None:
        ev.append(e['growAt'])
    if t in ('photocard', 'docpage', 'videocard'):
        ev += [L['at'] for L in (e.get('lift') or [])] + [L['at'] for L in (e.get('dim') or [])]
    if t == 'videocard':
        pa, pe = e.get('playAt', a), e['playEnd']
        ev += [pa + k * 3.0 for k in range(int((pe - pa) // 3.0) + 1)] + [pe]
    if e.get('hideAt') is not None:
        ev.append(e['hideAt'])
    return ev


def _text_w(t, size):
    """粗估文字宽度（汉字/全角按 1 个字号，数字字母按 0.56，标点 0.5），只用于检查是否可能折行。"""
    t = re.sub(r'==|\*\*', '', t)
    w = 0.0
    for ch in t:
        if ch in '\n':
            continue
        o = ord(ch)
        w += size * (0.56 if o < 0x2E80 else 1.0)
    return w


def check_shot(s: Shot) -> list[str]:
    warn = []
    ids = set()
    for e in s.elements:
        if e['id'] in ids:
            warn.append(f'{s.id} 元素 id 重复 {e["id"]}')
        ids.add(e['id'])
        a = e.get('delay', 0)
        if a > s.dur:
            warn.append(f'{s.id} {e["id"]}({e["type"]}) 出现 {a:.2f}s 超过镜头时长 {s.dur:.2f}s')
        if e.get('hideAt') is not None and e['hideAt'] <= a:
            warn.append(f'{s.id} {e["id"]} hideAt {e["hideAt"]} ≤ 出现时间 {a}')
        t = e['type']
        if t in ('eyebrow', 'source') or t in FULLCANVAS or t in ('parallax', 'particles', 'evidence', 'scrim', 'yeartag') or (t == 'photocard' and e.get('style') in ('map', 'sat')):
            pass
        elif t in ('bigstamp', 'seal', 'pop', 'onoma'):
            if e['y'] > SAFE['y1']:
                warn.append(f'{s.id} {e["id"]}({t}) 中心 y={e["y"]} 进了字幕带')
        else:
            hgt = e.get('h') or 0
            if e['y'] + hgt > SAFE['y1'] + 1:
                warn.append(f'{s.id} {e["id"]}({t}) 下沿 y={e["y"] + hgt:.0f} > {SAFE["y1"]}（字幕/出处区）')
            if t in TEXTY and (e['x'] < SAFE['x0'] - 1 or e['x'] + (e.get('w') or 0) > SAFE['x1'] + 1):
                warn.append(f'{s.id} {e["id"]}({t}) 横向 {e["x"]:.0f}–{e["x"] + (e.get("w") or 0):.0f} 超出 150–1770（会被暗角压暗）')
        if t == 'title':
            est = _text_w(e.get('text', ''), e.get('size', 74))
            if est > (e.get('w') or 0) * 1.0 and '\n' not in e.get('text', ''):
                warn.append(f'{s.id} 标题「{e["text"][:12]}…」估计宽 {est:.0f}px > 框宽 {e.get("w")}，会折成两行，留意压到下面的元素')
        if t == 'videocard' and e['playEnd'] > s.dur + .05 and (e.get('hideAt') is None or e['playEnd'] > e['hideAt'] + .05):
            warn.append(f'{s.id} {e["id"]}(videocard) 要播到 {e["playEnd"]:.2f}s，超过镜头 {s.dur:.2f}s（后面的帧看不到；改 t_out 或 speed）')
        if t == 'lens' and (e.get('card') or {}).get('y', 0) > 700:
            warn.append(f'{s.id} {e["id"]} 译文卡 y={e["card"]["y"]} 偏低，确认卡片下沿 ≤ 870')
    # 节拍：每 2.5–4 秒至少一个画面信息变化
    evs = sorted(set(round(x, 2) for e in s.elements if e['type'] not in ('eyebrow', 'source') for x in _events(e) if 0 <= x <= s.dur))
    if not evs:
        warn.append(f'{s.id} 没有任何画面元素')
    else:
        pts = [0.0] + evs + [s.dur]
        gaps = [(pts[i + 1] - pts[i], pts[i]) for i in range(len(pts) - 1)]
        strength = (_load_beats().get(s.id) or {}).get('强弱')
        lim = RELAX_GAP if strength == '松' else 4.05            # 松段是故意留的停顿，放宽到 8 秒
        big = [(g, a) for g, a in gaps if g > lim and not (a == pts[-2] and g < lim + .95)]
        if big:
            warn.append(f'{s.id} 节拍空档：' + '，'.join(f'{a:.1f}s 起 {g:.1f}s 无新信息' for g, a in big) + '（规则：每 2.5–4 秒加一个信息元素）')
        first = [x for x in evs if x > 0.01]
        if evs[0] > 1.0:
            warn.append(f'{s.id} 第一个画面元素 {evs[0]:.2f}s 才出现（建议 1 秒内有主体）')
        # 极短插镜：闪完要停住（连闪只看最后一张）
        fl = sorted((e['delay'], e['hideAt']) for e in s.elements if e.get('flash'))
        for i, (a, b) in enumerate(fl):
            if i + 1 < len(fl) and fl[i + 1][0] - a <= .6:
                continue
            nxt = [x for x in evs if b + .01 < x < b + 2.0]
            if nxt:
                warn.append(f'{s.id} 插镜 {a:.2f}s 闪完 {nxt[0] - b:.1f}s 就有新动作（要停 2 秒以上，让留下的画面看清）')
    if strength_of(s.id):
        fx = sorted({e['type'] for e in s.elements if e['type'] in HEAVY_FX} | ({'flash'} if any(e.get('flash') for e in s.elements) else set()))
        if fx and strength_of(s.id) != '强':
            warn.append(f'{s.id} 是「{strength_of(s.id)}」段，却用了 {"、".join(fx)}（重效果只放强段；要么改节拍表，要么换轻效果）')
    return warn


def strength_of(sid):
    return (_load_beats().get(sid) or {}).get('强弱') or None


def beat_report(sb, done):
    """全片节奏检查（2026-11-06）：节拍表填了没、强松比例、强段是否真的比松段密、全片是不是太匀。没有节拍表返回 []。"""
    rows = _load_beats()
    if not rows:
        return []
    out = []
    scenes = [sc for sc in sb['scenes'] if sc['stable_id'] in done]
    empty = [sc['stable_id'] for sc in sb['scenes'] if not (rows.get(sc['stable_id']) or {}).get('强弱')]
    if empty:
        out.append(f'节拍表：{len(empty)} 个镜头没填强弱（{"、".join(empty[:8])}{"…" if len(empty) > 8 else ""}），写镜头脚本前先填')
    filled = [sc for sc in scenes if (rows.get(sc['stable_id']) or {}).get('强弱')]
    if not filled:
        return out
    dur = {k: 0.0 for k in STRENGTHS}
    cnt = {k: 0 for k in STRENGTHS}
    times, flashes = [], 0
    for sc in scenes:
        k = (rows.get(sc['stable_id']) or {}).get('强弱')
        evs = {round(x, 2) for e in sc.get('elements') or [] if e['type'] not in ('eyebrow', 'source') for x in _events(e)}
        flashes += sum(1 for e in sc.get('elements') or [] if e.get('flash'))
        times += [sc['t0'] + x for x in evs]
        if k:
            dur[k] += sc['t1'] - sc['t0']
            cnt[k] += len(evs)
    tot = sum(dur.values()) or 1
    share = {k: dur[k] / tot for k in STRENGTHS}
    rate = {k: cnt[k] / dur[k] * 60 if dur[k] else 0 for k in STRENGTHS}
    out.append('节奏：' + '，'.join(f'{k} {share[k]:.0%}（每分钟 {rate[k]:.0f} 个动作）' for k in STRENGTHS) + f'；极短插镜 {flashes} 处')
    if not .10 <= share['强'] <= .40:
        out.append(f'节奏：强段占 {share["强"]:.0%}，建议 15–30%（太多就没有强弱了）')
    if share['松'] < .10:
        out.append(f'节奏：松段只占 {share["松"]:.0%}，至少留 10%，观众要有喘气的地方')
    if dur['强'] and dur['松'] and rate['强'] < rate['松'] * 1.3:
        out.append(f'节奏：强段（每分钟 {rate["强"]:.0f}）没有明显比松段（{rate["松"]:.0f}）密，强弱只写在表上、没落到画面')
    T_all = sum(sc['t1'] - sc['t0'] for sc in scenes)
    if T_all >= 120 and len(scenes) == len(sb['scenes']):
        n = int(T_all // 30)
        bins = [sum(1 for x in times if i * 30 <= x - sb['scenes'][0]['t0'] < (i + 1) * 30) for i in range(n)]
        m = sum(bins) / n
        cv = (sum((b - m) ** 2 for b in bins) / n) ** .5 / m if m else 0
        out.append(f'节奏：每 30 秒动作数的起伏 {cv:.2f}（往期 0.17–0.32，USJ v6 0.23）' +
                   (f'，低于 {BEAT_FLAT_CV}，全片太匀，松段再空一点或强段再密一点' if cv < BEAT_FLAT_CV else ''))
    return out


# ---------------------------------------------------------------- v5 兜底（还没写 v6 脚本的镜头，预览用）
def _v5_fallback(sid):
    """旧画面兜底（项目.json「兜底分镜」：USJ 是 v5 分镜；新一期可以是工厂分镜转出来的参考）。没有这个文件或没有这个镜头 → None（改用空白）。"""
    if not V5_STORYBOARD.exists():
        return None
    sb = json.loads(V5_STORYBOARD.read_text())
    sc = next((x for x in sb['scenes'] if x.get('stable_id') == sid), None)
    if sc is None:
        return None
    els = copy.deepcopy(sc['elements'])
    s = Shot(sid)
    for e in els:
        if e['type'] == 'eyebrow':
            x, y, w, h = CHAPTER_BOX
            e.update(x=x, y=y, w=w, h=h, text=s.chapter, kicker=_kicker(s.chapter_no))
            e.pop('size', None)
        elif e['type'] == 'source':
            x, y, w, h = SOURCE_BOX
            e.update(x=x, y=y, w=w, h=h)
            e.pop('size', None)
    return els, dict(cls=sc.get('cls', ''))


# ---------------------------------------------------------------- 拼分镜
def _load_module(path: Path):
    spec = importlib.util.spec_from_file_location('shot_' + path.stem, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = mod
    spec.loader.exec_module(mod)
    return mod


def build_storyboard(shots=None, fallback='auto', out_dir: Path = WORK, quiet=False) -> dict:
    """把镜头拼成完整分镜。shots：None = 读 镜头脚本/*.py 全部；也可以是 镜头号列表、模块、Shot 对象、.py 路径的列表。
    每个镜头脚本必须定义 build()，里面调用 begin(镜头号) 和组件函数。
    fallback：'auto'（默认）= 有「兜底分镜」文件就用旧画面预览没写脚本的镜头，没有就只放章标；'v5' 同 auto；'blank' = 只放章标。
    写出 out_dir/storyboard.json、timeline.js、sfx_events.json、检查报告.txt；返回分镜 dict。"""
    global _CUR
    _SHOTS.clear()
    _CUR = None
    items = shots
    if items is None:
        items = sorted(SHOT_DIR.glob('S*.py'))
    for it in items:
        if isinstance(it, Shot):
            _SHOTS.setdefault(it.id, it)
            continue
        if isinstance(it, (str, Path)) and not str(it).endswith('.py') and str(it) in _BY:
            it = SHOT_DIR / f'{it}.py'
        mod = _load_module(Path(it)) if isinstance(it, (str, Path)) else it
        before = set(_SHOTS)
        ret = mod.build()
        if isinstance(ret, Shot):
            _SHOTS.setdefault(ret.id, ret)
        if set(_SHOTS) == before:
            raise RuntimeError(f'{it} 的 build() 没有 begin 任何镜头')
    sb = copy.deepcopy(_AUD)
    sb['meta']['revision'] = 'v6'
    report, sfx = [], []
    for sc in sb['scenes']:
        sid = sc['stable_id']
        s0 = Shot(sid)
        sc['chapter'] = s0.chapter
        if sid in _SHOTS:
            s = _SHOTS[sid]
            sc['elements'] = s.elements
            sc['cls'] = 'ink' if s.dark else ''
            if s.vig is not None:
                sc['vig'] = s.vig
            if s.motion:
                sc['motion'] = s.motion
            if s.bgvideo:
                sc['bgvideo'] = s.bgvideo
            report += check_shot(s)
            for ev in s.sfx:
                sfx.append(dict(ev, t=round(sc['t0'] + ev['at'], 3)))
        else:
            fb = _v5_fallback(sid) if fallback in ('v5', 'auto') else None
            if fb is not None:
                els, extra = fb
                sc['elements'] = els
                sc.update(extra)
            else:
                x, y, w, h = CHAPTER_BOX
                sc['elements'] = [dict(id=f'{sid}_1', type='eyebrow', x=x, y=y, w=w, h=h, text=s0.chapter, kicker=_kicker(s0.chapter_no), delay=0, fixed=True)]
            sc['v6'] = False
    # 绝不改时间
    for a, b in zip(sb['scenes'], _AUD['scenes']):
        assert a['stable_id'] == b['stable_id'] and a['t0'] == b['t0'] and a['t1'] == b['t1'], a['stable_id']
    assert sb['beats'] == _AUD['beats'] and len(sb['scenes']) == len(_ORDER)
    assert sum(frames_of(s) for s in sb['scenes']) == round(sb['meta']['duration'] * FPS)
    sb['sfx_events'] = sorted(sfx, key=lambda e: e['t'])
    if os.environ.get('V6_TRAD'):                      # 2026-11-17：油管繁体版——屏上文字转台湾繁体（opencc s2twp + 项目.json「字幕繁体词表」），旁白和时间不动
        import opencc
        _cc = opencc.OpenCC('s2twp'); _tb = (P.get('字幕繁体词表') or {})
        def _tw(t):
            t = _cc.convert(t)
            for _a, _b in _tb.items():
                t = t.replace(_a, _b)
            return t
        for _sc in sb['scenes']:
            for _e in _sc['elements']:
                for _k in ('text', 'kicker', 'unit', 'suffix', 'prefix', 'valueText', 'label', 'title', 'caption', 'body', 'shown'):
                    if isinstance(_e.get(_k), str):
                        _e[_k] = _tw(_e[_k])
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / 'storyboard.json').write_text(json.dumps(sb, ensure_ascii=False, indent=1))
    (out_dir / 'timeline.js').write_text('window.__DATA=' + json.dumps(sb, ensure_ascii=False) + ';')
    (out_dir / 'sfx_events.json').write_text(json.dumps(sb['sfx_events'], ensure_ascii=False, indent=1))
    # 音效密度（2026-10-07 起每个动作都配声，轻档不限；只查中、重档相邻 < 2.5 秒——总装会把后一个降成轻档或跳过）
    hv = sorted((e for e in sfx if str(e.get('kind', '')).lower() in MID_HEAVY_SFX and not e.get('exception')), key=lambda e: e['t'])
    close = [(a, b) for a, b in zip(hv, hv[1:]) if b['t'] - a['t'] < 2.5]
    if close:
        report.append(f'中重档音效相邻 < 2.5 秒 {len(close)} 处（总装会降档或跳过；确实要连着响就在事件上标 exception）：' +
                      '，'.join(f'{a["shot"]} {a["t"]:.2f}「{a["kind"]}」→{b["t"]:.2f}「{b["kind"]}」' for a, b in close[:8]))
    done = [s for s in _ORDER if s in _SHOTS]
    report += beat_report(sb, set(done))
    head = f'v6 分镜：已写 {len(done)}/{len(_ORDER)} 个镜头（{", ".join(done)}）；音效事件 {len(sfx)} 个；其余用 {fallback} 兜底'
    (out_dir / '检查报告.txt').write_text(head + '\n' + '\n'.join(report) + '\n')
    if not quiet:
        print(head)
        for r in report:
            print('  [检查]', r)
    return sb


# ---------------------------------------------------------------- 渲染与抽帧
def render(ids=None, stills=False, at=None, out=None, force=False, fonts=False, retries=120, wait=30, storyboard=None):
    """渲染（自动套 mac-heavy-job.py；退出码 75 = 别的重任务在跑，等 wait 秒重试，不绕过锁）。
    ids：镜头号列表（None = 全部，写 manifest.json）；stills=True 只出静帧（at=[秒,…]）；out 默认 画面v6/镜头。
    storyboard：分镜文件（默认 工程/.work/storyboard.json；试验台等用别的文件）。"""
    out = Path(out or CACHE_DIR)
    if not HEAVY_JOB.exists():
        raise RuntimeError(f'缺 {HEAVY_JOB}（重任务锁）。从云盘 视频制作/工具-本机/mac-heavy-job.py 复制一份过去，'
                           '或运行 视频制作/另一台电脑准备.command 看说明')
    cmd = HEAVY + [NODE_BIN + '/node', '分段渲染.mjs', str(storyboard or '.work/storyboard.json'), str(out)]
    if ids:
        cmd.append('--only=' + ','.join(ids))
    if stills:
        cmd.append('--stills')
    if at:
        cmd.append('--at=' + ','.join(f'{t:.3f}' for t in at))
    if force:
        cmd.append('--force')
    if fonts:
        cmd.append('--fonts')
    env = dict(os.environ, PATH=NODE_BIN + ':' + os.environ.get('PATH', '/usr/bin:/bin'))
    for k in range(retries):
        r = subprocess.run(cmd, cwd=PROJ, env=env)
        if r.returncode != 75:
            if r.returncode != 0:
                raise RuntimeError(f'渲染失败，退出码 {r.returncode}')
            return r
        print(f'[memory guard] 另一个重任务在跑，{wait} 秒后重试（第 {k + 1} 次）', flush=True)
        time.sleep(wait)
    raise RuntimeError('等了太久，重任务锁一直被占用')


def latest_mp4(sid, cache=None):
    """某镜头最新渲染的 mp4（按修改时间）。"""
    fs = sorted(Path(cache or CACHE_DIR).glob(f'{sid}-*.mp4'), key=lambda p: p.stat().st_mtime)
    if not fs:
        raise FileNotFoundError(f'{sid} 还没有渲染')
    return fs[-1]


def grab(sid, times, out_dir=None, cache=None, prefix=None):
    """从镜头 mp4 抽静帧（ffmpeg，走重任务锁）：返回 jpg 路径列表。"""
    import imageio_ffmpeg
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    mp4 = latest_mp4(sid, cache)
    info = _probe(mp4)
    if any(not math.isfinite(float(t)) or t < 0 or t >= info['dur'] or (info['n'] is not None and math.ceil(t * (info['fps'] or FPS) - 1e-8) >= info['n']) for t in times):
        raise ValueError(f'{sid} grab：秒数必须在 [0, {info["dur"]}) 内')
    out_dir = Path(out_dir or SELFTEST_DIR)
    out_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for t in times:
        p = out_dir / f'{prefix or sid}-{t:05.2f}s.jpg'
        p.unlink(missing_ok=True)
        _media_run([ff, '-y', '-v', 'error', '-i', str(mp4), '-ss', f'{t:.3f}', '-frames:v', '1', '-q:v', '2', str(p)])
        if not p.is_file():
            raise RuntimeError(f'{sid} 抽帧失败：{t}s，mp4={mp4}')
        paths.append(p)
    return paths


def contact(paths, out, cols=2, width=960, label=True):
    """把几张静帧拼成一张对照图（带文件名小字）。"""
    from PIL import ImageDraw
    ims = [Image.open(p).convert('RGB') for p in paths]
    hgt = round(width * ims[0].height / ims[0].width)
    rows = math.ceil(len(ims) / cols)
    sheet = Image.new('RGB', (cols * width, rows * (hgt + (28 if label else 0))), '#222')
    d = ImageDraw.Draw(sheet)
    for i, (p, im) in enumerate(zip(paths, ims)):
        x, y = (i % cols) * width, (i // cols) * (hgt + (28 if label else 0))
        sheet.paste(im.resize((width, hgt)), (x, y + (28 if label else 0)))
        if label:
            d.text((x + 8, y + 6), Path(p).name, fill='#eee')
    sheet.save(out, quality=88)
    return out


if __name__ == '__main__':
    # python3 v6lib.py            → 拼分镜（读 镜头脚本/*.py）
    # python3 v6lib.py S05 S06    → 打印这些镜头的旁白时刻
    # 以脚本运行时，镜头脚本里的 `from v6lib import *` 会载入另一份模块；统一用那一份，镜头才登记得上
    import v6lib as _lib
    if len(sys.argv) > 1:
        for sid in sys.argv[1:]:
            _lib.shot_info(sid)
    else:
        _lib.build_storyboard()


# ---------------------------------------------------------------- 模板·实拍底片
def _bg_dir():
    c = P.get('实拍', {})
    if not c.get('工作区'):
        raise RuntimeError('项目.json 没写「实拍.工作区」，不能用 bgvideo()（见 实拍/实拍设置.py 的例子）')
    ws = Path(os.path.expanduser(c['工作区']))
    d = Path(os.path.expanduser(c.get('片段目录', '实拍片段')))
    return d if d.is_absolute() else ws / d


def bgvideo(sid=None, label='默认', label_at=0.0, shot=None):
    """本镜头用满屏实拍底片（实拍/做实拍片段.py 剪好的 <镜头号>.mp4，帧数与镜头一致）。舞台这一屏透明，渲染时叠到底片上。
    label：左下角小标，默认取 项目.json「实拍.标签」（例「实拍 2025年12月」）；None 不标。"""
    s = _S(shot)
    p = _bg_dir() / f'{sid or s.id}.mp4'
    if not p.exists():
        raise FileNotFoundError(f'实拍底片还没做：{p}（先跑 python3 实拍/做实拍片段.py {sid or s.id}）')
    s.bgvideo = p.resolve().as_uri()
    s.vig = .55 if s.vig is None else s.vig
    if label == '默认':
        label = P.get('实拍', {}).get('标签', '实拍')
    if label:
        x, y, w, h = SOURCE_BOX
        s.add('source', x, y, w, h, at=label_at, text=label, anim='fade', dur=.3, z=70, cls='onphoto shotlabel', fixed=True if label_at == 0 else None)
    return s.bgvideo
