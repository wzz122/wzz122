"""本期（大阪震度二）镜头脚本共用小工具：v7b 新闻解说版式（拷自 股神水谷v2/本期工具.py 的 v7b 部分）+ 本期新增：
- 动(视频)：满屏示意动画 / Seedance 小动画（1920×1080，无边框）。
- 视频(视频, …)：官方动画、新闻片段按比例放大到内容区，可在下方加小字来源。
成片不放来源字幕（新闻 / 官方视频卡例外，角上小字）。"""
from v6lib import pill, photocard, panel, text, C, videocard, vseq
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


def 满屏(name, view=None, at=0.0, scrim='left', amp=.012, scrim_w=1300, dark=1, **kw):
    """满屏照片 / 新闻画面（原色），左侧压暗保证标题、字条可读；scrim='bottom' 下方压暗。配 开(…, photo=True)。"""
    if at < .05:
        kw.setdefault('enter', 'none')                  # 镜头一开头就满屏：硬切，不从纸面淡入（避免切点闪一帧空纸）
    e = fullbleed(name, view=view, at=at, scrim_h=0, vig=0, amp=amp, **kw)
    if scrim:
        for _ in range(dark):
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


def 条(t, x=L, y=776, at=0.0, tone='neutral', size=44, sfx='pop', w=1600, **kw):
    """下三分之一字条：方角色块 + 白字（不是圆角药丸）。"""
    return pill(t, x, y, at=at, tone=tone, size=size, h=size + 44, w=w, sfx=sfx, **kw)


def 字(t, x=L, y=300, w=900, size=48, at=0.0, color=None, photo=False, big=False, num=False, **kw):
    """普通文字（≥40px）。big=True 思源黑体 Heavy；photo=True 照片上白字；num=True 用 Oswald。"""
    cls = ' '.join(c for c in ['onphoto' if photo else '', 'big' if big else '', 'num' if num else ''] if c) or None
    return text(t, x=x, y=y, w=w, size=size, at=at, kind='label', color=color, cls=cls, **kw)


def 竖裁(name, cx=.5, ar=920 / 1008, y0=0):
    """按目标宽高比从原图裁一块（整高，水平中心 cx）。"""
    _, iw, ih = asset(name)
    h = ih - y0; w = h * ar
    if w > iw:
        w = iw; h = w / ar
    x = min(max(0, iw * cx - w / 2), iw - w)
    return [round(x), round(y0), round(w), round(h)]


def 章卡(no, name, hold=2.6, sub=None, photo=None, cx=.5, y0=0):
    """大字章卡：左侧「第 N 章」+ 章名大字；右侧整高原色照片（photo，到 hold 时一起退场）。"""
    end = hold
    size = min(210, int(820 / max(1, len(name.replace(' ', '')) )))
    text(no, x=L, y=330, w=820, size=72, at=0.0, kind='label', color=C['red'], cls='big', hideAt=end, anim='fade', dur=.3)
    text(name, x=L, y=430, w=840, size=size, at=0.0, kind='label', cls='big', hideAt=end, anim='up', dur=.4)
    if sub:
        text(sub, x=L + 6, y=700, w=800, size=44, at=.3, kind='label', color=C['muted'], hideAt=end, anim='fade', dur=.3)
    if photo:
        v = 竖裁(photo, cx, y0=y0)
        photocard(photo, view=v, x=1000, y=0, w=920, at=0.0, rot=0, border=0, style='plain', enter='none', hideAt=end, z=8)
    sound('whoosh', 0.05)


def 放大(name, crop, at=0.0, x=None, y=None, w=None, h=None, label=None, **kw):
    """截图局部放大（原图像素 crop=[x,y,w,h]）：横条截图铺满宽度后，把关键数字那一格再放大一张，字更大、下半屏不空。"""
    e = 图(name, view=crop, at=at, x=x, y=y, w=w, h=h, sfx=None, **kw)
    if label:
        条(label, x=e['x'], y=e['y'] + e['h'] + 14, at=at + .2, size=36, sfx=None, hideAt=kw.get('hideAt'))
    return e




