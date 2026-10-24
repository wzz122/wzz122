import Foundation

// MARK: - 发布到线上的菜单（顾客扫码页面看到的内容）

/// iPad 发布给扫码点单页面的菜单。服务器按它重新计算价格、检查售罄和规格。
struct PublishedMenu: Codable, Hashable {
    var storeName: String
    var storeNameJP: String
    /// 售罄只对这一天有效，服务器发现日期变了就当作没有售罄
    var businessDay: String
    var eatInPricing: EatInPricing
    var categories: [MenuCategory]
    var toppings: [Topping]
    var items: [Item]

    struct Item: Codable, Hashable {
        var id: String
        var name: String
        var nameJP: String
        var categoryID: String
        var prices: SizePrices
        var allowedTemps: [Temperature]
        var allowedSweetness: [Sweetness]
        var allowedToppingIDs: [String]
        var defaultSize: DrinkSize
        var defaultTemp: Temperature
        var defaultSweetness: Sweetness
        var soldOut: Bool
    }

    init(menu: ShopMenu, settings: ShopSettings, businessDay: String) {
        storeName = settings.shopName
        storeNameJP = settings.shopNameJP
        self.businessDay = businessDay
        eatInPricing = settings.eatInPricing
        categories = menu.categories
        toppings = menu.toppings
        items = menu.items.filter(\.isActive).map { item in
            Item(
                id: item.id,
                name: item.name,
                nameJP: item.nameJP,
                categoryID: item.categoryID,
                prices: item.prices,
                allowedTemps: item.allowedTemps,
                allowedSweetness: item.allowedSweetness,
                allowedToppingIDs: item.allowedToppingIDs,
                defaultSize: item.defaultSize,
                defaultTemp: item.defaultTemp,
                defaultSweetness: item.defaultSweetness,
                soldOut: item.isSoldOut(on: businessDay)
            )
        }
    }
}

// MARK: - 顾客扫码下的单

enum OnlineOrderStatus: String, Codable, CaseIterable {
    /// 顾客已下单，等店员接单收款
    case received
    /// 已收款，制作中
    case accepted
    /// 做好了，等顾客取餐
    case ready
    case completed
    case cancelled

    var label: String {
        switch self {
        case .received: return "待接单"
        case .accepted: return "制作中"
        case .ready: return "可取餐"
        case .completed: return "已取餐"
        case .cancelled: return "已取消"
        }
    }

    var isOpen: Bool { self == .received || self == .accepted || self == .ready }
}

struct OnlineOrderLine: Codable, Hashable {
    var itemID: String
    var name: String
    var nameJP: String
    var size: DrinkSize
    var temp: Temperature
    var sweetness: Sweetness
    var toppings: [ToppingPick]
    var basePrice: Int
    var unitPrice: Int
    var quantity: Int

    /// 按顾客下单时服务器算出的价格生成一杯（顾客看到多少就收多少）
    var orderLine: OrderLine {
        OrderLine(
            itemID: itemID,
            name: name,
            nameJP: nameJP,
            size: size,
            temp: temp,
            sweetness: sweetness,
            toppings: toppings,
            basePrice: basePrice,
            quantity: quantity
        )
    }
}

struct OnlineOrder: Codable, Identifiable, Hashable {
    var id: UUID
    var number: Int
    var businessDay: String
    var seat: String?
    var dining: DiningOption
    var lines: [OnlineOrderLine]
    var total: Int
    var cupCount: Int
    var note: String?
    var status: OnlineOrderStatus
    var pickupNumber: Int?
    var cancelReason: String?
    var createdAt: Date
    var updatedAt: Date

    /// 顾客看到的扫码单号：Q12
    var numberLabel: String { OnlineOrder.numberLabel(number) }

    static func numberLabel(_ number: Int) -> String { "Q\(number)" }

    var summary: String {
        lines.map { $0.quantity > 1 ? "\($0.name)×\($0.quantity)" : $0.name }.joined(separator: "、")
    }

    /// 接单时放进购物车的内容
    func makeCart() -> Cart {
        var cart = Cart(channel: .inStore, dining: dining)
        for line in lines {
            cart.add(line.orderLine)
        }
        cart.online = OnlineOrderRef(id: id, number: number, seat: seat)
        return cart
    }

    /// 和当前菜单比一下：饮品被删掉、价格改了、今天售罄了，都提醒店员
    func warnings(menu: ShopMenu, businessDay: String) -> [String] {
        var result: [String] = []
        for line in lines {
            guard let item = menu.item(id: line.itemID) else {
                result.append("「\(line.name)」已经不在菜单里")
                continue
            }
            if item.isSoldOut(on: businessDay) {
                result.append("「\(line.name)」今天已标记售罄")
            }
            if let price = item.prices[line.size], price != line.basePrice {
                result.append("「\(line.name)」现在的价格是 \(Money.yen(price))，顾客下单时是 \(Money.yen(line.basePrice))")
            }
        }
        return result
    }
}

/// 购物车 / 订单里记录「这是哪张扫码单」
struct OnlineOrderRef: Codable, Hashable {
    var id: UUID
    var number: Int
    var seat: String?

    var numberLabel: String { OnlineOrder.numberLabel(number) }
}

enum OnlineJSON {
    /// Postgres 的时间带 6 位小数和 +00:00，这里统一去掉小数再解析
    static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let text = try container.decode(String.self)
            if let date = parseDate(text) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "无法解析时间：\(text)")
        }
        return decoder
    }()

    static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()

    static func parseDate(_ text: String) -> Date? {
        var cleaned = text
        if let dot = cleaned.firstIndex(of: ".") {
            var end = cleaned.index(after: dot)
            while end < cleaned.endIndex, cleaned[end].isNumber {
                end = cleaned.index(after: end)
            }
            cleaned.removeSubrange(dot..<end)
        }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: cleaned)
    }
}
