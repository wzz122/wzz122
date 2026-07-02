import ColorEngine
import Foundation
import StyleKnowledgeBase

/// 中文风格报告生成器。
/// XMP 解决“用”，报告解决“懂”：每次导出都附带一份可读的调色解释。
public enum StyleReport {
    public struct Options: Sendable {
        /// 免费版只给风格名 + 一句摘要；Pro 给完整报告
        public var fullReport: Bool

        public init(fullReport: Bool = true) {
            self.fullReport = fullReport
        }
    }

    /// 生成 Markdown 报告
    public static func markdown(
        params p: GradeParameters,
        match: StyleMatch?,
        presetName: String,
        options: Options = Options()
    ) -> String {
        var lines: [String] = []
        lines.append("# \(presetName) · 风格报告")
        lines.append("")

        if let match {
            lines.append("## 风格判定：\(match.style.name)")
            lines.append("")
            lines.append("\(match.style.tagline)（匹配度 \(Int((match.score * 100).rounded()))%）")
        } else {
            lines.append("## 风格判定：自定义风格")
            lines.append("")
            lines.append("这组参数没有落入任何已知风格族，说明参考图有比较独特的个人风格——参数本身依然可用。")
        }
        lines.append("")

        guard options.fullReport else {
            lines.append("---")
            lines.append("")
            lines.append("升级 Pro 解锁完整报告：逐参数解读、微调建议、适用与避免场景。")
            return lines.joined(separator: "\n") + "\n"
        }

        if let match, !match.style.explanation.isEmpty {
            lines.append("## 为什么像")
            lines.append("")
            for e in match.style.explanation {
                lines.append("- \(e)")
            }
            lines.append("")
        }

        lines.append("## 关键参数解读")
        lines.append("")
        for entry in significantParams(p).prefix(5) {
            lines.append("- \(entry)")
        }
        lines.append("")

        if let match, !match.style.tweaks.isEmpty {
            lines.append("## 微调建议")
            lines.append("")
            for t in match.style.tweaks {
                lines.append("- **\(t.when)**：\(t.action)")
            }
            lines.append("")
        }

        if let match {
            if !match.style.suitableFor.isEmpty {
                lines.append("**适合素材**：\(match.style.suitableFor.joined(separator: "、"))")
            }
            if !match.style.avoidFor.isEmpty {
                lines.append("**慎用素材**：\(match.style.avoidFor.joined(separator: "、"))")
            }
            lines.append("")
        }

        lines.append("---")
        lines.append("")
        lines.append("导入方法：把 .xmp 文件分享到 Lightroom，或在 Lightroom Classic 的预设面板选择“导入预设”。")
        return lines.joined(separator: "\n") + "\n"
    }

    /// 按感知显著度排序的参数解读句
    static func significantParams(_ p: GradeParameters) -> [String] {
        var entries: [(magnitude: Double, text: String)] = []

        func add(_ value: Double, threshold: Double, magnitudeScale: Double = 1, _ text: @autoclosure () -> String) {
            if abs(value) >= threshold {
                entries.append((abs(value) * magnitudeScale, text()))
            }
        }

        add(p.temperature, threshold: 3,
            "色温 \(fmt(p.temperature))：白平衡向\(p.temperature > 0 ? "暖（黄橙）" : "冷（蓝青）")偏移，这是整体氛围的地基")
        add(p.tint, threshold: 3,
            "色调 \(fmt(p.tint))：向\(p.tint > 0 ? "品红" : "绿色")方向修正，通常在补偿光源的颜色缺陷")
        add(p.exposure, threshold: 0.1, magnitudeScale: 40,
            "曝光 \(fmtExposure(p.exposure)) 档：整体\(p.exposure > 0 ? "提亮" : "压暗")，决定画面的明暗基调")
        add(p.contrast, threshold: 3,
            "对比度 \(fmt(p.contrast))：\(p.contrast > 0 ? "明暗分离更干脆" : "过渡更柔和，宽容度观感更强")")
        add(p.highlights, threshold: 5,
            "高光 \(fmt(p.highlights))：\(p.highlights > 0 ? "亮部更透" : "找回亮部细节，天空和皮肤高光不死白")")
        add(p.shadows, threshold: 5,
            "阴影 \(fmt(p.shadows))：\(p.shadows > 0 ? "暗部细节被抬出来" : "暗部下压，加重氛围")")
        add(p.blacks, threshold: 5,
            "黑色色阶 \(fmt(p.blacks))：\(p.blacks > 0 ? "最暗处被抬起，产生褪色胶片感" : "黑得更实，画面更有分量")")
        add(p.whites, threshold: 5,
            "白色色阶 \(fmt(p.whites))：调整画面最亮端的白点位置")
        add(p.vibrance, threshold: 4,
            "鲜艳度 \(fmt(p.vibrance))：优先作用于低饱和区域，肤色相对安全")
        add(p.saturation, threshold: 4,
            "饱和度 \(fmt(p.saturation))：全局等比\(p.saturation > 0 ? "提升" : "降低")颜色浓度")
        if p.shadowTintSat >= 3 {
            entries.append((p.shadowTintSat,
                "阴影染色：向\(hueName(p.shadowTintHue))（\(Int(p.shadowTintHue.rounded()))°）注入 \(Int(p.shadowTintSat.rounded())) 饱和，塑造暗部氛围"))
        }
        if p.highlightTintSat >= 3 {
            entries.append((p.highlightTintSat,
                "高光染色：向\(hueName(p.highlightTintHue))（\(Int(p.highlightTintHue.rounded()))°）注入 \(Int(p.highlightTintSat.rounded())) 饱和，给亮部定调"))
        }
        let bandNamesZh = ["红", "橙", "黄", "绿", "浅绿", "蓝", "紫", "品红"]
        for i in 0..<8 {
            if abs(p.hslSat[i]) >= 8 {
                entries.append((abs(p.hslSat[i]) * 0.8,
                    "HSL \(bandNamesZh[i])色饱和 \(fmt(p.hslSat[i]))：选择性\(p.hslSat[i] > 0 ? "强化" : "收敛")该色系"))
            }
            if abs(p.hslLum[i]) >= 8 {
                entries.append((abs(p.hslLum[i]) * 0.8,
                    "HSL \(bandNamesZh[i])色明亮度 \(fmt(p.hslLum[i]))：单独\(p.hslLum[i] > 0 ? "提亮" : "压暗")该色系"))
            }
        }

        if entries.isEmpty {
            return ["参考图与原图的色彩差异很小，这组参数只做了轻微修饰"]
        }
        return entries.sorted { $0.magnitude > $1.magnitude }.map { $0.text }
    }

    static func fmt(_ v: Double) -> String {
        let r = Int(v.rounded())
        return r > 0 ? "+\(r)" : String(r)
    }

    static func fmtExposure(_ v: Double) -> String {
        let s = String(format: "%.2f", abs(v))
        return v >= 0 ? "+\(s)" : "-\(s)"
    }

    static func hueName(_ hue: Double) -> String {
        let h = ColorMath.positiveMod(hue, 360)
        switch h {
        case ..<20: return "红"
        case ..<45: return "橙"
        case ..<70: return "黄"
        case ..<150: return "绿"
        case ..<200: return "青"
        case ..<260: return "蓝"
        case ..<310: return "紫"
        case ..<340: return "品红"
        default: return "红"
        }
    }
}
