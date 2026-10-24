import Foundation

/// 一组订单的汇总（日结、报表、报税导出共用）
struct SalesSummary: Hashable {
    var orderCount = 0
    var cupCount = 0
    var gross = 0
    var byPayment: [PaymentMethod: Int] = [:]
    var byChannel: [Channel: Int] = [:]
    var ordersByChannel: [Channel: Int] = [:]
    /// 8% / 10% 对象的含税合计和其中的消费税
    var taxableByRate: [Int: Int] = [:]
    var taxByRate: [Int: Int] = [:]
    var refundCount = 0
    var refundAmount = 0

    var averageTicket: Int { orderCount == 0 ? 0 : gross / orderCount }

    func payment(_ method: PaymentMethod) -> Int { byPayment[method] ?? 0 }
    func channel(_ channel: Channel) -> Int { byChannel[channel] ?? 0 }
    func payments(in group: PaymentGroup) -> Int {
        group.methods.reduce(0) { $0 + payment($1) }
    }
}

struct RankingRow: Identifiable, Hashable {
    var id: String { itemID }
    var itemID: String
    var name: String
    var cups: Int
    var amount: Int
}

struct ComboRow: Identifiable, Hashable {
    var id: String { line.comboKey }
    /// 数量为 1 的模板行
    var line: OrderLine
    var cups: Int
}

struct ShareRow: Identifiable, Hashable {
    var id: String { label }
    var label: String
    var count: Int
    var ratio: Double
}

enum Reports {
    static func summary(_ orders: [Order]) -> SalesSummary {
        var s = SalesSummary()
        for order in orders {
            if order.isRefunded {
                s.refundCount += 1
                s.refundAmount += order.total
                continue
            }
            s.orderCount += 1
            s.cupCount += order.cupCount
            s.gross += order.total
            s.byPayment[order.payment, default: 0] += order.total
            s.byChannel[order.channel, default: 0] += order.total
            s.ordersByChannel[order.channel, default: 0] += 1
            s.taxableByRate[order.taxRate, default: 0] += order.total
            s.taxByRate[order.taxRate, default: 0] += order.taxAmount
        }
        return s
    }

    /// 外卖扣除抽成后的到手金额（店内为原金额）
    static func net(for channel: Channel, gross: Int, settings: ShopSettings) -> Int {
        let rate = settings.commission(for: channel)
        return Int((Double(gross) * (100 - rate) / 100).rounded())
    }

    static func ranking(_ orders: [Order]) -> [RankingRow] {
        var rows: [String: RankingRow] = [:]
        for order in orders where !order.isRefunded {
            for line in order.lines {
                var row = rows[line.itemID] ?? RankingRow(itemID: line.itemID, name: line.name, cups: 0, amount: 0)
                row.cups += line.quantity
                row.amount += line.total
                rows[line.itemID] = row
            }
        }
        return rows.values.sorted { ($0.cups, $0.amount, $1.name) > ($1.cups, $1.amount, $0.name) }
    }

    /// 每小时单量（key 为 0–23 点）
    static func hourly(_ orders: [Order], calendar: BusinessCalendar) -> [Int: Int] {
        var result: [Int: Int] = [:]
        for order in orders where !order.isRefunded {
            result[calendar.hour(of: order.createdAt), default: 0] += 1
        }
        return result
    }

    /// 「常点」：点得最多的组合
    static func topCombos(_ orders: [Order], limit: Int = 8) -> [ComboRow] {
        var counts: [String: ComboRow] = [:]
        var firstSeen: [String: Int] = [:]
        var order = 0
        for o in orders where !o.isRefunded {
            for line in o.lines {
                let key = line.comboKey
                if var row = counts[key] {
                    row.cups += line.quantity
                    counts[key] = row
                } else {
                    var template = line
                    template.quantity = 1
                    counts[key] = ComboRow(line: template, cups: line.quantity)
                    firstSeen[key] = order
                    order += 1
                }
            }
        }
        return counts.values
            .sorted { a, b in
                if a.cups != b.cups { return a.cups > b.cups }
                return (firstSeen[a.id] ?? 0) < (firstSeen[b.id] ?? 0)
            }
            .prefix(limit)
            .map { $0 }
    }

    static func sweetnessShare(_ orders: [Order]) -> [ShareRow] {
        share(orders, keys: Sweetness.allCases.map(\.label)) { [$0.sweetness.label] }
    }

    static func temperatureShare(_ orders: [Order]) -> [ShareRow] {
        share(orders, keys: Temperature.allCases.map(\.label)) { [$0.temp.label] }
    }

    /// 小料比例：分母是总杯数（一杯可以加多种）
    static func toppingShare(_ orders: [Order], menu: ShopMenu) -> [ShareRow] {
        let keys = menu.toppings.map(\.name)
        return share(orders, keys: keys) { line in line.toppings.map(\.name) }
            .filter { $0.count > 0 }
            .sorted { $0.count > $1.count }
    }

    private static func share(_ orders: [Order], keys: [String], values: (OrderLine) -> [String]) -> [ShareRow] {
        var counts: [String: Int] = [:]
        var cups = 0
        for order in orders where !order.isRefunded {
            for line in order.lines {
                cups += line.quantity
                for value in values(line) {
                    counts[value, default: 0] += line.quantity
                }
            }
        }
        var orderedKeys = keys
        for key in counts.keys.sorted() where !orderedKeys.contains(key) {
            orderedKeys.append(key)
        }
        return orderedKeys.map { key in
            let count = counts[key] ?? 0
            return ShareRow(label: key, count: count, ratio: cups == 0 ? 0 : Double(count) / Double(cups))
        }
    }
}
