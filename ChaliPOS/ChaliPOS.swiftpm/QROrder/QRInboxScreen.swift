import SwiftUI

/// 扫码单：顾客手机下单 → 来柜台报单号 → 接单并收款（出杯贴）→ 做好了通知顾客取餐
struct QRInboxScreen: View {
    @EnvironmentObject private var store: AppStore
    @State private var selectedID: UUID?
    @State private var rejecting: OnlineOrder?
    @State private var replaceCartFor: OnlineOrder?
    @State private var showPoster = ScreenshotMode.isPage("qrposter")

    private var waiting: [OnlineOrder] { store.onlineOrders.filter { $0.status == .received } }
    private var inProgress: [OnlineOrder] { store.onlineOrders.filter { $0.status == .accepted || $0.status == .ready } }
    private var closed: [OnlineOrder] { store.onlineOrders.filter { !$0.status.isOpen }.reversed() }

    private var selected: OnlineOrder? {
        if let selectedID, let order = store.onlineOrders.first(where: { $0.id == selectedID }) { return order }
        return waiting.first ?? inProgress.first
    }

    var body: some View {
        if store.settings.qrEnabled {
            HStack(spacing: 0) {
                listColumn
                    .frame(width: 420)
                Divider()
                Group {
                    if let order = selected {
                        OnlineOrderDetail(
                            order: order,
                            onAccept: {
                                if !store.beginCheckout(order) { replaceCartFor = order }
                            },
                            onReject: { rejecting = order }
                        )
                    } else {
                        VStack(spacing: 10) {
                            Image(systemName: "qrcode.viewfinder")
                                .font(.system(size: 44))
                                .foregroundColor(.secondary.opacity(0.6))
                            Text("还没有扫码单。顾客下单后这里会响铃提示。")
                                .foregroundColor(.secondary)
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .confirmationDialog(
                "拒绝这张扫码单？",
                isPresented: Binding(get: { rejecting != nil }, set: { if !$0 { rejecting = nil } }),
                titleVisibility: .visible,
                presenting: rejecting
            ) { order in
                ForEach(["有饮品卖完了", "现在太忙，请到柜台点单", "顾客没有来付款", "其他原因"], id: \.self) { reason in
                    Button(reason, role: .destructive) {
                        store.rejectOnlineOrder(order, reason: reason)
                    }
                }
                Button("取消", role: .cancel) {}
            } message: { order in
                Text("\(order.numberLabel)：顾客手机上会显示「已取消」和原因")
            }
            .alert(
                "购物车里还有没结账的饮品",
                isPresented: Binding(get: { replaceCartFor != nil }, set: { if !$0 { replaceCartFor = nil } }),
                presenting: replaceCartFor
            ) { order in
                Button("清空并换成 \(order.numberLabel)", role: .destructive) {
                    store.beginCheckout(order, replacingCart: true)
                }
                Button("取消", role: .cancel) {}
            } message: { _ in
                Text("现在购物车里的饮品会被清空。")
            }
            .sheet(isPresented: $showPoster) {
                QRPosterSheet()
                    .environmentObject(store)
            }
        } else {
            setupGuide
        }
    }

    // MARK: - 左栏

    private var listColumn: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                syncStatus
                Spacer(minLength: 4)
                Toggle(isOn: Binding(get: { store.settings.qrAccepting }, set: { store.setQRAccepting($0) })) {
                    Text(store.settings.qrAccepting ? "接单中" : "已暂停")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundColor(store.settings.qrAccepting ? Theme.green : Theme.danger)
                }
                .toggleStyle(.switch)
                .fixedSize()
                Button {
                    showPoster = true
                } label: {
                    Image(systemName: "qrcode")
                        .font(.system(size: 20, weight: .semibold))
                        .frame(width: 40, height: 40)
                }
                .buttonStyle(.borderless)
                .accessibilityLabel("二维码")
            }
            .padding(.horizontal, 14)
            .frame(height: 60)

            if let error = store.onlineSync.error {
                Text(error)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Theme.danger)
            }

            if store.onlineOrders.isEmpty {
                Text("今天还没有扫码单")
                    .foregroundColor(.secondary)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List {
                    section("待接单（\(waiting.count)）", waiting)
                    section("制作中 / 可取餐", inProgress)
                    section("已完成 / 已取消", closed)
                }
                .listStyle(.plain)
            }
        }
        .background(Color.white)
    }

