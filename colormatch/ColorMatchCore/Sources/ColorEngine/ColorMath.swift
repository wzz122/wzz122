import Foundation

/// 色彩空间与基础数学。与 reference/grade_math.py 逐公式一致：
/// 任何常数改动必须两边同步，并重跑 gen_goldens.py。
public enum ColorMath {
    /// Lightroom 8 个 HSL 通道的色相中心（度）
    public static let bandCenters: [Double] = [0, 30, 60, 120, 180, 240, 280, 320]
    public static let bandNames: [String] = [
        "red", "orange", "yellow", "green", "aqua", "blue", "purple", "magenta",
    ]

    @inlinable
    public static func clamp(_ v: Double, _ lo: Double, _ hi: Double) -> Double {
        min(hi, max(lo, v))
    }

    /// Python 语义的取模：结果恒为非负
    @inlinable
    public static func positiveMod(_ x: Double, _ m: Double) -> Double {
        let r = x.truncatingRemainder(dividingBy: m)
        return r < 0 ? r + m : r
    }

    /// [0,1] -> uint8，floor(x*255+0.5)。与 Python quantize_u8 一致，
    /// 禁止改成 rounded()（舍入规则跨语言不一致）。
    @inlinable
    public static func quantizeU8(_ v: Double) -> UInt8 {
        UInt8((clamp(v, 0, 1) * 255.0 + 0.5).rounded(.down))
    }

