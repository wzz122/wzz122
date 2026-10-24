import SwiftUI

/// 中栏：饮品大卡片。点一下选规格，长按按默认值直接加入。
struct DrinkGrid: View {
    @EnvironmentObject private var store: AppStore
    let selection: CategorySelection
    let onOpen: (MenuItem) -> Void

    private let columns = [GridItem(.adaptive(minimum: 168), spacing: 12)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                switch selection {
                case .frequent:
                    frequentGrid
                case .category(let id):
                    itemGrid(store.menu.items(in: id))
                case .toppings:
                    toppingGrid
                }
            }
            .padding(14)
        }
        .background(Theme.background)
    }

    private func hint(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 13))
            .foregroundColor(.secondary)
    }

    @ViewBuilder
    private func itemGrid(_ items: [MenuItem]) -> some View {
        hint("点卡片选规格 · 长按直接按默认值加入")
        if items.isEmpty {
            emptyState("这个分类还没有饮品，可以在「管理 → 菜单」里添加。")
        } else {
            LazyVGrid(columns: columns, spacing: 12) {
                ForEach(items) { item in
                    let soldOut = store.isSoldOut(item)
                    DrinkCard(
                        item: item,
                        soldOut: soldOut,
                        priceText: store.priceText(for: item),
                        color: store.color(for: item)
                    )
                    .onTapGesture {
                        if soldOut {
                            store.showToast("「\(item.name)」今日售罄", isError: true)
                        } else {
                            onOpen(item)
                        }
                    }
                    .onLongPressGesture(minimumDuration: 0.35) {
                        store.quickAdd(item)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var frequentGrid: some View {
        hint(store.frequentIsToday ? "今天点得最多的组合，一点就加入" : "今天还没有订单，先显示最近 7 天的常点组合")
        if store.frequentCombos.isEmpty {
            emptyState("点过的组合会自动出现在这里，例如「乌龙烤鲜奶 L・50%・少冰・+珍珠」。")
        } else {
            LazyVGrid(columns: columns, spacing: 12) {
                ForEach(store.frequentCombos) { combo in
                    let item = store.menu.item(id: combo.line.itemID)
                    let soldOut = item.map { store.isSoldOut($0) } ?? true
                    let price = item.flatMap {
                        store.makeLine(item: $0, size: combo.line.size, temp: combo.line.temp, sweetness: combo.line.sweetness, toppingIDs: combo.line.toppingIDs)?.unitPrice
                    }
                    ComboCard(
                        combo: combo,
                        price: price,
                        soldOut: soldOut,
                        color: item.map { store.color(for: $0) } ?? Theme.green,
                        countLabel: store.frequentIsToday ? "今日 \(combo.cups) 杯" : "近 7 天 \(combo.cups) 杯"
                    )
                    .onTapGesture {
                        store.addCombo(combo.line)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var toppingGrid: some View {
        hint("点小料会加到购物车里的最后一杯")
        LazyVGrid(columns: columns, spacing: 12) {
            ForEach(store.menu.toppings) { topping in
                ToppingCard(topping: topping, price: store.toppingPrice(topping))
                    .onTapGesture {
                        store.addToppingToLastCup(topping)
                    }
            }
        }
    }

    private func emptyState(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 16))
            .foregroundColor(.secondary)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 60)
    }
}

struct DrinkCard: View {
    let item: MenuItem
    let soldOut: Bool
    let priceText: String
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(item.name)
                .font(.system(size: 21, weight: .bold))
                .foregroundColor(Theme.ink)
                .lineLimit(2)
                .minimumScaleFactor(0.75)
            Text(item.nameJP)
                .font(.system(size: 13))
                .foregroundColor(.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            Spacer(minLength: 6)
            HStack(alignment: .bottom, spacing: 4) {
                Text(priceText)
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .foregroundColor(Theme.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Spacer(minLength: 0)
                if item.allowedTemps.contains(.hot) {
                    Image(systemName: "flame.fill")
                        .font(.system(size: 13))
                        .foregroundColor(.orange)
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.top, 16)
        .padding(.bottom, 12)
        .frame(maxWidth: .infinity, minHeight: 124, alignment: .topLeading)
        .background(Color.white)
        .overlay(alignment: .top) {
            color.frame(height: 6)
        }
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .saturation(soldOut ? 0 : 1)
        .opacity(soldOut ? 0.5 : 1)
        .overlay {
            if soldOut { SoldOutStamp() }
        }
        .shadow(color: .black.opacity(0.05), radius: 3, y: 1)
        .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

struct ComboCard: View {
    let combo: ComboRow
    let price: Int?
    let soldOut: Bool
    let color: Color
    let countLabel: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(combo.line.name)
                .font(.system(size: 19, weight: .bold))
                .foregroundColor(Theme.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
            Text(combo.line.cartSummary)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(Theme.ink.opacity(0.75))
                .lineLimit(2)
            Spacer(minLength: 6)
            HStack {
                Text(price.map(Money.yen) ?? "—")
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                Spacer()
                Text(countLabel)
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
            }
        }
        .padding(.horizontal, 14)
        .padding(.top, 16)
        .padding(.bottom, 12)
        .frame(maxWidth: .infinity, minHeight: 124, alignment: .topLeading)
        .background(Color.white)
        .overlay(alignment: .top) {
            color.frame(height: 6)
        }
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .saturation(soldOut ? 0 : 1)
        .opacity(soldOut ? 0.5 : 1)
        .overlay {
            if soldOut { SoldOutStamp() }
        }
        .shadow(color: .black.opacity(0.05), radius: 3, y: 1)
        .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

struct ToppingCard: View {
    let topping: Topping
    let price: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(topping.name)
                .font(.system(size: 20, weight: .bold))
                .foregroundColor(Theme.ink)
            Text(topping.nameJP)
                .font(.system(size: 13))
                .foregroundColor(.secondary)
            Spacer(minLength: 6)
            Text("+" + Money.yen(price))
                .font(.system(size: 16, weight: .semibold, design: .rounded))
                .foregroundColor(Theme.green)
        }
        .padding(14)
        .frame(maxWidth: .infinity, minHeight: 104, alignment: .topLeading)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Color.white)
        )
        .shadow(color: .black.opacity(0.05), radius: 3, y: 1)
        .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

struct SoldOutStamp: View {
    var body: some View {
        Text("售罄")
            .font(.system(size: 26, weight: .heavy))
            .foregroundColor(Theme.danger)
            .padding(.horizontal, 14)
            .padding(.vertical, 2)
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(Theme.danger, lineWidth: 3)
            )
            .rotationEffect(.degrees(-12))
    }
}
