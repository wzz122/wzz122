# -*- coding: utf-8 -*-
"""把竖长的资料截图重新取景成横图（默认 1.6:1），画中画里就不用裁切：
   以黄色高亮为中心截一段正文 + 原样接回底部的【译】说明条。
   用法：python3 reframe.py 输入.png 输出.png [first|last|top] [宽高比]
     first/last：有多处高亮时对准第一处/最后一处；top：不管高亮，从顶部取
"""
import sys
from PIL import Image

BAND_BG = (248, 244, 235)          # imgtool 说明条的底色


def near(p, q, tol=4):
    return all(abs(a - b) <= tol for a, b in zip(p, q))


def band_top(im):
    """从底往上，第一处不是说明条底色的行 = 说明条上沿（分隔线）"""
    w, h = im.size
    y = h - 1
    while y > 0 and near(im.getpixel((5, y)), BAND_BG):
        y -= 1
    return y if y < h - 20 else h   # 没有说明条就返回 h


def highlight_rows(im, y_end):
    """黄色高亮所在的行，按间隔聚成若干段 [(top,bottom),…]"""
    w, _ = im.size
    rows = []
    for y in range(0, y_end, 2):
        n = 0
        for x in range(0, w, 6):
            r, g, b = im.getpixel((x, y))
            if r > 235 and 200 < g < 245 and b < 150:
                n += 1
        if n >= 4:
            rows.append(y)
    segs = []
    for y in rows:
        if segs and y - segs[-1][1] <= 40:
            segs[-1][1] = y
        else:
            segs.append([y, y])
    return [tuple(s) for s in segs]


def reframe(src, dst, mode='first', ar=1.6):
    im = Image.open(src).convert('RGB')
    w, h = im.size
    bt = band_top(im)
    body, band = im.crop((0, 0, w, bt)), im.crop((0, bt, w, h))
    H = round(w / ar)
    win = H - band.size[1]
    if bt <= win:                      # 本来就够横，不用动
        im.save(dst); return 'keep'
    segs = [] if mode == 'top' else highlight_rows(im, bt)
    if segs:
        t, b = segs[-1] if mode == 'last' else segs[0]
        c = (t + b) / 2
        y0 = int(c - win * 0.42)       # 高亮放在窗口偏上的位置，下面多留点上下文
        if b - t > win: y0 = t - 20
    else:
        y0 = 0
    y0 = max(0, min(y0, bt - win))
    out = Image.new('RGB', (w, H), BAND_BG)
    out.paste(body.crop((0, y0, w, y0 + win)), (0, 0))
    out.paste(band, (0, win))
    out.save(dst)
    return f'y0={y0} win={win} segs={segs}'


if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    mode = sys.argv[3] if len(sys.argv) > 3 else 'first'
    ar = float(sys.argv[4]) if len(sys.argv) > 4 else 1.6
    print(reframe(src, dst, mode, ar))
