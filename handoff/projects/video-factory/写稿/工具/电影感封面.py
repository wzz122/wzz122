"""电影感封面（默认封面版式，2026-10-16 起）：用户说「就像大時叔叔封面图一样」。
写实电影感大图（Codex image_gen）+ 底部两行白色超粗斜体大字（黑色外发光）+ 标题上方一行彩色小字；
可选：把真人的真实新闻 / 节目截帧抠图叠在画面一侧（不改人脸、不用 AI 生成真人脸）。画面上不写出处、不放标识、不写 AI 示意。
来历：爱的村庄（2026-10-14，写实大图 + 粉色节目名）→ 股神水谷（2026-10-16，加真人截帧，用户去掉了出处小字）。

用法（读本期 项目.json 的「电影感封面」，路径都按 项目.json 所在的 画面v6/ 目录算）：
  python3 ~/Desktop/写稿/工具/电影感封面.py 样片/<期>/画面v6/项目.json [--只出 yt,视频号3x4]
「电影感封面」字段：
  背景        Codex 出的写实大图（16:9，人物只背影、无文字；主体在上半部偏右，下方约 35% 暗而简单）
  行1 / 行2   两行白色大字（第二行更大）；系列 = 上方彩色小字（空 = 不放），系列色 = [r,g,b]
  文件名      输出前缀，例 "2026-10-16-股神水谷-v6-封面"（会出 -yt / -16x9 / -视频号4x3 / -视频号3x4 / -视频号9x16）
  焦点x       横版裁切焦点（0–1，默认 0.5）；竖版焦点x 竖版两个尺寸的焦点（默认同 焦点x，人物被切掉就往主体那边调）
  人物（可省） {"抠图": "封面/人物-抠图.png", "裁掉底部": 780, "布局": {"yt": [人物高占比, 人物中心x, 背景焦点], ...}}
              抠图：先把截帧裁到只剩这个人，再 `/usr/bin/python3 ~/.local/bin/mac-heavy-job.py -- ~/Desktop/写稿/工具/cutout 裁切.png 抠图.png`
              （macOS Vision 前景分割，图像推理走重任务锁）；有真人时背景选「没有人物」的那张，别让 AI 背影和真人同框。
  输出目录    默认 "封面/成品"
同时出 <文件名>-封面检查.jpg（5 个尺寸并排 + yt 缩到 246×138、168×94 的小图），交付前打开看一遍。
"""
import argparse, json, os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

# 2026-11-08：按 v7b 规范（画面硬规则第 8 条）默认换成思源黑体 Heavy（OFL，可商用）；找不到才退回兰亭黑
_思源 = os.path.expanduser('~/Desktop/视频工厂/模板-v6/工程/engine/assets/SourceHanSansCN-Heavy.otf')
if os.path.exists(_思源):
    字体, 字体序号 = _思源, 0
else:
    字体 = '/System/Library/AssetsV2/com_apple_MobileAsset_Font8/f14049099a04e570b893c01d9a4cd71f87c9e8d8.asset/AssetData/Lantinghei.ttc'
    字体序号 = 2  # Lantinghei SC Heavy
行1 = ''
行2 = ''
标签 = ''  # 空 = 不放左上标签（用户 2026-10-14：不要红色方框）
系列 = ''
系列色 = (255, 206, 64)
名 = '封面'
尺寸 = {'yt': (1280, 720), '16x9': (1920, 1080), '视频号4x3': (1440, 1080), '视频号3x4': (1080, 1440), '视频号9x16': (1080, 1920)}
斜切 = 0.18  # 字向右倾

