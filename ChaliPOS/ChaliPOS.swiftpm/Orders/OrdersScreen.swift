import SwiftUI

/// 订单：制作队列、补打标签 / 小票、标记完成、退款（需老板密码）
struct OrdersScreen: View {
    @EnvironmentObject private var store: AppStore
    @State private var day = ""
    @State private var filter: Filter = .all
    @State private var selectedID: UUID?
    @State private var refundTarget: Order?
    @State private var confirmRefund: Order?

    enum Filter: String, CaseIterable, Identifiable {
        case all, making, done, refunded
        var id: String { rawValue }
        var label: String {
            switch self {
            case .all: return "全部"
            case .making: return "制作中"
            case .done: return "已完成"
            case .refunded: return "已退款"
            }
        }
    }

    private var currentDay: String { day.isEmpty ? store.today : day }

    private var dayOrders: [Order] {
        store.orders(for: currentDay).sorted { $0.createdAt > $1.createdAt }
    }

    private var filteredOrders: [Order] {
        dayOrders.filter { order in
            switch filter {
            case .all: return true
            case .making: return order.status == .making
            case .done: return order.status == .done
            case .refunded: return order.status == .refunded
            }
        }
    }

    private var selectedOrder: Order? {
        guard let selectedID else { return nil }
        return dayOrders.first { $0.id == selectedID }
    }

    var body: some View {
        ZStack {
            HStack(spacing: 0) {
                listColumn
                    .frame(width: 430)
                Divider()
                Group {
                    if let order = selectedOrder {
                        OrderDetailView(order: order) {
                            refundTarget = order
                        }
                    } else {
                        Text("选择左侧订单查看详情")
                            .foregroundColor(.secondary)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }

            if refundTarget != nil {
                ModalBackdrop { refundTarget = nil }
                PINPadView(title: "退款需要老板密码", onSuccess: {
                    confirmRefund = refundTarget
                    refundTarget = nil
                }, onCancel: {
                    refundTarget = nil
                })
                .frame(width: 400)
            }
        }
        .alert(
            "确认退款？",
            isPresented: Binding(get: { confirmRefund != nil }, set: { if !$0 { confirmRefund = nil } }),
            presenting: confirmRefund
        ) { order in
            Button("登记退款", role: .destructive) {
                store.refund(orderID: order.id, day: order.businessDay)
            }
            Button("取消", role: .cancel) {}
        } message: { order in
            Text(refundMessage(for: order))
        }
        .onAppear {
            if day.isEmpty { day = store.today }
            if ScreenshotMode.isPage("orders") { selectedID = dayOrders.first?.id }
        }
    }

    private var listColumn: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Button {
                    day = store.calendar.addingDays(-1, to: currentDay)
                    selectedID = nil
                } label: {
                    Image(systemName: "chevron.left")
                        .frame(width: 40, height: 40)
                }
                VStack(spacing: 0) {
                    Text(currentDay)
                        .font(.system(size: 18, weight: .bold, design: .rounded))
                    Text(currentDay == store.today ? "今天" : "历史订单")
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                }
                .frame(maxWidth: .infinity)
                Button {
                    day = store.calendar.addingDays(1, to: currentDay)
                    selectedID = nil
                } label: {
                    Image(systemName: "chevron.right")
                        .frame(width: 40, height: 40)
                }
                .disabled(currentDay >= store.today)
            }
            .font(.system(size: 18, weight: .bold))
            .buttonStyle(.borderless)
            .padding(.horizontal, 12)
            .padding(.top, 10)

            Picker("筛选", selection: $filter) {
                ForEach(Filter.allCases) { item in
                    Text(item.label).tag(item)
                }
            }
            .pickerStyle(.segmented)
            .padding(12)

            if filteredOrders.isEmpty {
                Text("没有订单")
                    .foregroundColor(.secondary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List {
                    ForEach(filteredOrders) { order in
                        OrderRow(order: order, time: store.calendar.timeString(order.createdAt), selected: order.id == selectedID)
                            .contentShape(Rectangle())
                            .onTapGesture { selectedID = order.id }
                            .listRowBackground(order.id == selectedID ? Theme.greenSoft : Color.white)
                            .swipeActions(edge: .leading) {
                                if order.status == .making {
                                    Button {
                                        store.setStatus(.done, orderID: order.id, day: order.businessDay)
                                    } label: {
                                        Label("完成", systemImage: "checkmark")
                                    }
                                    .tint(Theme.green)
                                }
                            }
                    }
                }
                .listStyle(.plain)
            }
        }
        .background(Color.white)
    }

    private func refundMessage(for order: Order) -> String {
        switch order.payment.group {
        case .cash:
            return "No.\(order.pickupLabel)：请退还现金 \(Money.yen(order.total))。登记后不计入销售额。"
        case .card, .qr:
            return "No.\(order.pickupLabel)：请先在楽天ペイ店舗アプリ里取消这笔 \(order.payment.label) 交易（\(Money.yen(order.total))），再登记退款。"
        case .platform:
            return "No.\(order.pickupLabel)：外卖单的退款请在 \(order.channel.label) 商家后台处理。登记后不计入销售额。"
        }
    }
}

