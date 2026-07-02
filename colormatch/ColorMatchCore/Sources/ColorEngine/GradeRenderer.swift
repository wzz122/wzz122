import Foundation

/// 参数 → 像素变换。固定顺序：WB → 曝光 → 影调 → 对比 → HSL/饱和 → 色彩分级。
/// 与 reference/grade_math.py 的 apply_grade 逐公式一致。
/// LUTBuilder 用它填 LUT；ColorMatcher 用它做精修闭环。
public enum GradeRenderer {
    /// 渲染管线调参常数（改动必须与 Python RenderTuning 同步）
    public enum Tuning {
        public static let wbTempCoef = 0.0025
        public static let wbTintCoef = 0.0020
        public static let toneShadowAmount = 0.25
        public static let toneHighlightAmount = 0.25
        public static let toneBlackAmount = 0.20
        public static let toneWhiteAmount = 0.20
        public static let contrastCoef = 0.008
        public static let hslHueDegPerUnit = 0.3
        public static let hslSatCoef = 0.008
        public static let hslLumCoef = 0.002
        public static let vibranceCoef = 1.2
        public static let gradeAmount = 0.15
    }

    /// 单像素变换：gamma sRGB [0,1] -> gamma sRGB [0,1]
    public static func apply(_ input: SIMD3<Double>, params p: GradeParameters) -> SIMD3<Double> {
        var rgb = clamp01(input)
        var lin = SIMD3(
            ColorMath.srgbDecode(rgb.x),
            ColorMath.srgbDecode(rgb.y),
            ColorMath.srgbDecode(rgb.z)
        )

        // 1. 白平衡
        lin.x *= 1.0 + Tuning.wbTempCoef * p.temperature
        lin.z *= 1.0 - Tuning.wbTempCoef * p.temperature
        lin.y *= 1.0 - Tuning.wbTintCoef * p.tint

        // 2. 曝光
        let gain = pow(2.0, p.exposure)
        lin = SIMD3(max(lin.x * gain, 0), max(lin.y * gain, 0), max(lin.z * gain, 0))

        // 3+4. 影调 + 对比：gamma 亮度域统一 remap，按比例作用到 RGB
        lin = SIMD3(min(lin.x, 4), min(lin.y, 4), min(lin.z, 4))
        rgb = SIMD3(
            ColorMath.srgbEncode(lin.x),
            ColorMath.srgbEncode(lin.y),
            ColorMath.srgbEncode(lin.z)
        )
        let y = ColorMath.clamp(
            0.2126729 * rgb.x + 0.7151522 * rgb.y + 0.0721750 * rgb.z, 1e-4, 1.0
        )
        var y2 = y
        y2 += (p.shadows / 100) * Tuning.toneShadowAmount * (1 - ColorMath.smoothstep(0, 0.5, y))
        y2 += (p.highlights / 100) * Tuning.toneHighlightAmount * ColorMath.smoothstep(0.5, 1, y)
        y2 += (p.blacks / 100) * Tuning.toneBlackAmount * (1 - ColorMath.smoothstep(0, 0.25, y))
        y2 += (p.whites / 100) * Tuning.toneWhiteAmount * ColorMath.smoothstep(0.75, 1, y)
        y2 = 0.5 + (y2 - 0.5) * (1 + Tuning.contrastCoef * p.contrast)
        y2 = ColorMath.clamp(y2, 0, 1)
        rgb = clamp01(rgb * (y2 / y))

        // 5. HSL 分通道 + vibrance/saturation
        let hsl = ColorMath.rgbToHSL(rgb)
        var h = hsl.x
        var s = hsl.y
        var l = hsl.z
        let w = ColorMath.bandWeights(h)
        var hueShift = 0.0, satFactor = 0.0, lumAdd = 0.0
        for b in 0..<8 where w[b] > 0 {
            hueShift += w[b] * p.hslHue[b]
            satFactor += w[b] * p.hslSat[b]
            lumAdd += w[b] * p.hslLum[b]
        }
        h = ColorMath.positiveMod(h + hueShift * Tuning.hslHueDegPerUnit, 360)
        s = ColorMath.clamp(s * (1 + satFactor * Tuning.hslSatCoef), 0, 1)
        l = ColorMath.clamp(l + lumAdd * Tuning.hslLumCoef * (1 - abs(2 * l - 1)), 0, 1)

        s = ColorMath.clamp(s * (1 + p.saturation / 100), 0, 1)
        let v = p.vibrance / 100
        s = ColorMath.clamp(s + v * Tuning.vibranceCoef * (1 - s) * s, 0, 1)
        rgb = ColorMath.hslToRGB(h, s, l)

        // 6. 色彩分级（split tone）
        let y3 = ColorMath.clamp(
            0.2126729 * rgb.x + 0.7151522 * rgb.y + 0.0721750 * rgb.z, 0, 1
        )
        let bal = p.gradingBalance / 200
        if p.shadowTintSat > 0 {
            let wt = (1 - ColorMath.smoothstep(0.15, 0.6, y3)) * (1 - bal)
            let direction = ColorMath.hslToRGB(p.shadowTintHue, 1, 0.5) - SIMD3(repeating: 0.5)
            rgb += direction * ((p.shadowTintSat / 100) * Tuning.gradeAmount * wt)
        }
        if p.highlightTintSat > 0 {
            let wt = ColorMath.smoothstep(0.4, 0.85, y3) * (1 + bal)
            let direction = ColorMath.hslToRGB(p.highlightTintHue, 1, 0.5) - SIMD3(repeating: 0.5)
            rgb += direction * ((p.highlightTintSat / 100) * Tuning.gradeAmount * wt)
        }

        return clamp01(rgb)
    }

    /// 批量变换（供精修闭环与测试使用）
    public static func apply(_ pixels: [SIMD3<Double>], params: GradeParameters) -> [SIMD3<Double>] {
        pixels.map { apply($0, params: params) }
    }

    @inlinable
    static func clamp01(_ v: SIMD3<Double>) -> SIMD3<Double> {
        SIMD3(
            ColorMath.clamp(v.x, 0, 1),
            ColorMath.clamp(v.y, 0, 1),
            ColorMath.clamp(v.z, 0, 1)
        )
    }
}
