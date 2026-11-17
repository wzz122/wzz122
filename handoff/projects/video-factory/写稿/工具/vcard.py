# -*- coding: utf-8 -*-
"""竖屏截图卡：从原始截图（raw）重新取景，做成适合 1080×1920 竖屏的「截图 + 大字译文」卡片。
   用法：python3 vcard.py 配置.json [只做的键 …]
   配置（JSON）：{"out_dir": "...", "raw_dir": "...", "cards": {键: 卡片}}
   卡片：
     "out":   输出文件名（如 东大-W01-东大官网-选出藤垣-竖.png）
     "rows":  [[片段, 片段…], …]  每行内的片段左右并排，行与行上下叠放
              片段 = {"src": "raw/W01.png", "box": [x0, y0, x1, y1], "fade": true(右边渐隐，表示句子还在继续)}
              或 {"src": …, "stack": [[框], [框]]}：几块上下拼成一块
     "sep":   true = 行与行之间画一条虚线，表示中间有省略
     "cap":   中文译文（{…} 里的字不拆行，如 {上野千鹤子}；写了 | 就按 | 手动断行，放不下自动缩字号）
     "src":   来源
     "maxh":  卡片最大显示高度（默认 760，竖屏内容区里标题占两行时也放得下）
   输出宽 1840px（= 竖屏上显示 920px 的 2 倍，放大推镜也清楚）。只用 PIL，不加载模型。"""
import sys, json, os
from PIL import Image, ImageDraw, ImageFont

OUTW, K = 1840, 2                      # 输出宽、相对显示尺寸的倍数
SANS = '/System/Library/Fonts/Hiragino Sans GB.ttc'   # 0 = W3, 2 = W6
BAND_BG, LINE, RED = (248, 244, 235), (201, 192, 174), (178, 58, 37)
INK, MUTED = (28, 26, 23), (141, 132, 116)
NO_START = set('，。、；：！？）」』”’%·…—,.;:!?)]')
NO_END = set('（「『“‘([')


def font(i, s): return ImageFont.truetype(SANS, s, index=i)


def tokens(s):
    """拆成不可再分的小块：{…} 整体、连续的英文数字、破折号对，其余逐字"""
    out, i = [], 0
    while i < len(s):
        c = s[i]
        if c == '{':
            j = s.index('}', i); out.append(s[i + 1:j]); i = j + 1; continue
        if c.isascii() and (c.isalnum() or c in '.%'):
            j = i
            while j < len(s) and s[j].isascii() and (s[j].isalnum() or s[j] in '.,%–-'): j += 1
            out.append(s[i:j]); i = j; continue
        if s.startswith('——', i): out.append('——'); i += 2; continue
        out.append(c); i += 1
    # 数字连着单位（2026年、553票、第32代）不拆开
    merged = []
    for t in out:
        if merged and t in UNIT and merged[-1][-1:].isdigit(): merged[-1] += t; continue
        if merged and t[:1].isdigit() and merged[-1] == '第': merged[-1] += t; continue
        merged.append(t)
    return merged


UNIT = set('年月日号票名人倍次代轮位届%')


def wrap(s, f, w):
    """按像素宽折行；最后一行太短（≤3 字）时，把行宽收窄一点重排，免得两三个字孤零零一行"""
    best = wrap1(s, f, w)
    if len(best) > 1 and len(best[-1]) <= 3:
        for k in range(1, 9):
            alt = wrap1(s, f, w * (1 - 0.025 * k))
            if len(alt) == len(best) and len(alt[-1]) > 3: return alt
    return best


def wrap1(s, f, w):
    """按像素宽折行，遵守行首/行尾禁则：标点不放行首、开引号不留行尾（按整块挪，不拆 {…} 和数字）"""
    lines, cur = [], []
    for t in tokens(s):
        if not cur or f.getlength(''.join(cur) + t) <= w:
            cur.append(t); continue
        nxt = [t]
        while len(cur) > 1 and (nxt[0][0] in NO_START or cur[-1][-1] in NO_END):
            nxt.insert(0, cur.pop())
        lines.append(''.join(cur)); cur = nxt
    if cur: lines.append(''.join(cur))
    return lines


def page_color(im):
    w, h = im.size
    px = [im.getpixel((x, y)) for x in (2, w - 3) for y in (2, h - 3)]
    return max(set(px), key=px.count)


