import Foundation

/// 唯一的跨模块契约：Lightroom 参数子集。
/// 引擎产出它，渲染器消费它，XMP/报告导出它，知识库匹配它。
/// 字段单位与 Lightroom 滑杆一致。
public struct GradeParameters: Codable, Equatable, Sendable {
    /// 白平衡（Incremental，-100..100）
    public var temperature: Double = 0
    public var tint: Double = 0
    /// 曝光（stops，-5..5）
    public var exposure: Double = 0
    /// 以下均为 -100..100 滑杆
    public var contrast: Double = 0
    public var highlights: Double = 0
    public var shadows: Double = 0
    public var whites: Double = 0
    public var blacks: Double = 0
    public var vibrance: Double = 0
    public var saturation: Double = 0
    /// 8 通道 HSL（red, orange, yellow, green, aqua, blue, purple, magenta）
    public var hslHue: [Double] = Array(repeating: 0, count: 8)
    public var hslSat: [Double] = Array(repeating: 0, count: 8)
    public var hslLum: [Double] = Array(repeating: 0, count: 8)
    /// 色彩分级（split tone）：hue 0..360，sat 0..100
    public var shadowTintHue: Double = 0
    public var shadowTintSat: Double = 0
    public var highlightTintHue: Double = 0
    public var highlightTintSat: Double = 0
    public var gradingBalance: Double = 0

    public init() {}

    /// 全零（恒等）参数
    public static let identity = GradeParameters()

    public var isIdentity: Bool { self == .identity }

    /// vibrance + saturation 的合并强度，供知识库匹配使用
    public var satTotal: Double { vibrance + saturation }

    /// 夹取到 Lightroom 合法范围。AI 微调建议必须经过这里再应用。
    public func clamped() -> GradeParameters {
        var p = self
        p.temperature = ColorMath.clamp(p.temperature, -100, 100)
        p.tint = ColorMath.clamp(p.tint, -100, 100)
        p.exposure = ColorMath.clamp(p.exposure, -5, 5)
        p.contrast = ColorMath.clamp(p.contrast, -100, 100)
        p.highlights = ColorMath.clamp(p.highlights, -100, 100)
        p.shadows = ColorMath.clamp(p.shadows, -100, 100)
        p.whites = ColorMath.clamp(p.whites, -100, 100)
        p.blacks = ColorMath.clamp(p.blacks, -100, 100)
        p.vibrance = ColorMath.clamp(p.vibrance, -100, 100)
        p.saturation = ColorMath.clamp(p.saturation, -100, 100)
        p.hslHue = p.hslHue.map { ColorMath.clamp($0, -100, 100) }
        p.hslSat = p.hslSat.map { ColorMath.clamp($0, -100, 100) }
        p.hslLum = p.hslLum.map { ColorMath.clamp($0, -100, 100) }
        p.shadowTintHue = ColorMath.positiveMod(p.shadowTintHue, 360)
        p.shadowTintSat = ColorMath.clamp(p.shadowTintSat, 0, 100)
        p.highlightTintHue = ColorMath.positiveMod(p.highlightTintHue, 360)
        p.highlightTintSat = ColorMath.clamp(p.highlightTintSat, 0, 100)
        p.gradingBalance = ColorMath.clamp(p.gradingBalance, -100, 100)
        return p
    }
}
