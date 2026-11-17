#!/usr/bin/env python3
"""生成 v6 档案纸纹理（固定种子，重跑结果逐字节相同）。

输出（1920×1008，与内容区同尺寸）：
  engine/assets/paper-light.png  米色纸：底色 + 纤维颗粒 + 低频云斑 + 两三道极淡水渍弧 + 中心微亮
  engine/assets/paper-dark.png   深色变体（墨绿炭色），给 ink 屏用

格线不画在图里，由 stage.css 用 CSS 渐变画（48px 细格 + 每 5 格粗线），深浅可用 CSS 变量调。
改了纹理 = 改了 engine/assets，分段渲染.mjs 会把它算进指纹，所有镜头重渲。
用法：python3 做纸纹.py
"""
from pathlib import Path
import numpy as np
from PIL import Image

W, H = 1920, 1008
SEED = 20261007
OUT = Path(__file__).resolve().parent / 'engine' / 'assets'


def value_noise(rng, cell):
    """双三次放大的格点噪声：cell 越大越平滑。返回 [-1,1]。"""
    gw, gh = W // cell + 3, H // cell + 3
    g = rng.standard_normal((gh, gw)).astype(np.float32)
    im = Image.fromarray(g).resize((gw * cell, gh * cell), Image.BICUBIC)
    a = np.asarray(im)[cell:cell + H, cell:cell + W]
    return a / (np.abs(a).max() + 1e-6)


def blur(a, r):
    """可分离高斯模糊（纯 numpy，结果确定）。"""
    k = int(np.ceil(r * 3)) or 1
    x = np.arange(-k, k + 1, dtype=np.float32)
    w = np.exp(-x * x / (2 * r * r)); w /= w.sum()
    a = a.astype(np.float32)
    p = np.pad(a, ((0, 0), (k, k)), mode='reflect')
    a = sum(w[i] * p[:, i:i + a.shape[1]] for i in range(2 * k + 1))
    p = np.pad(a, ((k, k), (0, 0)), mode='reflect')
    return sum(w[i] * p[i:i + a.shape[0], :] for i in range(2 * k + 1))


def make(base, seed, dark=False):
    rng = np.random.default_rng(seed)
    base = np.array(base, np.float32)
    # 1) 低频云斑（纸张厚薄不均）
    mott = 0.55 * value_noise(rng, 420) + 0.30 * value_noise(rng, 160) + 0.15 * value_noise(rng, 60)
    # 2) 纤维颗粒：高频噪声轻微模糊，横向略拉长（纸纤维方向）
    g = rng.standard_normal((H, W)).astype(np.float32)
    g = 0.65 * blur(g, 0.6) + 0.35 * g
    # 3) 纤维丝：几百条很短的细线，略深
    fib = np.zeros((H, W), np.float32)
    for _ in range(900):
        x, y = rng.uniform(0, W), rng.uniform(0, H)
        ang = rng.normal(0.15, 0.6)
        L = rng.uniform(8, 38)
        n = int(L * 2)
        xs = (x + np.cos(ang) * np.linspace(0, L, n)).astype(int)
        ys = (y + np.sin(ang) * np.linspace(0, L, n) + np.sin(np.linspace(0, 3, n)) * rng.uniform(0, 2)).astype(int)
        ok = (xs >= 0) & (xs < W) & (ys >= 0) & (ys < H)
        fib[ys[ok], xs[ok]] += rng.uniform(0.35, 1.0)
    fib = blur(fib, 0.5)
    # 4) 两三道极淡大圆弧水渍（约 4% 不透明度）
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    stain = np.zeros((H, W), np.float32)
    for cx, cy, r, w in [(rng.uniform(250, 700), rng.uniform(-200, 300), rng.uniform(380, 620), rng.uniform(5, 9)),
                         (rng.uniform(1250, 1750), rng.uniform(600, 1200), rng.uniform(300, 520), rng.uniform(4, 8)),
                         (rng.uniform(900, 1100), rng.uniform(1100, 1500), rng.uniform(600, 800), rng.uniform(6, 10))]:
        d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) + 14 * value_noise(rng, 220)   # 边缘不规则，不像圆规画的
        ring = np.exp(-((d - r) / w) ** 2) * (0.6 + 0.4 * value_noise(rng, 90))
        inside = np.clip(1 - d / r, 0, 1) ** 2 * 0.25
        stain += ring + inside
    # 5) 极少量小斑点
    spk = np.zeros((H, W), np.float32)
    for _ in range(140):
        x, y = int(rng.uniform(0, W)), int(rng.uniform(0, H))
        spk[max(0, y - 1):y + 1, max(0, x - 1):x + 1] += rng.uniform(0.4, 1.0)
    spk = blur(spk, 0.7)
    # 6) 中心像被台灯照亮（极弱），边缘由 stage 的暗角层负责
    lamp = np.exp(-(((xx - W * 0.5) / (W * 0.62)) ** 2 + ((yy - H * 0.42) / (H * 0.75)) ** 2))

    if not dark:
        lum = (mott * 3.2 + g * 2.1 - fib * 5.5 - stain * 0.04 * 230 * 0.32 - spk * 9 + lamp * 3.0)
    else:
        lum = (mott * 2.4 + g * 1.6 + fib * 3.0 + stain * 0.04 * 60 - spk * 2 + lamp * 4.0)
    rgb = base[None, None, :] + lum[..., None] * np.array([1.0, 0.98, 0.92], np.float32)[None, None, :]
    return Image.fromarray(np.clip(np.round(rgb), 0, 255).astype(np.uint8))


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    make((234, 230, 217), SEED).save(OUT / 'paper-light.png', optimize=True)          # #EAE6D9（参考图实测约 #EBE6DA）
    make((27, 46, 40), SEED + 1, dark=True).save(OUT / 'paper-dark.png', optimize=True)  # 深墨绿炭色，配本期墨色 #172e29
    for f in ['paper-light.png', 'paper-dark.png']:
        a = np.asarray(Image.open(OUT / f)).astype(float)
        print(f, a.shape, '平均', a.reshape(-1, 3).mean(0).round(1), '标准差', a.reshape(-1, 3).std(0).round(2))
