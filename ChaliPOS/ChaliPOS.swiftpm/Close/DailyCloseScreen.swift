import SwiftUI

/// 日结（打烊时约 2 分钟）：清点钱箱 → 核对现金差额 → 按支付方式和渠道列出合计 → 保存 / 分享日结单
struct DailyCloseScreen: View {
    @EnvironmentObject private var store: AppStore
    @State private var counts: [Int: Int] = [:]
    @State private var note = ""
    @State private var loadedDay = ""

    private var summary: SalesSummary { store.todaySummary }
    private var counted: Int { CashDrawer.total(of: counts) }
    private var expected: Int { CashDrawer.expectedCash(float: store.settings.cashFloat, summary: summary) }
    private var difference: Int { counted - expected }
    private var savedClose: DailyClose? { store.close(for: store.today) }

    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            ScrollView {
                cashCountCard
            }
            .frame(width: 470)

            ScrollView {
                VStack(spacing: 16) {
                    cashCheckCard
                    totalsCard
                    finishCard
                }
            }
        }
        .padding(16)
        .onAppear(perform: loadSaved)
        .onChange(of: store.today) { _ in loadSaved() }
    }

    private func loadSaved() {
        guard loadedDay != store.today else { return }
        loadedDay = store.today
        if let close = store.close(for: store.today) {
            counts = close.cashCounts
            note = close.note
        } else {
            counts = ScreenshotMode.isActive ? ScreenshotMode.cashCounts(for: expected) : [:]
            note = ""
        }
    }

    // MARK: ① 清点钱箱

    private var cashCountCard: some View {
        Card("① 清点钱箱（营业日 \(store.today)）") {
            ForEach(CashDrawer.denominations, id: \.self) { value in
                DenominationRow(value: value, count: countBinding(value))
                if value != CashDrawer.denominations.last {
                    Divider()
                }
            }
            Divider()
            HStack(alignment: .firstTextBaseline) {
                Text("实点合计")
                    .font(.system(size: 18, weight: .bold))
                Spacer()
                Text(Money.yen(counted))
                    .font(.system(size: 30, weight: .heavy, design: .rounded))
                    .monospacedDigit()
            }
            if !counts.isEmpty {
                Button("全部清零") { counts = [:] }
                    .font(.system(size: 15, weight: .semibold))
            }
        }
    }

    private func countBinding(_ value: Int) -> Binding<Int> {
        Binding(
            get: { counts[value] ?? 0 },
            set: { counts[value] = max(0, $0) }
        )
    }

    // MARK: ② 核对现金

    private var cashCheckCard: some View {
        Card("② 核对现金") {
            KeyValueRow(key: "备用金（在「设置」里改）", value: Money.yen(store.settings.cashFloat))
            KeyValueRow(key: "今日现金销售", value: Money.yen(summary.payment(.cash)))
            KeyValueRow(key: "应有现金", value: Money.yen(expected), emphasized: true)
            KeyValueRow(key: "实点现金", value: Money.yen(counted), emphasized: true)
            Divider()
            HStack(alignment: .firstTextBaseline) {
                Text("差额")
                    .font(.system(size: 20, weight: .bold))
                Spacer()
                Text(difference == 0 ? "±¥0" : (difference > 0 ? "+" + Money.yen(difference) : Money.yen(difference)))
                    .font(.system(size: 40, weight: .heavy, design: .rounded))
                    .monospacedDigit()
                    .foregroundColor(difference == 0 ? Theme.green : Theme.danger)
            }
            if difference != 0 && counted > 0 {
                Text(difference > 0 ? "钱箱里的现金比应有的多，检查是否有现金单没录入。" : "钱箱里的现金比应有的少，检查找零或是否有单选错了支付方式。")
                    .font(.system(size: 14))
                    .foregroundColor(Theme.danger)
            }
        }
    }

    // MARK: ③ 当天合计

    private var totalsCard: some View {
        Card("③ 今日合计") {
            HStack(spacing: 12) {
                stat("单数", "\(summary.orderCount)")
                stat("杯数", "\(summary.cupCount)")
                stat("销售额", Money.yen(summary.gross))
            }
            if summary.refundCount > 0 {
                Text("退款 \(summary.refundCount) 单 \(Money.yen(summary.refundAmount))，已从销售额中扣除")
                    .font(.system(size: 14))
                    .foregroundColor(Theme.danger)
            }
            Divider()
            VStack(alignment: .leading, spacing: 10) {
                sectionTitle("按支付方式")
                KeyValueRow(key: "现金", value: Money.yen(summary.payment(.cash)))
                KeyValueRow(key: "楽天（卡・交通IC・电子钱）", value: Money.yen(summary.payments(in: .card)))
                ForEach(PaymentGroup.card.methods) { method in
                    if summary.payment(method) != 0 {
                        KeyValueRow(key: "　\(method.label)", value: Money.yen(summary.payment(method)))
                    }
                }
                KeyValueRow(key: "楽天（QR码）", value: Money.yen(summary.payments(in: .qr)))
                ForEach(PaymentGroup.qr.methods) { method in
                    if summary.payment(method) != 0 {
                        KeyValueRow(key: "　\(method.label)", value: Money.yen(summary.payment(method)))
                    }
                }
            }
            Divider()
            VStack(alignment: .leading, spacing: 10) {
                sectionTitle("外卖（扣抽成后到手）")
                ForEach(Channel.deliveryChannels) { channel in
                    let gross = summary.channel(channel)
                    KeyValueRow(
                        key: "\(channel.label) \(summary.ordersByChannel[channel] ?? 0) 单",
                        value: "\(Money.yen(gross)) → \(Money.yen(Reports.net(for: channel, gross: gross, settings: store.settings)))"
                    )
                }
            }
            Divider()
            VStack(alignment: .leading, spacing: 10) {
                sectionTitle("消费税")
                ForEach([8, 10], id: \.self) { rate in
                    KeyValueRow(
                        key: "\(rate)% 对象",
                        value: "\(Money.yen(summary.taxableByRate[rate] ?? 0))（内税 \(Money.yen(summary.taxByRate[rate] ?? 0))）"
                    )
                }
            }
        }
    }

    private func sectionTitle(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 15, weight: .bold))
            .foregroundColor(.secondary)
    }

    private func stat(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.system(size: 13))
                .foregroundColor(.secondary)
            Text(value)
                .font(.system(size: 26, weight: .heavy, design: .rounded))
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Theme.background)
        )
    }

    // MARK: ④ 保存

    private var finishCard: some View {
        Card("④ 完成日结") {
            TextField("备注（例如：差额原因、交接事项）", text: $note, axis: .vertical)
                .lineLimit(2...4)
                .textFieldStyle(.roundedBorder)
            if let saved = savedClose {
                Text("今天已于 \(store.calendar.timeString(saved.closedAt)) 日结。再次点「完成日结」会覆盖。")
                    .font(.system(size: 14))
                    .foregroundColor(.secondary)
            }
            HStack(spacing: 12) {
                BigButton(savedClose == nil ? "完成日结" : "重新日结", systemImage: "checkmark.seal.fill") {
                    let close = CashDrawer.makeClose(day: store.today, settings: store.settings, counts: counts, summary: summary, note: note)
                    store.saveClose(close)
                }
                if let saved = savedClose {
                    ShareLink(item: CashDrawer.reportText(close: saved, summary: summary, settings: store.settings, calendar: store.calendar)) {
                        Label("分享日结单", systemImage: "square.and.arrow.up")
                            .font(.system(size: 18, weight: .semibold))
                            .padding(.horizontal, 20)
                            .frame(height: 60)
                            .background(
                                RoundedRectangle(cornerRadius: 16, style: .continuous)
                                    .stroke(Theme.line, lineWidth: 1.5)
                            )
                    }
                }
            }
        }
    }
}