def 动(name, at=0.0, hideAt=None, speed=1.0, t_in=0.0, t_out=None, scrim=None, scrim_w=1300, dark=1, **kw):
    """满屏视频（示意动画 / Seedance / 新闻满屏）。scrim='left'/'bottom' 压暗保证白字可读。"""
    kw.setdefault('enter', 'none' if at < .05 else 'fade')
    e = videocard(name, x=0, y=0, w=W, h=H, at=at, t_in=t_in, t_out=t_out, speed=speed, rot=0, border=0, style='plain',
                  max_w=1920, hideAt=hideAt, sfx=None, z=6, enter_dur=.3, **kw)
    if scrim:
      for _ in range(dark):
        _S().add('scrim', W - scrim_w if scrim == 'right' else 0, 0 if scrim != 'bottom' else 560,
                 scrim_w if scrim in ('left', 'right') else W, H if scrim != 'bottom' else H - 560,
                 at=at, cls=scrim, anim='fade', dur=.3, z=7, hideAt=hideAt)
    return e


def 视频(name, at=0.0, x=None, y=None, w=None, h=None, box=(L, TOP, R - L, BOTTOM - TOP), view=None, src=None, hideAt=None,
       speed=1.0, t_in=0.0, t_out=None, **kw):
    """视频卡：按比例放进 box 最大（默认整个内容区，居中）；src='来源：…' 在卡片右下角下方小字。"""
    q = vseq(name, t_in, t_out, max_w=1920)
    v = view or [0, 0, q['w'], q['h']]
    ar = v[2] / v[3]
    bh = box[3] - (36 if src else 0)
    if w is None and h is None:
        w = min(box[2], bh * ar)
    elif w is None:
        w = h * ar
    h = w / ar
    if x is None:
        x = box[0] + (box[2] - w) / 2
    if y is None:
        y = box[1] + (bh - h) / 2
    kw.setdefault('enter', 'fade')
    e = videocard(name, view=v, x=round(x, 1), y=round(y, 1), w=round(w, 1), h=round(h, 1), at=at, t_in=t_in, t_out=t_out,
                  speed=speed, rot=0, border=0, style='plain', max_w=1920, hideAt=hideAt, sfx=None, enter_dur=.35, **kw)
    if src:
        text(src, x=x, y=y + h + 4, w=900, size=26, at=at, kind='smalllabel', anim='fade', dur=.3, z=21, hideAt=hideAt)
    return e


def 推文(zh, ja, 日期, x=L, y=None, w=1000, at=0.1, zh_size=52, ja_size=28, who='网友', h=None, **kw):
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
    if y is None:                                       # v7c：默认在内容区垂直居中
        y = max(TOP, round((TOP + BOTTOM) / 2 - h / 2))
    kw.setdefault('sfx', 'paper')
    hid = kw.get('hideAt')
    p = panel('', '', x=x, y=y, w=w, h=h, at=at, kind='navy', anim='fade', dur=.3, **kw)
    text(f'{who} · {日期}', x=x + 44, y=y + 34, w=w - 88, size=34, at=at, kind='label', color=C['muted'], anim='fade', dur=.3, z=16, hideAt=hid)
    text(zh, x=x + 44, y=y + 104, w=w - 88, size=zh_size, at=at, kind='label', cls='big', anim='fade', dur=.3, z=16, hideAt=hid)
    if ja:
        text(ja, x=x + 44, y=y + 104 + lines * hz + 14, w=w - 88, size=ja_size, at=at, kind='label', color=C['muted'],
             anim='fade', dur=.3, z=16, hideAt=hid)
    return p




# ======================= 难波漫游：通用「分段」镜头（2026-11-16） =======================
# 镜(sid, 段表, 章=None)：一个镜头按旁白分成几段，每段一张图 / 一段视频 + 标题 + 字条。
#   段 = (起, 素材, 标题, 字条=None, 选项={})
#   起：0 / 秒数 / '旁白里的词'（念到这个词时换段）/ ('词', 偏移秒)
#   素材：'x.jpg' 满屏（原图宽 ≥ 1300 且横图）或纸面大图（老明信片、竖图）；['a.jpg','b.jpg'] 并排；'x.mp4' 满屏视频；None 沿用上一段的图
#   选项：fit / full 强制；view=[x,y,w,h]；大='照片上的大字'（只在满屏段用）；大时、条时='词'；注='左下小字'；
#        scrim、dark；t_in、speed（视频）；文='竖图左侧大字'；圈=[([x,y,w,h], '词')]、划=[…]（原图像素）
import glob as _glob, os as _os
from v6lib import ASSET_DIRS as _AD, circle