struct OrderRow: View {
    let order: Order
    let time: String
    let selected: Bool

    var body: some View {
        HStack(spacing: 12) {
            Text(order.pickupLabel)
                .font(.system(size: 28, weight: .heavy, design: .rounded))
                .foregroundColor(order.isRefunded ? .secondary : Theme.ink)
                .strikethrough(order.isRefunded)
                .frame(width: 72, alignment: .leading)
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Badge(text: order.channel.shortLabel, color: Theme.channelColor(order.channel))
                    Text(time)
                        .font(.system(size: 14, weight: .semibold, design: .rounded))
                        .foregroundColor(.secondary)
                    if let ref = order.platformOrderRef {
                        Text("#\(ref)")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(.secondary)
                    }
                }
                Text(order.lines.map { $0.quantity > 1 ? "\($0.name)×\($0.quantity)" : $0.name }.joined(separator: "、"))
                    .font(.system(size: 14))
                    .foregroundColor(Theme.ink)
                    .lineLimit(1)
            }
            Spacer(minLength: 4)
            VStack(alignment: .trailing, spacing: 4) {
                Text(Money.yen(order.total))
                    .font(.system(size: 16, weight: .bold, design: .rounded))
                Badge(text: order.status.label, color: Theme.statusColor(order.status))
            }
        }
        .padding(.vertical, 4)
    }
}

struct OrderDetailView: View {
    @EnvironmentObject private var store: AppStore
    let order: Order
    let onRefund: () -> Void

    private var labels: [CupLabel] { LabelBuilder.labels(for: order, calendar: store.calendar) }

    @ViewBuilder
    private var actionButtons: some View {
        if order.status == .making {
            BigButton("标记完成", systemImage: "checkmark") {
                store.setStatus(.done, orderID: order.id, day: order.businessDay)
            }
        } else if order.status == .done {
            SecondaryButton("改回制作中", systemImage: "arrow.uturn.backward") {
                store.setStatus(.making, orderID: order.id, day: order.businessDay)
            }
        }
        SecondaryButton("补打标签", systemImage: "tag") {
            PrintService.printLabels(for: order, store: store)
        }
        SecondaryButton("打印小票", systemImage: "doc.text") {
            PrintService.printReceipt(for: order, store: store)
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Card {
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("No.\(order.pickupLabel)")
                                .font(.system(size: 40, weight: .heavy, design: .rounded))
                            Text(store.calendar.dateTimeString(order.createdAt))
                                .foregroundColor(.secondary)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 6) {
                            Badge(text: order.status.label, color: Theme.statusColor(order.status))
                            Badge(text: order.channel.isDelivery ? order.channel.label : "店内 · \(order.dining.label)", color: Theme.channelColor(order.channel))
                        }
                    }
                    Divider()
                    ForEach(order.lines) { line in
                        HStack(alignment: .top) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(line.name)
                                    .font(.system(size: 17, weight: .bold))
                                Text(line.cartSummary)
                                    .font(.system(size: 14))
                                    .foregroundColor(.secondary)
                            }
                            Spacer()
                            Text("×\(line.quantity)")
                                .font(.system(size: 17, weight: .bold, design: .rounded))
                                .frame(width: 50)
                            Text(Money.yen(line.total))
                                .font(.system(size: 17, weight: .semibold, design: .rounded))
                                .frame(width: 90, alignment: .trailing)
                        }
                    }
                    Divider()
                    KeyValueRow(key: "合计", value: Money.yen(order.total), emphasized: true)
                    KeyValueRow(key: "内消费税 \(order.taxRate)%", value: Money.yen(order.taxAmount))
                    KeyValueRow(key: "支付方式", value: order.payment.label)
                    if let cash = order.cashReceived, let change = order.change {
                        KeyValueRow(key: "实收 / 找零", value: "\(Money.yen(cash)) / \(Money.yen(change))")
                    }
                    if let ref = order.platformOrderRef {
                        KeyValueRow(key: "平台订单号", value: "#\(ref)")
                    }
                    if let refundedAt = order.refundedAt {
                        KeyValueRow(key: "退款时间", value: store.calendar.dateTimeString(refundedAt), valueColor: Theme.danger)
                    }
                }

                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 12) { actionButtons }
                    VStack(alignment: .leading, spacing: 12) { actionButtons }
                }

                if !order.isRefunded {
                    HStack {
                        Spacer()
                        SecondaryButton("退款", systemImage: "arrow.uturn.left.circle", color: Theme.danger, height: 48, action: onRefund)
                    }
                }

                Card("出杯标签预览（\(labels.count) 张）") {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: CupLabelView.size.width), spacing: 12)], spacing: 12) {
                        ForEach(labels) { label in
                            CupLabelView(label: label)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 6)
                                        .stroke(Theme.line, lineWidth: 1)
                                )
                        }
                    }
                }
            }
            .padding(16)
        }
        .background(Theme.background)
    }
}
