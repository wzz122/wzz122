# -*- coding: utf-8 -*-
"""新闻大写式人物封面：背景（AI，无人）+ 真实照片抠图（不改人脸）+ 少量大字。
   用法：python3 cover_people.py 背景.png 输出.png [--people-in-bg]
   --people-in-bg：背景里已有人物（如 Codex 整张合成版），只叠文字。"""
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance

W, H = 1280, 720
import os
P = os.path.expanduser('~/Desktop/写稿/资料/2026-09-东大新总长/封面/人物照片')
SONG = '/System/Library/Fonts/Supplemental/Songti.ttc'      # 0 = Songti SC Black
SANS = '/System/Library/Fonts/Hiragino Sans GB.ttc'          # 2 = W6
YEL, RED, WHITE, INK = (255, 214, 0), (214, 36, 36), (255, 255, 255), (18, 16, 14)

def font(p, s, i): return ImageFont.truetype(p, s, index=i)

def fit(im):
    r = max(W / im.width, H / im.height)
    im = im.resize((round(im.width * r), round(im.height * r)), Image.LANCZOS)
    x, y = (im.width - W) // 2, (im.height - H) // 2
    return im.crop((x, y, x + W, y + H))

def grade(person, warm=1.0):
    """让抠图贴近黄昏光：略降亮度、略暖、边缘羽化 1px"""
    rgb, a = person.convert('RGB'), person.getchannel('A')
    rgb = ImageEnhance.Brightness(rgb).enhance(0.93)
    r, g, b = rgb.split()
    r = r.point(lambda v: min(255, int(v * 1.03 * warm))); b = b.point(lambda v: int(v * 0.95))
    rgb = Image.merge('RGB', (r, g, b))
    a = a.filter(ImageFilter.GaussianBlur(0.8))
    out = rgb.convert('RGBA'); out.putalpha(a); return out

def shadowed(canvas, person, xy):
    """人物后面加一层柔和暗影，帮助从背景里「跳」出来"""
    sh = Image.new('RGBA', person.size, (0, 0, 0, 0))
    sh.putalpha(person.getchannel('A').point(lambda v: int(v * 0.55)).filter(ImageFilter.GaussianBlur(14)))
    canvas.alpha_composite(sh, (xy[0] + 10, xy[1] + 6)); canvas.alpha_composite(person, xy)

def text(dr, xy, s, f, fill, stroke=6, sc=INK, anchor='la'):
    dr.text(xy, s, font=f, fill=fill, stroke_width=stroke, stroke_fill=sc, anchor=anchor)

def main(src, dst, people_in_bg=False, stamp_x=290):
    bg = fit(Image.open(src).convert('RGB'))
    bg = ImageEnhance.Brightness(bg).enhance(0.92)
    cv = bg.convert('RGBA')
    if not people_in_bg:
        # 染谷：官方肖像（355px，放大有限），左侧、底边贴画面底
        so = Image.open(f'{P}/染谷-抠图.png'); so = so.crop(so.getbbox())
        so = grade(so.resize((round(so.width * 1.32), round(so.height * 1.32)), Image.LANCZOS))
        shadowed(cv, so, (28, H - so.height))
        # 藤垣：记者会照片，去掉桌上的水瓶和杯子，切在胸口
        fu = Image.open(f'{P}/藤垣-抠图.png')
        a = fu.getchannel('A'); d = ImageDraw.Draw(a)
        # 桌上的水瓶保留（擦掉会在身上留洞）；杯子在裁切线以下
        fu.putalpha(a); fu = fu.crop((250, 80, 930, 712))
        s = 690 / fu.height
        fu = grade(fu.resize((round(fu.width * s), round(fu.height * s)), Image.LANCZOS), warm=1.02)
        shadowed(cv, fu, (W - fu.width + 40, H - fu.height + 2))
    dr = ImageDraw.Draw(cv)
    # 左上角自有小标签（不用他人频道标志）
    f_tag = font(SANS, 34, 2)
    dr.rectangle([0, 26, 270, 84], fill=WHITE)
    text(dr, (22, 55), '东大总长选考', f_tag, INK, stroke=0, anchor='lm')
    # 票数：染谷 1107（黄，放在胸前、不挡脸）· 藤垣 553（白，右下）
    f_num = font(SONG, 120, 0); f_lab = font(SANS, 30, 2)
    text(dr, (30, 664), '1107票', f_num, YEL, stroke=8, anchor='lb')
    text(dr, (36, 708), '意向投票第一 · 过半数', f_lab, WHITE, stroke=5, anchor='lb')
    text(dr, (W - 36, 704), '553票', f_num, WHITE, stroke=8, anchor='rb')
    # 「多样性？」印章（红框、微倾），放在钟楼上方，不压人脸
    st = Image.new('RGBA', (430, 150), (0, 0, 0, 0)); sd = ImageDraw.Draw(st)
    sd.rounded_rectangle([6, 6, 424, 144], radius=14, outline=RED, width=10)
    sd.text((215, 76), '多样性？', font=font(SONG, 96, 0), fill=RED, anchor='mm')
    st = st.rotate(-8, expand=True, resample=Image.BICUBIC)
    cv.alpha_composite(st, (stamp_x, 96))
    cv.convert('RGB').save(dst, quality=93)

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], '--people-in-bg' in sys.argv)
