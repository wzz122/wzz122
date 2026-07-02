import ColorEngine
import Foundation

/// 风格族定义。数据来自 docs/color-grading-notes 的笔记编译
/// （v1 首发 5 包为手工整理），运行时只读。
/// 合规红线：explanation/tweaks 必须是原创中文解释，
/// 不得出现原视频文案或以博主/课程命名的内容。
public struct StyleDefinition: Codable, Sendable, Identifiable, Equatable {
    /// 签名检查项：参数键在 [min, max] 内得满分，偏离按距离衰减
    public struct SignatureCheck: Codable, Sendable, Equatable {
        public var key: String
        public var min: Double
        public var max: Double
        public var weight: Double

        public init(key: String, min: Double, max: Double, weight: Double = 1) {
            self.key = key
            self.min = min
            self.max = max
            self.weight = weight
        }
    }

    public struct Tweak: Codable, Sendable, Equatable {
        /// 触发场景描述，如“肤色偏青”
        public var when: String
        /// 操作建议，如“HSL 橙色饱和度 +10”
        public var action: String

        enum CodingKeys: String, CodingKey {
            case when
            case action = "do"
        }
    }

    public var styleId: String
    public var name: String
    /// 一句话风格描述
    public var tagline: String
    public var signature: [SignatureCheck]
    /// “为什么像”的分条解释
    public var explanation: [String]
    public var tweaks: [Tweak]
    public var suitableFor: [String]
    public var avoidFor: [String]

    public var id: String { styleId }
}

/// 匹配结果
public struct StyleMatch: Sendable, Equatable {
    public let style: StyleDefinition
    /// 0..1，1 为全部签名项命中
    public let score: Double

    public init(style: StyleDefinition, score: Double) {
        self.style = style
        self.score = score
    }
}

/// 从 GradeParameters 解析签名键的取值。
/// 支持的键：temperature/tint/exposure/contrast/highlights/shadows/whites/
/// blacks/vibrance/saturation/satTotal/shadowTintSat/shadowTintHue/
/// highlightTintSat/highlightTintHue/hslSat.<band>/hslLum.<band>/hslHue.<band>
public enum SignatureKeyResolver {
    public static func value(of key: String, in p: GradeParameters) -> Double? {
        if let dotIndex = key.firstIndex(of: ".") {
            let family = String(key[..<dotIndex])
            let bandName = String(key[key.index(after: dotIndex)...])
            guard let band = ColorMath.bandNames.firstIndex(of: bandName) else { return nil }
            switch family {
            case "hslSat": return p.hslSat[band]
            case "hslLum": return p.hslLum[band]
            case "hslHue": return p.hslHue[band]
            default: return nil
            }
        }
        switch key {
        case "temperature": return p.temperature
        case "tint": return p.tint
        case "exposure": return p.exposure
        case "contrast": return p.contrast
        case "highlights": return p.highlights
        case "shadows": return p.shadows
        case "whites": return p.whites
        case "blacks": return p.blacks
        case "vibrance": return p.vibrance
        case "saturation": return p.saturation
        case "satTotal": return p.satTotal
        case "shadowTintSat": return p.shadowTintSat
        case "shadowTintHue": return p.shadowTintHue
        case "highlightTintSat": return p.highlightTintSat
        case "highlightTintHue": return p.highlightTintHue
        default: return nil
        }
    }

    /// 色相类键需要环形区间语义（min > max 表示跨 0 度）
    public static func isHueKey(_ key: String) -> Bool {
        key == "shadowTintHue" || key == "highlightTintHue" || key.hasPrefix("hslHue.")
    }
}
