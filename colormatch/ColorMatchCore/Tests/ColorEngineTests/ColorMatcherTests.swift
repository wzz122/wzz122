import ColorEngine
import XCTest

final class ColorMatcherTests: XCTestCase {
    func testWarmReferenceProducesPositiveTemperature() {
        let base = SyntheticImages.baseScene()
        let p = ColorMatcher.matchImages(
            source: base,
            reference: SyntheticImages.variant(base, name: "warm")
        )
        XCTAssertGreaterThan(p.temperature, 5, "暖参考图必须产生正色温")
    }

    func testBrightReferenceProducesPositiveExposure() {
        let base = SyntheticImages.baseScene()
        let p = ColorMatcher.matchImages(
            source: base,
            reference: SyntheticImages.variant(base, name: "bright_soft")
        )
        XCTAssertGreaterThan(p.exposure, 0.2, "更亮的参考图必须产生正曝光")
        XCTAssertLessThan(p.contrast, 0, "低对比参考图必须产生负对比度")
    }

    func testFadedReferenceReducesSaturation() {
        let base = SyntheticImages.baseScene()
        let p = ColorMatcher.matchImages(
            source: base,
            reference: SyntheticImages.variant(base, name: "faded")
        )
        XCTAssertLessThan(p.satTotal, -5, "去饱和参考图必须产生负的整体饱和")
    }

    func testTealOrangeReferenceProducesSplitTone() {
        let base = SyntheticImages.baseScene()
        let p = ColorMatcher.matchImages(
            source: base,
            reference: SyntheticImages.variant(base, name: "teal_orange")
        )
        XCTAssertGreaterThan(p.shadowTintSat, 5, "青橙参考图必须产生阴影染色")
        // 阴影染色应指向青蓝区（120..260）
        XCTAssertGreaterThan(p.shadowTintHue, 120)
        XCTAssertLessThan(p.shadowTintHue, 260)
    }

    func testIdenticalImagesProduceNearIdentityParams() {
        let base = SyntheticImages.baseScene()
        let p = ColorMatcher.matchImages(source: base, reference: base)
        XCTAssertEqual(p.temperature, 0, accuracy: 1.5)
        XCTAssertEqual(p.exposure, 0, accuracy: 0.05)
        XCTAssertEqual(p.contrast, 0, accuracy: 3)
        XCTAssertEqual(p.satTotal, 0, accuracy: 3)
        XCTAssertEqual(p.shadowTintSat, 0, accuracy: 2)
    }

    func testSkinProtectionCapsOrangeBand() {
        let base = SyntheticImages.baseScene() // 含中央肤色块
        let ref = SyntheticImages.variant(base, name: "teal_orange")
        let protected = ColorMatcher.matchImages(
            source: base, reference: ref,
            options: MatchOptions(protectSkin: true)
        )
        let orange = 1
        XCTAssertLessThanOrEqual(
            abs(protected.hslSat[orange]), ColorMatcher.Tuning.skinBandSatMax + 1e-9,
            "肤色保护必须限制橙色通道饱和调整"
        )
        XCTAssertLessThanOrEqual(
            abs(protected.hslHue[orange]), ColorMatcher.Tuning.skinBandHueMax + 1e-9,
            "肤色保护必须限制橙色通道色相调整"
        )
    }

    func testStrongMatchWidensAdjustments() {
        let base = SyntheticImages.baseScene()
        let ref = SyntheticImages.variant(base, name: "warm")
        let normal = ColorMatcher.matchImages(source: base, reference: ref)
        let strong = ColorMatcher.matchImages(
            source: base, reference: ref,
            options: MatchOptions(strongMatch: true)
        )
        XCTAssertGreaterThan(
            strong.temperature, normal.temperature,
            "强匹配模式的色温修正必须不小于普通模式（普通模式已撞夹取上限）"
        )
    }

    func testParametersCodableRoundTrip() throws {
        let base = SyntheticImages.baseScene()
        let p = ColorMatcher.matchImages(
            source: base,
            reference: SyntheticImages.variant(base, name: "teal_orange")
        )
        let data = try JSONEncoder().encode(p)
        let decoded = try JSONDecoder().decode(GradeParameters.self, from: data)
        XCTAssertEqual(p, decoded)
    }

    func testClampedBoundsAllFields() {
        var p = GradeParameters()
        p.temperature = 500
        p.exposure = -20
        p.hslSat[3] = -300
        p.shadowTintHue = 400
        p.shadowTintSat = 200
        let c = p.clamped()
        XCTAssertEqual(c.temperature, 100)
        XCTAssertEqual(c.exposure, -5)
        XCTAssertEqual(c.hslSat[3], -100)
        XCTAssertEqual(c.shadowTintHue, 40, accuracy: 1e-9)
        XCTAssertEqual(c.shadowTintSat, 100)
    }
}
