import SwiftUI

enum CategorySelection: Hashable {
    case frequent
    case category(String)
    case toppings
}

struct OptionsContext: Identifiable {
    let id = UUID()
    let item: MenuItem
    var editingLine: OrderLine? = nil
}

/// 点单主界面：左分类 / 中饮品 / 右购物车。常规单：点饮品 → 加入 → 结账。
struct OrderScreen: View {
    @EnvironmentObject private var store: AppStore
    @State private var category: CategorySelection = .frequent
    @State private var options: OptionsContext?
    @State private var checkoutID: UUID?

    var body: some View {
        ZStack {
            VStack(spacing: 0) {
                ChannelBar()
                Divider()
                HStack(spacing: 0) {
                    CategoryColumn(selection: $category)
                        .frame(width: 138)
                    Divider()
                    DrinkGrid(selection: category) { item in
                        options = OptionsContext(item: item)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    Divider()
                    CartPanel(
                        onEdit: { line in
                            if let item = store.menu.item(id: line.itemID) {
                                options = OptionsContext(item: item, editingLine: line)
                            } else {
                                store.showToast("菜单里已经没有这款饮品，只能删除", isError: true)
                            }
                        },
                        onCheckout: { checkoutID = UUID() }
                    )
                    .frame(width: 340)
                }
            }

            if let context = options {
                ModalBackdrop { options = nil }
                ItemOptionsPanel(context: context) { options = nil }
                    .id(context.id)
                    .padding(16)
                    .transition(.scale(scale: 0.96).combined(with: .opacity))
            }

            if let checkoutID {
                ModalBackdrop()
                CheckoutPanel(isDelivery: store.cart.channel.isDelivery) { self.checkoutID = nil }
                    .id(checkoutID)
                    .padding(24)
                    .transition(.scale(scale: 0.96).combined(with: .opacity))
            }
        }
        .animation(.easeOut(duration: 0.15), value: options?.id)
        .animation(.easeOut(duration: 0.15), value: checkoutID)
        .onAppear {
            if store.frequentCombos.isEmpty, case .frequent = category, let first = store.menu.categories.first {
                category = .category(first.id)
            }
            if ScreenshotMode.isActive {
                category = .category("milktea")
                if ScreenshotMode.isPage("options"), let item = store.menu.item(id: "oolong-roast-milk") {
                    options = OptionsContext(item: item)
                }
                if ScreenshotMode.isPage("checkout") { checkoutID = UUID() }
            }
        }
    }
}

/// 顶部条：订单渠道 + 店内用 / 外带
struct ChannelBar: View {
    @EnvironmentObject private var store: AppStore

    var body: some View {
        HStack(spacing: 8) {
            ForEach(Channel.allCases) { channel in
                ChipButton(
                    title: channel.label,
                    selected: store.cart.channel == channel,
                    color: Theme.channelColor(channel)
                ) {
                    store.setChannel(channel)
                }
            }
            if !store.cart.channel.isDelivery {
                Divider()
                    .frame(height: 30)
                    .padding(.horizontal, 6)
                ForEach(DiningOption.allCases) { dining in
                    ChipButton(
                        title: dining.label,
                        subtitle: "税 \(dining.taxRate)%",
                        selected: store.cart.dining == dining
                    ) {
                        store.setDining(dining)
                    }
                }
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 0) {
                Text("下一号")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                Text(Order.pickupLabel(store.nextPickupNumber))
                    .font(.system(size: 24, weight: .heavy, design: .rounded))
                    .foregroundColor(Theme.ink)
            }
        }
        .padding(.horizontal, 14)
        .frame(height: 62)
        .background(Color.white)
    }
}

/// 左栏：常点 + 5 个分类 + 小料，顺序和菜单屏一致
struct CategoryColumn: View {
    @EnvironmentObject private var store: AppStore
    @Binding var selection: CategorySelection

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                row(.frequent, title: "常点", subtitle: store.frequentIsToday ? "今日 TOP 8" : "近 7 天", color: Theme.green, icon: "star.fill")
                ForEach(store.menu.categories) { category in
                    row(.category(category.id), title: category.name, subtitle: category.nameJP, color: Color(hex: category.colorHex), icon: nil)
                }
                row(.toppings, title: "小料", subtitle: "トッピング", color: Color(hex: "6D6D6D"), icon: "plus.circle.fill")
            }
            .padding(10)
        }
        .background(Theme.background)
    }

    private func row(_ value: CategorySelection, title: String, subtitle: String, color: Color, icon: String?) -> some View {
        let selected = selection == value
        return Button {
            selection = value
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    if let icon {
                        Image(systemName: icon)
                            .font(.system(size: 13))
                    }
                    Text(title)
                        .font(.system(size: 17, weight: .bold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
                Text(subtitle)
                    .font(.system(size: 11))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .opacity(0.8)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.leading, 14)
            .padding(.trailing, 8)
            .frame(height: 62)
            .foregroundColor(selected ? .white : Theme.ink)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(selected ? color : Color.white)
            )
            .overlay(alignment: .leading) {
                if !selected {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(color)
                        .frame(width: 4)
                        .padding(.vertical, 12)
                        .padding(.leading, 4)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
