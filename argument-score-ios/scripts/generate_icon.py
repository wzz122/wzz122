#!/usr/bin/env python3
"""生成冷静报告 App 图标：深色渐变底 + 评分圆环（青→紫）+ 橙色对峙缺口 + 大数字。"""
import math
import os

from PIL import Image, ImageDraw, ImageFont

SIZE = 1024
OUT = os.path.join(
    os.path.dirname(__file__),
    "..",
    "ArgumentScore",
    "Resources",
    "Assets.xcassets",
    "AppIcon.appiconset",
    "AppIcon.png",
)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def main():
    img = Image.new("RGB", (SIZE, SIZE))
    draw = ImageDraw.Draw(img)

    # 垂直渐变背景：深墨蓝
    top, bottom = (23, 26, 42), (11, 13, 24)
    for y in range(SIZE):
        draw.line([(0, y), (SIZE, y)], fill=lerp(top, bottom, y / SIZE))

    # 评分圆环：从 135° 顺时针扫 300°，青 → 紫
    cx = cy = SIZE / 2
    radius = 330
    width = 86
    teal, violet = (62, 217, 194), (148, 120, 248)
    steps = 240
    sweep = 262
    for i in range(steps):
        a0 = 135 + sweep * i / steps
        a1 = 135 + sweep * (i + 1) / steps + 0.8
        color = lerp(teal, violet, i / steps)
        draw.arc(
            [cx - radius, cy - radius, cx + radius, cy + radius],
            start=a0, end=a1, fill=color, width=width,
        )

    # 圆环两端圆头
    for angle, color in [(135, teal), (135 + sweep, violet)]:
        rad = math.radians(angle)
        px = cx + radius_mid(radius, width) * math.cos(rad)
        py = cy + radius_mid(radius, width) * math.sin(rad)
        r = width / 2
        draw.ellipse([px - r, py - r, px + r, py + r], fill=color)

    # 橙色小段：对峙的"另一方"，在缺口处
    orange = (255, 158, 87)
    o0, o1 = 135 + sweep + 22, 135 + 348
    draw.arc(
        [cx - radius, cy - radius, cx + radius, cy + radius],
        start=o0, end=o1, fill=orange, width=width,
    )
    for angle in [o0, o1]:
        rad = math.radians(angle)
        px = cx + radius_mid(radius, width) * math.cos(rad)
        py = cy + radius_mid(radius, width) * math.sin(rad)
        r = width / 2
        draw.ellipse([px - r, py - r, px + r, py + r], fill=orange)

    # 中央大数字
    font = ImageFont.truetype(
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 360
    )
    text = "88"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text(
        (cx - tw / 2 - bbox[0], cy - th / 2 - bbox[1]),
        text, font=font, fill=(240, 242, 248),
    )

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    img.save(OUT, "PNG")
    print(f"saved {OUT}")


def radius_mid(radius, width):
    # Pillow 的 arc 从椭圆边界向内描边，所以圆头中心在 radius - width/2
    return radius - width / 2


if __name__ == "__main__":
    main()
