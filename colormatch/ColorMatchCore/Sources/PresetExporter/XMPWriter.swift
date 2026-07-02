import ColorEngine
import Foundation

/// Lightroom 预设 XMP 写出器。
/// 字段与 GradeParameters 一一对应；禁止导出预览渲染不支持的参数。
/// 白平衡使用 Incremental（对 JPEG/HEIC 等已渲染文件生效，
/// 这是手机端 Lightroom 工作流的主路径）。
public enum XMPWriter {
    /// 生成 .xmp 预设文本
    /// - Parameters:
    ///   - params: 调色参数
    ///   - presetName: Lightroom 中显示的预设名
    ///   - uuid: 稳定 UUID（同一配方重复导出应传同一值）
    public static func xmp(
        params p: GradeParameters,
        presetName: String,
        uuid: UUID
    ) -> String {
        let bands = ["Red", "Orange", "Yellow", "Green", "Aqua", "Blue", "Purple", "Magenta"]

        var crs: [String] = []
        crs.append(attr("Version", "15.4"))
        crs.append(attr("ProcessVersion", "11.0"))
        crs.append(attr("PresetType", "Normal"))
        crs.append(attr("Cluster", "ColorMatch"))
        crs.append(attr("UUID", uuid.uuidString.replacingOccurrences(of: "-", with: "")))
        crs.append(attr("SupportsAmount", "False"))
        crs.append(attr("SupportsColor", "True"))
        crs.append(attr("SupportsMonochrome", "False"))
        crs.append(attr("SupportsHighDynamicRange", "True"))
        crs.append(attr("SupportsSceneReferred", "True"))
        crs.append(attr("WhiteBalance", "Custom"))

        crs.append(attr("IncrementalTemperature", int(p.temperature)))
        crs.append(attr("IncrementalTint", int(p.tint)))
        crs.append(attr("Exposure2012", exposureString(p.exposure)))
        crs.append(attr("Contrast2012", signedInt(p.contrast)))
        crs.append(attr("Highlights2012", signedInt(p.highlights)))
        crs.append(attr("Shadows2012", signedInt(p.shadows)))
        crs.append(attr("Whites2012", signedInt(p.whites)))
        crs.append(attr("Blacks2012", signedInt(p.blacks)))
        crs.append(attr("Vibrance", signedInt(p.vibrance)))
        crs.append(attr("Saturation", signedInt(p.saturation)))

        for (i, band) in bands.enumerated() {
            crs.append(attr("HueAdjustment\(band)", signedInt(p.hslHue[i])))
        }
        for (i, band) in bands.enumerated() {
            crs.append(attr("SaturationAdjustment\(band)", signedInt(p.hslSat[i])))
        }
        for (i, band) in bands.enumerated() {
            crs.append(attr("LuminanceAdjustment\(band)", signedInt(p.hslLum[i])))
        }

        // 色彩分级（新版三路 + 兼容旧版 split toning 字段）
        crs.append(attr("SplitToningShadowHue", int(p.shadowTintHue)))
        crs.append(attr("SplitToningShadowSaturation", int(p.shadowTintSat)))
        crs.append(attr("SplitToningHighlightHue", int(p.highlightTintHue)))
        crs.append(attr("SplitToningHighlightSaturation", int(p.highlightTintSat)))
        crs.append(attr("SplitToningBalance", signedInt(p.gradingBalance)))
        crs.append(attr("ColorGradeShadowLum", "0"))
        crs.append(attr("ColorGradeMidtoneHue", "0"))
        crs.append(attr("ColorGradeMidtoneSat", "0"))
        crs.append(attr("ColorGradeMidtoneLum", "0"))
        crs.append(attr("ColorGradeHighlightLum", "0"))
        crs.append(attr("ColorGradeBlending", "50"))
        crs.append(attr("ColorGradeGlobalHue", "0"))
        crs.append(attr("ColorGradeGlobalSat", "0"))
        crs.append(attr("ColorGradeGlobalLum", "0"))

        crs.append(attr("HasSettings", "True"))

        let curveSeq = """
              <crs:ToneCurvePV2012>
               <rdf:Seq>
                <rdf:li>0, 0</rdf:li>
                <rdf:li>255, 255</rdf:li>
               </rdf:Seq>
              </crs:ToneCurvePV2012>
        """

        return """
        <x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="ColorMatch">
         <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
          <rdf:Description rdf:about=""
            xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"
        \(crs.map { "    \($0)" }.joined(separator: "\n"))>
           <crs:Name>
            <rdf:Alt>
             <rdf:li xml:lang="x-default">\(escapeXML(presetName))</rdf:li>
            </rdf:Alt>
           </crs:Name>
           <crs:Group>
            <rdf:Alt>
             <rdf:li xml:lang="x-default">ColorMatch</rdf:li>
            </rdf:Alt>
           </crs:Group>
        \(curveSeq)
          </rdf:Description>
         </rdf:RDF>
        </x:xmpmeta>
        """
    }

    /// 建议的导出文件名（去除非法字符）
    public static func suggestedFileName(presetName: String) -> String {
        let illegal = CharacterSet(charactersIn: "/\\?%*|\"<>:")
        let cleaned = presetName
            .components(separatedBy: illegal)
            .joined()
            .replacingOccurrences(of: " ", with: "_")
        return (cleaned.isEmpty ? "ColorMatch_Preset" : cleaned) + ".xmp"
    }

    // MARK: - 格式化

    static func attr(_ name: String, _ value: String) -> String {
        "crs:\(name)=\"\(value)\""
    }

    /// 四舍五入到整数（远离零），Lightroom 滑杆惯例
    static func int(_ v: Double) -> String {
        String(Int(v.rounded()))
    }

    /// 正值带 "+" 前缀（Lightroom 写法）
    static func signedInt(_ v: Double) -> String {
        let r = Int(v.rounded())
        return r > 0 ? "+\(r)" : String(r)
    }

    /// 曝光两位小数，正值带 "+"（如 "+0.85"、"-1.20"、"0.00"）
    static func exposureString(_ v: Double) -> String {
        let s = String(format: "%.2f", abs(v))
        if s == "0.00" { return "0.00" }
        return v > 0 ? "+\(s)" : "-\(s)"
    }

    static func escapeXML(_ s: String) -> String {
        s.replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
            .replacingOccurrences(of: "'", with: "&apos;")
    }
}
