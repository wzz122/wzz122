import SwiftUI
import Charts

/// 报表：销售额（按渠道，外卖扣抽成）、商品排行、时段分布、口味偏好
struct ReportsView: View {
    @EnvironmentObject private var store: AppStore
    @State private var range: ReportRange = .today

    enum ReportRange: String, CaseIterable, Identifiable {
        case today, yesterday, week, month, last30
        var id: String { rawValue }
        var title: String {
            switch self {
            case .today: return "今日"
            case .yesterday: return "昨日"
            case .week: return "本周"
            case .month: return "本月"
            case .last30: return "近 30 天"
            }
        }
    }

    private var days: [String] {
        let cal = store.calendar
        let today = store.today
        switch range {
        case .today: return [today]
        case .yesterday: return [cal.addingDays(-1, to: today)]
        case .week: return cal.weekToDate(today: today)
        case .month: return cal.monthToDate(today: today)
        case .last30: return cal.days(from: cal.addingDays(-29, to: today), to: today)
        }
    }

    var body: some View {
        let orders = store.orders(days: days)
        let summary = Reports.summary(orders)
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    Picker("范围", selection: $range) {
                        ForEach(ReportRange.allCases) { item in
                            Text(item.title).tag(item)
                        }
                    }
                    .pickerStyle(.segmented)
                    .frame(maxWidth: 480)
                    Spacer()
                    Text(days.count == 1 ? days[0] : "\(days.first ?? "") ～ \(days.last ?? "")")
                        .font(.system(size: 15, weight: .semibold, design: .rounded))
                        .foregroundColor(.secondary)
                }

                HStack(spacing: 12) {
                    tile("销售额", Money.yen(summary.gross))
                    tile("单数", "\(summary.orderCount)")
                    tile("杯数", "\(summary.cupCount)")
                    tile("客单价", Money.yen(summary.averageTicket))
                }

                HStack(alignment: .top, spacing: 16) {
                    channelCard(summary)
                    paymentCard(summary)
                }

                HStack(alignment: .top, spacing: 16) {
                    rankingCard(orders)
                    hourlyCard(orders)
                }

