"""本期（股神水谷）镜头脚本共用的小工具。
- 标 / 小标：胶囊标签（默认配 pop 声）。
- 推文(ja, zh, 日期, …)：手机推文卡：上面一行账号和日期，中间中文大字，下面日文原文小字（屏上日文都配中文）。
- 截图(文件, …)：他晒的持仓 / 损益截图，白边照片卡（可叠放大镜、荧光笔）。
- 行情数据：日经、铠侠（拆股前口径）等折线点，来自 写稿/资料/2026-10-水谷隼股神/素材/行情/*.csv（Yahoo Finance 日线）。
成片不放来源字幕（用户 10-13）：begin() 第三个参数一律 None，来源记在 素材/00-来源.md 和描述栏。"""
import csv
from pathlib import Path
from v6lib import pill, photocard, panel, text, C

行情 = Path('~/Desktop/写稿/资料/2026-10-水谷隼股神/素材/行情').expanduser()


# ======================= v7b（2026-11-07 用户审片）新闻解说版式 =======================
# 规则：图是主角时满屏或宽 ≥ 画面 65%；截图字要看得清；正文 ≥40px、标签 ≥32px；每屏 0.5 秒内出主体；
# 不倾斜、不胶带、不便签、不药丸、不手写体、不荧光笔标题；图片原色。
from v6lib import begin, fullbleed, counter, stamp, highlighter, lens, sound, linechart, statbar, timeline, asset, _S, W, H

TOP, BOTTOM = 172, 868          # 标题下方内容区（字幕区在 925 以下，出处条不用）
L, R = 150, 1770


def 开(sid, title=None, photo=False, **kw):
    """开镜头：标题思源黑体 Heavy 64px（满屏照片上改白字）。"""
    kw.setdefault('title_size', 64)
    kw.setdefault('title_box', (150, 54, 1280, 96))
    return begin(sid, title, None, onphoto=photo, vig=0 if photo else None, **kw)


def _fit(name, view, w=None, h=None, box_w=1620, box_h=TOP and (BOTTOM - TOP)):
    _, iw, ih = asset(name)
    v = view or [0, 0, iw, ih]
    ar = v[2] / v[3]
    if w is None and h is None:
        w = min(box_w, box_h * ar)
    elif w is None:
        w = h * ar
    return v, round(w, 1), round(w / ar, 1)


def 图(name, view=None, at=0.0, x=None, y=None, w=None, h=None, box=(L, TOP, R - L, BOTTOM - TOP), sfx='paper', **kw):
    """大图（照片、截图、新闻截帧）：无边框、不倾斜，按比例放到 box 里最大（默认整个内容区，居中）。"""
    v, ww, hh = _fit(name, view, w, h, box[2], box[3])
    if x is None:
        x = box[0] + (box[2] - ww) / 2
    if y is None:
        y = box[1] + (box[3] - hh) / 2
    kw.setdefault('enter', 'fade'); kw.setdefault('enter_dur', .35)
    return photocard(name, view=v, x=x, y=y, w=ww, at=at, rot=0, border=0, style='plain', sfx=sfx, **kw)


def 满屏(name, view=None, at=0.0, scrim='left', amp=.012, scrim_w=1300, **kw):
    """满屏照片 / 新闻画面（原色），左侧压暗保证标题、字条可读；scrim='bottom' 下方压暗。配 开(…, photo=True)。"""
    if at < .05:
        kw.setdefault('enter', 'none')                  # 镜头一开头就满屏：硬切，不从纸面淡入（避免切点闪一帧空纸）
    e = fullbleed(name, view=view, at=at, scrim_h=0, vig=0, amp=amp, **kw)
    if scrim:
        _S().add('scrim', W - scrim_w if scrim == 'right' else 0, 0 if scrim != 'bottom' else 560, scrim_w if scrim in ('left', 'right') else W, H if scrim != 'bottom' else H - 560,
                 at=at, cls=scrim, anim='fade', dur=.3, z=4, hideAt=kw.get('hideAt'))
    return e


def 题(t, at=0.0, hideAt=None, photo=False, size=64):
    """分段标题（同一镜头里照片段 / 纸面段要换标题颜色时用；begin 不写标题）。"""
    return text(t, x=150, y=54, w=1280, h=96, size=size, at=at, kind='title', cls='onphoto' if photo else None,
                anim='fade', dur=.4, hideAt=hideAt, z=20)


def 角标(at=0.0, hideAt=None, photo=False):
    """分段右上章标（begin(chapter_mark=False) 时手动放，照片段白字、纸面段墨字）。"""
    from v6lib import CHAPTER_BOX, _kicker
    s = _S(); x, y, w, h = CHAPTER_BOX
    return s.add('eyebrow', x, y, w, h, at=at, text=s.chapter, kicker=_kicker(s.chapter_no), anim='fade', dur=.3, z=70,
                 cls='onphoto' if photo else None, hideAt=hideAt)


