import Foundation

/// 交给会计 / 导入会计软件的 CSV（UTF-8 带 BOM，Excel 直接打开不乱码）
enum CSVExport {
    static let bom = "\u{FEFF}"

    /// 报税用：每天一行，按税率和收款方式拆分金额（退款单不计入）
    static func dailyTaxCSV(days: [String], ordersByDay: [String: [Order]]) -> String {
        let methods = PaymentMethod.allCases.filter { $0 != .platform }
        var header = [
            "日付", "件数", "杯数", "売上合計(税込)",
            "8%対象(税込)", "うち消費税8%", "10%対象(税込)", "うち消費税10%",
        ]
        header += methods.map(\.labelJP)
        header += Channel.deliveryChannels.map(\.labelJP)
        header += ["返金件数", "返金額"]

        var rows = [header]
        var totals = Array(repeating: 0, count: header.count - 1)
        for day in days {
            let s = Reports.summary(ordersByDay[day] ?? [])
            var values = [
                s.orderCount, s.cupCount, s.gross,
                s.taxableByRate[8] ?? 0, s.taxByRate[8] ?? 0,
                s.taxableByRate[10] ?? 0, s.taxByRate[10] ?? 0,
            ]
            values += methods.map { s.payment($0) }
            values += Channel.deliveryChannels.map { s.channel($0) }
            values += [s.refundCount, s.refundAmount]
            for (i, v) in values.enumerated() { totals[i] += v }
            rows.append([day.replacingOccurrences(of: "-", with: "/")] + values.map(String.init))
        }
        rows.append(["合計"] + totals.map(String.init))
        return bom + rows.map { $0.map(escape).joined(separator: ",") }.joined(separator: "\r\n") + "\r\n"
    }

    /// 订单明细：每单一行
    static func orderDetailCSV(orders: [Order], calendar: BusinessCalendar) -> String {
        let header = [
            "営業日", "日時", "取餐号", "チャネル", "店内/持ち帰り", "支払方法",
            "税率", "合計(税込)", "うち消費税", "杯数", "明細", "プラットフォーム注文番号", "状態",
        ]
        var rows = [header]
        for order in orders.sorted(by: { $0.createdAt < $1.createdAt }) {
            let detail = order.lines.map { line in
                "\(line.name) \(line.cartSummary) ×\(line.quantity) \(line.total)"
            }.joined(separator: " / ")
            rows.append([
                order.businessDay.replacingOccurrences(of: "-", with: "/"),
                calendar.dateTimeString(order.createdAt),
                order.pickupLabel,
                order.channel.labelJP,
                order.dining.labelJP,
                order.payment.labelJP,
                "\(order.taxRate)%",
                String(order.total),
                String(order.taxAmount),
                String(order.cupCount),
                detail,
                order.platformOrderRef ?? "",
                order.status.label,
            ])
        }
        return bom + rows.map { $0.map(escape).joined(separator: ",") }.joined(separator: "\r\n") + "\r\n"
    }

    static func escape(_ field: String) -> String {
        if field.contains(where: { $0 == "," || $0 == "\"" || $0 == "\n" || $0 == "\r" }) {
            return "\"" + field.replacingOccurrences(of: "\"", with: "\"\"") + "\""
        }
        return field
    }
}
