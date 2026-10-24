import SwiftUI

/// 右栏：购物车。每杯一行，点一下改规格，左滑删除。
struct CartPanel: View {
    @EnvironmentObject private var store: AppStore
    let onEdit: (OrderLine) -> Void
    let onCheckout: () -> Void

    private var cart: Cart { store.cart }

    var body: some View {
        VStack(spacing: 0) {
            header
            if cart.channel.isDelivery {
                deliveryBanner
            }
            Divider()
            if cart.isEmpty {
                emptyState
            } else {
                List {
                    ForEach(cart.lines) { line in
                        CartRow(
                            line: line,
                            onMinus: { store.changeQuantity(line.id, by: -1) },
                            onPlus: { store.changeQuantity(line.id, by: 1) }
                        )
                        .contentShape(Rectangle())
                        .onTapGesture { onEdit(line) }
                        .listRowInsets(EdgeInsets(top: 10, leading: 14, bottom: 10, trailing: 10))
                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                            Button(role: .destructive) {
                                store.removeLine(line.id)
                            } label: {
                                Label("删除", systemImage: "trash")
                            }
                        }
                    }
                }
                .listStyle(.plain)
            }
            Divider()
            footer
        }
        .background(Color.white)
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text("购物车")
                .font(.system(size: 20, weight: .bold))
            if cart.cupCount > 0 {
                Text("\(cart.cupCount) 杯")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.secondary)
            }
            Spacer()
            if !cart.isEmpty {
                Button(role: .destructive) {
                    store.clearCart()
                } label: {
                    Text("清空")
                        .font(.system(size: 16, weight: .semibold))
                }
                .buttonStyle(.borderless)
            }
        }
        .padding(.horizontal, 16)
        .frame(height: 52)
    }

    private var deliveryBanner: some View {
        HStack(spacing: 8) {
            Image(systemName: "bicycle")
            Text("\(cart.channel.label) 单：使用平台价格，确认后不经过收款")
                .lineLimit(2)
        }
        .font(.system(size: 14, weight: .semibold))
        .foregroundColor(.white)
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.channelColor(cart.channel))
    }

    private var emptyState: some View {
        VStack(spacing: 10) {
            Image(systemName: "cup.and.saucer")
                .font(.system(size: 40))
                .foregroundColor(.secondary.opacity(0.6))
            Text("点左侧饮品加入")
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var footer: some View {
        VStack(spacing: 10) {
            HStack {
                Text(cart.channel.isDelivery ? "外卖 · 内消费税 \(cart.taxRate)%" : "\(cart.dining.label) · 内消费税 \(cart.taxRate)%")
                Spacer()
                Text(Money.yen(cart.taxAmount))
                    .monospacedDigit()
            }
            .font(.system(size: 14))
            .foregroundColor(.secondary)

            HStack(alignment: .firstTextBaseline) {
                Text("合计")
                    .font(.system(size: 20, weight: .bold))
                Spacer()
                Text(Money.yen(cart.total))
                    .font(.system(size: 36, weight: .heavy, design: .rounded))
                    .monospacedDigit()
            }

            BigButton(
                cart.channel.isDelivery ? "确认（平台已付）" : "结账",
                systemImage: cart.channel.isDelivery ? "checkmark.seal.fill" : "yensign.circle.fill",
                color: Theme.channelColor(cart.channel),
                disabled: cart.isEmpty,
                fullWidth: true,
                height: 66,
                action: onCheckout
            )
        }
        .padding(16)
    }
}

struct CartRow: View {
    let line: OrderLine
    let onMinus: () -> Void
    let onPlus: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                Text(line.name)
                    .font(.system(size: 17, weight: .bold))
                    .foregroundColor(Theme.ink)
                Text(line.cartSummary)
                    .font(.system(size: 14))
                    .foregroundColor(.secondary)
                    .lineLimit(2)
                Text(Money.yen(line.total))
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .foregroundColor(Theme.ink)
            }
            Spacer(minLength: 4)
            HStack(spacing: 4) {
                Button(action: onMinus) {
                    Image(systemName: "minus")
                        .font(.system(size: 16, weight: .bold))
                        .frame(width: 38, height: 38)
                        .background(Circle().fill(Theme.background))
                }
                Text("×\(line.quantity)")
                    .font(.system(size: 18, weight: .bold, design: .rounded))
                    .frame(minWidth: 38)
                Button(action: onPlus) {
                    Image(systemName: "plus")
                        .font(.system(size: 16, weight: .bold))
                        .frame(width: 38, height: 38)
                        .background(Circle().fill(Theme.greenSoft))
                }
            }
            .foregroundColor(Theme.ink)
            .buttonStyle(.borderless)
        }
    }
}