    @ViewBuilder
    private func section(_ title: String, _ orders: [OnlineOrder]) -> some View {
        if !orders.isEmpty {
            Section {
                ForEach(orders) { order in
                    OnlineOrderRow(order: order, time: store.calendar.timeString(order.createdAt))
                        .contentShape(Rectangle())
                        .onTapGesture { selectedID = order.id }
                        .listRowBackground(order.id == selected?.id ? Theme.greenSoft : Color.white)
                }
            } header: {
                Text(title)
                    .font(.system(size: 14, weight: .bold))
            }
        }
    }

    private var syncStatus: some View {
        let ok = store.onlineSync.error == nil && store.onlineSync.lastSync != nil
        return HStack(spacing: 6) {
            Circle()
                .fill(ok ? Theme.green : (store.onlineSync.error == nil ? Color.gray : Theme.danger))
                .frame(width: 10, height: 10)
            VStack(alignment: .leading, spacing: 0) {
                Text(ok ? "已连接" : (store.qrClient == nil ? "未填写连接信息" : (store.onlineSync.error == nil ? "连接中…" : "连接失败")))
                    .font(.system(size: 14, weight: .bold))
                if let last = store.onlineSync.lastSync {
                    Text("\(store.calendar.timeString(last)) 同步 · 每 5 秒")
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                }
            }
        }
    }

    // MARK: - 未启用

    private var setupGuide: some View {
        ScrollView {
            Card("扫码点单还没启用") {
                Text("顾客扫桌上或柜台的二维码，用手机点单；店员在这里接单、到柜台收款，出杯贴和平常一样。做好后点一下，顾客手机上会显示「可取餐」。")
                    .foregroundColor(.secondary)
                Divider()
                step(1, "在 Supabase 新建项目，打开 SQL Editor，执行 ChaliPOS/QROrder/supabase/migrations 里的 SQL")
                step(2, "执行 select chali.create_store('\(store.settings.storeID)', '\(store.settings.shopName)'); 记下返回的门店密钥")
                step(3, "把 ChaliPOS/QROrder/web 部署到 GitHub Pages（改 config.js 里的 URL 和 key）")
                step(4, "管理 → 设置 → 扫码点单：填 Supabase URL、API key、门店密钥、顾客页面地址，打开「启用」，点「测试连接」")
                step(5, "在这一页右上角生成二维码，打印出来贴在柜台和桌上")
            }
            .frame(maxWidth: 720)
            .padding(24)
        }
        .frame(maxWidth: .infinity)
        .background(Theme.background)
    }

    private func step(_ number: Int, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text("\(number)")
                .font(.system(size: 15, weight: .heavy))
                .foregroundColor(.white)
                .frame(width: 28, height: 28)
                .background(Circle().fill(Theme.green))
            Text(text)
                .font(.system(size: 16))
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

struct OnlineOrderRow: View {
    let order: OnlineOrder
    let time: String

    var body: some View {
        HStack(spacing: 12) {
            Text(order.numberLabel)
                .font(.system(size: 26, weight: .heavy, design: .rounded))
                .foregroundColor(order.status == .cancelled ? .secondary : Theme.ink)
                .strikethrough(order.status == .cancelled)
                .frame(width: 70, alignment: .leading)
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    if let seat = order.seat {
                        Badge(text: seat, color: Theme.ink.opacity(0.7))
                    }
                    Text(order.dining.label)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.secondary)
                    Text(time)
                        .font(.system(size: 13, weight: .semibold, design: .rounded))
                        .foregroundColor(.secondary)
                    if order.note != nil {
                        Image(systemName: "text.bubble.fill")
                            .font(.system(size: 12))
                            .foregroundColor(Theme.statusColor(.making))
                    }
                }
                Text(order.summary)
                    .font(.system(size: 14))
                    .lineLimit(1)
            }
            Spacer(minLength: 4)
            VStack(alignment: .trailing, spacing: 4) {
                Text(Money.yen(order.total))
                    .font(.system(size: 16, weight: .bold, design: .rounded))
                Badge(text: order.status.label, color: OnlineOrderRow.color(order.status))
            }
        }
        .padding(.vertical, 4)
    }

    static func color(_ status: OnlineOrderStatus) -> Color {
        switch status {
        case .received: return Theme.pink
        case .accepted: return Theme.statusColor(.making)
        case .ready: return Theme.green
        case .completed: return Color.gray
        case .cancelled: return Theme.danger
        }
    }
}

