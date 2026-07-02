import ColorEngine
import LUTBuilder
import XCTest

/// 与 Python 参照实现的 golden 交叉校验。
/// GoldenVectors.swift 由 reference/gen_goldens.py 生成；
/// 任何一侧改动算法常数都会让这里立刻失败。
/// 容差说明：libm 的 pow/cbrt 跨平台可能有 1 ulp 差异，经量化边界
/// 与增益放大后，统计层容差 1e-3、参数层容差 0.05 滑杆单位。
/// 真正的移植错误产生的偏差会大出多个数量级。
final class CrossValidationTests: XCTestCase {
    static let statsTolerance = 1e-3
    static let paramsTolerance = 0.05
    static let lutTolerance = 2e-3

    func testBaseSceneStatsMatchPython() {
        let stats = ImageStats.compute(from: SyntheticImages.baseScene())

        for (i, expected) in GoldenVectors.baseLumaPercentiles.enumerated() {
            XCTAssertEqual(stats.lumaPercentiles[i], expected, accuracy: Self.statsTolerance,
                           "lumaPercentiles[\(i)]")
        }
        XCTAssertEqual(stats.linearLumaMedian, GoldenVectors.baseLinearLumaMedian,
                       accuracy: Self.statsTolerance)
        XCTAssertEqual(stats.meanL, GoldenVectors.baseMeanLab[0], accuracy: Self.statsTolerance)
        XCTAssertEqual(stats.meanA, GoldenVectors.baseMeanLab[1], accuracy: Self.statsTolerance)
        XCTAssertEqual(stats.meanB, GoldenVectors.baseMeanLab[2], accuracy: Self.statsTolerance)
        XCTAssertEqual(stats.meanChroma, GoldenVectors.baseMeanChroma, accuracy: Self.statsTolerance)
        XCTAssertEqual(stats.shadowA, GoldenVectors.baseShadowCast[0], accuracy: Self.statsTolerance)
        XCTAssertEqual(stats.shadowB, GoldenVectors.baseShadowCast[1], accuracy: Self.statsTolerance)
        XCTAssertEqual(stats.highlightA, GoldenVectors.baseHighlightCast[0], accuracy: Self.statsTolerance)
        XCTAssertEqual(stats.highlightB, GoldenVectors.baseHighlightCast[1], accuracy: Self.statsTolerance)
        for i in 0..<8 {
            XCTAssertEqual(stats.bandFraction[i], GoldenVectors.baseBandFraction[i],
                           accuracy: Self.statsTolerance, "bandFraction[\(i)]")
            XCTAssertEqual(stats.bandSat[i], GoldenVectors.baseBandSat[i],
                           accuracy: Self.statsTolerance, "bandSat[\(i)]")
        }
        XCTAssertEqual(stats.skinFraction, GoldenVectors.baseSkinFraction,
                       accuracy: Self.statsTolerance)
    }

    func testMatchedParametersMatchPython() {
        let base = SyntheticImages.baseScene()

        for variantName in SyntheticImages.variantNames {
            guard let golden = GoldenVectors.matchGoldens[variantName] else {
                XCTFail("missing golden for \(variantName)")
                continue
            }
            let ref = SyntheticImages.variant(base, name: variantName)
            let p = ColorMatcher.matchImages(source: base, reference: ref)
            let t = Self.paramsTolerance

            XCTAssertEqual(p.temperature, golden.temperature, accuracy: t, "\(variantName).temperature")
            XCTAssertEqual(p.tint, golden.tint, accuracy: t, "\(variantName).tint")
            XCTAssertEqual(p.exposure, golden.exposure, accuracy: t, "\(variantName).exposure")
            XCTAssertEqual(p.contrast, golden.contrast, accuracy: t, "\(variantName).contrast")
            XCTAssertEqual(p.highlights, golden.highlights, accuracy: t, "\(variantName).highlights")
            XCTAssertEqual(p.shadows, golden.shadows, accuracy: t, "\(variantName).shadows")
            XCTAssertEqual(p.whites, golden.whites, accuracy: t, "\(variantName).whites")
            XCTAssertEqual(p.blacks, golden.blacks, accuracy: t, "\(variantName).blacks")
            XCTAssertEqual(p.vibrance, golden.vibrance, accuracy: t, "\(variantName).vibrance")
            XCTAssertEqual(p.saturation, golden.saturation, accuracy: t, "\(variantName).saturation")
            for i in 0..<8 {
                XCTAssertEqual(p.hslHue[i], golden.hslHue[i], accuracy: t, "\(variantName).hslHue[\(i)]")
                XCTAssertEqual(p.hslSat[i], golden.hslSat[i], accuracy: t, "\(variantName).hslSat[\(i)]")
                XCTAssertEqual(p.hslLum[i], golden.hslLum[i], accuracy: t, "\(variantName).hslLum[\(i)]")
            }
            XCTAssertEqual(p.shadowTintSat, golden.shadowTintSat, accuracy: t,
                           "\(variantName).shadowTintSat")
            XCTAssertEqual(p.highlightTintSat, golden.highlightTintSat, accuracy: t,
                           "\(variantName).highlightTintSat")
            // 色相仅在饱和显著时比较（低饱和下色相无意义且数值不稳定）
            if golden.shadowTintSat > 2 {
                XCTAssertEqual(p.shadowTintHue, golden.shadowTintHue, accuracy: 1.0,
                               "\(variantName).shadowTintHue")
            }
            if golden.highlightTintSat > 2 {
                XCTAssertEqual(p.highlightTintHue, golden.highlightTintHue, accuracy: 1.0,
                               "\(variantName).highlightTintHue")
            }
        }
    }

    func testWarmLUTSamplesMatchPython() {
        let base = SyntheticImages.baseScene()
        let ref = SyntheticImages.variant(base, name: "warm")
        let params = ColorMatcher.matchImages(source: base, reference: ref)
        let lut = LUT(params: params, size: 33)

        for (bIdx, gIdx, rIdx, r, g, b) in GoldenVectors.warmLUTSamples {
            let sample = lut.sample(bIndex: bIdx, gIndex: gIdx, rIndex: rIdx)
            XCTAssertEqual(sample.x, r, accuracy: Self.lutTolerance, "LUT[\(bIdx)][\(gIdx)][\(rIdx)].r")
            XCTAssertEqual(sample.y, g, accuracy: Self.lutTolerance, "LUT[\(bIdx)][\(gIdx)][\(rIdx)].g")
            XCTAssertEqual(sample.z, b, accuracy: Self.lutTolerance, "LUT[\(bIdx)][\(gIdx)][\(rIdx)].b")
        }
    }
}
