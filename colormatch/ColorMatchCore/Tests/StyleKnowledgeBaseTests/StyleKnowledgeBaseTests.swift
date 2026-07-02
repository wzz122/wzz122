import ColorEngine
@testable import StyleKnowledgeBase
import XCTest

final class StyleKnowledgeBaseTests: XCTestCase {
    func testBundledLibraryLoadsFiveStyles() throws {
        let library = try StyleLibrary.bundled()
        XCTAssertEqual(library.styles.count, 5)
        let ids = Set(library.styles.map(\.styleId))
        XCTAssertEqual(ids, ["film-fade", "japan-airy", "teal-orange", "night-neon", "portrait-skin"])
        for style in library.styles {
            XCTAssertFalse(style.signature.isEmpty, "\(style.styleId) 缺签名")
            XCTAssertFalse(style.explanation.isEmpty, "\(style.styleId) 缺解释")
            XCTAssertFalse(style.tweaks.isEmpty, "\(style.styleId) 缺微调建议")
            for check in style.signature {
                XCTAssertNotNil(
                    SignatureKeyResolver.value(of: check.key, in: .identity),
                    "\(style.styleId) 的签名键 \(check.key) 无法解析"
                )
            }
        }
    }

    func testTealOrangeParamsMatchTealOrangeStyle() throws {
        let library = try StyleLibrary.bundled()
        var p = GradeParameters()
        p.shadowTintHue = 200
        p.shadowTintSat = 25
        p.highlightTintHue = 35
        p.highlightTintSat = 15
        p.contrast = 18
        p.hslSat[1] = 10
        let match = library.match(p)
        XCTAssertEqual(match?.style.styleId, "teal-orange")
        XCTAssertGreaterThan(match?.score ?? 0, 0.8)
    }

    func testFilmFadeParamsMatchFilmFade() throws {
        let library = try StyleLibrary.bundled()
        var p = GradeParameters()
        p.blacks = 20
        p.contrast = -18
        p.vibrance = -10
        p.saturation = -8
        p.highlights = -12
        p.shadowTintSat = 10
        let match = library.match(p)
        XCTAssertEqual(match?.style.styleId, "film-fade")
    }

    func testJapanAiryParamsMatchJapanAiry() throws {
        let library = try StyleLibrary.bundled()
        var p = GradeParameters()
        p.exposure = 0.7
        p.contrast = -15
        p.temperature = -8
        p.shadows = 25
        p.vibrance = -5
        let match = library.match(p)
        XCTAssertEqual(match?.style.styleId, "japan-airy")
    }

    func testIdentityParamsMatchNothing() throws {
        let library = try StyleLibrary.bundled()
        XCTAssertNil(library.match(.identity), "全零参数不应命中任何风格")
    }

    func testHueWrapAroundRange() {
        // highlightTintHue 签名区间 300..60（跨 0 度）
        let check = StyleDefinition.SignatureCheck(
            key: "highlightTintHue", min: 300, max: 60, weight: 1
        )
        var p = GradeParameters()
        p.highlightTintHue = 20
        XCTAssertEqual(StyleLibrary.checkScore(check, params: p), 1.0, accuracy: 1e-9)
        p.highlightTintHue = 340
        XCTAssertEqual(StyleLibrary.checkScore(check, params: p), 1.0, accuracy: 1e-9)
        p.highlightTintHue = 180
        XCTAssertLessThan(StyleLibrary.checkScore(check, params: p), 0.1)
    }

    func testRankedReturnsAllStylesSorted() throws {
        let library = try StyleLibrary.bundled()
        var p = GradeParameters()
        p.blacks = 15
        p.contrast = -10
        let ranked = library.ranked(p)
        XCTAssertEqual(ranked.count, 5)
        for i in 1..<ranked.count {
            XCTAssertGreaterThanOrEqual(ranked[i - 1].score, ranked[i].score)
        }
    }

    func testSignatureKeyResolverBandKeys() {
        var p = GradeParameters()
        p.hslSat[1] = 12
        p.hslLum[5] = -7
        p.hslHue[3] = 4
        XCTAssertEqual(SignatureKeyResolver.value(of: "hslSat.orange", in: p), 12)
        XCTAssertEqual(SignatureKeyResolver.value(of: "hslLum.blue", in: p), -7)
        XCTAssertEqual(SignatureKeyResolver.value(of: "hslHue.green", in: p), 4)
        XCTAssertNil(SignatureKeyResolver.value(of: "hslSat.pink", in: p))
        XCTAssertNil(SignatureKeyResolver.value(of: "bogus", in: p))
    }
}
