# -*- coding: utf-8 -*-
"""封面排版：AI 背景图 + 本地清晰中文标题（与视频同款字体），输出 1280×720 YouTube 缩略图。
   用法：python3 cover_compose.py 背景.png 输出.png [dark|light]
   dark：深色背景，白字；light：米色纸背景，黑字。"""
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1280, 720
SONG = '/System/Library/Fonts/Supplemental/Songti.ttc'      # index 0 = Songti SC Black（视频标题字体）
SANS = '/System/Library/Fonts/Hiragino Sans GB.ttc'          # index 2 = W6
YEL, RED = (255, 214, 0), (214, 40, 40)

def font(path, size, idx): return ImageFont.truetype(path, size, index=idx)

def cover_crop(im):
    r = max(W / im.width, H / im.height)
    im = im.resize((round(im.width * r), round(im.height * r)), Image.LANCZOS)
    x = im.width - W                                      # 主体在右侧：靠右裁
    y = (im.height - H) // 2
    return im.crop((x, y, x + W, y + H))

def main(src, dst, theme='dark', hot=None):
    bg = cover_crop(Image.open(src).convert('RGB'))
    ink = (255, 255, 255) if theme == 'dark' else (24, 22, 20)
    # 左侧压暗/提亮渐变，保证标题对比度
    shade = Image.new('L', (W, H), 0); d = ImageDraw.Draw(shade)
    for x in range(W):
        a = 210 if x < 520 else max(0, int(210 * (1 - (x - 520) / 300)))
        d.line([(x, 0), (x, H)], fill=a)
    tint = Image.new('RGB', (W, H), (12, 12, 14) if theme == 'dark' else (236, 229, 216))
    bg = Image.composite(tint, bg, shade)
    dr = ImageDraw.Draw(bg)
    X = 64
    def put(text, f, y, fill, hl=None, gap=0):
        """按实际字形边界放置：y 是这一行字形的上沿；返回字形下沿"""
        l, t, r, b = dr.textbbox((0, 0), text, font=f)
        if hl:
            dr.rectangle([X - 8, y - 10, X + (r - l) + 14, y + (b - t) + 12], fill=hl)
        dr.text((X - l, y - t), text, font=f, fill=fill)
        return y + (b - t)
    # 小标
    f_k = font(SANS, 50, 2)
    yb = put('东大首位女总长', f_k, 62, ink)
    dr.rectangle([X - 22, 62, X - 12, yb], fill=RED)
    # 主标题三行：1107票 / 输给了 / 553票，行间固定留白
    f_big = font(SONG, 146, 0); f_mid = font(SONG, 90, 0)
    y = put('1107票', f_big, yb + 42, ink)
    y = put('输给了', f_mid, y + 36, (20, 18, 16), hl=YEL)
    # 553 的颜色：默认与 1107 同色（批评对象是程序，不把负面色落在获胜者身上）
    y = put('553票', f_big, y + 40, hot or ink)
    # 底部一句（与上面至少留 34px）
    f_s = font(SONG, 54, 0)
    put('“综合考虑”的黑箱', f_s, max(y + 30, 600), ink)
    bg.save(dst, quality=95)

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else 'dark')
    if sys.argv[2].endswith('.png'):
        Image.open(sys.argv[2]).convert('RGB').save(sys.argv[2][:-4] + '.jpg', quality=92)
