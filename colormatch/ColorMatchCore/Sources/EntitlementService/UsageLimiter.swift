import Foundation

/// 键值存储抽象：生产环境用 UserDefaults，测试用 InMemoryKeyValueStore
public protocol KeyValueStore: AnyObject {
    func integer(forKey key: String) -> Int
    func set(_ value: Int, forKey key: String)
    func string(forKey key: String) -> String?
    func set(_ value: String, forKey key: String)
}

public final class InMemoryKeyValueStore: KeyValueStore {
    private var ints: [String: Int] = [:]
    private var strings: [String: String] = [:]

    public init() {}

    public func integer(forKey key: String) -> Int { ints[key] ?? 0 }
    public func set(_ value: Int, forKey key: String) { ints[key] = value }
    public func string(forKey key: String) -> String? { strings[key] }
    public func set(_ value: String, forKey key: String) { strings[key] = value }
}

/// integer(forKey:)/set(Int)/string(forKey:) 由 Foundation 原生方法满足，
/// 只需补 String 写入的精确重载
extension UserDefaults: KeyValueStore {
    public func set(_ value: String, forKey key: String) {
        set(value as Any, forKey: key)
    }
}

/// 免费/Pro 配额（架构文档 §6 的数字落地处，改这里即改产品策略）
public struct FreeTierLimits: Sendable {
    public var dailyMatches = 3
    public var totalXMPExports = 3
    public var maxRecipes = 5
    public var proMonthlyAIDiagnoses = 30

    public init() {}
}

/// 用量限次器。日期以字符串注入（调用方从 Date 格式化），保证可测试。
/// 原则：免费版必须能完整走通一次“仿色 → 报告 → XMP”，卡频次不卡流程。
public final class UsageLimiter {
    public let limits: FreeTierLimits
    private let store: KeyValueStore

    private enum Key {
        static let matchDay = "cm.usage.match.day"
        static let matchCount = "cm.usage.match.count"
        static let xmpTotal = "cm.usage.xmp.total"
        static let aiMonth = "cm.usage.ai.month"
        static let aiCount = "cm.usage.ai.count"
    }

    public init(store: KeyValueStore, limits: FreeTierLimits = FreeTierLimits()) {
        self.store = store
        self.limits = limits
    }

    /// 便捷格式化："2026-07-02"
    public static func dayString(for date: Date, calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    /// 便捷格式化："2026-07"
    public static func monthString(for date: Date, calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.year, .month], from: date)
        return String(format: "%04d-%02d", c.year ?? 0, c.month ?? 0)
    }

    // MARK: - 仿色（免费每日限次）

    public func remainingMatches(day: String, isPro: Bool) -> Int {
        guard !isPro else { return .max }
        rolloverDayIfNeeded(day)
        return max(0, limits.dailyMatches - store.integer(forKey: Key.matchCount))
    }

    public func canPerformMatch(day: String, isPro: Bool) -> Bool {
        isPro || remainingMatches(day: day, isPro: isPro) > 0
    }

    public func recordMatch(day: String) {
        rolloverDayIfNeeded(day)
        store.set(store.integer(forKey: Key.matchCount) + 1, forKey: Key.matchCount)
    }

    private func rolloverDayIfNeeded(_ day: String) {
        if store.string(forKey: Key.matchDay) != day {
            store.set(day, forKey: Key.matchDay)
            store.set(0, forKey: Key.matchCount)
        }
    }

    // MARK: - XMP 导出（免费累计限次：给完整体验，然后撞墙）

    public func remainingXMPExports(isPro: Bool) -> Int {
        guard !isPro else { return .max }
        return max(0, limits.totalXMPExports - store.integer(forKey: Key.xmpTotal))
    }

    public func canExportXMP(isPro: Bool) -> Bool {
        isPro || remainingXMPExports(isPro: isPro) > 0
    }

    public func recordXMPExport() {
        store.set(store.integer(forKey: Key.xmpTotal) + 1, forKey: Key.xmpTotal)
    }

    // MARK: - 配方数量（免费上限）

    public func canSaveRecipe(currentCount: Int, isPro: Bool) -> Bool {
        isPro || currentCount < limits.maxRecipes
    }

    // MARK: - AI 诊断（Pro 月配额，v1.1 启用）

    public func remainingAIDiagnoses(month: String, isPro: Bool) -> Int {
        guard isPro else { return 0 }
        if store.string(forKey: Key.aiMonth) != month {
            store.set(month, forKey: Key.aiMonth)
            store.set(0, forKey: Key.aiCount)
        }
        return max(0, limits.proMonthlyAIDiagnoses - store.integer(forKey: Key.aiCount))
    }

    public func recordAIDiagnosis(month: String) {
        _ = remainingAIDiagnoses(month: month, isPro: true)
        store.set(store.integer(forKey: Key.aiCount) + 1, forKey: Key.aiCount)
    }
}
