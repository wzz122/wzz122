import Foundation

/// 图像统计量。与 reference/grade_math.py 的 compute_stats 一致。
public struct ImageStats: Sendable, Equatable {
    public static let percentiles: [Double] = [1, 5, 25, 50, 75, 95, 99]
    public static let maxSamples = 200_000
    public static let satMaskThreshold = 0.08
    public static let shadowLMax = 40.0
    public static let highlightLMin = 65.0
    public static let bandMinFraction = 0.01

    /// gamma luma 的 [p1, p5, p25, p50, p75, p95, p99]
    public var lumaPercentiles: [Double] = Array(repeating: 0, count: 7)
    public var linearLumaMedian: Double = 0
    public var meanL: Double = 0
    public var meanA: Double = 0
    public var meanB: Double = 0
    public var stdLuma: Double = 0
    public var meanChroma: Double = 0
    /// 阴影（L* < 40）/ 高光（L* > 65）区域的 Lab a/b 均值
    public var shadowA: Double = 0
    public var shadowB: Double = 0
    public var highlightA: Double = 0
    public var highlightB: Double = 0
    /// 8 通道统计（饱和度掩码加权）
    public var bandFraction: [Double] = Array(repeating: 0, count: 8)
    public var bandSat: [Double] = Array(repeating: 0, count: 8)
    public var bandLum: [Double] = Array(repeating: 0, count: 8)
    public var bandHueShift: [Double] = Array(repeating: 0, count: 8)
    public var skinFraction: Double = 0

    public init() {}

    /// 两边统一的百分位定义：index = floor(p/100*(n-1)+0.5)，取该元素
    public static func nearestRankPercentile(_ sorted: [Double], _ p: Double) -> Double {
        let idx = Int((p / 100.0 * Double(sorted.count - 1) + 0.5).rounded(.down))
        return sorted[idx]
    }

    public static func compute(from image: RGBAImage) -> ImageStats {
        let n = image.pixelCount
        let strideValue = max(1, n / maxSamples)
        return compute(fromFloatPixels: image.floatPixels(stride: strideValue))
    }

    /// px: gamma sRGB [0,1] 像素数组（不再抽样）
    public static func compute(fromFloatPixels px: [SIMD3<Double>]) -> ImageStats {
        var st = ImageStats()
        let count = px.count
        guard count > 0 else { return st }
        let total = Double(count)

        var yGamma = [Double](repeating: 0, count: count)
        var yLinear = [Double](repeating: 0, count: count)
        var sumL = 0.0, sumA = 0.0, sumB = 0.0, sumChroma = 0.0
        var shadowSumA = 0.0, shadowSumB = 0.0
        var shadowCount = 0.0
        var hiSumA = 0.0, hiSumB = 0.0
        var hiCount = 0.0
        var bandWSum = [Double](repeating: 0, count: 8)
        var bandSatSum = [Double](repeating: 0, count: 8)
        var bandLumSum = [Double](repeating: 0, count: 8)
        var bandHueSum = [Double](repeating: 0, count: 8)
        var skinCount = 0.0

        for (i, rgb) in px.enumerated() {
            let lin = SIMD3(
                ColorMath.srgbDecode(rgb.x),
                ColorMath.srgbDecode(rgb.y),
                ColorMath.srgbDecode(rgb.z)
            )
            let yl = ColorMath.linearLuma(lin)
            let yg = ColorMath.srgbEncode(yl)
            yLinear[i] = yl
            yGamma[i] = yg

            let lab = ColorMath.rgbToLab(rgb)
            sumL += lab.x
            sumA += lab.y
            sumB += lab.z
            sumChroma += (lab.y * lab.y + lab.z * lab.z).squareRoot()
            if lab.x < shadowLMax {
                shadowSumA += lab.y
                shadowSumB += lab.z
                shadowCount += 1
            }
            if lab.x > highlightLMin {
                hiSumA += lab.y
                hiSumB += lab.z
                hiCount += 1
            }

            let hsl = ColorMath.rgbToHSL(rgb)
            if hsl.y > satMaskThreshold {
                let w = ColorMath.bandWeights(hsl.x)
                for b in 0..<8 where w[b] > 0 {
                    bandWSum[b] += w[b]
                    bandSatSum[b] += w[b] * hsl.y
                    bandLumSum[b] += w[b] * hsl.z
                    bandHueSum[b] += w[b] * ColorMath.bandHueOffset(hsl.x, center: ColorMath.bandCenters[b])
                }
            }
            if hsl.x >= 15, hsl.x <= 50, hsl.y >= 0.1, hsl.y <= 0.65, yg >= 0.15, yg <= 0.9 {
                skinCount += 1
            }
        }

        let sortedGamma = yGamma.sorted()
        st.lumaPercentiles = percentiles.map { nearestRankPercentile(sortedGamma, $0) }
        st.linearLumaMedian = nearestRankPercentile(yLinear.sorted(), 50)
        st.meanL = sumL / total
        st.meanA = sumA / total
        st.meanB = sumB / total
        st.meanChroma = sumChroma / total

        let meanY = yGamma.reduce(0, +) / total
        st.stdLuma = (yGamma.reduce(0) { $0 + ($1 - meanY) * ($1 - meanY) } / total).squareRoot()

        if shadowCount > 0 {
            st.shadowA = shadowSumA / shadowCount
            st.shadowB = shadowSumB / shadowCount
        } else {
            st.shadowA = st.meanA
            st.shadowB = st.meanB
        }
        if hiCount > 0 {
            st.highlightA = hiSumA / hiCount
            st.highlightB = hiSumB / hiCount
        } else {
            st.highlightA = st.meanA
            st.highlightB = st.meanB
        }

        for b in 0..<8 {
            st.bandFraction[b] = bandWSum[b] / total
            if bandWSum[b] > 1e-9 {
                st.bandSat[b] = bandSatSum[b] / bandWSum[b]
                st.bandLum[b] = bandLumSum[b] / bandWSum[b]
                st.bandHueShift[b] = bandHueSum[b] / bandWSum[b]
            }
        }
        st.skinFraction = skinCount / total
        return st
    }
}
