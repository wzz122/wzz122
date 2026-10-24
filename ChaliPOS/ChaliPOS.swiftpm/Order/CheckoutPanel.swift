import SwiftUI

/// 结账：现金 / 卡・交通IC・电子钱 / QR码；外卖单直接「确认（平台已付）」
struct CheckoutPanel: View {
    @EnvironmentObject private var store: AppStore
    let onClose: () -> Void

    enum Step: Equatable {
        case choose
        case cash
        case card
        case qr
        case platform
        case done
    }

    @State private var step: Step
    @State private var received = 0
    @State private var method: PaymentMethod?
    @State private var platformRef = ""
    @State private var completed: Order?
    @State private var labelsSent = false
    @FocusState private var refFocused: Bool

    init(isDelivery: Bool, onClose: @escaping () -> Void) {
        self.onClose = onClose
        _step = State(initialValue: isDelivery ? .platform : .choose)
    }

    private var cart: Cart { store.cart }
    private var total: Int { cart.total }

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()
            Group {
                switch step {
                case .choose: chooseView
                case .cash: cashView
                case .card: methodView(.card)
                case .qr: methodView(.qr)
                case .platform: platformView
                case .done: doneView
                }
            }
            .padding(24)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .frame(maxWidth: 780, maxHeight: 640)
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(Color.white)
        )
        .shadow(color: .black.opacity(0.2), radius: 20, y: 6)
    }

    // MARK: - 头部

    private var title: String {
        switch step {
        case .choose: return "结账"
        case .cash: return "现金"
        case .card: return "卡・交通IC・电子钱"
        case .qr: return "QR码"
        case .platform: return "\(cart.channel.label) · 平台已付"
        case .done: return "完成"
        }
    }

    private var header: some View {
        HStack(spacing: 12) {
            if step == .cash || step == .card || step == .qr {
                Button {
                    step = .choose
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundColor(Theme.ink)
                        .frame(width: 46, height: 46)
                        .background(Circle().fill(Theme.background))
                }
                .buttonStyle(.plain)
            }
            Text(title)
                .font(.system(size: 26, weight: .heavy))
                .foregroundColor(Theme.ink)
            Spacer()
            if step != .done {
                Text("\(cart.cupCount) 杯")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundColor(.secondary)
                Button(action: onClose) {
                    Image(systemName: "xmark")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundColor(Theme.ink)
                        .frame(width: 46, height: 46)
                        .background(Circle().fill(Theme.background))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 22)
        .padding(.vertical, 16)
    }

    // MARK: - 选择支付方式

    private var chooseView: some View {
        VStack(spacing: 28) {
            amountDue
            HStack(spacing: 16) {
                payButton("现金", icon: "yensign.circle.fill", color: Theme.green) {
                    received = 0
                    step = .cash
                }
                payButton("卡・交通IC・电子钱", icon: "creditcard.fill", color: Theme.blue) {
                    method = nil
                    step = .card
                }
                payButton("QR码", icon: "qrcode", color: Theme.pink) {
                    method = nil
                    step = .qr
                }
            }
            Spacer(minLength: 0)
        }
    }

    private var amountDue: some View {
        VStack(spacing: 4) {
            Text("应收")
                .font(.system(size: 17))
                .foregroundColor(.secondary)
            Text(Money.yen(total))
                .font(.system(size: 76, weight: .heavy, design: .rounded))
                .monospacedDigit()
                .foregroundColor(Theme.ink)
            Text("\(cart.dining.label) · 内消费税 \(cart.taxRate)% \(Money.yen(cart.taxAmount))")
                .font(.system(size: 15))
                .foregroundColor(.secondary)
        }
    }

    private func payButton(_ title: String, icon: String, color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 14) {
                Image(systemName: icon)
                    .font(.system(size: 46))
                Text(title)
                    .font(.system(size: 21, weight: .bold))
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
            }
            .foregroundColor(.white)
            .padding(12)
            .frame(maxWidth: .infinity)
            .frame(height: 190)
            .background(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(color)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // MARK: - 现金

    private var change: Int { received - total }

    private struct QuickAmount {
        let label: String
        let amount: Int
    }

    /// 快捷键：刚好、1000、2000、5000、10000
    private var quickAmounts: [QuickAmount] {
        [QuickAmount(label: "刚好", amount: total)] + [1000, 2000, 5000, 10000].map {
            QuickAmount(label: Money.yen($0), amount: $0)
        }
    }

    private var cashView: some View {
        HStack(alignment: .top, spacing: 24) {
            VStack(alignment: .leading, spacing: 14) {
                KeyValueRow(key: "应收", value: Money.yen(total))
                VStack(alignment: .leading, spacing: 2) {
                    Text("实收")
                        .foregroundColor(.secondary)
                    Text(received == 0 ? "¥0" : Money.yen(received))
                        .font(.system(size: 48, weight: .heavy, design: .rounded))
                        .monospacedDigit()
                        .foregroundColor(Theme.ink)
                }
                Divider()
                VStack(alignment: .leading, spacing: 2) {
                    Text(change >= 0 ? "找零" : "还差")
                        .foregroundColor(.secondary)
                    Text(Money.yen(abs(change)))
                        .font(.system(size: 64, weight: .heavy, design: .rounded))
                        .monospacedDigit()
                        .foregroundColor(change >= 0 ? Theme.green : Theme.danger)
                }
                Spacer(minLength: 0)
                BigButton("确认收款", systemImage: "checkmark", disabled: received < total || total == 0, fullWidth: true, height: 68) {
                    complete(payment: .cash, cashReceived: received)
                }
            }
            .frame(maxWidth: .infinity)

            VStack(spacing: 10) {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                    ForEach(quickAmounts, id: \.label) { entry in
                        Button {
                            received = entry.amount
                        } label: {
                            Text(entry.label)
                                .font(.system(size: 19, weight: .bold, design: .rounded))
                                .frame(maxWidth: .infinity)
                                .frame(height: 50)
                                .foregroundColor(entry.amount >= total ? Theme.green : .secondary)
                                .background(
                                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                                        .fill(Theme.greenSoft.opacity(entry.amount >= total ? 1 : 0.4))
                                )
                        }
                        .buttonStyle(.plain)
                        .disabled(entry.amount < total)
                    }
                    Button {
                        received = 0
                    } label: {
                        Text("清零")
                            .font(.system(size: 19, weight: .bold))
                            .frame(maxWidth: .infinity)
                            .frame(height: 50)
                            .foregroundColor(Theme.ink)
                            .background(
                                RoundedRectangle(cornerRadius: 12, style: .continuous)
                                    .fill(Theme.background)
                            )
                    }
                    .buttonStyle(.plain)
                }
                NumberPad(keyHeight: 56) { key in
                    received = NumberPad.apply(key, to: received)
                }
            }
            .frame(width: 330)
        }
    }

    // MARK: - 卡 / QR（第 1 期：在楽天ペイ店舗アプリ收款后回来点「已收款」）

    private func methodView(_ group: PaymentGroup) -> some View {
        VStack(spacing: 18) {
            Text("请在楽天ペイ店舗アプリ中输入")
                .font(.system(size: 18))
                .foregroundColor(.secondary)
            Text(Money.yen(total))
                .font(.system(size: 76, weight: .heavy, design: .rounded))
                .monospacedDigit()
                .foregroundColor(Theme.ink)
            Text("收款成功后，选择客人用的支付方式，再点「已收款」")
                .font(.system(size: 15))
                .foregroundColor(.secondary)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 3), spacing: 12) {
                ForEach(group.methods) { option in
                    ChipButton(
                        title: option.label,
                        selected: method == option,
                        color: group == .card ? Theme.blue : Theme.pink,
                        large: true
                    ) { method = option }
                }
            }
            Spacer(minLength: 0)
            BigButton("已收款", systemImage: "checkmark", disabled: method == nil || total == 0, fullWidth: true, height: 68) {
                if let method {
                    complete(payment: method)
                }
            }
        }
    }

    // MARK: - 外卖

    private var platformView: some View {
        VStack(spacing: 18) {
            Text("平台已经收款，这里只登记订单，不经过收款")
                .font(.system(size: 16))
                .foregroundColor(.secondary)
            Text(Money.yen(total))
                .font(.system(size: 64, weight: .heavy, design: .rounded))
                .monospacedDigit()
                .foregroundColor(Theme.ink)
            VStack(spacing: 6) {
                Text("平台订单号后 4 位（印在标签上，骑手取餐时对号）")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(Theme.ink)
                TextField("例如 4821", text: $platformRef)
                    .font(.system(size: 40, weight: .bold, design: .rounded))
                    .multilineTextAlignment(.center)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .keyboardType(.asciiCapable)
                    .focused($refFocused)
                    .submitLabel(.done)
                    .onSubmit {
                        if !platformRef.isEmpty { complete(payment: .platform, platformRef: platformRef) }
                    }
                    .padding(.vertical, 10)
                    .frame(width: 320)
                    .background(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(Theme.channelColor(cart.channel), lineWidth: 2)
                    )
                    .onChange(of: platformRef) { value in
                        let cleaned = String(value.uppercased().filter { $0.isASCII && ($0.isLetter || $0.isNumber) }.suffix(6))
                        if cleaned != value { platformRef = cleaned }
                    }
            }
            Spacer(minLength: 0)
            BigButton(
                "确认（平台已付）",
                systemImage: "checkmark.seal.fill",
                color: Theme.channelColor(cart.channel),
                disabled: platformRef.isEmpty || total == 0,
                fullWidth: true,
                height: 68
            ) {
                complete(payment: .platform, platformRef: platformRef)
            }
        }
        .onAppear {
            Task { @MainActor in
                try? await Task.sleep(nanoseconds: 350_000_000)
                refFocused = true
            }
        }
    }

    // MARK: - 完成

    @ViewBuilder
    private var doneView: some View {
        if let order = completed {
            VStack(spacing: 10) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 50))
                    .foregroundColor(Theme.green)
                Text("取餐号")
                    .font(.system(size: 17))
                    .foregroundColor(.secondary)
                Text(order.pickupLabel)
                    .font(.system(size: 100, weight: .heavy, design: .rounded))
                    .foregroundColor(Theme.ink)
                Text("\(order.cupCount) 杯 · \(order.payment.label) · \(Money.yen(order.total))")
                    .font(.system(size: 19, weight: .semibold))
                if let change = order.change, order.payment == .cash {
                    Text("找零 \(Money.yen(change))")
                        .font(.system(size: 40, weight: .heavy, design: .rounded))
                        .foregroundColor(Theme.green)
                }
                Text(labelsSent ? "标签已发送到打印机（\(order.cupCount) 张）" : "没有自动打印标签（可在「管理 → 设置」开启）")
                    .font(.system(size: 15))
                    .foregroundColor(.secondary)
                Spacer(minLength: 0)
                HStack(spacing: 12) {
                    SecondaryButton("补打标签", systemImage: "tag") {
                        PrintService.printLabels(for: order, store: store)
                        labelsSent = true
                    }
                    SecondaryButton("打印小票", systemImage: "doc.text") {
                        PrintService.printReceipt(for: order, store: store)
                    }
                    Spacer()
                    BigButton("下一单", systemImage: "arrow.right", height: 68, action: onClose)
                }
            }
        }
    }

    private func complete(payment: PaymentMethod, cashReceived: Int? = nil, platformRef: String? = nil) {
        guard let order = store.placeOrder(payment: payment, cashReceived: cashReceived, platformRef: platformRef) else { return }
        refFocused = false
        completed = order
        step = .done
        if store.settings.autoPrintLabels {
            PrintService.printLabels(for: order, store: store)
            labelsSent = true
        }
    }
}