    @inlinable
    public static func srgbDecode(_ c: Double) -> Double {
        c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4)
    }

    @inlinable
    public static func srgbEncode(_ c: Double) -> Double {
        let c = max(c, 0)
        return c <= 0.0031308 ? c * 12.92 : 1.055 * pow(c, 1.0 / 2.4) - 0.055
    }

    @inlinable
    public static func linearLuma(_ rgb: SIMD3<Double>) -> Double {
        0.2126729 * rgb.x + 0.7151522 * rgb.y + 0.0721750 * rgb.z
    }

    @inlinable
    public static func smoothstep(_ e0: Double, _ e1: Double, _ x: Double) -> Double {
        let t = clamp((x - e0) / (e1 - e0), 0, 1)
        return t * t * (3 - 2 * t)
    }

    // MARK: - Lab (D65)

    @usableFromInline
    static func labF(_ t: Double) -> Double {
        let d = 6.0 / 29.0
        return t > d * d * d ? cbrt(t) : t / (3 * d * d) + 4.0 / 29.0
    }

    /// gamma sRGB [0,1] -> (L*, a*, b*)
    public static func rgbToLab(_ rgb: SIMD3<Double>) -> SIMD3<Double> {
        let lin = SIMD3(srgbDecode(rgb.x), srgbDecode(rgb.y), srgbDecode(rgb.z))
        let x = 0.4124564 * lin.x + 0.3575761 * lin.y + 0.1804375 * lin.z
        let y = 0.2126729 * lin.x + 0.7151522 * lin.y + 0.0721750 * lin.z
        let z = 0.0193339 * lin.x + 0.1191920 * lin.y + 0.9503041 * lin.z
        let fx = labF(x / 0.95047)
        let fy = labF(y / 1.0)
        let fz = labF(z / 1.08883)
        return SIMD3(116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz))
    }

    // MARK: - HSL

    /// gamma sRGB [0,1] -> (hue 0..360, sat 0..1, lum 0..1)
    public static func rgbToHSL(_ rgb: SIMD3<Double>) -> SIMD3<Double> {
        let r = rgb.x, g = rgb.y, b = rgb.z
        let mx = max(r, g, b), mn = min(r, g, b)
        let l = (mx + mn) / 2
        let d = mx - mn
        let s = d < 1e-12 ? 0 : min(1, max(0, d / (1 - abs(2 * l - 1) + 1e-12)))
        var h = 0.0
        if d > 0 {
            if mx == r {
                h = positiveMod((g - b) / d, 6)
            } else if mx == g {
                h = (b - r) / d + 2
            } else {
                h = (r - g) / d + 4
            }
        }
        return SIMD3(positiveMod(h * 60, 360), s, l)
    }

    /// (hue 0..360, sat 0..1, lum 0..1) -> gamma sRGB [0,1]
    public static func hslToRGB(_ h: Double, _ s: Double, _ l: Double) -> SIMD3<Double> {
        let h = positiveMod(h, 360)
        let s = clamp(s, 0, 1)
        let l = clamp(l, 0, 1)
        let c = (1 - abs(2 * l - 1)) * s
        let x = c * (1 - abs(positiveMod(h / 60, 2) - 1))
        let m = l - c / 2
        let rgb: SIMD3<Double>
        switch h {
        case ..<60: rgb = SIMD3(c, x, 0)
        case ..<120: rgb = SIMD3(x, c, 0)
        case ..<180: rgb = SIMD3(0, c, x)
        case ..<240: rgb = SIMD3(0, x, c)
        case ..<300: rgb = SIMD3(x, 0, c)
        default: rgb = SIMD3(c, 0, x)
        }
        return rgb + SIMD3(repeating: m)
    }

    // MARK: - 色相通道隶属

    /// 像素对 8 个通道的隶属权重（相邻中心线性插值，恰有两个非零）
    public static func bandWeights(_ hueDeg: Double) -> [Double] {
        let hue = positiveMod(hueDeg, 360)
        var w = [Double](repeating: 0, count: 8)
        let n = bandCenters.count
        for i in 0..<n {
            let c0 = bandCenters[i]
            let c1 = bandCenters[(i + 1) % n]
            let span = positiveMod(c1 - c0, 360)
            guard span > 0 else { continue }
            let rel = positiveMod(hue - c0, 360)
            if rel < span {
                let t = rel / span
                w[i] += 1 - t
                w[(i + 1) % n] += t
            }
        }
        return w
    }

    /// 像素色相相对各通道中心的偏移（度，规范到 -180..180）
    @inlinable
    public static func bandHueOffset(_ hueDeg: Double, center: Double) -> Double {
        positiveMod(hueDeg - center + 180, 360) - 180
    }

    // MARK: - Lab 色相 <-> HSL 色相

    @inlinable
    public static func labHueDeg(_ a: Double, _ b: Double) -> Double {
        positiveMod(atan2(b, a) * 180 / .pi, 360)
    }

    /// Lab 色相角到 HSL 色相的分段线性近似（锚点：红25→0，黄90→60，
    /// 绿135→120，青200→180，蓝270→240，品红330→300）
    public static func labHueToHSLHue(_ hab: Double) -> Double {
        let anchorsLab: [Double] = [25, 90, 135, 200, 270, 330, 385]
        let anchorsHSL: [Double] = [0, 60, 120, 180, 240, 300, 360]
        var h = positiveMod(hab, 360)
        if h < anchorsLab[0] { h += 360 }
        for i in 0..<(anchorsLab.count - 1) {
            let lo = anchorsLab[i], hi = anchorsLab[i + 1]
            if h >= lo && h <= hi {
                let t = (h - lo) / (hi - lo)
                return positiveMod(anchorsHSL[i] + t * (anchorsHSL[i + 1] - anchorsHSL[i]), 360)
            }
        }
        return 0
    }

    // MARK: - 色彩分级轮盘向量

    @inlinable
    public static func wheelVec(hue: Double, sat: Double) -> (x: Double, y: Double) {
        let r = hue * .pi / 180
        return (sat * cos(r), sat * sin(r))
    }

    @inlinable
    public static func wheelFromVec(x: Double, y: Double) -> (hue: Double, sat: Double) {
        (positiveMod(atan2(y, x) * 180 / .pi, 360), (x * x + y * y).squareRoot())
    }
}