def band(cap, src, w):
    fc, fs = font(2, 34 * K), font(0, 23 * K)
    pad, bar = 28 * K, 6 * K
    tw = w - pad * 2 - bar - 14 * K
    if '|' in cap:                                 # 手动断行：每行按写的断；有一行放不下就整体缩小字号
        lines = [l.replace('{', '').replace('}', '') for l in cap.split('|')]
        while max(fc.getlength(l) for l in lines) > tw and fc.size > 28 * K:
            fc = font(2, fc.size - K)
        if max(fc.getlength(l) for l in lines) > tw:  # 缩到 28px 还放不下：恢复 34px，超长的那几行按宽度自动折行（以前会出界被裁掉）
            fc = font(2, 34 * K)
            lines = [x for l in cap.split('|') for x in (wrap(l, fc, tw) if fc.getlength(l.replace('{', '').replace('}', '')) > tw
                                                          else [l.replace('{', '').replace('}', '')])]
            print(f'   译文超长行已自动折行：共 {len(lines)} 行')
        elif fc.size < 34 * K: print(f'   译文字号缩到 {fc.size // K}px：{max(lines, key=fc.getlength)}')
    else:
        lines = wrap(cap, fc, tw) if cap else []
    lh = round(fc.size * 1.5)
    h = 22 * K + len(lines) * lh + (12 * K + 23 * K * 1.4 if src else 0) + 20 * K
    im = Image.new('RGB', (w, round(h)), BAND_BG); d = ImageDraw.Draw(im)
    d.line([(0, 0), (w, 0)], fill=LINE, width=2 * K)
    y = 22 * K
    if lines:
        d.rectangle([pad, y + 6 * K, pad + bar, y + len(lines) * lh - 8 * K], fill=RED)
        for ln in lines:
            d.text((pad + bar + 14 * K, y + lh / 2), ln, font=fc, fill=INK, anchor='lm'); y += lh
    if src:
        d.text((pad + bar + 14 * K, y + 12 * K), src, font=fs, fill=MUTED, anchor='la')
    return im


def card(c, raw_dir):
    rows = c['rows']
    def part(p):                                   # 一个片段；"stack" = 几块上下拼成一块（如表头 + 后半张表）
        src = Image.open(os.path.join(raw_dir, p['src'])).convert('RGB')
        boxes = p.get('stack') or [p['box']]
        ims = [src.crop(tuple(b)) for b in boxes]
        out = Image.new('RGB', (max(i.width for i in ims), sum(i.height for i in ims)), (255, 255, 255))
        y = 0
        for i in ims: out.paste(i, (0, y)); y += i.height
        return out
    imgs = [[part(p) for p in r] for r in rows]
    bg = tuple(c['bg']) if c.get('bg') else page_color(max((i for r in imgs for i in r), key=lambda i: i.width * i.height))
    gap, sepH, padx = 24, 64, 20                   # 原图像素：并排间距、虚线行高、左右留白
    rw = [sum(i.width for i in r) + gap * (len(r) - 1) for r in imgs]
    rh = [max(i.height for i in r) for r in imgs]
    W0 = max(rw) + padx * 2
    H0 = sum(rh) + (sepH if c.get('sep') else gap) * (len(imgs) - 1) + padx
    b = band(c.get('cap', ''), c.get('src', ''), OUTW)
    maxh = c.get('maxh', 760) * K - b.height
    s = min(OUTW / W0, maxh / H0)
    shot = Image.new('RGB', (OUTW, round(H0 * s)), bg)
    d = ImageDraw.Draw(shot)
    y = padx / 2
    for ri, r in enumerate(imgs):
        x = (OUTW - rw[ri] * s) / 2
        for pi, im in enumerate(r):
            t = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
            fd = rows[ri][pi].get('fade')
            if fd:                                     # 右边渐隐：句子没截完，用渐隐表示「下文略」（数字 = 渐隐宽度，原图像素）
                fw = round((fd if fd is not True else 120) * s)
                ov = Image.new('RGB', (fw, t.height), page_color(im))
                mask = Image.linear_gradient('L').rotate(90, expand=True).resize((fw, t.height))   # 左 0 → 右 255
                t.paste(ov, (t.width - fw, 0), mask)
            shot.paste(t, (round(x), round(y)))
            x += (im.width + gap) * s
        y += rh[ri] * s
        if ri < len(imgs) - 1:
            if c.get('sep'):
                ym = y + sepH * s / 2
                for xx in range(round(OUTW * 0.08), round(OUTW * 0.92), 22 * K):
                    d.line([(xx, ym), (xx + 11 * K, ym)], fill=(196, 188, 172), width=2 * K)
                y += sepH * s
            else:
                y += gap * s
    out = Image.new('RGB', (OUTW, shot.height + b.height), bg)
    out.paste(shot, (0, 0)); out.paste(b, (0, shot.height))
    return out, s


if __name__ == '__main__':
    cfg = json.load(open(sys.argv[1], encoding='utf-8'))
    only = set(sys.argv[2:])
    for k, c in cfg['cards'].items():
        if only and k not in only: continue
        im, s = card(c, cfg['raw_dir'])
        p = os.path.join(cfg['out_dir'], c['out'])
        im.save(p)
        print(f'{k}: {im.width}x{im.height}（显示 {im.width // K}x{im.height // K}），原图缩放 {s / K:.2f}', p)
