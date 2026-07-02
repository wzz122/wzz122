"""ColorMatch GradeMath 参照实现（算法规格的可执行版本）。

这份 Python 是 Swift 侧 ColorEngine / LUTBuilder 的镜像实现，两边必须保持
逐公式一致。它有三个用途：

1. 在无法运行 Swift 的环境里验证算法数值行为（acceptance_test.py）。
2. 生成 golden vectors（gen_goldens.py），嵌入 Swift 测试做交叉校验。
3. 作为算法规格文档：改任何常数必须两边同步改，并重新生成 goldens。

所有公式使用 float64；两边的合成测试图生成、百分位定义、采样步长
必须逐位一致，否则 golden 校验没有意义。
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

# ---------------------------------------------------------------------------
# 色彩空间（与 Swift ColorMath.swift 一致）
# ---------------------------------------------------------------------------

SRGB_TO_XYZ = np.array(
    [
        [0.4124564, 0.3575761, 0.1804375],
        [0.2126729, 0.7151522, 0.0721750],
        [0.0193339, 0.1191920, 0.9503041],
    ]
)

WHITE_XN, WHITE_YN, WHITE_ZN = 0.95047, 1.0, 1.08883

# Lightroom 8 个 HSL 通道的色相中心（度）
BAND_CENTERS = [0.0, 30.0, 60.0, 120.0, 180.0, 240.0, 280.0, 320.0]
BAND_NAMES = ["red", "orange", "yellow", "green", "aqua", "blue", "purple", "magenta"]


def quantize_u8(v01):
    """[0,1] float -> uint8，用 floor(x*255+0.5)。禁止用 np.round（银行家舍入，
    与 Swift 的 rounded() 不一致）。"""
    return np.floor(np.clip(v01, 0.0, 1.0) * 255.0 + 0.5).astype(np.uint8)


def srgb_decode(c):
    c = np.asarray(c, dtype=np.float64)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def srgb_encode(c):
    c = np.asarray(c, dtype=np.float64)
    c = np.clip(c, 0.0, None)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * (c ** (1.0 / 2.4)) - 0.055)


def linear_luma(rgb_lin):
    return (
        0.2126729 * rgb_lin[..., 0]
        + 0.7151522 * rgb_lin[..., 1]
        + 0.0721750 * rgb_lin[..., 2]
    )


def _lab_f(t):
    d = 6.0 / 29.0
    return np.where(t > d**3, np.cbrt(t), t / (3 * d * d) + 4.0 / 29.0)


def rgb_to_lab(rgb01):
    """rgb01: gamma sRGB in [0,1] -> (L*, a*, b*)"""
    lin = srgb_decode(rgb01)
    xyz = lin @ SRGB_TO_XYZ.T
    fx = _lab_f(xyz[..., 0] / WHITE_XN)
    fy = _lab_f(xyz[..., 1] / WHITE_YN)
    fz = _lab_f(xyz[..., 2] / WHITE_ZN)
    L = 116.0 * fy - 16.0
    a = 500.0 * (fx - fy)
    b = 200.0 * (fy - fz)
    return np.stack([L, a, b], axis=-1)


def rgb_to_hsl(rgb01):
    r, g, b = rgb01[..., 0], rgb01[..., 1], rgb01[..., 2]
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    l = (mx + mn) / 2.0
    d = mx - mn
    s = np.where(d < 1e-12, 0.0, d / (1.0 - np.abs(2.0 * l - 1.0) + 1e-12))
    h = np.zeros_like(l)
    with np.errstate(invalid="ignore", divide="ignore"):
        hr = np.where((mx == r) & (d > 0), ((g - b) / d) % 6.0, 0.0)
        hg = np.where((mx == g) & (d > 0) & (mx != r), (b - r) / d + 2.0, 0.0)
        hb = np.where(
            (mx == b) & (d > 0) & (mx != r) & (mx != g), (r - g) / d + 4.0, 0.0
        )
    h = (hr + hg + hb) * 60.0
    return np.stack([h % 360.0, np.clip(s, 0, 1), l], axis=-1)


def hsl_to_rgb(h, s, l):
    h = np.asarray(h, dtype=np.float64) % 360.0
    s = np.clip(np.asarray(s, dtype=np.float64), 0, 1)
    l = np.clip(np.asarray(l, dtype=np.float64), 0, 1)
    c = (1.0 - np.abs(2.0 * l - 1.0)) * s
    x = c * (1.0 - np.abs((h / 60.0) % 2.0 - 1.0))
    m = l - c / 2.0
    zeros = np.zeros_like(c)
    conds = [
        (h < 60, (c, x, zeros)),
        ((h >= 60) & (h < 120), (x, c, zeros)),
        ((h >= 120) & (h < 180), (zeros, c, x)),
        ((h >= 180) & (h < 240), (zeros, x, c)),
        ((h >= 240) & (h < 300), (x, zeros, c)),
        ((h >= 300), (c, zeros, x)),
    ]
    r = np.zeros_like(c)
    g = np.zeros_like(c)
    b = np.zeros_like(c)
    for cond, (rr, gg, bb) in conds:
        r = np.where(cond, rr, r)
        g = np.where(cond, gg, g)
        b = np.where(cond, bb, b)
    return np.stack([r + m, g + m, b + m], axis=-1)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def band_weights(hue_deg):
    """每个像素对 8 个通道的隶属权重（相邻中心线性插值，恰有两个非零）。

    返回 shape (..., 8)
    """
    hue = np.asarray(hue_deg, dtype=np.float64) % 360.0
    n = len(BAND_CENTERS)
    w = np.zeros(hue.shape + (n,))
    for i in range(n):
        c0 = BAND_CENTERS[i]
        c1 = BAND_CENTERS[(i + 1) % n]
        span = (c1 - c0) % 360.0
        if span == 0:
            continue
        rel = (hue - c0) % 360.0
        inside = rel < span
        t = np.where(inside, rel / span, 0.0)
        w[..., i] += np.where(inside, 1.0 - t, 0.0)
        w[..., (i + 1) % n] += np.where(inside, t, 0.0)
    return w


def band_hue_offset(hue_deg):
    """像素色相相对其最近通道中心的偏移（度，-180..180 规范到相邻中心区间）。"""
    hue = np.asarray(hue_deg, dtype=np.float64) % 360.0
    centers = np.array(BAND_CENTERS)
    diff = (hue[..., None] - centers[None, :] + 180.0) % 360.0 - 180.0
    return diff


# ---------------------------------------------------------------------------
# ImageStats（与 Swift ImageStats.swift 一致）
# ---------------------------------------------------------------------------

PERCENTILES = [1, 5, 25, 50, 75, 95, 99]
MAX_SAMPLES = 200_000
SAT_MASK_THRESHOLD = 0.08
SHADOW_L_MAX = 40.0
HIGHLIGHT_L_MIN = 65.0
BAND_MIN_FRACTION = 0.01


def nearest_rank_percentile(sorted_vals, p):
    """两边统一的百分位定义：index = round(p/100 * (n-1))，取该元素。"""
    n = len(sorted_vals)
    idx = int(math.floor(p / 100.0 * (n - 1) + 0.5))
    return float(sorted_vals[idx])


@dataclass
class ImageStats:
    luma_percentiles: list[float] = field(default_factory=list)  # gamma luma, PERCENTILES
    linear_luma_median: float = 0.0
    mean_l: float = 0.0
    mean_a: float = 0.0
    mean_b: float = 0.0
    std_luma: float = 0.0  # gamma luma std
    mean_chroma: float = 0.0
    shadow_a: float = 0.0
    shadow_b: float = 0.0
    highlight_a: float = 0.0
    highlight_b: float = 0.0
    band_fraction: list[float] = field(default_factory=lambda: [0.0] * 8)
    band_sat: list[float] = field(default_factory=lambda: [0.0] * 8)
    band_lum: list[float] = field(default_factory=lambda: [0.0] * 8)
    band_hue_shift: list[float] = field(default_factory=lambda: [0.0] * 8)
    skin_fraction: float = 0.0


def compute_stats(rgba_u8):
    """rgba_u8: (h, w, 4) uint8 -> ImageStats。采样步长与 Swift 一致。"""
    flat = rgba_u8[..., :3].reshape(-1, 3).astype(np.float64) / 255.0
    n = flat.shape[0]
    stride = max(1, n // MAX_SAMPLES)
    return compute_stats_px(flat[::stride])


def compute_stats_px(px):
    """px: (n, 3) float64 gamma sRGB in [0,1] -> ImageStats（不再抽样）。"""
    lin = srgb_decode(px)
    y_lin = linear_luma(lin)
    y_gamma = srgb_encode(y_lin)
    lab = rgb_to_lab(px)
    hsl = rgb_to_hsl(px)

    st = ImageStats()
    sorted_y = np.sort(y_gamma)
    st.luma_percentiles = [nearest_rank_percentile(sorted_y, p) for p in PERCENTILES]
    sorted_lin = np.sort(y_lin)
    st.linear_luma_median = nearest_rank_percentile(sorted_lin, 50)
    st.mean_l = float(lab[:, 0].mean())
    st.mean_a = float(lab[:, 1].mean())
    st.mean_b = float(lab[:, 2].mean())
    st.std_luma = float(y_gamma.std())
    st.mean_chroma = float(np.hypot(lab[:, 1], lab[:, 2]).mean())

    shadow = lab[:, 0] < SHADOW_L_MAX
    if shadow.any():
        st.shadow_a = float(lab[shadow, 1].mean())
        st.shadow_b = float(lab[shadow, 2].mean())
    else:
        st.shadow_a, st.shadow_b = st.mean_a, st.mean_b
    hi = lab[:, 0] > HIGHLIGHT_L_MIN
    if hi.any():
        st.highlight_a = float(lab[hi, 1].mean())
        st.highlight_b = float(lab[hi, 2].mean())
    else:
        st.highlight_a, st.highlight_b = st.mean_a, st.mean_b

    sat_mask = hsl[:, 1] > SAT_MASK_THRESHOLD
    weights = band_weights(hsl[:, 0]) * sat_mask[:, None]
    offsets = band_hue_offset(hsl[:, 0])
    total = float(px.shape[0])
    for i in range(8):
        wsum = float(weights[:, i].sum())
        st.band_fraction[i] = wsum / total
        if wsum > 1e-9:
            st.band_sat[i] = float((weights[:, i] * hsl[:, 1]).sum() / wsum)
            st.band_lum[i] = float((weights[:, i] * hsl[:, 2]).sum() / wsum)
            st.band_hue_shift[i] = float((weights[:, i] * offsets[:, i]).sum() / wsum)

    skin = (
        (hsl[:, 0] >= 15.0)
        & (hsl[:, 0] <= 50.0)
        & (hsl[:, 1] >= 0.1)
        & (hsl[:, 1] <= 0.65)
        & (y_gamma >= 0.15)
        & (y_gamma <= 0.9)
    )
    st.skin_fraction = float(skin.mean())
    return st


# ---------------------------------------------------------------------------
# GradeParameters（与 Swift GradeParameters.swift 一致）
# ---------------------------------------------------------------------------


@dataclass
class GradeParameters:
    temperature: float = 0.0  # Incremental, -100..100
    tint: float = 0.0
    exposure: float = 0.0  # stops, -5..5
    contrast: float = 0.0
    highlights: float = 0.0
    shadows: float = 0.0
    whites: float = 0.0
    blacks: float = 0.0
    vibrance: float = 0.0
    saturation: float = 0.0
    hsl_hue: list[float] = field(default_factory=lambda: [0.0] * 8)
    hsl_sat: list[float] = field(default_factory=lambda: [0.0] * 8)
    hsl_lum: list[float] = field(default_factory=lambda: [0.0] * 8)
    shadow_tint_hue: float = 0.0  # 0..360
    shadow_tint_sat: float = 0.0  # 0..100
    highlight_tint_hue: float = 0.0
    highlight_tint_sat: float = 0.0
    grading_balance: float = 0.0

    def as_dict(self):
        return {
            "temperature": self.temperature,
            "tint": self.tint,
            "exposure": self.exposure,
            "contrast": self.contrast,
            "highlights": self.highlights,
            "shadows": self.shadows,
            "whites": self.whites,
            "blacks": self.blacks,
            "vibrance": self.vibrance,
            "saturation": self.saturation,
            "hslHue": self.hsl_hue,
            "hslSat": self.hsl_sat,
            "hslLum": self.hsl_lum,
            "shadowTintHue": self.shadow_tint_hue,
            "shadowTintSat": self.shadow_tint_sat,
            "highlightTintHue": self.highlight_tint_hue,
            "highlightTintSat": self.highlight_tint_sat,
            "gradingBalance": self.grading_balance,
        }


# ---------------------------------------------------------------------------
# Matcher 调参常数（Tuning，与 Swift ColorMatcher.swift 的 Tuning 一致）
# ---------------------------------------------------------------------------


class Tuning:
    TEMP_GAIN = 4.0
    TEMP_MAX = 40.0
    TINT_GAIN = 4.0
    TINT_MAX = 40.0
    EXPOSURE_MAX = 1.5
    CONTRAST_GAIN = 80.0  # × (spread ratio - 1)
    CONTRAST_MAX = 50.0
    TONE_GAIN = 300.0  # highlights/shadows：× 百分位差
    TONE_MAX = 60.0
    EDGE_GAIN = 250.0  # whites/blacks
    EDGE_MAX = 40.0
    SAT_GAIN = 90.0  # × (chroma ratio - 1)
    SAT_MAX = 40.0
    BAND_SAT_GAIN = 160.0
    BAND_LUM_GAIN = 160.0
    BAND_ADJ_MAX = 35.0
    BAND_HUE_GAIN = 0.8
    BAND_HUE_MAX = 15.0
    CAST_THRESHOLD = 3.0  # Lab 距离，低于视为中性
    CAST_SAT_GAIN = 4.0
    CAST_SAT_MAX = 50.0
    STRONG_MULT = 1.35  # 强匹配：增益倍率
    STRONG_RANGE = 2.0  # 强匹配：夹取范围倍率
    SKIN_FRACTION_GATE = 0.08
    SKIN_BAND_SAT_MAX = 12.0
    SKIN_BAND_HUE_MAX = 5.0


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


@dataclass
class MatchOptions:
    strength: float = 0.8
    strong_match: bool = False
    protect_skin: bool = True


def lab_hue_deg(a, b):
    return math.degrees(math.atan2(b, a)) % 360.0


def lab_hue_to_hsl_hue(hab):
    """Lab 色相角到 HSL 色相的分段线性近似（锚点：红25→0，黄90→60，
    绿135→120，青青200→180，蓝270→240，品红330→300）。"""
    anchors_lab = [25.0, 90.0, 135.0, 200.0, 270.0, 330.0, 385.0]
    anchors_hsl = [0.0, 60.0, 120.0, 180.0, 240.0, 300.0, 360.0]
    h = hab % 360.0
    if h < anchors_lab[0]:
        h += 360.0
    for i in range(len(anchors_lab) - 1):
        lo, hi = anchors_lab[i], anchors_lab[i + 1]
        if lo <= h <= hi:
            t = (h - lo) / (hi - lo)
            return (anchors_hsl[i] + t * (anchors_hsl[i + 1] - anchors_hsl[i])) % 360.0
    return 0.0


def match(src: ImageStats, ref: ImageStats, opts: MatchOptions | None = None) -> GradeParameters:
    o = opts or MatchOptions()
    k = o.strength
    gm = Tuning.STRONG_MULT if o.strong_match else 1.0
    rm = Tuning.STRONG_RANGE if o.strong_match else 1.0
    p = GradeParameters()

    # 白平衡：Lab a/b 均值差
    p.temperature = clamp(
        Tuning.TEMP_GAIN * gm * (ref.mean_b - src.mean_b) * k,
        -Tuning.TEMP_MAX * rm, Tuning.TEMP_MAX * rm,
    )
    p.tint = clamp(
        Tuning.TINT_GAIN * gm * (ref.mean_a - src.mean_a) * k,
        -Tuning.TINT_MAX * rm, Tuning.TINT_MAX * rm,
    )

    # 曝光：线性亮度中位数比（stops）
    eps = 1e-4
    p.exposure = clamp(
        math.log2(max(ref.linear_luma_median, eps) / max(src.linear_luma_median, eps)) * k,
        -Tuning.EXPOSURE_MAX * rm, Tuning.EXPOSURE_MAX * rm,
    )

    # 对比：四分位距之比
    src_spread = src.luma_percentiles[4] - src.luma_percentiles[2]  # p75 - p25
    ref_spread = ref.luma_percentiles[4] - ref.luma_percentiles[2]
    if src_spread > 0.02:
        p.contrast = clamp(
            Tuning.CONTRAST_GAIN * gm * (ref_spread / src_spread - 1.0) * k,
            -Tuning.CONTRAST_MAX * rm, Tuning.CONTRAST_MAX * rm,
        )

    # 影调：曝光补偿后的源百分位 vs 参考百分位
    def exposure_adjusted(p_gamma):
        lin = srgb_decode(np.array(p_gamma)) * (2.0 ** p.exposure)
        return float(srgb_encode(lin))

    adj = [exposure_adjusted(v) for v in src.luma_percentiles]
    p.highlights = clamp(
        Tuning.TONE_GAIN * gm * (ref.luma_percentiles[5] - adj[5]) * k,
        -Tuning.TONE_MAX * rm, Tuning.TONE_MAX * rm,
    )
    p.shadows = clamp(
        Tuning.TONE_GAIN * gm * (ref.luma_percentiles[1] - adj[1]) * k,
        -Tuning.TONE_MAX * rm, Tuning.TONE_MAX * rm,
    )
    p.whites = clamp(
        Tuning.EDGE_GAIN * gm * (ref.luma_percentiles[6] - adj[6]) * k,
        -Tuning.EDGE_MAX * rm, Tuning.EDGE_MAX * rm,
    )
    p.blacks = clamp(
        Tuning.EDGE_GAIN * gm * (ref.luma_percentiles[0] - adj[0]) * k,
        -Tuning.EDGE_MAX * rm, Tuning.EDGE_MAX * rm,
    )

    # 饱和：整体 chroma 比，按肤色保护拆分 vibrance/saturation
    chroma_ratio = ref.mean_chroma / max(src.mean_chroma, 1e-3)
    sat_total = clamp(
        Tuning.SAT_GAIN * gm * (chroma_ratio - 1.0) * k,
        -Tuning.SAT_MAX * rm, Tuning.SAT_MAX * rm,
    )
    skin_present = (
        src.skin_fraction > Tuning.SKIN_FRACTION_GATE
        or ref.skin_fraction > Tuning.SKIN_FRACTION_GATE
    )
    if o.protect_skin and skin_present:
        p.vibrance, p.saturation = sat_total * 0.85, sat_total * 0.15
    else:
        p.vibrance, p.saturation = sat_total * 0.65, sat_total * 0.35

    # HSL 分通道
    for i in range(8):
        if (
            src.band_fraction[i] < BAND_MIN_FRACTION
            or ref.band_fraction[i] < BAND_MIN_FRACTION
        ):
            continue
        sat_adj = clamp(
            Tuning.BAND_SAT_GAIN * gm * (ref.band_sat[i] - src.band_sat[i]) * k,
            -Tuning.BAND_ADJ_MAX * rm, Tuning.BAND_ADJ_MAX * rm,
        )
        lum_adj = clamp(
            Tuning.BAND_LUM_GAIN * gm * (ref.band_lum[i] - src.band_lum[i]) * k,
            -Tuning.BAND_ADJ_MAX * rm, Tuning.BAND_ADJ_MAX * rm,
        )
        hue_adj = clamp(
            Tuning.BAND_HUE_GAIN * gm * (ref.band_hue_shift[i] - src.band_hue_shift[i]) * k,
            -Tuning.BAND_HUE_MAX * rm, Tuning.BAND_HUE_MAX * rm,
        )
        if o.protect_skin and skin_present and BAND_NAMES[i] == "orange":
            sat_adj = clamp(sat_adj, -Tuning.SKIN_BAND_SAT_MAX, Tuning.SKIN_BAND_SAT_MAX)
            hue_adj = clamp(hue_adj, -Tuning.SKIN_BAND_HUE_MAX, Tuning.SKIN_BAND_HUE_MAX)
        p.hsl_sat[i] = sat_adj
        p.hsl_lum[i] = lum_adj
        p.hsl_hue[i] = hue_adj

    # 色彩分级：参考图与源图“区域残余色偏”（阴影/高光相对各自全局均值）之差。
    # 源图已有的区域色偏不需要补，只补两者的差值。
    rs_a = (ref.shadow_a - ref.mean_a) - (src.shadow_a - src.mean_a)
    rs_b = (ref.shadow_b - ref.mean_b) - (src.shadow_b - src.mean_b)
    mag = math.hypot(rs_a, rs_b)
    if mag > Tuning.CAST_THRESHOLD:
        p.shadow_tint_hue = lab_hue_to_hsl_hue(lab_hue_deg(rs_a, rs_b))
        p.shadow_tint_sat = clamp(mag * Tuning.CAST_SAT_GAIN * k, 0.0, Tuning.CAST_SAT_MAX)
    rh_a = (ref.highlight_a - ref.mean_a) - (src.highlight_a - src.mean_a)
    rh_b = (ref.highlight_b - ref.mean_b) - (src.highlight_b - src.mean_b)
    mag = math.hypot(rh_a, rh_b)
    if mag > Tuning.CAST_THRESHOLD:
        p.highlight_tint_hue = lab_hue_to_hsl_hue(lab_hue_deg(rh_a, rh_b))
        p.highlight_tint_sat = clamp(mag * Tuning.CAST_SAT_GAIN * k, 0.0, Tuning.CAST_SAT_MAX)

    return p


# ---------------------------------------------------------------------------
# 不动点残差精修（与 Swift ColorMatcher.matchImages 一致）
#
# 单发前馈估计假设“参数→统计量”彼此独立，但渲染管线是耦合的（饱和度会
# 牵动亮度分布、白平衡会牵动色度）。精修把当前参数真实应用到源图 proxy，
# 重新测量统计量，用残差乘阻尼系数反馈回参数，迭代固定轮数。
# ---------------------------------------------------------------------------

REFINE_ITERATIONS = 2
REFINE_DAMPING = 0.7
PROXY_MAX_DIM = 128


def downsample(rgba_u8, max_dim=PROXY_MAX_DIM):
    """确定性下采样：等步长抽取（与 Swift 一致，不做平均）。"""
    h, w = rgba_u8.shape[:2]
    step = max(1, (max(h, w) + max_dim - 1) // max_dim)
    return rgba_u8[::step, ::step]


def wheel_vec(hue_deg, sat):
    r = math.radians(hue_deg)
    return sat * math.cos(r), sat * math.sin(r)


def wheel_from_vec(x, y):
    sat = math.hypot(x, y)
    hue = math.degrees(math.atan2(y, x)) % 360.0
    return hue, sat


def _refine(p: GradeParameters, res: ImageStats, ref: ImageStats, o: MatchOptions) -> GradeParameters:
    """用（已应用当前参数的）结果统计 vs 参考统计的残差修正参数。"""
    k = o.strength * REFINE_DAMPING
    gm_ = Tuning.STRONG_MULT if o.strong_match else 1.0
    rm = Tuning.STRONG_RANGE if o.strong_match else 1.0

    p.temperature = clamp(
        p.temperature + Tuning.TEMP_GAIN * gm_ * (ref.mean_b - res.mean_b) * k,
        -Tuning.TEMP_MAX * rm, Tuning.TEMP_MAX * rm,
    )
    p.tint = clamp(
        p.tint + Tuning.TINT_GAIN * gm_ * (ref.mean_a - res.mean_a) * k,
        -Tuning.TINT_MAX * rm, Tuning.TINT_MAX * rm,
    )
    eps = 1e-4
    p.exposure = clamp(
        p.exposure + math.log2(max(ref.linear_luma_median, eps) / max(res.linear_luma_median, eps)) * k,
        -Tuning.EXPOSURE_MAX * rm, Tuning.EXPOSURE_MAX * rm,
    )
    res_spread = res.luma_percentiles[4] - res.luma_percentiles[2]
    ref_spread = ref.luma_percentiles[4] - ref.luma_percentiles[2]
    if res_spread > 0.02:
        p.contrast = clamp(
            p.contrast + Tuning.CONTRAST_GAIN * gm_ * (ref_spread / res_spread - 1.0) * k,
            -Tuning.CONTRAST_MAX * rm, Tuning.CONTRAST_MAX * rm,
        )
    p.highlights = clamp(
        p.highlights + Tuning.TONE_GAIN * gm_ * (ref.luma_percentiles[5] - res.luma_percentiles[5]) * k,
        -Tuning.TONE_MAX * rm, Tuning.TONE_MAX * rm,
    )
    p.shadows = clamp(
        p.shadows + Tuning.TONE_GAIN * gm_ * (ref.luma_percentiles[1] - res.luma_percentiles[1]) * k,
        -Tuning.TONE_MAX * rm, Tuning.TONE_MAX * rm,
    )
    p.whites = clamp(
        p.whites + Tuning.EDGE_GAIN * gm_ * (ref.luma_percentiles[6] - res.luma_percentiles[6]) * k,
        -Tuning.EDGE_MAX * rm, Tuning.EDGE_MAX * rm,
    )
    p.blacks = clamp(
        p.blacks + Tuning.EDGE_GAIN * gm_ * (ref.luma_percentiles[0] - res.luma_percentiles[0]) * k,
        -Tuning.EDGE_MAX * rm, Tuning.EDGE_MAX * rm,
    )

    chroma_ratio = ref.mean_chroma / max(res.mean_chroma, 1e-3)
    sat_delta = clamp(Tuning.SAT_GAIN * gm_ * (chroma_ratio - 1.0) * k, -Tuning.SAT_MAX, Tuning.SAT_MAX)
    skin_present = (
        res.skin_fraction > Tuning.SKIN_FRACTION_GATE
        or ref.skin_fraction > Tuning.SKIN_FRACTION_GATE
    )
    vib_share, sat_share = (0.85, 0.15) if (o.protect_skin and skin_present) else (0.65, 0.35)
    p.vibrance = clamp(p.vibrance + sat_delta * vib_share, -Tuning.SAT_MAX * rm, Tuning.SAT_MAX * rm)
    p.saturation = clamp(p.saturation + sat_delta * sat_share, -Tuning.SAT_MAX * rm, Tuning.SAT_MAX * rm)

    for i in range(8):
        if (
            res.band_fraction[i] < BAND_MIN_FRACTION
            or ref.band_fraction[i] < BAND_MIN_FRACTION
        ):
            continue
        sat_max, hue_max = Tuning.BAND_ADJ_MAX * rm, Tuning.BAND_HUE_MAX * rm
        if o.protect_skin and skin_present and BAND_NAMES[i] == "orange":
            sat_max = min(sat_max, Tuning.SKIN_BAND_SAT_MAX)
            hue_max = min(hue_max, Tuning.SKIN_BAND_HUE_MAX)
        p.hsl_sat[i] = clamp(
            p.hsl_sat[i] + Tuning.BAND_SAT_GAIN * gm_ * (ref.band_sat[i] - res.band_sat[i]) * k,
            -sat_max, sat_max,
        )
        p.hsl_lum[i] = clamp(
            p.hsl_lum[i] + Tuning.BAND_LUM_GAIN * gm_ * (ref.band_lum[i] - res.band_lum[i]) * k,
            -Tuning.BAND_ADJ_MAX * rm, Tuning.BAND_ADJ_MAX * rm,
        )
        p.hsl_hue[i] = clamp(
            p.hsl_hue[i] + Tuning.BAND_HUE_GAIN * gm_ * (ref.band_hue_shift[i] - res.band_hue_shift[i]) * k,
            -hue_max, hue_max,
        )

    # 色彩分级精修：在“轮盘向量”空间做残差叠加
    def zone_residual(st, zone):
        if zone == "shadow":
            return st.shadow_a - st.mean_a, st.shadow_b - st.mean_b
        return st.highlight_a - st.mean_a, st.highlight_b - st.mean_b

    for zone in ("shadow", "highlight"):
        ra, rb = zone_residual(ref, zone)
        sa, sb = zone_residual(res, zone)
        err_a, err_b = ra - sa, rb - sb
        mag = math.hypot(err_a, err_b)
        if zone == "shadow":
            cur = wheel_vec(p.shadow_tint_hue, p.shadow_tint_sat)
        else:
            cur = wheel_vec(p.highlight_tint_hue, p.highlight_tint_sat)
        if mag > 0.5:
            err_hue = lab_hue_to_hsl_hue(lab_hue_deg(err_a, err_b))
            dx, dy = wheel_vec(err_hue, mag * Tuning.CAST_SAT_GAIN * k)
            cur = (cur[0] + dx, cur[1] + dy)
        hue, sat = wheel_from_vec(*cur)
        sat = clamp(sat, 0.0, Tuning.CAST_SAT_MAX)
        if sat < 1.0:
            hue, sat = 0.0, 0.0
        if zone == "shadow":
            p.shadow_tint_hue, p.shadow_tint_sat = hue, sat
        else:
            p.highlight_tint_hue, p.highlight_tint_sat = hue, sat

    return p


def match_images(src_rgba, ref_rgba, opts: MatchOptions | None = None) -> GradeParameters:
    """完整匹配入口：初始前馈估计 + REFINE_ITERATIONS 轮渲染闭环精修。"""
    o = opts or MatchOptions()
    src_proxy = downsample(src_rgba)
    ref_stats = compute_stats(ref_rgba)
    p = match(compute_stats(src_proxy), ref_stats, o)
    proxy01 = src_proxy[..., :3].astype(np.float64) / 255.0
    for _ in range(REFINE_ITERATIONS):
        rendered = apply_grade(proxy01, p)
        p = _refine(p, compute_stats_px(rendered.reshape(-1, 3)), ref_stats, o)
    return p


# ---------------------------------------------------------------------------
# 渲染管线（与 Swift GradeRenderer.swift 一致）——参数 → 像素变换
# 固定顺序：WB → 曝光 → 影调 → 对比 → HSL/饱和 → 色彩分级
# ---------------------------------------------------------------------------


class RenderTuning:
    WB_TEMP_COEF = 0.0025  # 每 temperature 单位的通道增益
    WB_TINT_COEF = 0.0020
    TONE_SHADOW_AMOUNT = 0.25
    TONE_HIGHLIGHT_AMOUNT = 0.25
    TONE_BLACK_AMOUNT = 0.20
    TONE_WHITE_AMOUNT = 0.20
    CONTRAST_COEF = 0.008
    HSL_HUE_DEG_PER_UNIT = 0.3
    HSL_SAT_COEF = 0.008
    HSL_LUM_COEF = 0.002
    VIBRANCE_COEF = 1.2
    GRADE_AMOUNT = 0.15


def apply_grade(rgb01, p: GradeParameters):
    """rgb01: (..., 3) gamma sRGB in [0,1] -> graded gamma sRGB in [0,1]."""
    rgb = np.clip(np.asarray(rgb01, dtype=np.float64), 0.0, 1.0)
    lin = srgb_decode(rgb)

    # 1. 白平衡
    r_gain = 1.0 + RenderTuning.WB_TEMP_COEF * p.temperature
    b_gain = 1.0 - RenderTuning.WB_TEMP_COEF * p.temperature
    g_gain = 1.0 - RenderTuning.WB_TINT_COEF * p.tint
    lin = lin * np.array([r_gain, g_gain, b_gain])

    # 2. 曝光
    lin = lin * (2.0 ** p.exposure)
    lin = np.clip(lin, 0.0, None)

    # 3+4. 影调 + 对比（在 gamma 亮度域做统一 remap，再按比例作用到 RGB）
    rgb = srgb_encode(np.clip(lin, 0.0, 4.0))
    y = np.clip(
        0.2126729 * rgb[..., 0] + 0.7151522 * rgb[..., 1] + 0.0721750 * rgb[..., 2],
        1e-4, 1.0,
    )
    y2 = y.copy()
    y2 = y2 + (p.shadows / 100.0) * RenderTuning.TONE_SHADOW_AMOUNT * (
        1.0 - smoothstep(0.0, 0.5, y)
    )
    y2 = y2 + (p.highlights / 100.0) * RenderTuning.TONE_HIGHLIGHT_AMOUNT * smoothstep(
        0.5, 1.0, y
    )
    y2 = y2 + (p.blacks / 100.0) * RenderTuning.TONE_BLACK_AMOUNT * (
        1.0 - smoothstep(0.0, 0.25, y)
    )
    y2 = y2 + (p.whites / 100.0) * RenderTuning.TONE_WHITE_AMOUNT * smoothstep(
        0.75, 1.0, y
    )
    c = 1.0 + RenderTuning.CONTRAST_COEF * p.contrast
    y2 = 0.5 + (y2 - 0.5) * c
    y2 = np.clip(y2, 0.0, 1.0)
    rgb = np.clip(rgb * (y2 / y)[..., None], 0.0, 1.0)

    # 5. HSL 分通道 + vibrance/saturation
    hsl = rgb_to_hsl(rgb)
    h, s, l = hsl[..., 0], hsl[..., 1], hsl[..., 2]
    w = band_weights(h)
    hue_shift = (w * np.array(p.hsl_hue)).sum(axis=-1) * RenderTuning.HSL_HUE_DEG_PER_UNIT
    sat_mult = 1.0 + (w * np.array(p.hsl_sat)).sum(axis=-1) * RenderTuning.HSL_SAT_COEF
    lum_add = (w * np.array(p.hsl_lum)).sum(axis=-1) * RenderTuning.HSL_LUM_COEF
    h = (h + hue_shift) % 360.0
    s = np.clip(s * sat_mult, 0.0, 1.0)
    l = np.clip(l + lum_add * (1.0 - np.abs(2.0 * l - 1.0)), 0.0, 1.0)

    s = np.clip(s * (1.0 + p.saturation / 100.0), 0.0, 1.0)
    v = p.vibrance / 100.0
    s = np.clip(s + v * RenderTuning.VIBRANCE_COEF * (1.0 - s) * s, 0.0, 1.0)
    rgb = hsl_to_rgb(h, s, l)

    # 6. 色彩分级（split tone）
    y = np.clip(
        0.2126729 * rgb[..., 0] + 0.7151522 * rgb[..., 1] + 0.0721750 * rgb[..., 2],
        0.0, 1.0,
    )
    bal = p.grading_balance / 200.0
    if p.shadow_tint_sat > 0:
        wt = (1.0 - smoothstep(0.15, 0.6, y)) * (1.0 - bal)
        direction = hsl_to_rgb(
            np.array(p.shadow_tint_hue), np.array(1.0), np.array(0.5)
        ) - 0.5
        rgb = rgb + direction * (p.shadow_tint_sat / 100.0) * RenderTuning.GRADE_AMOUNT * wt[..., None]
    if p.highlight_tint_sat > 0:
        wt = smoothstep(0.4, 0.85, y) * (1.0 + bal)
        direction = hsl_to_rgb(
            np.array(p.highlight_tint_hue), np.array(1.0), np.array(0.5)
        ) - 0.5
        rgb = rgb + direction * (p.highlight_tint_sat / 100.0) * RenderTuning.GRADE_AMOUNT * wt[..., None]

    return np.clip(rgb, 0.0, 1.0)


def build_lut(p: GradeParameters, size: int = 33):
    """生成 size³ 3D LUT，返回 (size, size, size, 3)，索引序 [b][g][r]（CIColorCube 约定）。"""
    axis = np.arange(size, dtype=np.float64) / (size - 1)
    b, g, r = np.meshgrid(axis, axis, axis, indexing="ij")
    grid = np.stack([r, g, b], axis=-1)
    return apply_grade(grid, p)


def apply_lut(rgba_u8, lut):
    """CPU 三线性插值应用 LUT（与 Swift LUT.apply 一致），返回 uint8 RGB。"""
    size = lut.shape[0]
    rgb = rgba_u8[..., :3].astype(np.float64) / 255.0
    pos = rgb * (size - 1)
    i0 = np.clip(np.floor(pos).astype(int), 0, size - 2)
    f = pos - i0
    r0, g0, b0 = i0[..., 0], i0[..., 1], i0[..., 2]
    fr, fg, fb = f[..., 0:1], f[..., 1:2], f[..., 2:3]

    def L(bi, gi, ri):
        return lut[bi, gi, ri]

    c000 = L(b0, g0, r0)
    c100 = L(b0, g0, r0 + 1)
    c010 = L(b0, g0 + 1, r0)
    c110 = L(b0, g0 + 1, r0 + 1)
    c001 = L(b0 + 1, g0, r0)
    c101 = L(b0 + 1, g0, r0 + 1)
    c011 = L(b0 + 1, g0 + 1, r0)
    c111 = L(b0 + 1, g0 + 1, r0 + 1)
    c00 = c000 * (1 - fr) + c100 * fr
    c10 = c010 * (1 - fr) + c110 * fr
    c01 = c001 * (1 - fr) + c101 * fr
    c11 = c011 * (1 - fr) + c111 * fr
    c0 = c00 * (1 - fg) + c10 * fg
    c1 = c01 * (1 - fg) + c11 * fg
    out = c0 * (1 - fb) + c1 * fb
    return quantize_u8(out)


# ---------------------------------------------------------------------------
# 确定性合成测试图（与 Swift SyntheticImages.swift 一致）
# ---------------------------------------------------------------------------


def base_scene(w=96, h=96):
    """基准场景：双向渐变 + 中央“肤色”矩形 + 角落高饱和块，覆盖多个色相通道。"""
    img = np.zeros((h, w, 4), dtype=np.float64)
    for y in range(h):
        for x in range(w):
            r = x / (w - 1)
            g = y / (h - 1)
            b = (x + y) / (w + h - 2)
            img[y, x, :3] = (r * 0.85 + 0.05, g * 0.75 + 0.1, b * 0.8 + 0.08)
    # 肤色块（中央 1/3）
    for y in range(h // 3, 2 * h // 3):
        for x in range(w // 3, 2 * w // 3):
            img[y, x, :3] = (0.85, 0.62, 0.5)
    # 四角色块：蓝天 / 绿植 / 暖橙 / 深阴影
    q = max(1, w // 6)
    img[:q, :q, :3] = (0.35, 0.55, 0.85)
    img[:q, -q:, :3] = (0.3, 0.65, 0.35)
    img[-q:, :q, :3] = (0.9, 0.55, 0.25)
    img[-q:, -q:, :3] = (0.12, 0.1, 0.14)
    img[..., 3] = 1.0
    return quantize_u8(img)


def variant(rgba_u8, name):
    """对基准场景做确定性风格化，得到“参考图”。两边公式必须一致。"""
    rgb = rgba_u8[..., :3].astype(np.float64) / 255.0
    if name == "warm":
        rgb = np.clip(rgb * np.array([1.12, 1.0, 0.86]), 0, 1)
    elif name == "bright_soft":
        lin = srgb_decode(rgb) * 1.6
        rgb = srgb_encode(np.clip(lin, 0, 1))
        rgb = 0.5 + (rgb - 0.5) * 0.85  # 降对比
    elif name == "teal_orange":
        hsl = rgb_to_hsl(rgb)
        y = hsl[..., 2]
        shadow_w = np.clip(1.0 - y / 0.5, 0, 1)[..., None]
        hi_w = np.clip((y - 0.5) / 0.5, 0, 1)[..., None]
        rgb = np.clip(
            rgb + shadow_w * np.array([-0.06, 0.02, 0.08]) + hi_w * np.array([0.08, 0.02, -0.06]),
            0, 1,
        )
    elif name == "faded":
        rgb = 0.5 + (rgb - 0.5) * 0.8
        rgb = np.clip(rgb + 0.06, 0, 1)
        hsl = rgb_to_hsl(rgb)
        rgb = hsl_to_rgb(hsl[..., 0], hsl[..., 1] * 0.7, hsl[..., 2])
    else:
        raise ValueError(name)
    out = rgba_u8.copy()
    out[..., :3] = quantize_u8(rgb)
    return out