def F(prefix):
    """按文件名开头找素材（素材目录里唯一匹配），返回文件名。"""
    if prefix.endswith('.mp4'):
        return prefix
    hits = []
    for d in _AD:
        hits += [_os.path.basename(x) for x in _glob.glob(str(d) + '/' + _glob.escape(prefix) + '*') if x.lower().endswith(('.jpg', '.jpeg', '.png'))]
    if not hits:
        raise FileNotFoundError('找不到素材：' + prefix)
    return sorted(hits)[0]


def _时(x, 默认=0.0):
    from v6lib import Tw
    if x is None:
        return 默认
    if isinstance(x, (int, float)):
        return float(x)
    off = 0.0
    if isinstance(x, tuple):
        x, off = x
        if isinstance(x, (int, float)):
            return max(0.0, float(x) + off)
    try:
        return max(0.0, Tw(x) + off)
    except Exception:
        print(f'  ⚠️ 找不到词「{x}」→ 用默认 {默认:.1f}s')
        return 默认


def _后面有圈(段表, i):
    j = i + 1
    while j < len(段表) and 段表[j][1] is None:
        if len(段表[j]) > 4 and (段表[j][4].get('圈') or 段表[j][4].get('划')):
            return True
        j += 1
    return False


def 镜(sid, 段表, 章=None):
    s = 开(sid, None, photo=True, chapter_mark=False)
    dur = s.dur
    t0 = 0.0
    if 章:
        章卡(章[0], 章[1], photo=F(章[2]), cx=章[3] if len(章) > 3 else .5)
        t0 = 2.6
    n = len(段表)
    starts = []
    for i, g in enumerate(段表):
        if i == 0:
            starts.append(t0); continue
        st = _时(g[0], t0 + (dur - t0) * i / n)
        starts.append(min(max(st, starts[-1] + 2.0), dur - 1.5))
    full = True
    ref = None
    for i, g in enumerate(段表):
        材, 标 = g[1], g[2]
        条文 = g[3] if len(g) > 3 else None
        o = g[4] if len(g) > 4 else {}
        at = starts[i]
        end = starts[i + 1] if i + 1 < n else None
        j = i + 1
        while j < n and 段表[j][1] is None:
            j += 1
        iend = starts[j] if j < n else None                       # 图一直留到下一张图上来
        文模式 = False
        if 材 is not None:
            if isinstance(材, list):
                full = False
                k_n = len(材); gap = 24; bw = (1620 - gap * (k_n - 1)) / k_n
                for k, m in enumerate(材):
                    ref = 图(F(m), at=at + .12 * k, box=(L + k * (bw + gap), TOP, bw, BOTTOM - TOP), hideAt=iend, sfx='paper' if k == 0 and at > .3 else None)
            elif 材.endswith('.mp4'):
                full = True
                _ep = _os.path.expanduser('~/video-projects/map-explainer/episodes/abeno/')
                _log = open(_ep + '渲染日志.txt', encoding='utf-8', errors='ignore').read() if _os.path.exists(_ep + '渲染日志.txt') else ''
                if ('DONE ' + 材[:-4]) not in _log:          # 文件在但没写完也算没渲完
                    print('  ⏳ 三维镜头还没渲完，先用 A1 占位：', 材); 材 = 'A1-路口向北推近.mp4'
                动(材, at=at, hideAt=iend, t_in=o.get('t_in', 0), speed=o.get('speed', .85), scrim=o.get('scrim', 'left'), scrim_w=o.get('scrim_w', 1150), dark=o.get('dark', 1))
                if at > .3:
                    sound('whoosh', at)
            else:
                name = F(材)
                _, iw, ih = asset(name)
                v = o.get('view') or ([20, 80, 1480, 880] if name.endswith('旧绘.png') else None)
                vw, vh = (v[2], v[3]) if v else (iw, ih)
                full = bool(o.get('full', vw >= 1200 and vw / vh >= 1.2 and not name.endswith('旧绘.png'))) and not o.get('fit')
                if not full and not o.get('文') and v is None and 1.3 <= iw / ih < 1.78:      # 老明信片：上下各裁一点，画面宽到 ≥ 60%
                    ar2 = min(1.78, iw / ih * 1.16); nh = iw / ar2; v = [0, round((ih - nh) / 2), iw, round(nh)]
                if full:
                    ref = 满屏(name, view=v, at=at, hideAt=iend, scrim=o.get('scrim', 'left'), dark=o.get('dark', 1), scrim_w=o.get('scrim_w', 1300))
                    if at > .3:
                        sound('paper', at)
                elif o.get('文'):
                    文模式 = True
                    ref = 图(name, view=v, at=at, box=(990, TOP, 780, BOTTOM - TOP), hideAt=iend, sfx='paper' if at > .3 else None)
                    字(o['文'], x=L, y=300, w=820, size=o.get('文字', 84), at=at + .3, big=True, hideAt=iend, color=o.get('文色'))
                else:
                    v0 = v or [0, 0, iw, ih]
                    z = .06                                                   # 纸面大图也慢慢推近一点，别完全静止
                    v1 = [round(v0[0] + v0[2] * z / 2, 1), round(v0[1] + v0[3] * z / 2, 1), round(v0[2] * (1 - z), 1), round(v0[3] * (1 - z), 1)]
                    ref = 图(name, view=v0, at=at, box=(L, TOP, R - L, BOTTOM - TOP), hideAt=iend, sfx='paper' if at > .3 else None,
                            views=[{'at': at, 'dur': .05, 'view': v0}, {'at': at + .4, 'dur': max(2.0, (iend or dur) - at - .5), 'view': v1}] if not o.get('圈') and not o.get('划') and not _后面有圈(段表, i) else None)
        角标(at, hideAt=end, photo=full)
        if 标:
            题(标, at=at, hideAt=end, photo=full, size=64 if len(标) <= 19 else 54)
        if 条文:
            ct = max(min(_时(o.get('条时'), at + .9), (end or dur) - 2.8), at + .2)
            if 文模式 or (not full and 材 is None and i and len(段表[i - 1]) > 4 and 段表[i - 1][4].get('文')):
                字(条文, x=L, y=660, w=800, size=42, at=ct, hideAt=end)
            else:
                条(条文, y=772 if full else 782, at=ct, size=o.get('条字', 40), hideAt=end)
        if o.get('大') and full:
            bt = max(_时(o.get('大时'), at + .5), at + .1)
            字(o['大'], x=150, y=o.get('大y', 330), w=1400, size=o.get('大字', 96), at=bt, big=True, photo=True, hideAt=end)
            sound('pop', bt)
        if o.get('注'):
            text(o['注'], x=152, y=136, w=1400, size=34, at=at, kind='label', cls='onphoto' if full else None, anim='fade', dur=.3, hideAt=end)
        if ref is not None:
            for rect, w in o.get('圈', []):
                circle(ref, rect, at=_时(w, at + 1), hideAt=iend, sfx='marker')
            for rect, w in o.get('划', []):
                circle(ref, rect, at=_时(w, at + 1), shape='box', hideAt=iend, sfx='marker')
    return s


