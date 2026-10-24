import Foundation

enum Pricing {
    /// 某个渠道下一杯饮品（不含小料）的含税价。返回 nil 表示该规格不提供。
    static func basePrice(
        for item: MenuItem,
        size: DrinkSize,
        channel: Channel,
        dining: DiningOption,
        eatInPricing: EatInPricing
    ) -> Int? {
        guard let storePrice = item.prices[size] else { return nil }
        if channel.isDelivery {
            return item.platformPrices[channel.rawValue]?[size] ?? storePrice
        }
        return adjusted(storePrice, dining: dining, eatInPricing: eatInPricing)
    }

    static func toppingPrice(
        _ topping: Topping,
        channel: Channel,
        dining: DiningOption,
        eatInPricing: EatInPricing
    ) -> Int {
        if channel.isDelivery { return topping.price }
        return adjusted(topping.price, dining: dining, eatInPricing: eatInPricing)
    }

    static func adjusted(_ price: Int, dining: DiningOption, eatInPricing: EatInPricing) -> Int {
        guard dining == .eatIn, eatInPricing == .convertByTaxRate else { return price }
        // 四舍五入到 1 円
        return (price * 110 * 2 + 108) / (108 * 2)
    }

    /// 外卖一律按外带（8%）计税
    static func taxRate(channel: Channel, dining: DiningOption) -> Int {
        channel.isDelivery ? DiningOption.takeOut.taxRate : dining.taxRate
    }

    /// 含税金额中包含的消费税（1 円未满切り捨て）
    static func includedTax(total: Int, rate: Int) -> Int {
        guard total > 0 else { return 0 }
        return total * rate / (100 + rate)
    }

    /// 按菜单当前设置生成一杯
    static func makeLine(
        item: MenuItem,
        size: DrinkSize,
        temp: Temperature,
        sweetness: Sweetness,
        toppingIDs: [String],
        menu: ShopMenu,
        channel: Channel,
        dining: DiningOption,
        eatInPricing: EatInPricing,
        quantity: Int = 1
    ) -> OrderLine? {
        guard let base = basePrice(for: item, size: size, channel: channel, dining: dining, eatInPricing: eatInPricing) else {
            return nil
        }
        let picks: [ToppingPick] = menu.toppings
            .filter { toppingIDs.contains($0.id) && item.allowedToppingIDs.contains($0.id) }
            .map {
                ToppingPick(
                    id: $0.id,
                    name: $0.name,
                    nameJP: $0.nameJP,
                    price: toppingPrice($0, channel: channel, dining: dining, eatInPricing: eatInPricing)
                )
            }
        return OrderLine(
            itemID: item.id,
            name: item.name,
            nameJP: item.nameJP,
            size: size,
            temp: temp,
            sweetness: sweetness,
            toppings: picks,
            basePrice: base,
            quantity: quantity
        )
    }

    /// 按默认值生成一杯（长按卡片、常点）
    static func defaultLine(
        item: MenuItem,
        menu: ShopMenu,
        channel: Channel,
        dining: DiningOption,
        eatInPricing: EatInPricing
    ) -> OrderLine? {
        makeLine(
            item: item,
            size: item.defaultSize,
            temp: item.defaultTemp,
            sweetness: item.defaultSweetness,
            toppingIDs: [],
            menu: menu,
            channel: channel,
            dining: dining,
            eatInPricing: eatInPricing
        )
    }
}

enum Money {
    private static let formatter: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.groupingSeparator = ","
        f.usesGroupingSeparator = true
        f.maximumFractionDigits = 0
        return f
    }()

    static func plain(_ amount: Int) -> String {
        formatter.string(from: NSNumber(value: amount)) ?? String(amount)
    }

    /// ¥1,360 / -¥200
    static func yen(_ amount: Int) -> String {
        amount < 0 ? "-¥" + plain(-amount) : "¥" + plain(amount)
    }
}
