import ColorEngine
import PresetExporter
import StyleKnowledgeBase
import XCTest

#if canImport(FoundationXML)
import FoundationXML
#endif

final class PresetExporterTests: XCTestCase {
    var sampleParams: GradeParameters {
        var p = GradeParameters()
        p.temperature = 12.4
        p.tint = -3.2
        p.exposure = 0.847
        p.contrast = -15.6
        p.highlights = -22
        p.shadows = 18
        p.blacks = 9.7
        p.vibrance = 14
        p.saturation = -6
        p.hslSat[1] = 8.2
        p.hslLum[5] = -12.5
        p.shadowTintHue = 197.3
        p.shadowTintSat = 21.8
        return p
    }

    let fixedUUID = UUID(uuidString: "A1B2C3D4-E5F6-4A5B-8C9D-0E1F2A3B4C5D")!

    func testXMPIsWellFormedXML() {
        let xmp = XMPWriter.xmp(params: sampleParams, presetName: "海边黄昏 · 仿色", uuid: fixedUUID)
        let parser = XMLParser(data: Data(xmp.utf8))
        let ok = parser.parse()
        XCTAssertTrue(ok, "XMP 必须是良构 XML：\(parser.parserError?.localizedDescription ?? "unknown")")
    }

    func testXMPContainsCoreFields() {
        let xmp = XMPWriter.xmp(params: sampleParams, presetName: "Test", uuid: fixedUUID)
        XCTAssertTrue(xmp.contains("crs:IncrementalTemperature=\"12\""))
        XCTAssertTrue(xmp.contains("crs:IncrementalTint=\"-3\""))
        XCTAssertTrue(xmp.contains("crs:Exposure2012=\"+0.85\""))
        XCTAssertTrue(xmp.contains("crs:Contrast2012=\"-16\""))
        XCTAssertTrue(xmp.contains("crs:Highlights2012=\"-22\""))
        XCTAssertTrue(xmp.contains("crs:Shadows2012=\"+18\""))
        XCTAssertTrue(xmp.contains("crs:Blacks2012=\"+10\""))
        XCTAssertTrue(xmp.contains("crs:Vibrance=\"+14\""))
        XCTAssertTrue(xmp.contains("crs:Saturation=\"-6\""))
        XCTAssertTrue(xmp.contains("crs:SaturationAdjustmentOrange=\"+8\""))
        XCTAssertTrue(xmp.contains("crs:LuminanceAdjustmentBlue=\"-13\""))
        XCTAssertTrue(xmp.contains("crs:SplitToningShadowHue=\"197\""))
        XCTAssertTrue(xmp.contains("crs:SplitToningShadowSaturation=\"22\""))
        XCTAssertTrue(xmp.contains("crs:ProcessVersion=\"11.0\""))
        XCTAssertTrue(xmp.contains("crs:HasSettings=\"True\""))
        XCTAssertTrue(xmp.contains("crs:ToneCurvePV2012"))
        XCTAssertTrue(xmp.contains("<rdf:li>0, 0</rdf:li>"))
        XCTAssertTrue(xmp.contains("<rdf:li>255, 255</rdf:li>"))
    }

    func testXMPEscapesPresetName() {
        let xmp = XMPWriter.xmp(params: .identity, presetName: "A & B <Test>", uuid: fixedUUID)
        XCTAssertTrue(xmp.contains("A &amp; B &lt;Test&gt;"))
        XCTAssertFalse(xmp.contains("A & B <Test>"))
    }

    func testExposureFormatting() {
        var p = GradeParameters()
        p.exposure = 0
        XCTAssertTrue(XMPWriter.xmp(params: p, presetName: "t", uuid: fixedUUID)
            .contains("crs:Exposure2012=\"0.00\""))
        p.exposure = -1.2
        XCTAssertTrue(XMPWriter.xmp(params: p, presetName: "t", uuid: fixedUUID)
            .contains("crs:Exposure2012=\"-1.20\""))
    }

    func testSuggestedFileName() {
        XCTAssertEqual(
            XMPWriter.suggestedFileName(presetName: "海边黄昏 仿色"),
            "海边黄昏_仿色.xmp"
        )
        XCTAssertEqual(
            XMPWriter.suggestedFileName(presetName: "a/b\\c:d"),
            "abcd.xmp"
        )
        XCTAssertEqual(XMPWriter.suggestedFileName(presetName: ""), "ColorMatch_Preset.xmp")
    }

    func testFullReportContainsAllSections() throws {
        let library = try StyleLibrary.bundled()
        guard let tealOrange = library.styles.first(where: { $0.styleId == "teal-orange" }) else {
            return XCTFail("missing teal-orange style")
        }
        let match = StyleMatch(style: tealOrange, score: 0.87)
        let report = StyleReport.markdown(
            params: sampleParams,
            match: match,
            presetName: "夜街仿色"
        )
        XCTAssertTrue(report.contains("# 夜街仿色 · 风格报告"))
        XCTAssertTrue(report.contains("风格判定：青橙电影感"))
        XCTAssertTrue(report.contains("87%"))
        XCTAssertTrue(report.contains("## 为什么像"))
        XCTAssertTrue(report.contains("## 关键参数解读"))
        XCTAssertTrue(report.contains("## 微调建议"))
        XCTAssertTrue(report.contains("适合素材"))
        XCTAssertTrue(report.contains("导入方法"))
    }

    func testFreeReportIsTruncated() {
        let report = StyleReport.markdown(
            params: sampleParams,
            match: nil,
            presetName: "测试",
            options: StyleReport.Options(fullReport: false)
        )
        XCTAssertTrue(report.contains("风格判定"))
        XCTAssertFalse(report.contains("## 关键参数解读"))
        XCTAssertTrue(report.contains("升级 Pro"))
    }

    func testReportHandlesNoMatch() {
        let report = StyleReport.markdown(params: .identity, match: nil, presetName: "空参数")
        XCTAssertTrue(report.contains("自定义风格"))
        XCTAssertTrue(report.contains("轻微修饰"))
    }
}