# ======================= 阿倍野再开发：本期专用（2026-11-17，大时风格第一期） =======================
from v6lib import docpage, arrow, Tw, T
AMBER = '#FFB23E'


def 表(数, x=1050, y=250, w=700, at=0.0, 灯='跳表', 单位='亿日元', 标='利息', from_=0, dur=1.2, static=False, hideAt=None, 数时=None, 小数=0):
    """贯穿物件：计价器。图是 图解/计价器-*.png（1000×560），液晶窗里叠计数器。"""
    k = w / 1000
    photocard(F(('计价表繁-' if _os.environ.get('V6_TRAD') else '计价表-') + 灯), x=x, y=y, w=w, at=at, rot=0, border=0, style='plain', enter='fade', enter_dur=.3, sfx='click' if at > .2 else None, hideAt=hideAt, z=10, cls='noshadow')
    text(标, x=x + 90 * k, y=y + 196 * k, w=500 * k, size=max(30, 44 * k), at=at + .15, kind='label', color='#9AA39A', anim='fade', dur=.3, z=26, hideAt=hideAt)
    if 数 is not None:
        t = at + .3 if 数时 is None else 数时
        counter(数, x + 250 * k, y + 232 * k, w=650 * k, at=t, dur=dur, from_=from_, size=150 * k, color=AMBER, unit=单位, align='right', static=static,
                decimals=小数, sfx=None if static else 'tick', hideAt=hideAt)