def 条(t, x=L, y=776, at=0.0, tone='neutral', size=44, sfx='pop', **kw):
    """下三分之一字条：方角色块 + 白字（不是圆角药丸）。"""
    return pill(t, x, y, at=at, tone=tone, size=size, h=size + 44, w=1600, sfx=sfx, **kw)


def 字(t, x=L, y=300, w=900, size=48, at=0.0, color=None, photo=False, big=False, num=False, **kw):
    """普通文字（≥40px）。big=True 思源黑体 Heavy；photo=True 照片上白字；num=True 用 Oswald。"""
    cls = ' '.join(c for c in ['onphoto' if photo else '', 'big' if big else '', 'num' if num else ''] if c) or None
    return text(t, x=x, y=y, w=w, size=size, at=at, kind='label', color=color, cls=cls, **kw)


def 章卡(no, name, hold=2.6, sub=None):
    """大字章卡：画面中部左对齐，「第 N 章」红字 + 章名 170px Heavy（铺满左右，不再是几个小方框）。"""
    end = hold
    text(no, x=L, y=300, w=1200, size=72, at=0.0, kind='label', color=C['red'], cls='big', hideAt=end, anim='fade', dur=.3)
    text(name, x=L, y=400, w=1620, size=210, at=0.12, kind='label', cls='big', hideAt=end, anim='up', dur=.4)
    if sub:
        text(sub, x=L + 6, y=680, w=1500, size=44, at=.3, kind='label', color=C['muted'], hideAt=end, anim='fade', dur=.3)
    sound('whoosh', 0.05)


def 推文(zh, ja, 日期, x=L, y=TOP + 10, w=1000, at=0.1, zh_size=52, ja_size=28, who='水谷隼', h=None, **kw):
    """推文卡（重做）：白卡 + 左侧藏青条；第一行「账号 · 日期」，中间中文大字，下面日文原文小字。返回底卡元素。"""
    import math, re
    plain = re.sub(r'==|\*\*', '', zh)
    cpl = max(1, int((w - 90) / zh_size))
    lines = sum(max(1, math.ceil(len(seg) / cpl)) for seg in plain.split('\n'))
    jcpl = max(1, int((w - 90) / (ja_size * 1.02)))
    jl = sum(max(1, math.ceil(len(seg) / jcpl)) for seg in ja.split('\n')) if ja else 0
    hz = int(zh_size * 1.42)
    if h is None:
        h = 40 + 52 + 26 + lines * hz + (16 + jl * int(ja_size * 1.55) if ja else 0) + 40
    kw.setdefault('sfx', 'paper')
    hid = kw.get('hideAt')
    p = panel('', '', x=x, y=y, w=w, h=h, at=at, kind='navy', anim='fade', dur=.3, **kw)
    text(f'{who} · {日期}', x=x + 44, y=y + 34, w=w - 88, size=34, at=at, kind='label', color=C['muted'], anim='fade', dur=.3, z=16, hideAt=hid)
    text(zh, x=x + 44, y=y + 104, w=w - 88, size=zh_size, at=at + .15, kind='label', cls='big', anim='fade', dur=.3, z=16, hideAt=hid)
    if ja:
        text(ja, x=x + 44, y=y + 104 + lines * hz + 14, w=w - 88, size=ja_size, at=at + .25, kind='label', color=C['muted'],
             anim='fade', dur=.3, z=16, hideAt=hid)
    return p


def 截图(name, at=0.1, **kw):
    """他晒的持仓 / 损益截图：放大到字看得清（默认铺满内容区宽或高）。"""
    return 图(name, at=at, **kw)


def _读(name, col='收'):
    rows = []
    with open(行情 / name) as f:
        for r in csv.DictReader(f):
            if r[col]:
                rows.append((r['日期'], float(r[col])))
    return rows


def 点(name, 日期们, labels=None, texts=None, col='收', override=None):
    """按日期取收盘价做折线点。labels/texts 与日期们一一对应（None = 不写）。override={日期: 值}。"""
    d = dict(_读(name, col))
    if override:
        d.update(override)
    out = []
    for i, ds in enumerate(日期们):
        v = d[ds]
        o = {'label': (labels[i] if labels else ''), 'value': round(v)}
        if texts is not None:
            o['text'] = texts[i] if texts[i] is not None else ''
        out.append(o)
    return out


# ---- v7（2026-11-06）新增：11 月行情（Yahoo Finance 日线，拆股后口径；铠侠要换拆股前就 ×3）
新行情 = Path('~/Desktop/视频工厂/样片/2026-11-06-股神水谷v2/新素材/行情').expanduser()


def 新点(name, 日期们, labels=None, texts=None, col='收', mul=1.0, override=None):
    d = {}
    with open(新行情 / name) as f:
        for r in csv.DictReader(f):
            d[r['日期']] = float(r[col]) * mul
    if override:
        d.update(override)
    return [{'label': labels[i] if labels else '', 'value': round(d[ds]), **({'text': texts[i] or ''} if texts else {})}
            for i, ds in enumerate(日期们)]
