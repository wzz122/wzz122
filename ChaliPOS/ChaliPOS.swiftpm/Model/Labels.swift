import Foundation

/// 出杯标签（每杯一张，约 40×30mm）
struct CupLabel: Identifiable, Hashable {
    var id: String
    var pickup: String
    var index: Int
    var count: Int
    var name: String
    var nameJP: String
    var spec: String
    var toppings: String
    /// 「店内 外带 16:20」或「Uber #4821 16:20」
    var footer: String
}

enum LabelBuilder {
    static func labels(for order: Order, calendar: BusinessCalendar) -> [CupLabel] {
        let count = order.cupCount
        let footer = footerText(for: order, calendar: calendar)
        var result: [CupLabel] = []
        var index = 0
        for line in order.lines {
            for _ in 0..<line.quantity {
                index += 1
                result.append(CupLabel(
                    id: "\(order.id.uuidString)-\(index)",
                    pickup: order.pickupLabel,
                    index: index,
                    count: count,
                    name: line.name,
                    nameJP: line.nameJP,
                    spec: line.labelSpec,
                    toppings: line.labelToppings,
                    footer: footer
                ))
            }
        }
        return result
    }

    static func footerText(for order: Order, calendar: BusinessCalendar) -> String {
        let time = calendar.timeString(order.createdAt)
        if let online = order.online {
            let seat = online.seat.map { " \($0)" } ?? ""
            return "扫码 \(online.numberLabel)\(seat) \(order.dining.label) \(time)"
        }
        if order.channel.isDelivery {
            let ref = order.platformOrderRef.map { " #" + $0 } ?? ""
            return "\(order.channel.shortLabel)\(ref) \(time)"
        }
        return "店内 \(order.dining.label) \(time)"
    }
}
