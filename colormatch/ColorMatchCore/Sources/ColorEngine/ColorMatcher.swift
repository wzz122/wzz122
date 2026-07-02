import Foundation

/// 匹配选项
public struct MatchOptions: Sendable, Equatable {
    /// 整体强度 0..1
    public var strength: Double = 0.8
    /// 强匹配模式（Pro）：更大的增益与夹取范围
    public var strongMatch: Bool = false
    /// 肤色保护：限制橙色通道的饱和/色相调整，饱和度偏向 vibrance
    public var protectSkin: Bool = true

    public init(strength: Double = 0.8, strongMatch: Bool = false, protectSkin: Bool = true) {
        self.strength = strength
        self.strongMatch = strongMatch
        self.protectSkin = protectSkin
    }
}

/// 双图仿色：统计估计 + 渲染闭环精修。
/// 与 reference/grade_math.py 的 match / _refine / match_images 逐公式一致。
public enum ColorMatcher {
    /// 匹配器调参常数（改动必须与 Python Tuning 同步，并重新生成 goldens）
    public enum Tuning {
        public static let tempGain = 4.0
        public static let tempMax = 40.0
        public static let tintGain = 4.0
        public static let tintMax = 40.0
        public static let exposureMax = 1.5
        public static let contrastGain = 80.0
        public static let contrastMax = 50.0
        public static let toneGain = 300.0
        public static let toneMax = 60.0
        public static let edgeGain = 250.0
        public static let edgeMax = 40.0
        public static let satGain = 90.0
        public static let satMax = 40.0
        public static let bandSatGain = 160.0
        public static let bandLumGain = 160.0
        public static let bandAdjMax = 35.0
        public static let bandHueGain = 0.8
        public static let bandHueMax = 15.0
        public static let castThreshold = 3.0
        public static let castSatGain = 4.0
        public static let castSatMax = 50.0
        public static let strongMult = 1.35
        public static let strongRange = 2.0
        public static let skinFractionGate = 0.08
        public static let skinBandSatMax = 12.0
        public static let skinBandHueMax = 5.0
        public static let refineIterations = 2
        public static let refineDamping = 0.7
        public static let proxyMaxDimension = 128
    }

    // MARK: - 完整入口

    /// 完整匹配：初始前馈估计 + 渲染闭环精修。确定性：同输入同输出。
    public static func matchImages(
        source: RGBAImage,
        reference: RGBAImage,
        options: MatchOptions = MatchOptions()
    ) -> GradeParameters {
        let proxy = source.downsampled(maxDimension: Tuning.proxyMaxDimension)
        let refStats = ImageStats.compute(from: reference)
        var params = match(
            source: ImageStats.compute(from: proxy),
            reference: refStats,
            options: options
        )
        let proxyPixels = proxy.floatPixels()
        for _ in 0..<Tuning.refineIterations {
            let rendered = GradeRenderer.apply(proxyPixels, params: params)
            let resStats = ImageStats.compute(fromFloatPixels: rendered)
            params = refine(params, result: resStats, reference: refStats, options: options)
        }
        return params
    }

    // MARK: - 初始前馈估计

