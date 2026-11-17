#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
格子纸封面（2026-10-07 从大阪 USJ v6 封面合成固化，每期通用）

配方（用户认可的做法）：
  1. Codex 的 image_gen 画主体：写实的桌面微缩模型（像微距拍的比例模型），纯白背景、物体下面有自然接触阴影，
     画面里不要任何文字、数字、标志、人脸；要排标题的那一块（通常左上约 55% 宽 × 40% 高）和右下角留空。
     **故事要完整**：画面一眼讲清全片的走向（USJ：连续的过山车轨道冲上坡顶的奖杯；断轨会被读成「到不了」，用户否掉了）。
     一次出 6–7 张不同构图让用户挑，放 画面v6/封面/候选/。提示词例：视频工厂/模板-v6/封面/。
  2. 本脚本用代码画米色格子纸（细线 + 每 5 格一根粗线 + 轻微纸纹 + 暗角），把主体图「正片叠底」贴上去：
     白色的地方消失、露出格线，影子落在格线上；实物（够暗或有颜色的像素）按原样贴，格线不透到实物身上。
  3. 字：标题（用户本期定的标题直接用；宋体 Black，分段上色，可在某一行下垫荧光笔）和 / 或一句手写体钩子字（可配红色虚线双箭头）。
     不放任何标识，不写「AI 示意」（用户要求）；YouTube 右下角留给时长标签（脚本会检查）。
  两种出法：
  · 写了「尺寸」：一次出齐 YouTube 与视频号各尺寸（yt 1280×720、16x9 1920×1080、视频号 4x3 1440×1080、3x4 1080×1440、
    9x16 1080×1920），每个尺寸单独给标题位置、字号、主体图高和左上角；按平台安全区检查（9x16 标题块在 y420–1500、
    全部内容在 y240–1680；3x4 内容在 y60–1400）；出 <文件名>-<尺寸>.jpg、<文件名>-封面检查.jpg、<文件名>-yt缩略对照.png。
  · 没写「尺寸」（旧用法）：出 1280×720 和 1920×1080 两张（png + jpg），主体用「缩放 / 偏移」摆，配钩子字，
    另出 246×138 / 168×94 小图检查。

用法：
  python3 格子纸封面.py 画面v6/项目.json            # 读项目.json 里的「封面」（相对路径按 项目.json 所在目录算）
  python3 格子纸封面.py 封面配置.json                # 单独的配置，格式同「封面」那一段
  python3 格子纸封面.py --主体 候选/a.png --字 差184万 [--出 成品目录] [--名 文件名前缀]      # 快速出一张（字放右下偏上）
  python3 格子纸封面.py --只做纸 格子纸.png [--宽 1920]                                  # 只出一张空白格子纸

「封面」字段：
  主体图        纯白底主体（Codex image_gen 出的候选之一）
  实物框        [[x0,y0,x1,y1], …] 白得和背景一样的实物（白台子），按实物贴；圆柱写 [x0,y0,x1,y1,上下椭圆半高]；斜放的白卡片写多边形 [[x,y],[x,y],…]（主体图原图像素）
  标题          {"行": [{"片段": [["目标", "墨"], ["全球第一！", "红"]], "字号": "大"},
                        {"片段": [["差点破产的大阪USJ", "墨"]], "字号": "小"},
                        {"片段": [["绝地翻盘史！", "墨"]], "字号": "小", "荧光笔": true}],
                 "字体": "/System/Library/Fonts/Supplemental/Songti.ttc", "字体序号": 0（Songti SC Black）, "行距": 0.2}
                颜色写「墨 / 红 / 荧光」、"#B03A33" 或 [r,g,b]；字号写「大 / 中 / 小」（取该尺寸的 大字号 / 两者平均 / 小字号）或像素数；
                某行写 "底框": "#1F5FD6" → 这一行垫一块圆角色块（字用片段里的颜色，通常写「白」），像标签一样醒目
  尺寸          {"yt": {"宽":1280,"高":720,"标题位置":[46,29],"大字号":108,"小字号":59,"主体高":720.4,"主体位置":[0,0],"文件名":"封面-yt"}, …}
                主体高 = 主体图放上去的高度（像素），主体位置 = 它左上角在画布上的坐标（可以是负数，超出画布的部分裁掉）；
                可选 "安全区": {"标题":[y0,y1],"内容":[y0,y1]}（不写就按尺寸名：9x16、3x4 用平台默认）；
                可选 "钩子字位置"/"钩子字大小"/"钩子字角度"、"箭头"（画布像素）给这个尺寸加钩子字
  文件名        输出文件名前缀（默认「封面-<期名>」）；输出目录 默认 项目.json 旁边的 封面/成品
  旧用法字段    缩放 / 左右偏移 / 上下偏移（主体放大倍数，1 = 按 16:9 铺满；平移占画面宽高的比例）、钩子字、钩子字位置、
                钩子字大小（占画面高的比例，默认 0.13）、钩子字角度（默认 4）、箭头 [[x,y],[x,y]]（坐标都 ≤ 1.5 = 画面比例，否则 = 主体图原图像素）、
                候选 [{名, 主体图, 缩放, …}, …]（一次出几版对比）
