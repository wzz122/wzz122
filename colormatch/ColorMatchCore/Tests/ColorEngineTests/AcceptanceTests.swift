import ColorEngine
import LUTBuilder
import XCTest

/// 算法验收：双图仿色的闭环收敛测试。
/// 与 reference/acceptance_test.py 的维度、阈值、地板值完全一致——
/// 本测试通过即证明 Swift 移植与 Python 参照实现行为等价。
final class AcceptanceTests: XCTestCase {
    struct Dimension {
        let name: String
        let extract: (ImageStats) -> [Double]
        /// after <= max(floor, before * threshold)
        let threshold: Double
        let floor: Double
    }

    static let dimensions: [Dimension] = [
        Dimension(name: "white_balance", extract: { [$0.meanA, $0.meanB] }, threshold: 0.55, floor: 1.0),
        Dimension(name: "exposure_p50", extract: { [$0.lumaPercentiles[3]] }, threshold: 0.55, floor: 0.02),
        Dimension(
            name: "contrast_spread",
            extract: { [$0.lumaPercentiles[4] - $0.lumaPercentiles[2]] },
            threshold: 0.75, floor: 0.02
        ),
        Dimension(name: "global_chroma", extract: { [$0.meanChroma] }, threshold: 0.75, floor: 1.5),
        Dimension(
            name: "zone_cast",
            extract: {
                [
                    $0.shadowA - $0.meanA, $0.shadowB - $0.meanB,
                    $0.highlightA - $0.meanA, $0.highlightB - $0.meanB,
                ]
            },
            threshold: 0.85, floor: 3.0
        ),
    ]

    static func distance(_ a: [Double], _ b: [Double]) -> Double {
        zip(a, b).reduce(0) { $0 + ($1.0 - $1.1) * ($1.0 - $1.1) }.squareRoot()
    }

    func testMatchConvergesTowardReference() {
        let base = SyntheticImages.baseScene()
        let srcStats = ImageStats.compute(from: base)

        for variantName in SyntheticImages.variantNames {
            let ref = SyntheticImages.variant(base, name: variantName)
            let refStats = ImageStats.compute(from: ref)
            let params = ColorMatcher.matchImages(source: base, reference: ref)
            let lut = LUT(params: params)
            let resStats = ImageStats.compute(from: lut.apply(to: base))

            for dim in Self.dimensions {
                let before = Self.distance(dim.extract(refStats), dim.extract(srcStats))
                let after = Self.distance(dim.extract(refStats), dim.extract(resStats))
                let allowed = max(dim.floor, before * dim.threshold)
                XCTAssertLessThanOrEqual(
                    after, allowed,
                    "\(variantName)/\(dim.name): before=\(before) after=\(after) allowed=\(allowed)"
                )
            }
        }
    }

    func testMatcherIsDeterministic() {
        let base = SyntheticImages.baseScene()
        let ref = SyntheticImages.variant(base, name: "warm")
        let p1 = ColorMatcher.matchImages(source: base, reference: ref)
        let p2 = ColorMatcher.matchImages(source: base, reference: ref)
        XCTAssertEqual(p1, p2, "matcher must be bit-for-bit deterministic")
    }

    func testIdentityLUTIsNoOp() {
        let base = SyntheticImages.baseScene()
        let identity = LUT(params: .identity)
        let out = identity.apply(to: base)
        var maxError = 0
        for i in 0..<base.pixels.count where i % 4 != 3 {
            maxError = max(maxError, abs(Int(out.pixels[i]) - Int(base.pixels[i])))
        }
        XCTAssertLessThanOrEqual(maxError, 1, "identity LUT must be a no-op up to quantization")
    }
}