GX, GY, GK = 260, 132, .73          # 路口图解（1920×1008 原图）放到画面上的位置和缩放


def _g(x, y):
    return GX + x * GK, GY + y * GK


def 路口(at=0.0, 图纸=None, 图纸退=None, hideAt=None):
    """贯穿物件：车站前马路两边的楼。右 HARUKAS（300 米），左 6 层商场；图纸=秒 时左边长出虚线的 63 层。"""
    photocard(F('路口图-现状'), x=GX, y=GY, w=1920 * GK, at=at, rot=0, border=0, style='plain', enter='fade' if at > .1 else 'none', enter_dur=.3, hideAt=hideAt, z=8, cls='noshadow')
    if 图纸 is not None:
        photocard(F('路口图-含图纸'), x=GX, y=GY, w=1920 * GK, at=图纸, rot=0, border=0, style='plain', enter='fade', enter_dur=.6, sfx='marker', hideAt=图纸退 or hideAt, z=9, cls='noshadow')


def 楼标(t, gx, gy, at, size=40, color=None, w=380, big=True, hideAt=None, **kw):
    x, y = _g(gx, gy)
    if _os.environ.get('V6_TRAD') and w >= 450:      # 繁体「公尺」比「米」宽，左侧大字放宽，免得折行
        w = 660
    if _os.environ.get('V6_TRAD') and w < 450 and ' · ' in t:   # 右侧窄标签：繁体变宽，拆成两行
        t = t.replace(' · ', '\n')
    return 字(t, x=x, y=y, w=w, size=size, at=at, big=big, color=color, hideAt=hideAt, **kw)


def 原文(sid, name, view, w=1180, x=None, y=150, rot=-2, 划=(), 译=None, 译时=None, 题文=None, views=None):
    """深色底 + 斜放原件 + 荧光笔（一期 2–4 屏）。划=[([x,y,w,h] 原图像素, '词' 或 秒)]"""
    s = 开(sid, None, photo=True, dark=True, chapter_mark=False)
    角标(0, photo=True)
    if 题文:
        题(题文, at=0, photo=True, size=56)
    if callable(views):
        views = views()
    if x is None:
        x = (W - w) / 2
    ref = docpage(name, view=view, x=x, y=y, w=w, at=0.05, rot=rot, keep_rot=True, enter='drop', enter_dur=.5, sfx='paper', views=views)
    for rect, wd in 划:
        highlighter(ref, rect, at=_时(wd, 2.0), sfx='marker')
    if 译:
        条(译, y=790, at=_时(译时, 1.2), size=40)
    return s, ref


def 行(label, value, y, at, color=None, x=260, vx=1180, size=58, unit='亿', static=False, bold=False, hideAt=None):
    """账本的一行：左项目、右数字。"""
    字(label, x=x, y=y, w=vx - x - 10, size=size, at=at, big=bold, hideAt=hideAt, anim='fade' if at < .1 else 'up', dur=.3)
    if value is not None:
        字(value, x=vx, y=y - 8, w=280, size=size + 14, at=at + (0 if at < .1 else .15), big=True, num=True, color=color, hideAt=hideAt, anim='fade', dur=.3)
        字(unit, x=vx + 30 + 34 * len(str(value)), y=y + 10, w=200, size=size - 12, at=at + (0 if at < .1 else .15), color=C['muted'], hideAt=hideAt, anim='fade', dur=.3)
    if at > .1:
        sound('pop', at)


def 步(items, y=330, x0=150, gap=64, h=120, size=50, color=None):
    """流程：一串方角色块，中间箭头。items=[(文字, at, 宽)]；色块宽度按字数自适应，所以 x 也按字数排。"""
    x = x0
    for i, (t, at, w) in enumerate(items):
        w = len(t) * size * 1.02 + 56
        if i:
            arrow([(x - gap + 10, y + h / 2), (x - 12, y + h / 2)], at=at - .1, dur=.25, width=6, head=18, wobble=0)
        pill(t, x, y, at=at, tone='neutral', size=size, h=h, w=w, sfx='pop')
        x += w + gap