                Card("口味偏好（用于备料）") {
                    HStack(alignment: .top, spacing: 24) {
                        ShareBars(title: "甜度", rows: Reports.sweetnessShare(orders))
                        ShareBars(title: "温度 / 冰量", rows: Reports.temperatureShare(orders))
                        ShareBars(title: "小料（每杯加的比例）", rows: Reports.toppingShare(orders, menu: store.menu))
                    }
                }
            }
            .padding(16)
        }
        .background(Theme.background)
    }

    private func tile(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.system(size: 14))
                .foregroundColor(.secondary)
            Text(value)
                .font(.system(size: 30, weight: .heavy, design: .rounded))
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color.white)
        )
    }

    private func channelCard(_ summary: SalesSummary) -> some View {
        Card("按渠道（外卖显示扣抽成后到手）") {
            ForEach(Channel.allCases) { channel in
                let gross = summary.channel(channel)
                let rate = store.settings.commission(for: channel)
                HStack {
                    Badge(text: channel.shortLabel, color: Theme.channelColor(channel))
                    Text("\(summary.ordersByChannel[channel] ?? 0) 单")
                        .foregroundColor(.secondary)
                    Spacer()
                    VStack(alignment: .trailing, spacing: 0) {
                        Text(Money.yen(gross))
                            .font(.system(size: 17, weight: .bold, design: .rounded))
                        if channel.isDelivery {
                            Text(rate > 0
                                 ? "抽成 \(String(format: "%.1f", rate))% → 到手 \(Money.yen(Reports.net(for: channel, gross: gross, settings: store.settings)))"
                                 : "未设置抽成比例")
                                .font(.system(size: 12))
                                .foregroundColor(.secondary)
                        }
                    }
                }
            }
        }
    }

    private func paymentCard(_ summary: SalesSummary) -> some View {
        Card("按支付方式") {
            let methods = PaymentMethod.allCases.filter { summary.payment($0) != 0 }
            if methods.isEmpty {
                Text("暂无数据").foregroundColor(.secondary)
            }
            ForEach(methods) { method in
                KeyValueRow(key: method.label, value: Money.yen(summary.payment(method)))
            }
            if summary.refundCount > 0 {
                Divider()
                KeyValueRow(key: "退款 \(summary.refundCount) 单（已扣除）", value: Money.yen(summary.refundAmount), valueColor: Theme.danger)
            }
        }
    }

    private func rankingCard(_ orders: [Order]) -> some View {
        let ranking = Reports.ranking(orders)
        let sold = Set(ranking.map(\.itemID))
        let unsold = store.menu.items.filter { $0.isActive && !sold.contains($0.id) }
        return Card("商品排行") {
            if ranking.isEmpty {
                Text("暂无数据").foregroundColor(.secondary)
            }
            ForEach(Array(ranking.prefix(10).enumerated()), id: \.element.id) { index, row in
                HStack {
                    Text("\(index + 1)")
                        .font(.system(size: 16, weight: .heavy, design: .rounded))
                        .foregroundColor(index < 3 ? Theme.green : .secondary)
                        .frame(width: 26, alignment: .leading)
                    Text(row.name)
                        .font(.system(size: 16, weight: .semibold))
                    Spacer()
                    Text("\(row.cups) 杯")
                        .font(.system(size: 15, weight: .bold, design: .rounded))
                    Text(Money.yen(row.amount))
                        .font(.system(size: 14, design: .rounded))
                        .foregroundColor(.secondary)
                        .frame(width: 86, alignment: .trailing)
                }
            }
            if ranking.count > 3 {
                Divider()
                Text("卖得最少：" + ranking.suffix(3).reversed().map { "\($0.name)（\($0.cups)杯）" }.joined(separator: "、"))
                    .font(.system(size: 14))
                    .foregroundColor(.secondary)
            }
            if !unsold.isEmpty && !ranking.isEmpty {
                Text("这段时间没卖出：" + unsold.map(\.name).joined(separator: "、"))
                    .font(.system(size: 14))
                    .foregroundColor(Theme.danger)
            }
        }
    }

    private func hourlyCard(_ orders: [Order]) -> some View {
        let hourly = Reports.hourly(orders, calendar: store.calendar)
        let hours: [Int] = {
            guard let first = hourly.keys.min(), let last = hourly.keys.max() else { return [] }
            return Array(min(first, 10)...max(last, 21))
        }()
        return Card("时段分布（每小时单量，用于排班）") {
            if hours.isEmpty {
                Text("暂无数据").foregroundColor(.secondary)
            } else {
                Chart {
                    ForEach(hours, id: \.self) { hour in
                        BarMark(
                            x: .value("时", "\(hour)"),
                            y: .value("单量", hourly[hour] ?? 0)
                        )
                        .foregroundStyle(Theme.green)
                    }
                }
                .frame(height: 220)
            }
        }
    }
}

struct ShareBars: View {
    let title: String
    let rows: [ShareRow]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 15, weight: .bold))
                .foregroundColor(.secondary)
            if rows.allSatisfy({ $0.count == 0 }) {
                Text("暂无数据")
                    .font(.system(size: 14))
                    .foregroundColor(.secondary)
            }
            ForEach(rows) { row in
                HStack(spacing: 8) {
                    Text(row.label)
                        .font(.system(size: 14, weight: .semibold))
                        .frame(width: 64, alignment: .leading)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    GeometryReader { proxy in
                        ZStack(alignment: .leading) {
                            Capsule().fill(Theme.background)
                            Capsule()
                                .fill(Theme.green)
                                .frame(width: max(0, proxy.size.width * min(row.ratio, 1)))
                        }
                    }
                    .frame(height: 12)
                    Text(percentText(row.ratio))
                        .font(.system(size: 13, design: .rounded))
                        .foregroundColor(.secondary)
                        .frame(width: 44, alignment: .trailing)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