只用 PIL + numpy，不加载任何模型，不联网，不花钱。
"""
import argparse
import glob
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

# ---------------- 格子纸参数（基准 1280 宽，按宽度等比缩放；USJ v6 定稿值） ----------------
PAPER = {
    "base": (0xEC, 0xE5, 0xD8),   # 底色
    "thin": (0xCD, 0xBF, 0xA6),   # 细线
    "thick": (0xBB, 0xA9, 0x8C),  # 每 5 格粗线
    "cell": 36,                   # 每格像素 @1280
    "thin_w": 2,                  # 细线宽 @1280
    "thick_w": 3,                 # 粗线宽 @1280
    "thin_alpha": 0.80,
    "thick_alpha": 1.00,
    "vignette": 0.16,             # 四角最多压暗多少
    "grain": 3.2,                 # 细颗粒强度（0–255 灰度）
    "mottle": 4.0,                # 大块纸纹明暗起伏
}
INK_RED = (196, 38, 34)
SIZES = [(1280, 720), (1920, 1080)]


def find_font(px):
    """手写体：Hannotate SC Bold → Hanzipen SC Bold → Yuanti SC Bold（系统字体资源目录里找，路径会随系统更新变）。"""
    for name in ("Hannotate.ttc", "Hanzipen.ttc", "Yuanti.ttc"):
        for path in sorted(glob.glob(f"/System/Library/AssetsV2/**/{name}", recursive=True), key=lambda x: ('Preinstalled' in x, x)):
            for idx in (2, 0):
                try:
                    return ImageFont.truetype(path, px, index=idx)
                except Exception:
                    continue
    raise SystemExit("找不到手写字体（Hannotate / Hanzipen / Yuanti）：系统设置 → 字体 里下载一下")


def smooth_noise(h, w, scale, rng):
    """低频噪声：小图随机后放大，再模糊。返回约 -1..1。"""
    sh, sw = max(2, int(h / scale)), max(2, int(w / scale))
    small = rng.standard_normal((sh, sw)).astype(np.float32)
    img = Image.fromarray(((small - small.min()) / (np.ptp(small) + 1e-6) * 255).astype(np.uint8))
    img = img.resize((w, h), Image.BICUBIC).filter(ImageFilter.GaussianBlur(scale / 3))
    a = np.asarray(img).astype(np.float32) / 255.0
    return (a - a.mean()) / (a.std() + 1e-6) / 3.0


def make_paper(W, H, seed=7):
    """米色格子纸（固定种子，重跑一样）：纸纹 + 细格 + 每 5 格粗线，画面中心正好落在粗线上。返回 float32 RGB。"""
    k = W / 1280.0
    rng = np.random.default_rng(seed)
    base = np.array(PAPER["base"], np.float32)
    img = np.ones((H, W, 3), np.float32) * base
    mottle = smooth_noise(H, W, 120 * k, rng) * PAPER["mottle"]
    fiber = smooth_noise(H, W, 9 * k, rng) * 1.6
    grain = rng.standard_normal((H, W)).astype(np.float32) * PAPER["grain"]
    img += (mottle + fiber + grain)[..., None]
    cell = PAPER["cell"] * k
    thin_w, thick_w = PAPER["thin_w"] * k, PAPER["thick_w"] * k

    def line_cov(coord, n_total, w):
        center = n_total / 2.0
        rel = (coord + 0.5 - center) / cell
        idx = np.round(rel)
        dist = np.abs(rel - idx) * cell
        return np.clip(w / 2.0 + 0.5 - dist, 0, 1), (np.mod(idx, 5) == 0)

    xs, ys = np.arange(W, dtype=np.float32), np.arange(H, dtype=np.float32)
    cx_thin, tx = line_cov(xs, W, thin_w)
    cx_thick, _ = line_cov(xs, W, thick_w)
    cy_thin, ty = line_cov(ys, H, thin_w)
    cy_thick, _ = line_cov(ys, H, thick_w)
    vx_thick, vx_thin = np.where(tx, cx_thick, 0.0), np.where(tx, 0.0, cx_thin)
    vy_thick, vy_thin = np.where(ty, cy_thick, 0.0), np.where(ty, 0.0, cy_thin)
    wob = 0.88 + 0.12 * (smooth_noise(H, W, 60 * k, rng) * 1.5).clip(-1, 1)     # 线的浓淡轻微起伏，像印刷的方格本
    thin_a = np.maximum(vx_thin[None, :], vy_thin[:, None]) * PAPER["thin_alpha"] * wob
    thick_a = np.maximum(vx_thick[None, :], vy_thick[:, None]) * PAPER["thick_alpha"] * wob
    thin_mul = np.array(PAPER["thin"], np.float32) / base
    thick_mul = np.array(PAPER["thick"], np.float32) / base
    img = img * (1 - thin_a[..., None] * (1 - thin_mul))
    img = img * (1 - thick_a[..., None] * (1 - thick_mul))
    return np.clip(img, 0, 255)


def vignette(img):
    """暗角：椭圆径向，四角最暗，略偏暖。最后对整张图（纸 + 主体）一起做，像真的拍照。"""
    H, W = img.shape[:2]
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    nx, ny = (xx - W / 2) / (W / 2), (yy - H / 2) / (H / 2)
    r = np.sqrt(nx ** 2 * 0.85 + ny ** 2 * 1.0)
    vig = 1 - PAPER["vignette"] * np.clip((r - 0.55) / 0.85, 0, 1) ** 1.7
    out = img * vig[..., None]
    out[..., 2] *= (1 - (1 - vig) * 0.25)
    return np.clip(out, 0, 255)


def prep_subject(path, W, H, scale=1.0, dx=0.0, dy=0.0, opaque=()):
    """读主体图 → 背景拉成纯白 → 放到 W×H 白画布上。返回 (subj 0..1, mask 0..1)；mask = 实物（按原样贴），其余走正片叠底。"""
    im = Image.open(path).convert("RGB")
    a = np.asarray(im).astype(np.float32)
    h0, w0 = a.shape[:2]
    border = np.concatenate([a[:8].reshape(-1, 3), a[-8:].reshape(-1, 3), a[:, :8].reshape(-1, 3), a[:, -8:].reshape(-1, 3)])
    white_pt = np.maximum(np.percentile(border, 70, axis=0), 200)
    a = np.clip(a / white_pt * 255.0, 0, 255)
    lum = a.mean(axis=2, keepdims=True)
    t = np.clip((lum - 240) / (251 - 240), 0, 1)                 # 接近纯白的背景直接算白，避免残留灰块
    a = a * (1 - t) + 255 * t
    lum = a.mean(axis=2)
    sat = (a.max(axis=2) - a.min(axis=2)) / 255.0
    m = Image.fromarray(((lum < 205) | (sat > 0.10)).astype(np.uint8) * 255)      # 够暗或有颜色 = 实物；浅灰软影子不算
    m = m.filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.MinFilter(7))       # 闭运算：补钢架高光、缝隙
    if opaque:
        md = ImageDraw.Draw(m)
        for shp in opaque:
            if isinstance(shp[0], (list, tuple)):         # 斜放的白卡片等：[[x,y], [x,y], …] 多边形
                md.polygon([tuple(p) for p in shp], fill=255)
            elif len(shp) == 4:
                md.rectangle(list(shp), fill=255)
            else:
                x0, y0, x1, y1, ry = shp
                md.rectangle([x0, y0 + ry, x1, y1 - ry], fill=255)
                md.ellipse([x0, y0, x1, y0 + 2 * ry], fill=255)
                md.ellipse([x0, y1 - 2 * ry, x1, y1], fill=255)
    m = m.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))   # 往里收 1 像素再羽化，避免白边
    im = Image.fromarray(a.astype(np.uint8))
    fit = max(W / w0, H / h0) * scale
    nw, nh = int(round(w0 * fit)), int(round(h0 * fit))
    im, m = im.resize((nw, nh), Image.LANCZOS), m.resize((nw, nh), Image.LANCZOS)
    canvas, mcanvas = Image.new("RGB", (W, H), (255, 255, 255)), Image.new("L", (W, H), 0)
    ox, oy = int(round((W - nw) / 2 + dx * W)), int(round((H - nh) / 2 + dy * H))
    canvas.paste(im, (ox, oy))
    mcanvas.paste(m, (ox, oy))
    return np.asarray(canvas).astype(np.float32) / 255.0, np.asarray(mcanvas).astype(np.float32) / 255.0


def to_canvas(pt, cfg, W, H, src_size):
    """坐标换到封面像素：两个值都 ≤ 1.5 当作画面比例，否则当作主体图原图像素（和 prep_subject 的摆放一致）。"""
    if abs(pt[0]) <= 1.5 and abs(pt[1]) <= 1.5:
        return pt[0] * W, pt[1] * H
    w0, h0 = src_size
    fit = max(W / w0, H / h0) * cfg.get("缩放", 1.0)
    nw, nh = round(w0 * fit), round(h0 * fit)
    ox = (W - nw) / 2 + cfg.get("左右偏移", 0.0) * W
    oy = (H - nh) / 2 + cfg.get("上下偏移", 0.0) * H
    return ox + pt[0] * fit, oy + pt[1] * fit


def dashed_double_arrow(draw, a, b, k, color=INK_RED):
    ax, ay = a
    bx, by = b
    L = math.hypot(bx - ax, by - ay)
    if L < 1:
        return
    ux, uy = (bx - ax) / L, (by - ay) / L
    w = max(2, int(round(7 * k)))
    head, dash, gapl = 27 * k, 16 * k, 10 * k
    t = head * 0.7
    while t < L - head * 0.7:
        t2 = min(t + dash, L - head * 0.7)
        draw.line([(ax + ux * t, ay + uy * t), (ax + ux * t2, ay + uy * t2)], fill=color, width=w)
        t = t2 + gapl
    px, py = -uy, ux
    for (tx, ty, sgn) in [(ax, ay, 1), (bx, by, -1)]:
        bxx, byy = tx + ux * head * sgn, ty + uy * head * sgn
        draw.polygon([(tx, ty), (bxx + px * head * 0.5, byy + py * head * 0.5), (bxx - px * head * 0.5, byy - py * head * 0.5)], fill=color)


def ink_layer(W, H, text, label_xy, size, rot, arrow=None):
    """红色墨迹层（可选箭头 + 钩子字），返回 (RGBA, 字的外框)。"""
    k = W / 1280.0
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    if arrow:
        dashed_double_arrow(d, arrow[0], arrow[1], k)
    box = None
    if text:
        px = int(round(size * H))
        font = find_font(px)
        bb = font.getbbox(text)
        tw, th = bb[2] - bb[0], bb[3] - bb[1]
        pad = int(px * 0.4)
        txt = Image.new("RGBA", (tw + pad * 2, th + pad * 2), (0, 0, 0, 0))
        stroke = max(2, int(round(px * 0.05)))                   # 很淡的浅色描边：字在格线和影子上都清楚
        ImageDraw.Draw(txt).text((pad - bb[0], pad - bb[1]), text, font=font, fill=INK_RED + (255,),
                                 stroke_width=stroke, stroke_fill=(246, 241, 231, 200))
        txt = txt.rotate(rot, resample=Image.BICUBIC, expand=True)
        cx, cy = label_xy
        x0, y0 = int(cx - txt.width / 2), int(cy - txt.height / 2)
        layer.alpha_composite(txt, (max(0, x0), max(0, y0)))
        al = np.asarray(txt)[..., 3]
        ys, xs = np.nonzero(al > 40)
        box = (x0 + xs.min(), y0 + ys.min(), x0 + xs.max(), y0 + ys.max()) if len(xs) else None
    rng = np.random.default_rng(3)                               # 墨迹微微不均匀，像马克笔
    arr = np.asarray(layer).astype(np.float32)
    tex = 0.90 + 0.10 * np.clip(smooth_noise(H, W, 6 * k, rng) * 1.5, -1, 1)
    arr[..., 3] = np.where(arr[..., 0] < 230, arr[..., 3] * tex, arr[..., 3])
    return Image.fromarray(arr.astype(np.uint8)), box


def compose(cfg, W, H):
    src = cfg["主体图"]
    src_size = Image.open(src).size
    paper = make_paper(W, H)
    subj, mask = prep_subject(src, W, H, cfg.get("缩放", 1.0), cfg.get("左右偏移", 0.0), cfg.get("上下偏移", 0.0), cfg.get("实物框", ()))
    mult = np.clip(paper * subj, 0, 255)                           # 正片叠底：白处透出格子纸，影子落在格线上
    warm = np.array([1.0, 0.985, 0.955], np.float32)               # 实物：原色乘一点暖光，和纸的色温一致
    solid = np.clip(subj * 255.0 * warm, 0, 255)
    out = vignette(mult * (1 - mask[..., None]) + solid * mask[..., None])
    img = Image.fromarray(out.astype(np.uint8)).convert("RGBA")
    lx = cfg.get("钩子字位置") or [0.72, 0.78]
    arrow = cfg.get("箭头")
    ink, box = ink_layer(W, H, cfg.get("钩子字", ""), to_canvas(lx, cfg, W, H, src_size), float(cfg.get("钩子字大小", 0.13)),
                         float(cfg.get("钩子字角度", 4)), [to_canvas(p, cfg, W, H, src_size) for p in arrow] if arrow else None)
    img.alpha_composite(ink)
    return img.convert("RGB"), box


def save_checks(img, check_dir, stem):
    os.makedirs(check_dir, exist_ok=True)
    for (w, h) in [(246, 138), (168, 94)]:
        img.resize((w, h), Image.LANCZOS).save(os.path.join(check_dir, f"{stem}-{w}x{h}.png"))
    sheet = Image.new("RGB", (246 + 168 + 30, 150), (30, 30, 30))
    sheet.paste(img.resize((246, 138), Image.LANCZOS), (10, 6))
    sheet.paste(img.resize((168, 94), Image.LANCZOS), (246 + 20, 6))
    sheet.save(os.path.join(check_dir, f"{stem}-对照.png"))


# ======================================================================
# 标题封面：一次出齐 YouTube 与视频号各尺寸（2026-10-07 USJ v6 定稿做法）
# ======================================================================
COLORS = {"墨": (32, 28, 24), "红": INK_RED, "朱红": INK_RED, "荧光": (242, 216, 74), "白": (255, 255, 255)}
EDGE = (246, 241, 231)                      # 标题字的浅色描边（米白），让字在格线和主体上都清楚
SAFE = {"9x16": {"标题": (420, 1500), "内容": (240, 1680)},   # 视频号竖版整张封面（第三方整理的尺寸，平台提示不同时以平台为准）
        "3x4": {"内容": (60, 1400)}}                            # 视频号主页卡片


def parse_color(c):
    if isinstance(c, str):
        if c in COLORS:
            return COLORS[c]
        c = c.lstrip("#")
        return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))
    return tuple(int(v) for v in c[:3])


def place(W, H, h_s, ox, oy, src_size):
    """把「主体图高 h_s、左上角在 (ox, oy)」换算成 prep_subject 的 scale / dx / dy。"""
    w0, h0 = src_size
    cover = max(W / w0, H / h0)
    fit = h_s / h0
    nw, nh = w0 * fit, h0 * fit
    return fit / cover, (ox - (W - nw) / 2) / W, (oy - (H - nh) / 2) / H


def title_block(W, H, x0, y0, s1, s2, title):
    """标题块：返回 (荧光笔层, 文字层（含柔和投影）, 外框 [x0,y0,x1,y1])。字号「大」= s1、「小」= s2，也可直接写像素。"""
    font_path = title.get("字体", "/System/Library/Fonts/Supplemental/Songti.ttc")
    font_idx = int(title.get("字体序号", 0))
    gap_ratio = float(title.get("行距", 0.2))
    marker_c = parse_color(title.get("荧光颜色", "荧光"))
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    marker = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d, ds, dm = ImageDraw.Draw(layer), ImageDraw.Draw(shadow), ImageDraw.Draw(marker)
    y = y0
    box = [x0, y0, x0, y0]
    for ln in title["行"]:
        big = ln.get("字号", "小") == "大"
        size = ln.get("字号", "小")
        px = s1 if big else s2 if size == "小" else int(round((s1 + s2) / 2)) if size == "中" else int(size)
        font = ImageFont.truetype(font_path, px, index=font_idx)
        asc = font.getbbox("国")[1]
        lh = font.getbbox("国")[3] - asc
        stroke = max(2, int(round(px * 0.07)))
        segs = [(t, parse_color(c)) for t, c in ln["片段"]]
        x = x0
        boxed = ln.get("底框")
        if boxed:                                                # 标签式底框：圆角色块 + 投影，字压在上面
            total = sum(font.getlength(t) for t, _ in segs)
            padx, pady = 0.32 * lh, 0.2 * lh
            rect = [x - padx * 0.3, y - pady, x + total + padx * 1.7, y + lh + pady]
            off = 0.06 * lh
            ds.rounded_rectangle([rect[0] + off, rect[1] + off * 1.4, rect[2] + off, rect[3] + off * 1.4], radius=0.22 * lh, fill=(20, 30, 60, 110))
            d.rounded_rectangle(rect, radius=0.22 * lh, fill=parse_color(boxed) + (255,))
            x += padx * 0.7
        if ln.get("荧光笔"):                                      # 荧光笔垫在字的下半截，正片叠底
            total = sum(font.getlength(t) for t, _ in segs)
            dm.rectangle([x - 0.2 * lh, y + 0.42 * lh, x + total + 0.15 * lh, y + 1.08 * lh], fill=marker_c + (170,))
        for t, col in segs:
            pos = (x, y - asc)
            ds.text((pos[0] + 0.035 * lh, pos[1] + 0.05 * lh), t, font=font, fill=(40, 30, 20, 120))
            if boxed:
                d.text(pos, t, font=font, fill=col + (255,))
            else:
                d.text(pos, t, font=font, fill=col + (255,), stroke_width=stroke, stroke_fill=EDGE + (235,))
            x += font.getlength(t)
        extra = 0.2 * lh if boxed else 0
        box[2] = max(box[2], x + stroke + (0.32 * lh if boxed else 0))
        box[3] = y + lh + stroke + extra
        y = y + lh + gap_ratio * s2 + (0.15 * s1 if big else 0) + 2 * extra
    shadow = shadow.filter(ImageFilter.GaussianBlur(max(1, W / 640)))
    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    out.alpha_composite(shadow)
    out.alpha_composite(layer)
    return marker, out, box


def compose_sized(cfg, sz):
    """一个尺寸：格子纸 + 主体（按 主体高 / 主体位置 摆）+ 标题块 + 可选钩子字。返回 (图, 标题框或 None, 主体框, 钩子字框或 None)。"""
    W, H = int(sz["宽"]), int(sz["高"])
    src = cfg["主体图"]
    src_size = Image.open(src).size
    if "主体高" in sz:
        h_s = float(sz["主体高"])
        ox, oy = sz.get("主体位置", [0, 0])
        scale, dx, dy = place(W, H, h_s, ox, oy, src_size)
    else:                                                          # 没给就按旧用法的 缩放 / 偏移（铺满）
        scale, dx, dy = cfg.get("缩放", 1.0), cfg.get("左右偏移", 0.0), cfg.get("上下偏移", 0.0)
        fit = max(W / src_size[0], H / src_size[1]) * scale
        h_s = src_size[1] * fit
        ox = (W - src_size[0] * fit) / 2 + dx * W
        oy = (H - h_s) / 2 + dy * H
    paper = make_paper(W, H)
    subj, mask = prep_subject(src, W, H, scale, dx, dy, cfg.get("实物框", ()))
    mult = np.clip(paper * subj, 0, 255)
    warm = np.array([1.0, 0.985, 0.955], np.float32)
    solid = np.clip(subj * 255.0 * warm, 0, 255)
    out = vignette(mult * (1 - mask[..., None]) + solid * mask[..., None])
    tbox = None
    txt = None
    if cfg.get("标题"):
        x0, y0 = sz.get("标题位置", [round(W * 0.036), round(H * 0.04)])
        marker, txt, tbox = title_block(W, H, x0, y0, int(sz.get("大字号", round(H * 0.15))), int(sz.get("小字号", round(H * 0.082))), cfg["标题"])
        m = np.asarray(marker).astype(np.float32)
        a = m[..., 3:4] / 255.0
        out = out * (1 - a * (1 - m[..., :3] / 255.0))
    img = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).convert("RGBA")
    if txt is not None:
        img.alpha_composite(txt)
    hbox = None
    if cfg.get("钩子字") and sz.get("钩子字位置"):
        ink, hbox = ink_layer(W, H, cfg["钩子字"], sz["钩子字位置"], float(sz.get("钩子字大小", 0.13)), float(sz.get("钩子字角度", 4)),
                              sz.get("箭头"))
        img.alpha_composite(ink)
    sub = (ox, oy, ox + src_size[0] * h_s / src_size[1], oy + h_s)
    return img.convert("RGB"), tbox, sub, hbox


def check_sized(key, sz, W, H, tbox, sub, hbox):
    """安全区检查（平台默认 + 尺寸里写的「安全区」）。主体框按放上去的整张图算（偏保守）。"""
    warn = []
    safe = dict(SAFE.get(key, {}))
    safe.update({k: tuple(v) for k, v in (sz.get("安全区") or {}).items()})
    boxes = [b for b in (tbox, hbox) if b]
    for b in boxes:
        if b[2] > W - 20 or b[0] < 0:
            warn.append(f"字出了左右边界（{b[0]:.0f}–{b[2]:.0f}，画宽 {W}）")
    if tbox and "标题" in safe:
        t0, t1 = safe["标题"]
        if tbox[1] < t0 or tbox[3] > t1:
            warn.append(f"标题块 y{tbox[1]:.0f}–{tbox[3]:.0f} 不在 y{t0}–{t1}")
    if "内容" in safe:
        c0, c1 = safe["内容"]
        tops = [max(0, sub[1])] + [b[1] for b in boxes]
        bots = [min(H, sub[3])] + [b[3] for b in boxes]
        if min(tops) < c0 or max(bots) > c1:
            warn.append(f"内容 y{min(tops):.0f}–{max(bots):.0f} 不在 y{c0}–{c1}（主体图 y{sub[1]:.0f}–{sub[3]:.0f}）")
    if key in ("yt", "16x9"):
        for b in boxes:                                            # YouTube 时长标签在右下角
            if b[2] > W * 0.80 and b[3] > H * 0.84:
                warn.append("字压进了右下角（YouTube 时长标签的位置）")
    return warn


def run_sized(cfg, base_dir, out_dir, name):
    """写了「尺寸」：一次出齐各尺寸 + 检查图 + yt 缩略对照。"""
    def ab(p):
        return p if os.path.isabs(p) else os.path.join(base_dir, p)
    if not cfg.get("主体图"):
        raise SystemExit("缺「主体图」：先用 Codex image_gen 出纯白底的桌面微缩模型候选，放进 封面/候选/")
    cfg = dict(cfg)
    cfg["主体图"] = ab(cfg["主体图"])
    if not os.path.isfile(cfg["主体图"]):
        raise SystemExit(f"找不到主体图：{cfg['主体图']}")
    os.makedirs(out_dir, exist_ok=True)
    checks, allwarn = [], []
    for key, sz in cfg["尺寸"].items():
        img, tbox, sub, hbox = compose_sized(cfg, sz)
        W, H = img.size
        fn = os.path.join(out_dir, f"{name}-{sz.get('文件名', '封面-' + key)}.jpg")
        img.save(fn, quality=92, subsampling=0)
        warn = check_sized(key, sz, W, H, tbox, sub, hbox)
        allwarn += [f"{key}：{w}" for w in warn]
        chk = img.copy()
        dd = ImageDraw.Draw(chk)
        for b in (tbox, hbox):
            if b:
                dd.rectangle(b, outline=(0, 160, 255), width=4)
        safe = dict(SAFE.get(key, {}))
        safe.update({k: tuple(v) for k, v in (sz.get("安全区") or {}).items()})
        for kind, col in (("标题", (0, 200, 200)), ("内容", (0, 170, 0))):
            for yy in safe.get(kind, ()):
                for xx in range(0, W, 40):
                    dd.line([xx, yy, xx + 20, yy], fill=col, width=5)
        checks.append(chk)
        print(f"写出 {fn}（{W}×{H}）" + (f"  标题框 {[round(v) for v in tbox]}" if tbox else "") + ("  ⚠️ " + "；".join(warn) if warn else "  安全区无警告"))
    hh = 700                                                       # 检查图：所有尺寸按同一高度并排
    tiles = [c.resize((int(c.width * hh / c.height), hh), Image.LANCZOS) for c in checks]
    sheet = Image.new("RGB", (sum(t.width for t in tiles) + 20 * (len(tiles) + 1), hh + 40), (40, 40, 40))
    x = 20
    for t in tiles:
        sheet.paste(t, (x, 20))
        x += t.width + 20
    sheet.save(os.path.join(out_dir, f"{name}-封面检查.jpg"), quality=88)
    if "yt" in cfg["尺寸"]:                                        # YouTube 列表里的小图：246×138、168×94
        small = Image.open(os.path.join(out_dir, f"{name}-{cfg['尺寸']['yt'].get('文件名', '封面-yt')}.jpg"))
        s2 = Image.new("RGB", (246 + 168 + 30, 150), (30, 30, 30))
        s2.paste(small.resize((246, 138), Image.LANCZOS), (10, 6))
        s2.paste(small.resize((168, 94), Image.LANCZOS), (266, 6))
        s2.save(os.path.join(out_dir, f"{name}-yt缩略对照.png"))
    for w in allwarn:
        print("⚠️", w)
    print(f"检查：先看各尺寸 jpg，再看 {name}-封面检查.jpg（蓝框 = 字，青虚线 = 标题安全区，绿虚线 = 内容安全区）和 {name}-yt缩略对照.png")
    return allwarn


def run(cfg, base_dir, out_dir, name):
    def ab(p):
        return p if os.path.isabs(p) else os.path.join(base_dir, p)
    variants = cfg.get("候选") or [dict(名="")]
    os.makedirs(out_dir, exist_ok=True)
    warns = []
    for v in variants:
        c = {**{k: x for k, x in cfg.items() if k != "候选"}, **v}
        if not c.get("主体图"):
            raise SystemExit("缺「主体图」：先用 Codex image_gen 出纯白底的桌面微缩模型候选，放进 封面/候选/")
        c["主体图"] = ab(c["主体图"])
        if not os.path.isfile(c["主体图"]):
            raise SystemExit(f"找不到主体图：{c['主体图']}")
        if len(c.get("钩子字", "")) > 8:
            warns.append(f"钩子字「{c['钩子字']}」超过 8 个字，小图上可能认不清")
        stem = name + (f"-{v['名']}" if v.get("名") else "")
        for (W, H) in SIZES:
            img, box = compose(c, W, H)
            img.save(os.path.join(out_dir, f"{stem}-{W}x{H}.png"))
            if W == 1280:
                img.save(os.path.join(out_dir, f"{stem}-{W}x{H}.jpg"), quality=92, subsampling=0)
                save_checks(img, os.path.join(out_dir, "缩略检查"), stem)
                if box and box[2] > W * 0.80 and box[3] > H * 0.84:          # YouTube 时长标签在右下角
                    warns.append(f"{stem}：钩子字压进了右下角（YouTube 时长标签的位置），往左或往上挪")
                if box and (box[0] < 0 or box[1] < 0 or box[2] > W or box[3] > H):
                    warns.append(f"{stem}：钩子字出画了")
            print("写出", os.path.join(out_dir, f"{stem}-{W}x{H}.png"))
    for w in warns:
        print("⚠️", w)
    print(f"检查：先看 {out_dir}/*-1280x720.jpg，再看 缩略检查/*-对照.png（246×138、168×94 两种小图能不能一眼认出主体和钩子字）")


def main():
    ap = argparse.ArgumentParser(description="格子纸封面：纯白底主体图 + 米色格子纸（正片叠底）+ 一句钩子字")
    ap.add_argument("config", nargs="?", help="画面v6/项目.json（读「封面」）或单独的封面配置 json")
    ap.add_argument("--主体", dest="subj")
    ap.add_argument("--字", dest="text", default="")
    ap.add_argument("--出", dest="out", default=None)
    ap.add_argument("--名", dest="name", default=None)
    ap.add_argument("--只做纸", dest="paper_only", default=None)
    ap.add_argument("--宽", dest="width", type=int, default=1920)
    a = ap.parse_args()
    if a.paper_only:
        W = a.width
        Image.fromarray(vignette(make_paper(W, round(W * 9 / 16))).astype(np.uint8)).save(a.paper_only)
        print("写出", a.paper_only)
        return
    if a.config:
        P = json.load(open(a.config, encoding="utf-8"))
        cfg = P.get("封面", P)
        base = os.path.dirname(os.path.abspath(a.config))
        out_dir = a.out or (cfg.get("输出目录") and os.path.join(base, cfg["输出目录"])) or os.path.join(base, "封面", "成品")
        name = a.name or cfg.get("文件名") or f"封面-{P.get('期名', '本期')}"
        if cfg.get("尺寸"):
            run_sized(cfg, base, os.path.abspath(out_dir), name)
        else:
            if cfg.get("标题"):
                print("⚠️ 写了「标题」但没写「尺寸」：标题封面要给每个尺寸的标题位置、字号、主体高和左上角（例：模板-v6/项目-示例.json），这次按旧用法只出钩子字版")
            run(cfg, base, os.path.abspath(out_dir), name)
    elif a.subj:
        cfg = {"主体图": os.path.abspath(a.subj), "钩子字": a.text}
        out_dir = os.path.abspath(a.out or os.path.join(os.path.dirname(os.path.abspath(a.subj)), "..", "成品"))
        run(cfg, os.getcwd(), out_dir, a.name or "封面")
    else:
        ap.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