struct OnlineOrderDetail: View {
    @EnvironmentObject private var store: AppStore
    let order: OnlineOrder
    let onAccept: () -> Void
    let onReject: () -> Void

    private var warnings: [String] { order.warnings(menu: store.menu, businessDay: store.today) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Card {
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("扫码单 \(order.numberLabel)")
                                .font(.system(size: 36, weight: .heavy, design: .rounded))
                            Text("\(store.calendar.dateTimeString(order.createdAt)) 下单 · \(order.cupCount) 杯")
                                .foregroundColor(.secondary)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 6) {
                            Badge(text: order.status.label, color: OnlineOrderRow.color(order.status))
                            Badge(text: order.seat.map { "\(order.dining.label) · \($0)" } ?? order.dining.label, color: Theme.green)
                        }
                    }
                    if let note = order.note {
                        Label(note, systemImage: "text.bubble.fill")
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundColor(Theme.ink)
                            .padding(12)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(
                                RoundedRectangle(cornerRadius: 12, style: .continuous)
                                    .fill(Color(hex: "FFF4E5"))
                            )
                    }
                    Divider()
                    ForEach(Array(order.lines.enumerated()), id: \.offset) { _, line in
                        HStack(alignment: .top) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(line.name)
                                    .font(.system(size: 18, weight: .bold))
                                Text(line.orderLine.cartSummary)
                                    .font(.system(size: 14))
                                    .foregroundColor(.secondary)
                            }
                            Spacer()
                            Text("×\(line.quantity)")
                                .font(.system(size: 18, weight: .bold, design: .rounded))
                                .frame(width: 50)
                            Text(Money.yen(line.unitPrice * line.quantity))
                                .font(.system(size: 17, weight: .semibold, design: .rounded))
                                .frame(width: 90, alignment: .trailing)
                        }
                    }
                    Divider()
                    KeyValueRow(key: "合计（顾客看到的金额）", value: Money.yen(order.total), emphasized: true)
                    if let reason = order.cancelReason, order.status == .cancelled {
                        KeyValueRow(key: "取消原因", value: reason, valueColor: Theme.danger)
                    }
                }

                if !warnings.isEmpty && order.status == .received {
                    Card("注意") {
                        ForEach(warnings, id: \.self) { warning in
                            Label(warning, systemImage: "exclamationmark.triangle.fill")
                                .foregroundColor(Theme.danger)
                        }
                    }
                }

                actions
            }
            .padding(16)
        }
        .background(Theme.background)
    }

    @ViewBuilder
    private var actions: some View {
        switch order.status {
        case .received:
            VStack(alignment: .leading, spacing: 10) {
                Text("顾客到柜台报「\(order.numberLabel)」后，点下面的按钮收款。收款后会出杯贴，顾客手机上显示取餐号。")
                    .font(.system(size: 14))
                    .foregroundColor(.secondary)
                HStack(spacing: 12) {
                    BigButton("接单并收款 \(Money.yen(order.total))", systemImage: "yensign.circle.fill", fullWidth: true, height: 66, action: onAccept)
                    SecondaryButton("拒单", systemImage: "xmark", color: Theme.danger, height: 66, action: onReject)
                }
            }
        case .accepted:
            VStack(alignment: .leading, spacing: 10) {
                Text(pickupText + " · 制作中")
                    .font(.system(size: 20, weight: .bold))
                BigButton("做好了，通知顾客取餐", systemImage: "bell.fill", fullWidth: true, height: 66) {
                    store.markOnlineReady(order)
                }
            }
        case .ready:
            VStack(alignment: .leading, spacing: 10) {
                Text("已通知顾客取餐 · " + pickupText)
                    .font(.system(size: 20, weight: .bold))
                    .foregroundColor(Theme.green)
                SecondaryButton("顾客已取餐", systemImage: "checkmark") {
                    store.markOnlinePickedUp(order)
                }
            }
        case .completed, .cancelled:
            EmptyView()
        }
    }

    private var pickupText: String {
        order.pickupNumber.map { "取餐号 " + Order.pickupLabel($0) } ?? "取餐号未分配"
    }
}