    public static func match(
        source src: ImageStats,
        reference ref: ImageStats,
        options o: MatchOptions = MatchOptions()
    ) -> GradeParameters {
        let k = o.strength
        let gm = o.strongMatch ? Tuning.strongMult : 1.0
        let rm = o.strongMatch ? Tuning.strongRange : 1.0
        var p = GradeParameters()

        // 白平衡：Lab a/b 均值差
        p.temperature = ColorMath.clamp(
            Tuning.tempGain * gm * (ref.meanB - src.meanB) * k,
            -Tuning.tempMax * rm, Tuning.tempMax * rm
        )
        p.tint = ColorMath.clamp(
            Tuning.tintGain * gm * (ref.meanA - src.meanA) * k,
            -Tuning.tintMax * rm, Tuning.tintMax * rm
        )

        // 曝光：线性亮度中位数比（stops）
        let eps = 1e-4
        p.exposure = ColorMath.clamp(
            log2(max(ref.linearLumaMedian, eps) / max(src.linearLumaMedian, eps)) * k,
            -Tuning.exposureMax * rm, Tuning.exposureMax * rm
        )

        // 对比：四分位距之比
        let srcSpread = src.lumaPercentiles[4] - src.lumaPercentiles[2]
        let refSpread = ref.lumaPercentiles[4] - ref.lumaPercentiles[2]
        if srcSpread > 0.02 {
            p.contrast = ColorMath.clamp(
                Tuning.contrastGain * gm * (refSpread / srcSpread - 1) * k,
                -Tuning.contrastMax * rm, Tuning.contrastMax * rm
            )
        }

        // 影调：曝光补偿后的源百分位 vs 参考百分位
        func exposureAdjusted(_ gammaValue: Double) -> Double {
            ColorMath.srgbEncode(ColorMath.srgbDecode(gammaValue) * pow(2, p.exposure))
        }
        let adj = src.lumaPercentiles.map(exposureAdjusted)
        p.highlights = ColorMath.clamp(
            Tuning.toneGain * gm * (ref.lumaPercentiles[5] - adj[5]) * k,
            -Tuning.toneMax * rm, Tuning.toneMax * rm
        )
        p.shadows = ColorMath.clamp(
            Tuning.toneGain * gm * (ref.lumaPercentiles[1] - adj[1]) * k,
            -Tuning.toneMax * rm, Tuning.toneMax * rm
        )
        p.whites = ColorMath.clamp(
            Tuning.edgeGain * gm * (ref.lumaPercentiles[6] - adj[6]) * k,
            -Tuning.edgeMax * rm, Tuning.edgeMax * rm
        )
        p.blacks = ColorMath.clamp(
            Tuning.edgeGain * gm * (ref.lumaPercentiles[0] - adj[0]) * k,
            -Tuning.edgeMax * rm, Tuning.edgeMax * rm
        )

        // 饱和：整体 chroma 比，按肤色保护拆分 vibrance/saturation
        let chromaRatio = ref.meanChroma / max(src.meanChroma, 1e-3)
        let satTotal = ColorMath.clamp(
            Tuning.satGain * gm * (chromaRatio - 1) * k,
            -Tuning.satMax * rm, Tuning.satMax * rm
        )
        let skinPresent = src.skinFraction > Tuning.skinFractionGate
            || ref.skinFraction > Tuning.skinFractionGate
        if o.protectSkin && skinPresent {
            p.vibrance = satTotal * 0.85
            p.saturation = satTotal * 0.15
        } else {
            p.vibrance = satTotal * 0.65
            p.saturation = satTotal * 0.35
        }

        // HSL 分通道
        for i in 0..<8 {
            guard src.bandFraction[i] >= ImageStats.bandMinFraction,
                  ref.bandFraction[i] >= ImageStats.bandMinFraction
            else { continue }
            var satAdj = ColorMath.clamp(
                Tuning.bandSatGain * gm * (ref.bandSat[i] - src.bandSat[i]) * k,
                -Tuning.bandAdjMax * rm, Tuning.bandAdjMax * rm
            )
            let lumAdj = ColorMath.clamp(
                Tuning.bandLumGain * gm * (ref.bandLum[i] - src.bandLum[i]) * k,
                -Tuning.bandAdjMax * rm, Tuning.bandAdjMax * rm
            )
            var hueAdj = ColorMath.clamp(
                Tuning.bandHueGain * gm * (ref.bandHueShift[i] - src.bandHueShift[i]) * k,
                -Tuning.bandHueMax * rm, Tuning.bandHueMax * rm
            )
            if o.protectSkin && skinPresent && ColorMath.bandNames[i] == "orange" {
                satAdj = ColorMath.clamp(satAdj, -Tuning.skinBandSatMax, Tuning.skinBandSatMax)
                hueAdj = ColorMath.clamp(hueAdj, -Tuning.skinBandHueMax, Tuning.skinBandHueMax)
            }
            p.hslSat[i] = satAdj
            p.hslLum[i] = lumAdj
            p.hslHue[i] = hueAdj
        }

        // 色彩分级：参考与源“区域残余色偏”（相对各自全局均值）之差
        let rsA = (ref.shadowA - ref.meanA) - (src.shadowA - src.meanA)
        let rsB = (ref.shadowB - ref.meanB) - (src.shadowB - src.meanB)
        var mag = (rsA * rsA + rsB * rsB).squareRoot()
        if mag > Tuning.castThreshold {
            p.shadowTintHue = ColorMath.labHueToHSLHue(ColorMath.labHueDeg(rsA, rsB))
            p.shadowTintSat = ColorMath.clamp(mag * Tuning.castSatGain * k, 0, Tuning.castSatMax)
        }
        let rhA = (ref.highlightA - ref.meanA) - (src.highlightA - src.meanA)
        let rhB = (ref.highlightB - ref.meanB) - (src.highlightB - src.meanB)
        mag = (rhA * rhA + rhB * rhB).squareRoot()
        if mag > Tuning.castThreshold {
            p.highlightTintHue = ColorMath.labHueToHSLHue(ColorMath.labHueDeg(rhA, rhB))
            p.highlightTintSat = ColorMath.clamp(mag * Tuning.castSatGain * k, 0, Tuning.castSatMax)
        }

        return p
    }

