import Foundation

/// 日结记录
struct DailyClose: Codable, Identifiable, Hashable {
    var id: String { businessDay }
    var storeID: String
    var businessDay: String
    var closedAt: Date
    var cashFloat: Int
    /// 面额 → 张数/枚数
    var cashCounts: [Int: Int]
    var countedCash: Int
    var expectedCash: Int
    var orderCount: Int
    var gross: Int
    /// PaymentMethod.rawValue → 金额
    var paymentTotals: [String: Int]
    /// Channel.rawValue → 金额
    var channelTotals: [String: Int]
    var note: String

    var difference: Int { countedCash - expectedCash }
}

enum CashDrawer {
    static let denominations = [10000, 5000, 2000, 1000, 500, 100, 50, 10, 5, 1]

    static func total(of counts: [Int: Int]) -> Int {
        counts.reduce(0) { $0 + $1.key * max($1.value, 0) }
    }

    /// 应有现金 = 备用金 + 当天现金销售（退款单已排除）
    static func expectedCash(float: Int, summary: SalesSummary) -> Int {
        float + summary.payment(.cash)
    }

    static func makeClose(
        day: String,
        settings: ShopSettings,
        counts: [Int: Int],
        summary: SalesSummary,
        note: String,
        now: Date = Date()
    ) -> DailyClose {
        DailyClose(
            storeID: settings.storeID,
            businessDay: day,
            closedAt: now,
            cashFloat: settings.cashFloat,
            cashCounts: counts.filter { $0.value > 0 },
            countedCash: total(of: counts),
            expectedCash: expectedCash(float: settings.cashFloat, summary: summary),
            orderCount: summary.orderCount,
            gross: summary.gross,
            paymentTotals: Dictionary(uniqueKeysWithValues: summary.byPayment.map { ($0.key.rawValue, $0.value) }),
            channelTotals: Dictionary(uniqueKeysWithValues: summary.byChannel.map { ($0.key.rawValue, $0.value) }),
            note: note
        )
    }

    /// 日结单文字版（分享 / 打印）
    static func reportText(close: DailyClose, summary: SalesSummary, settings: ShopSettings, calendar: BusinessCalendar) -> String {
        var lines: [String] = []
        lines.append("\(settings.shopName) 日结单")
        lines.append("营业日：\(close.businessDay)")
        lines.append("日结时间：\(calendar.dateTimeString(close.closedAt))")
        lines.append("")
        lines.append("单数：\(summary.orderCount) 单 / \(summary.cupCount) 杯")
        lines.append("销售额：\(Money.yen(summary.gross))")
        if summary.refundCount > 0 {
            lines.append("退款：\(summary.refundCount) 单 \(Money.yen(summary.refundAmount))（已从销售额中扣除）")
        }
        lines.append("")
        lines.append("【现金】")
        lines.append("备用金：\(Money.yen(close.cashFloat))")
        lines.append("现金销售：\(Money.yen(summary.payment(.cash)))")
        lines.append("应有现金：\(Money.yen(close.expectedCash))")
        lines.append("实点现金：\(Money.yen(close.countedCash))")
        lines.append("差额：\(Money.yen(close.difference))")
        lines.append("")
        lines.append("【支付方式】")
        for method in PaymentMethod.allCases where summary.payment(method) != 0 {
            lines.append("\(method.label)：\(Money.yen(summary.payment(method)))")
        }
        lines.append("")
        lines.append("【渠道】")
        for channel in Channel.allCases where summary.channel(channel) != 0 {
            let gross = summary.channel(channel)
            if channel.isDelivery {
                let net = Reports.net(for: channel, gross: gross, settings: settings)
                lines.append("\(channel.label)：\(Money.yen(gross))（扣抽成到手 \(Money.yen(net))）")
            } else {
                lines.append("\(channel.label)：\(Money.yen(gross))")
            }
        }
        lines.append("")
        lines.append("【消费税】")
        for rate in [8, 10] {
            let base = summary.taxableByRate[rate] ?? 0
            let tax = summary.taxByRate[rate] ?? 0
            lines.append("\(rate)%对象：\(Money.yen(base))（内税 \(Money.yen(tax))）")
        }
        if !close.note.isEmpty {
            lines.append("")
            lines.append("备注：\(close.note)")
        }
        return lines.joined(separator: "\n")
    }
}
