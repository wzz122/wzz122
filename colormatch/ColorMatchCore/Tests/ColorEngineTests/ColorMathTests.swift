import ColorEngine
import XCTest

final class ColorMathTests: XCTestCase {
    func testSRGBRoundTrip() {
        for v in stride(from: 0.0, through: 1.0, by: 0.05) {
            XCTAssertEqual(ColorMath.srgbEncode(ColorMath.srgbDecode(v)), v, accuracy: 1e-12)
        }
    }

    func testHSLRoundTrip() {
        let samples: [SIMD3<Double>] = [
            SIMD3(0.85, 0.62, 0.5),
            SIMD3(0.1, 0.5, 0.9),
            SIMD3(0.5, 0.5, 0.5),
            SIMD3(1, 0, 0),
            SIMD3(0, 0, 0),
            SIMD3(1, 1, 1),
        ]
        for rgb in samples {
            let hsl = ColorMath.rgbToHSL(rgb)
            let back = ColorMath.hslToRGB(hsl.x, hsl.y, hsl.z)
            XCTAssertEqual(back.x, rgb.x, accuracy: 1e-9)
            XCTAssertEqual(back.y, rgb.y, accuracy: 1e-9)
            XCTAssertEqual(back.z, rgb.z, accuracy: 1e-9)
        }
    }

    func testLabKnownValues() {
        // 白色 → L=100, a≈0, b≈0
        let white = ColorMath.rgbToLab(SIMD3(1, 1, 1))
        XCTAssertEqual(white.x, 100, accuracy: 0.1)
        XCTAssertEqual(white.y, 0, accuracy: 0.5)
        XCTAssertEqual(white.z, 0, accuracy: 0.5)
        // 黑色 → L=0
        XCTAssertEqual(ColorMath.rgbToLab(SIMD3(0, 0, 0)).x, 0, accuracy: 0.1)
        // 中性灰 → a≈0, b≈0
        let gray = ColorMath.rgbToLab(SIMD3(0.5, 0.5, 0.5))
        XCTAssertEqual(gray.y, 0, accuracy: 0.5)
        XCTAssertEqual(gray.z, 0, accuracy: 0.5)
        // 纯红 → a 显著为正
        XCTAssertGreaterThan(ColorMath.rgbToLab(SIMD3(1, 0, 0)).y, 40)
        // 纯蓝 → b 显著为负
        XCTAssertLessThan(ColorMath.rgbToLab(SIMD3(0, 0, 1)).z, -40)
    }

    func testBandWeightsSumToOne() {
        for hue in stride(from: 0.0, to: 360.0, by: 7.5) {
            let w = ColorMath.bandWeights(hue)
            XCTAssertEqual(w.reduce(0, +), 1.0, accuracy: 1e-9, "hue \(hue)")
            XCTAssertLessThanOrEqual(w.filter { $0 > 1e-12 }.count, 2)
        }
    }

    func testBandWeightsAtCenters() {
        for (i, center) in ColorMath.bandCenters.enumerated() {
            let w = ColorMath.bandWeights(center)
            XCTAssertEqual(w[i], 1.0, accuracy: 1e-9, "center \(center)")
        }
    }

    func testPositiveMod() {
        XCTAssertEqual(ColorMath.positiveMod(-30, 360), 330, accuracy: 1e-12)
        XCTAssertEqual(ColorMath.positiveMod(370, 360), 10, accuracy: 1e-12)
        XCTAssertEqual(ColorMath.positiveMod(0, 360), 0, accuracy: 1e-12)
    }

    func testQuantizeMatchesFloorHalfUp() {
        // 0.5 边界必须向上（floor(x+0.5)），不能用银行家舍入
        XCTAssertEqual(ColorMath.quantizeU8(0.5 / 255.0), 1)
        XCTAssertEqual(ColorMath.quantizeU8(1.5 / 255.0), 2)
        XCTAssertEqual(ColorMath.quantizeU8(0), 0)
        XCTAssertEqual(ColorMath.quantizeU8(1), 255)
        XCTAssertEqual(ColorMath.quantizeU8(2), 255)
        XCTAssertEqual(ColorMath.quantizeU8(-1), 0)
    }

    func testLabHueToHSLHueAnchors() {
        XCTAssertEqual(ColorMath.labHueToHSLHue(25), 0, accuracy: 1e-9)
        XCTAssertEqual(ColorMath.labHueToHSLHue(90), 60, accuracy: 1e-9)
        XCTAssertEqual(ColorMath.labHueToHSLHue(270), 240, accuracy: 1e-9)
        // 环形连续性：335 度在 330(→300) 与 385(→360) 之间
        let v = ColorMath.labHueToHSLHue(335)
        XCTAssertGreaterThan(v, 300)
        XCTAssertLessThan(v, 360)
    }

    func testWheelVecRoundTrip() {
        let (x, y) = ColorMath.wheelVec(hue: 200, sat: 30)
        let (hue, sat) = ColorMath.wheelFromVec(x: x, y: y)
        XCTAssertEqual(hue, 200, accuracy: 1e-9)
        XCTAssertEqual(sat, 30, accuracy: 1e-9)
    }
}
