import ColorEngine
import Foundation

/// 风格族知识库：加载 styles.json，对 GradeParameters 做签名匹配。
public struct StyleLibrary: Sendable {
    /// 低于该分数视为“无明确风格”，报告走兜底文案
    public static let matchThreshold = 0.6

    public let styles: [StyleDefinition]

    public init(styles: [StyleDefinition]) {
        self.styles = styles
    }

    public init(jsonData: Data) throws {
        self.styles = try JSONDecoder().decode([StyleDefinition].self, from: jsonData)
    }

    /// 加载打包在模块资源里的 styles.json
    public static func bundled() throws -> StyleLibrary {
        guard let url = Bundle.module.url(forResource: "styles", withExtension: "json") else {
            throw CocoaError(.fileNoSuchFile)
        }
        return try StyleLibrary(jsonData: Data(contentsOf: url))
    }

    /// 单项签名得分：区间内 1.0，区间外按距离线性衰减
    static func checkScore(_ check: StyleDefinition.SignatureCheck, params: GradeParameters) -> Double {
        guard let v = SignatureKeyResolver.value(of: check.key, in: params) else { return 0 }
        if SignatureKeyResolver.isHueKey(check.key) {
            let hue = ColorMath.positiveMod(v, 360)
            let lo = ColorMath.positiveMod(check.min, 360)
            let hi = ColorMath.positiveMod(check.max, 360)
            let inside = lo <= hi ? (hue >= lo && hue <= hi) : (hue >= lo || hue <= hi)
            if inside { return 1 }
            // 到区间边界的环形距离
            func circularDistance(_ a: Double, _ b: Double) -> Double {
                let d = abs(a - b).truncatingRemainder(dividingBy: 360)
                return Swift.min(d, 360 - d)
            }
            let d = Swift.min(circularDistance(hue, lo), circularDistance(hue, hi))
            return Swift.max(0, 1 - d / 60.0)
        }
        if v >= check.min && v <= check.max { return 1 }
        // 区间外快速衰减：容差取区间宽度的 1/8（加 0.25 兜底，
        // 兼容 exposure 这类小数值参数），越窄的签名越挑剔
        let d = v < check.min ? check.min - v : v - check.max
        let tolerance = (check.max - check.min) / 8 + 0.25
        return Swift.max(0, 1 - d / tolerance)
    }

    /// 近恒等参数没有“风格”可言：多个风格的签名区间跨零，
    /// 不加门禁会让全零参数误命中
    public static func isNearIdentity(_ p: GradeParameters) -> Bool {
        abs(p.temperature) < 2 && abs(p.tint) < 2
            && abs(p.exposure) < 0.08 && abs(p.contrast) < 3
            && abs(p.highlights) < 4 && abs(p.shadows) < 4
            && abs(p.whites) < 4 && abs(p.blacks) < 4
            && abs(p.satTotal) < 4
            && p.shadowTintSat < 3 && p.highlightTintSat < 3
            && p.hslSat.allSatisfy { abs($0) < 5 }
            && p.hslLum.allSatisfy { abs($0) < 5 }
            && p.hslHue.allSatisfy { abs($0) < 5 }
    }

    /// 对单个风格打分（加权平均）
    public func score(_ style: StyleDefinition, params: GradeParameters) -> Double {
        var weightSum = 0.0
        var scoreSum = 0.0
        for check in style.signature {
            weightSum += check.weight
            scoreSum += check.weight * Self.checkScore(check, params: params)
        }
        return weightSum > 0 ? scoreSum / weightSum : 0
    }

    /// 最优匹配；低于阈值或近恒等参数返回 nil（报告应使用兜底文案）
    public func match(_ params: GradeParameters) -> StyleMatch? {
        guard !Self.isNearIdentity(params) else { return nil }
        var best: StyleMatch?
        for style in styles {
            let s = score(style, params: params)
            if best == nil || s > best!.score {
                best = StyleMatch(style: style, score: s)
            }
        }
        guard let found = best, found.score >= Self.matchThreshold else { return nil }
        return found
    }

    /// 全部风格按得分排序（Pro 报告的“相近风格”段落用）
    public func ranked(_ params: GradeParameters) -> [StyleMatch] {
        styles
            .map { StyleMatch(style: $0, score: score($0, params: params)) }
            .sorted { $0.score > $1.score }
    }
}