def 字层(text, px, fill=(255, 255, 255), 倍=3):
    """先按 3 倍尺寸画字、做发光，最后缩回原尺寸，边缘更锐利。
    汉字不加描边（兰亭黑 Heavy 已够粗，再描边会把「翻」「啥」这类密字的空隙填死、发糊）。"""
    P = px * 倍
    f = ImageFont.truetype(字体, P, index=字体序号)
    gap = int(P * .03)
    空 = int(P * .22)  # 空格宽度
    top = min(f.getbbox(c)[1] for c in text if c != ' ')
    bot = max(f.getbbox(c)[3] for c in text if c != ' ')
    h = bot - top
    w = sum(空 if c == ' ' else f.getbbox(c)[2] - f.getbbox(c)[0] + gap for c in text) + P // 8
    pad = int(P * .5)
    W, H = w + pad * 2 + int(h * 斜切), h + pad * 2
    a = Image.new('L', (W, H), 0)
    d, x = ImageDraw.Draw(a), pad
    假名 = lambda c: '\u3040' <= c <= '\u30ff'
    for i, c in enumerate(text):
        if c == ' ':
            x += 空
            continue
        cb = f.getbbox(c)
        k = 假名(c)  # 兰亭黑的假名笔画偏细：只给假名加粗描边
        d.text((x - cb[0], pad - top), c, font=f, fill=255, stroke_width=P // 17 if k else 0, stroke_fill=255)
        nxt = text[i + 1] if i + 1 < len(text) else ''
        x += cb[2] - cb[0] + (int(P * .015) if k and 假名(nxt) else gap)
    a = a.transform(a.size, Image.AFFINE, (1, 斜切, -斜切 * H, 0, 1, 0), Image.BICUBIC)
    a = a.crop(a.getbbox())
    pad2 = int(P * .45)
    A = Image.new('L', (a.width + pad2 * 2, a.height + pad2 * 2), 0)
    A.paste(a, (pad2, pad2))
    out = Image.new('RGBA', A.size, (0, 0, 0, 0))
    zero = Image.new('L', A.size, 0)
    # 黑色外发光（两层：宽而淡 + 窄而浓）
    for r, k in ((P * .22, .85), (P * .07, 1.0)):
        g = A.filter(ImageFilter.GaussianBlur(r)).point(lambda v, k=k: min(255, int(v * 1.6 * k)))
        out.alpha_composite(Image.merge('RGBA', (zero, zero, zero, g)))
    # 细的深色轮廓：把字和背景切开，不吃进字里
    n = max(3, int(P * .018) * 2 + 1)
    edge = A.filter(ImageFilter.MaxFilter(n))
    out.alpha_composite(Image.merge('RGBA', (Image.new('L', A.size, 20), Image.new('L', A.size, 20), Image.new('L', A.size, 26), edge)))
    out.alpha_composite(Image.merge('RGBA', (Image.new('L', A.size, fill[0]), Image.new('L', A.size, fill[1]), Image.new('L', A.size, fill[2]), A)))
    out = out.resize((out.width // 倍, out.height // 倍), Image.LANCZOS)
    return out, pad2 // 倍


def 标签层(px):
    f = ImageFont.truetype(字体, px, index=字体序号)
    bb = f.getbbox(标签)
    w, h = bb[2] - bb[0], bb[3] - bb[1]
    px_pad, py_pad = int(px * .55), int(px * .38)
    im = Image.new('RGBA', (w + px_pad * 2, h + py_pad * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, im.width - 1, im.height - 1), radius=int(px * .28), fill=(150, 18, 24, 235))
    d.text((px_pad - bb[0], py_pad - bb[1]), 标签, font=f, fill=(255, 255, 255))
    return im


def 铺底(bg, W, H, fx):
    """横图：按焦点裁满；竖图：上方放原图（裁到焦点），下方用同图放大模糊延伸。"""
    r = W / H
    if r >= 1.2:
        s = max(W / bg.width, H / bg.height)
        im = bg.resize((round(bg.width * s), round(bg.height * s)), Image.LANCZOS)
        x = int((im.width - W) * fx)
        return im.crop((x, (im.height - H) // 2, x + W, (im.height - H) // 2 + H))
    # 竖图
    base = bg.resize((round(bg.width * H / bg.height), H), Image.LANCZOS)
    x = int((base.width - W) * fx)
    canvas = base.crop((x, 0, x + W, H)).filter(ImageFilter.GaussianBlur(28))
    canvas = Image.blend(canvas, Image.new('RGB', canvas.size, (0, 0, 0)), .45)
    # 主图：宽度适当放大并按焦点裁，放在上部
    top_h = int(H * (.66 if r < .7 else .80))
    s = max(W / bg.width, top_h / bg.height)
    im = bg.resize((round(bg.width * s), round(bg.height * s)), Image.LANCZOS)
    x = int((im.width - W) * fx)
    im = im.crop((x, 0, x + W, top_h))
    m = Image.new('L', im.size, 255)
    fade = int(top_h * .22)
    for y in range(fade):
        ImageDraw.Draw(m).line((0, top_h - 1 - y, W, top_h - 1 - y), fill=int(255 * y / fade))
    canvas.paste(im, (0, 0), m)
    return canvas


def 合成(bg, W, H, fx):
    im = 铺底(bg, W, H, fx).convert('RGBA')
    # 底部压暗渐变
    g = Image.new('L', (1, H))
    for y in range(H):
        t = max(0, (y / H - .45) / .55)
        g.putpixel((0, y), int(215 * t ** 1.4))
    im.alpha_composite(Image.merge('RGBA', (*[Image.new('L', (W, H), 0)] * 3, g.resize((W, H)))))
    竖 = W / H < 1.2
    unit = W if 竖 else min(H, W * 9 / 16)
    l1, p1 = 字层(行1, int(unit * (.165 if 竖 else .140)))
    l2, p2 = 字层(行2, int(unit * (.205 if 竖 else .175)))
    maxw = int(W * .92)
    widest = max(l1.width - 2 * p1, l2.width - 2 * p2)   # 两行里更宽的那行也要放得下（本期第一行比第二行长）
    if widest > maxw:
        k = maxw / widest
        l1 = l1.resize((int(l1.width * k), int(l1.height * k)), Image.LANCZOS); p1 = int(p1 * k)
        l2 = l2.resize((int(l2.width * k), int(l2.height * k)), Image.LANCZOS); p2 = int(p2 * k)
    bottom = H - int(H * (.16 if W / H < .7 else .09 if 竖 else .07))
    y2 = bottom - (l2.height - p2)
    x2 = (W - (l2.width - 2 * p2)) // 2 - p2
    gap = int(unit * .028)
    y1 = y2 + p2 - gap - (l1.height - p1)          # 第一行贴在第二行上方
    x1 = (W - (l1.width - 2 * p1)) // 2 - p1          # 两行都左右居中
    im.alpha_composite(l1, (max(0, x1), y1 - p1))
    im.alpha_composite(l2, (x2, y2 - p2))
    if 系列:
        lt, pt = 字层(系列, int(unit * (.100 if 竖 else .086)), fill=系列色)
        k = l1.height / max(1, 字层(行1, int(unit * (.165 if 竖 else .140)))[0].height)  # 跟标题同比例缩放
        if k < 1:
            lt = lt.resize((int(lt.width * k), int(lt.height * k)), Image.LANCZOS); pt = int(pt * k)
        h1 = l1.height - 2 * p1
        xt = max(0, x1) + p1 + int(h1 * 斜切 * .8) - pt   # 左边顺着斜体的倾斜对齐第一行
        room = int(W * .96) - (xt + pt)                     # 小字比第一行长时，竖版右边会被切：放不下就等比缩小（2026-10-28 日本桥）
        if lt.width - 2 * pt > room > 0:
            k2 = room / (lt.width - 2 * pt)
            lt = lt.resize((int(lt.width * k2), int(lt.height * k2)), Image.LANCZOS); pt = int(pt * k2)
        yt = y1 - int(unit * .018) - (lt.height - 2 * pt)  # 贴在第一行上方
        im.alpha_composite(lt, (xt, yt - pt))
    if 标签:
        tag = 标签层(int(unit * (.034 if 竖 else .042)))
        m = int(unit * .035)
        im.alpha_composite(tag, (m, m))
    return im.convert('RGB')



默认人物布局 = {'yt': (.98, .81, .45), '16x9': (.98, .81, .45), '视频号4x3': (.92, .70, .40),
              '视频号3x4': (.62, .58, .45), '视频号9x16': (.48, .58, .45)}


def 读人物(path, 裁掉底部=None):
    fig = Image.open(path).convert('RGBA')
    if 裁掉底部:
        fig = fig.crop((0, 0, fig.width, min(fig.height, int(裁掉底部))))
    m = fig.split()[3]; f = int(fig.height * .16)          # 底部 16% 淡出，不留胸口硬边
    for i in range(f):
        y = fig.height - 1 - i
        m.paste(m.crop((0, y, fig.width, y + 1)).point(lambda v, k=i / f: int(v * k)), (0, y))
    fig.putalpha(m)
    return fig


def 合成带人物(bg, W, H, fx, fig, lay):
    fh, cx, fx2 = lay
    orig = globals()['铺底']
    def 铺底_人物(bg_, W_, H_, fx_):
        im = orig(bg_, W_, H_, fx_).convert('RGBA')
        h = int(H_ * fh); w = int(fig.width * h / fig.height)
        f2 = fig.resize((w, h), Image.LANCZOS)
        x = int(W_ * cx - w / 2); y = H_ - h if W_ / H_ >= 1.2 else int(H_ * .06)
        sh = Image.new('RGBA', f2.size, (0, 0, 0, 0)); sh.putalpha(f2.split()[3].point(lambda v: int(v * .55)))
        sh = sh.filter(ImageFilter.GaussianBlur(max(6, w // 40)))
        im.alpha_composite(sh, (x + w // 60, y + w // 80)); im.alpha_composite(f2, (x, y))
        return im.convert('RGB')
    globals()['铺底'] = 铺底_人物
    try:
        return 合成(bg, W, H, fx2)
    finally:
        globals()['铺底'] = orig


def 检查图(paths, out):
    ims = [Image.open(p) for p in paths]
    H = 540
    row = [im.resize((int(im.width * H / im.height), H), Image.LANCZOS) for im in ims]
    yt = ims[0]
    W = sum(r.width for r in row) + 20 * (len(row) + 1)
    S = Image.new('RGB', (W, H + 40 + 138 + 20), (40, 40, 40))
    x = 20
    for r in row:
        S.paste(r, (x, 20)); x += r.width + 20
    S.paste(yt.resize((246, 138), Image.LANCZOS), (20, H + 40)); S.paste(yt.resize((168, 94), Image.LANCZOS), (286, H + 40))
    S.save(out, quality=88)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('项目')
    ap.add_argument('--只出', default='')
    a = ap.parse_args()
    proj = Path(a.项目).expanduser().resolve(); root = proj.parent
    c = json.load(open(proj))['电影感封面']
    P = lambda s: Path(os.path.expanduser(s)) if str(s).startswith(('~', '/')) else root / s
    行1, 行2 = c['行1'], c['行2']
    系列 = c.get('系列', ''); 系列色 = tuple(c.get('系列色', 系列色)); 名 = c['文件名']
    fx = float(c.get('焦点x', .5)); vfx = float(c.get('竖版焦点x', fx))
    bg = Image.open(P(c['背景'])).convert('RGB')
    fig = lay = None
    if c.get('人物'):
        fig = 读人物(P(c['人物']['抠图']), c['人物'].get('裁掉底部'))
        lay = dict(默认人物布局); lay.update({k: tuple(v) for k, v in c['人物'].get('布局', {}).items()})
    out = P(c.get('输出目录', '封面/成品')); out.mkdir(parents=True, exist_ok=True)
    done = []
    for k, (W, H) in 尺寸.items():
        if a.只出 and k not in a.只出.split(','):
            continue
        f = vfx if W / H < 1.2 else fx
        im = 合成带人物(bg, W, H, f, fig, lay[k]) if fig else 合成(bg, W, H, f)
        p = out / f'{名}-{k}.jpg'; im.save(p, quality=92); done.append(p); print(p)
    if not a.只出:
        检查图(done, out / f'{名}-封面检查.jpg'); print(out / f'{名}-封面检查.jpg')
