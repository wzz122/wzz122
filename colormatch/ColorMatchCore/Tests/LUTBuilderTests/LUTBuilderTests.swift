import ColorEngine
import LUTBuilder
import XCTest

final class LUTBuilderTests: XCTestCase {
    var warmParams: GradeParameters {
        var p = GradeParameters()
        p.temperature = 25
        p.exposure = 0.3
        p.contrast = 10
        p.vibrance = 15
        p.shadowTintHue = 200
        p.shadowTintSat = 20
        return p
    }

    func testBuildIsDeterministic() {
        let a = LUT(params: warmParams)
        let b = LUT(params: warmParams)
        XCTAssertEqual(a.data, b.data, "同参数 LUT 必须逐位一致")
    }

    func testDataLayoutAndSize() {
        let lut = LUT(params: .identity, size: 17)
        XCTAssertEqual(lut.data.count, 17 * 17 * 17 * 4)
        // 恒等 LUT 的网格角点
        let black = lut.sample(bIndex: 0, gIndex: 0, rIndex: 0)
        XCTAssertEqual(black.x, 0, accuracy: 1e-6)
        let white = lut.sample(bIndex: 16, gIndex: 16, rIndex: 16)
        XCTAssertEqual(white.x, 1, accuracy: 1e-6)
        // 纯红角点：r 最大、g/b 最小
        let red = lut.sample(bIndex: 0, gIndex: 0, rIndex: 16)
        XCTAssertEqual(red.x, 1, accuracy: 1e-6)
        XCTAssertEqual(red.y, 0, accuracy: 1e-6)
        XCTAssertEqual(red.z, 0, accuracy: 1e-6)
        // alpha 通道恒为 1
        XCTAssertEqual(lut.data[3], 1)
    }

    func testCICubeDataSize() {
        let lut = LUT(params: .identity, size: 33)
        XCTAssertEqual(lut.ciCubeData.count, 33 * 33 * 33 * 4 * MemoryLayout<Float>.size)
    }

    func testExposureIncreaseBrightensMidGray() {
        var p = GradeParameters()
        p.exposure = 1.0
        let lut = LUT(params: p)
        var img = RGBAImage(width: 1, height: 1)
        img.setRGB(SIMD3(repeating: 0.4), atPixel: 0)
        let out = lut.apply(to: img)
        XCTAssertGreaterThan(out.rgb(atPixel: 0).x, 0.5, "+1 档曝光必须明显提亮中灰")
    }

    func testCubeFileFormat() {
        let size = 17
        let lut = LUT(params: warmParams, size: size)
        let text = lut.cubeFileText(title: "ColorMatch Test")
        let lines = text.split(separator: "\n", omittingEmptySubsequences: false)

        XCTAssertEqual(lines[0], "TITLE \"ColorMatch Test\"")
        XCTAssertEqual(lines[1], "LUT_3D_SIZE \(size)")
        XCTAssertEqual(lines[2], "DOMAIN_MIN 0.0 0.0 0.0")
        XCTAssertEqual(lines[3], "DOMAIN_MAX 1.0 1.0 1.0")
        // 4 行头 + size³ 行数据 + 末尾换行产生的空行
        XCTAssertEqual(lines.count, 4 + size * size * size + 1)
        // 每个数据行是三个 float
        let sample = lines[4].split(separator: " ")
        XCTAssertEqual(sample.count, 3)
        XCTAssertNotNil(Double(sample[0]))
    }

    func testApplyMatchesDirectRender() {
        // 33³ LUT 三线性插值应接近逐像素直算（插值误差应很小）
        let params = warmParams
        let lut = LUT(params: params)
        let base = SyntheticImages.baseScene(width: 16, height: 16)
        let viaLUT = lut.apply(to: base)
        var maxError = 0.0
        for i in 0..<base.pixelCount {
            let direct = GradeRenderer.apply(base.rgb(atPixel: i), params: params)
            let interpolated = viaLUT.rgb(atPixel: i)
            maxError = max(maxError, abs(direct.x - interpolated.x))
            maxError = max(maxError, abs(direct.y - interpolated.y))
            maxError = max(maxError, abs(direct.z - interpolated.z))
        }
        XCTAssertLessThan(maxError, 0.02, "LUT 插值与直算的最大偏差应小于 2/255 量级")
    }
}
