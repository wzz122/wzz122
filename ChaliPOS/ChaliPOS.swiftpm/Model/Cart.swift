import Foundation

/// 正在点的这一单
struct Cart: Hashable {
    var channel: Channel = .inStore
    var dining: DiningOption = .takeOut
    var lines: [OrderLine] = []

    var isEmpty: Bool { lines.isEmpty }
    var total: Int { lines.reduce(0) { $0 + $1.total } }
    var cupCount: Int { lines.reduce(0) { $0 + $1.quantity } }
    var taxRate: Int { Pricing.taxRate(channel: channel, dining: dining) }
    var taxAmount: Int { Pricing.includedTax(total: total, rate: taxRate) }

    /// 加入一杯；同款同规格的行直接 +数量
    mutating func add(_ line: OrderLine) {
        if let index = lines.firstIndex(where: { $0.comboKey == line.comboKey && $0.unitPrice == line.unitPrice }) {
            lines[index].quantity += line.quantity
        } else {
            lines.append(line)
        }
    }

    /// 改规格后替换原来那一行（保留位置和数量）
    mutating func replace(lineID: UUID, with line: OrderLine) {
        guard let index = lines.firstIndex(where: { $0.id == lineID }) else {
            add(line)
            return
        }
        var updated = line
        updated.id = lineID
        updated.quantity = lines[index].quantity
        lines[index] = updated
        mergeDuplicates()
    }

    mutating func changeQuantity(lineID: UUID, by delta: Int) {
        guard let index = lines.firstIndex(where: { $0.id == lineID }) else { return }
        let newValue = lines[index].quantity + delta
        if newValue <= 0 {
            lines.remove(at: index)
        } else {
            lines[index].quantity = min(newValue, 99)
        }
    }

    mutating func remove(lineID: UUID) {
        lines.removeAll { $0.id == lineID }
    }

    mutating func clear() {
        lines.removeAll()
    }

    /// 「小料」栏：把小料加到最后一杯。最后一行有多杯时，拆出一杯单独加。
    /// 返回 nil 表示成功，否则返回提示文字。
    mutating func addToppingToLastCup(_ topping: Topping, menu: ShopMenu, eatInPricing: EatInPricing) -> String? {
        guard let index = lines.indices.last else { return "请先点饮品，再加小料" }
        let line = lines[index]
        guard let item = menu.item(id: line.itemID), item.allowedToppingIDs.contains(topping.id) else {
            return "「\(line.name)」不能加\(topping.name)"
        }
        if line.toppings.contains(where: { $0.id == topping.id }) {
            return "最后一杯已经加了\(topping.name)"
        }
        let pick = ToppingPick(
            id: topping.id,
            name: topping.name,
            nameJP: topping.nameJP,
            price: Pricing.toppingPrice(topping, channel: channel, dining: dining, eatInPricing: eatInPricing)
        )
        if line.quantity > 1 {
            lines[index].quantity -= 1
            var single = line
            single.id = UUID()
            single.quantity = 1
            single.toppings.append(pick)
            lines.append(single)
        } else {
            lines[index].toppings.append(pick)
        }
        return nil
    }

    /// 切换渠道或店内用/外带后，按新渠道重新计价。菜单里已经没有的饮品会被移除。
    mutating func reprice(menu: ShopMenu, eatInPricing: EatInPricing) {
        lines = lines.compactMap { line in
            guard let item = menu.item(id: line.itemID),
                  var repriced = Pricing.makeLine(
                    item: item,
                    size: line.size,
                    temp: line.temp,
                    sweetness: line.sweetness,
                    toppingIDs: line.toppingIDs,
                    menu: menu,
                    channel: channel,
                    dining: dining,
                    eatInPricing: eatInPricing,
                    quantity: line.quantity
                  ) else { return nil }
            repriced.id = line.id
            return repriced
        }
    }

    private mutating func mergeDuplicates() {
        var merged: [OrderLine] = []
        for line in lines {
            if let index = merged.firstIndex(where: { $0.comboKey == line.comboKey && $0.unitPrice == line.unitPrice }) {
                merged[index].quantity += line.quantity
            } else {
                merged.append(line)
            }
        }
        lines = merged
    }
}
