"""从 Python 参照实现生成 Swift golden 测试文件。

产出 Tests/ColorEngineTests/GoldenVectors.swift：
- 基准合成图的 ImageStats 关键值（定位统计层移植偏差）；
- 每组风格对 match_images 的 GradeParameters（定位匹配器移植偏差）；
- warm 参数下 33³ LUT 的抽样点（定位渲染器移植偏差）。

改动 grade_math.py 的任何常数后必须重跑本脚本。
"""

from __future__ import annotations

import numpy as np

import grade_math as gm

OUT = "../ColorMatchCore/Tests/ColorEngineTests/GoldenVectors.swift"

VARIANTS = ["warm", "bright_soft", "teal_orange", "faded"]


def fmt(v):
    return f"{v:.10f}"


def fmt_list(vals):
    return "[" + ", ".join(fmt(v) for v in vals) + "]"


def params_literal(p):
    return f"""GoldenParams(
        temperature: {fmt(p.temperature)}, tint: {fmt(p.tint)},
        exposure: {fmt(p.exposure)}, contrast: {fmt(p.contrast)},
        highlights: {fmt(p.highlights)}, shadows: {fmt(p.shadows)},
        whites: {fmt(p.whites)}, blacks: {fmt(p.blacks)},
        vibrance: {fmt(p.vibrance)}, saturation: {fmt(p.saturation)},
        hslHue: {fmt_list(p.hsl_hue)},
        hslSat: {fmt_list(p.hsl_sat)},
        hslLum: {fmt_list(p.hsl_lum)},
        shadowTintHue: {fmt(p.shadow_tint_hue)}, shadowTintSat: {fmt(p.shadow_tint_sat)},
        highlightTintHue: {fmt(p.highlight_tint_hue)}, highlightTintSat: {fmt(p.highlight_tint_sat)}
    )"""


def main():
    base = gm.base_scene()
    st = gm.compute_stats(base)

    lines = []
    lines.append("// 本文件由 reference/gen_goldens.py 自动生成，禁止手改。")
    lines.append("// Python 参照实现与 Swift 实现的交叉校验数据。")
    lines.append("// 重新生成：cd colormatch/reference && python3 gen_goldens.py")
    lines.append("")
    lines.append("struct GoldenParams {")
    for f in ["temperature", "tint", "exposure", "contrast", "highlights",
              "shadows", "whites", "blacks", "vibrance", "saturation"]:
        lines.append(f"    let {f}: Double")
    lines.append("    let hslHue: [Double]")
    lines.append("    let hslSat: [Double]")
    lines.append("    let hslLum: [Double]")
    lines.append("    let shadowTintHue: Double")
    lines.append("    let shadowTintSat: Double")
    lines.append("    let highlightTintHue: Double")
    lines.append("    let highlightTintSat: Double")
    lines.append("}")
    lines.append("")
    lines.append("enum GoldenVectors {")

    # 1. 基准图统计
    lines.append("    // base_scene() 的 ImageStats 关键值")
    lines.append(f"    static let baseLumaPercentiles: [Double] = {fmt_list(st.luma_percentiles)}")
    lines.append(f"    static let baseLinearLumaMedian: Double = {fmt(st.linear_luma_median)}")
    lines.append(f"    static let baseMeanLab: [Double] = {fmt_list([st.mean_l, st.mean_a, st.mean_b])}")
    lines.append(f"    static let baseMeanChroma: Double = {fmt(st.mean_chroma)}")
    lines.append(f"    static let baseShadowCast: [Double] = {fmt_list([st.shadow_a, st.shadow_b])}")
    lines.append(f"    static let baseHighlightCast: [Double] = {fmt_list([st.highlight_a, st.highlight_b])}")
    lines.append(f"    static let baseBandFraction: [Double] = {fmt_list(st.band_fraction)}")
    lines.append(f"    static let baseBandSat: [Double] = {fmt_list(st.band_sat)}")
    lines.append(f"    static let baseSkinFraction: Double = {fmt(st.skin_fraction)}")
    lines.append("")

    # 2. 各风格对的匹配参数
    lines.append("    // match_images(base, variant) 的参数（strength=0.8 默认选项）")
    lines.append("    static let matchGoldens: [String: GoldenParams] = [")
    for name in VARIANTS:
        p = gm.match_images(base, gm.variant(base, name))
        lines.append(f'        "{name}": {params_literal(p)},')
    lines.append("    ]")
    lines.append("")

    # 3. warm 参数下的 LUT 抽样（索引序 [b][g][r]，与 CIColorCube 一致）
    p_warm = gm.match_images(base, gm.variant(base, "warm"))
    lut = gm.build_lut(p_warm, size=33)
    samples = []
    probe = [0, 8, 16, 24, 32]
    for bi in probe:
        for gi in probe:
            for ri in probe:
                rgb = lut[bi, gi, ri]
                samples.append((bi, gi, ri, rgb))
    lines.append("    // warm 参数 33³ LUT 抽样：(bIdx, gIdx, rIdx, r, g, b)")
    lines.append("    static let warmLUTSamples: [(Int, Int, Int, Double, Double, Double)] = [")
    for bi, gi, ri, rgb in samples:
        lines.append(
            f"        ({bi}, {gi}, {ri}, {fmt(rgb[0])}, {fmt(rgb[1])}, {fmt(rgb[2])}),"
        )
    lines.append("    ]")
    lines.append("}")

    with open(OUT, "w") as f:
        f.write("\n".join(lines) + "\n")
    print(f"wrote {OUT}: {len(lines)} lines")
    print("warm params:", {k: round(v, 3) for k, v in p_warm.as_dict().items() if not isinstance(v, list)})


if __name__ == "__main__":
    main()