    // MARK: - 残差精修

    /// 用（已应用当前参数的）结果统计 vs 参考统计的残差修正参数
    public static func refine(
        _ input: GradeParameters,
        result res: ImageStats,
        reference ref: ImageStats,
        options o: MatchOptions
    ) -> GradeParameters {
        var p = input
        let k = o.strength * Tuning.refineDamping
        let gm = o.strongMatch ? Tuning.strongMult : 1.0
        let rm = o.strongMatch ? Tuning.strongRange : 1.0

        p.temperature = ColorMath.clamp(
            p.temperature + Tuning.tempGain * gm * (ref.meanB - res.meanB) * k,
            -Tuning.tempMax * rm, Tuning.tempMax * rm
        )
        p.tint = ColorMath.clamp(
            p.tint + Tuning.tintGain * gm * (ref.meanA - res.meanA) * k,
            -Tuning.tintMax * rm, Tuning.tintMax * rm
        )
        let eps = 1e-4
        p.exposure = ColorMath.clamp(
            p.exposure + log2(max(ref.linearLumaMedian, eps) / max(res.linearLumaMedian, eps)) * k,
            -Tuning.exposureMax * rm, Tuning.exposureMax * rm
        )
        let resSpread = res.lumaPercentiles[4] - res.lumaPercentiles[2]
        let refSpread = ref.lumaPercentiles[4] - ref.lumaPercentiles[2]
        if resSpread > 0.02 {
            p.contrast = ColorMath.clamp(
                p.contrast + Tuning.contrastGain * gm * (refSpread / resSpread - 1) * k,
                -Tuning.contrastMax * rm, Tuning.contrastMax * rm
            )
        }
        p.highlights = ColorMath.clamp(
            p.highlights + Tuning.toneGain * gm * (ref.lumaPercentiles[5] - res.lumaPercentiles[5]) * k,
            -Tuning.toneMax * rm, Tuning.toneMax * rm
        )
        p.shadows = ColorMath.clamp(
            p.shadows + Tuning.toneGain * gm * (ref.lumaPercentiles[1] - res.lumaPercentiles[1]) * k,
            -Tuning.toneMax * rm, Tuning.toneMax * rm
        )
        p.whites = ColorMath.clamp(
            p.whites + Tuning.edgeGain * gm * (ref.lumaPercentiles[6] - res.lumaPercentiles[6]) * k,
            -Tuning.edgeMax * rm, Tuning.edgeMax * rm
        )
        p.blacks = ColorMath.clamp(
            p.blacks + Tuning.edgeGain * gm * (ref.lumaPercentiles[0] - res.lumaPercentiles[0]) * k,
            -Tuning.edgeMax * rm, Tuning.edgeMax * rm
        )

        let chromaRatio = ref.meanChroma / max(res.meanChroma, 1e-3)
        let satDelta = ColorMath.clamp(
            Tuning.satGain * gm * (chromaRatio - 1) * k,
            -Tuning.satMax, Tuning.satMax
        )
        let skinPresent = res.skinFraction > Tuning.skinFractionGate
            || ref.skinFraction > Tuning.skinFractionGate
        let (vibShare, satShare) = (o.protectSkin && skinPresent) ? (0.85, 0.15) : (0.65, 0.35)
        p.vibrance = ColorMath.clamp(
            p.vibrance + satDelta * vibShare, -Tuning.satMax * rm, Tuning.satMax * rm
        )
        p.saturation = ColorMath.clamp(
            p.saturation + satDelta * satShare, -Tuning.satMax * rm, Tuning.satMax * rm
        )

        for i in 0..<8 {
            guard res.bandFraction[i] >= ImageStats.bandMinFraction,
                  ref.bandFraction[i] >= ImageStats.bandMinFraction
            else { continue }
            var satMax = Tuning.bandAdjMax * rm
            var hueMax = Tuning.bandHueMax * rm
            if o.protectSkin && skinPresent && ColorMath.bandNames[i] == "orange" {
                satMax = min(satMax, Tuning.skinBandSatMax)
                hueMax = min(hueMax, Tuning.skinBandHueMax)
            }
            p.hslSat[i] = ColorMath.clamp(
                p.hslSat[i] + Tuning.bandSatGain * gm * (ref.bandSat[i] - res.bandSat[i]) * k,
                -satMax, satMax
            )
            p.hslLum[i] = ColorMath.clamp(
                p.hslLum[i] + Tuning.bandLumGain * gm * (ref.bandLum[i] - res.bandLum[i]) * k,
                -Tuning.bandAdjMax * rm, Tuning.bandAdjMax * rm
            )
            p.hslHue[i] = ColorMath.clamp(
                p.hslHue[i] + Tuning.bandHueGain * gm * (ref.bandHueShift[i] - res.bandHueShift[i]) * k,
                -hueMax, hueMax
            )
        }

        // 色彩分级精修：在“轮盘向量”空间做残差叠加
        func zoneResidual(_ st: ImageStats, shadow: Bool) -> (a: Double, b: Double) {
            shadow
                ? (st.shadowA - st.meanA, st.shadowB - st.meanB)
                : (st.highlightA - st.meanA, st.highlightB - st.meanB)
        }
        for shadowZone in [true, false] {
            let (ra, rb) = zoneResidual(ref, shadow: shadowZone)
            let (sa, sb) = zoneResidual(res, shadow: shadowZone)
            let errA = ra - sa, errB = rb - sb
            let mag = (errA * errA + errB * errB).squareRoot()
            var cur = shadowZone
                ? ColorMath.wheelVec(hue: p.shadowTintHue, sat: p.shadowTintSat)
                : ColorMath.wheelVec(hue: p.highlightTintHue, sat: p.highlightTintSat)
            if mag > 0.5 {
                let errHue = ColorMath.labHueToHSLHue(ColorMath.labHueDeg(errA, errB))
                let delta = ColorMath.wheelVec(hue: errHue, sat: mag * Tuning.castSatGain * k)
                cur = (cur.x + delta.x, cur.y + delta.y)
            }
            var (hue, sat) = ColorMath.wheelFromVec(x: cur.x, y: cur.y)
            sat = ColorMath.clamp(sat, 0, Tuning.castSatMax)
            if sat < 1.0 {
                hue = 0
                sat = 0
            }
            if shadowZone {
                p.shadowTintHue = hue
                p.shadowTintSat = sat
            } else {
                p.highlightTintHue = hue
                p.highlightTintSat = sat
            }
        }

        return p
    }
}
