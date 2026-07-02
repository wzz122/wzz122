"""算法验收：双图仿色的闭环收敛测试。

对每组（基准图, 风格化参考图）：
1. match() 得到 GradeParameters；
2. build_lut() + apply_lut() 把参数应用回基准图；
3. 断言结果图与参考图在各统计维度上的距离，相比基准图显著缩小。

这是架构文档 M1 验收标准在无 Lightroom 环境下的可执行等价物。
"""

from __future__ import annotations

import math
import sys

import numpy as np

import grade_math as gm

VARIANTS = ["warm", "bright_soft", "teal_orange", "faded"]

# 每个维度的定义：名称, 提取函数, 收敛比阈值（after/before 必须 < 阈值）
def dim_wb(st):
    return np.array([st.mean_a, st.mean_b])

def dim_exposure(st):
    return np.array([st.luma_percentiles[3]])  # p50 gamma luma

def dim_contrast(st):
    return np.array([st.luma_percentiles[4] - st.luma_percentiles[2]])

def dim_chroma(st):
    return np.array([st.mean_chroma])

def dim_cast(st):
    return np.array([
        st.shadow_a - st.mean_a, st.shadow_b - st.mean_b,
        st.highlight_a - st.mean_a, st.highlight_b - st.mean_b,
    ])

# (维度名, 提取函数, 收敛比阈值, 绝对地板值)
# 判定：after <= max(floor, before * threshold)
# floor 的含义：低于该值的差异在感知上可忽略，不要求继续压缩（其它参数的
# 耦合作用允许在地板内漂移）。
DIMS = [
    ("white_balance", dim_wb, 0.55, 1.0),
    ("exposure_p50", dim_exposure, 0.55, 0.02),
    ("contrast_spread", dim_contrast, 0.75, 0.02),
    ("global_chroma", dim_chroma, 0.75, 1.5),
    ("zone_cast", dim_cast, 0.85, 3.0),
]


def run():
    base = gm.base_scene()
    src_stats = gm.compute_stats(base)
    failures = []
    print(f"{'pair':<14} {'dimension':<18} {'before':>9} {'after':>9} {'allowed':>9}  verdict")
    for name in VARIANTS:
        ref = gm.variant(base, name)
        ref_stats = gm.compute_stats(ref)
        params = gm.match_images(base, ref)
        lut = gm.build_lut(params, size=33)
        result = base.copy()
        result[..., :3] = gm.apply_lut(base, lut)
        res_stats = gm.compute_stats(result)

        for dim_name, fn, threshold, floor in DIMS:
            before = float(np.linalg.norm(fn(ref_stats) - fn(src_stats)))
            after = float(np.linalg.norm(fn(ref_stats) - fn(res_stats)))
            allowed = max(floor, before * threshold)
            ok = after <= allowed
            verdict = "ok" if ok else "FAIL"
            if not ok:
                failures.append((name, dim_name, before, after, allowed))
            print(f"{name:<14} {dim_name:<18} {before:>9.4f} {after:>9.4f} {allowed:>9.4f}  {verdict}")

    # 确定性检查：同输入两次匹配结果必须逐位一致
    p1 = gm.match_images(base, gm.variant(base, "warm"))
    p2 = gm.match_images(base, gm.variant(base, "warm"))
    assert p1.as_dict() == p2.as_dict(), "matcher must be deterministic"

    # 恒等检查：零参数 LUT 应用后图像几乎不变（只有量化误差）
    identity = gm.build_lut(gm.GradeParameters(), size=33)
    out = gm.apply_lut(base, identity)
    max_err = int(np.abs(out.astype(int) - base[..., :3].astype(int)).max())
    print(f"\nidentity LUT max per-channel error: {max_err} (must be <= 1)")
    assert max_err <= 1, "identity LUT must be a no-op up to quantization"

    if failures:
        print(f"\n{len(failures)} FAILURES:")
        for f in failures:
            print("  ", f)
        sys.exit(1)
    print("\nALL ACCEPTANCE CHECKS PASSED")


if __name__ == "__main__":
    run()