struct DenominationRow: View {
    let value: Int
    @Binding var count: Int

    var body: some View {
        HStack(spacing: 10) {
            Text(Money.yen(value))
                .font(.system(size: 18, weight: .semibold, design: .rounded))
                .frame(width: 86, alignment: .leading)
            Button {
                count = max(0, count - 1)
            } label: {
                Image(systemName: "minus")
                    .font(.system(size: 16, weight: .bold))
                    .frame(width: 40, height: 40)
                    .background(Circle().fill(Theme.background))
            }
            TextField("0", text: digitsBinding($count))
                .keyboardType(.numberPad)
                .multilineTextAlignment(.center)
                .font(.system(size: 20, weight: .bold, design: .rounded))
                .frame(width: 70, height: 40)
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .stroke(Theme.line, lineWidth: 1.5)
                )
            Button {
                count += 1
            } label: {
                Image(systemName: "plus")
                    .font(.system(size: 16, weight: .bold))
                    .frame(width: 40, height: 40)
                    .background(Circle().fill(Theme.greenSoft))
            }
            Spacer(minLength: 4)
            Text(Money.yen(value * count))
                .font(.system(size: 17, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .foregroundColor(count > 0 ? Theme.ink : .secondary)
        }
        .foregroundColor(Theme.ink)
        .buttonStyle(.borderless)
    }
}
