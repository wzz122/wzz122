import Foundation

// MARK: - 渠道与用餐方式

enum Channel: String, Codable, CaseIterable, Identifiable {
    case inStore
    case uber
    case panda
    case rocket

    var id: String { rawValue }

    var label: String {
        switch self {
        case .inStore: return "店内"
        case .uber: return "Uber Eats"
        case .panda: return "熊猫外卖"
        case .rocket: return "火箭外卖"
        }
    }

    var shortLabel: String {
        switch self {
        case .inStore: return "店内"
        case .uber: return "Uber"
        case .panda: return "熊猫"
        case .rocket: return "火箭"
        }
    }

    /// 报税 CSV 用的日文名
    var labelJP: String {
        switch self {
        case .inStore: return "店舗"
        case .uber: return "Uber Eats"
        case .panda: return "HungryPanda"
        case .rocket: return "Rocket Now"
        }
    }

    var isDelivery: Bool { self != .inStore }

    static let deliveryChannels: [Channel] = [.uber, .panda, .rocket]
}

enum DiningOption: String, Codable, CaseIterable, Identifiable {
    case eatIn
    case takeOut

    var id: String { rawValue }

    var label: String {
        switch self {
        case .eatIn: return "店内用"
        case .takeOut: return "外带"
        }
    }

    var labelJP: String {
        switch self {
        case .eatIn: return "店内"
        case .takeOut: return "お持ち帰り"
        }
    }

    /// 消费税率：外带 8%（轻减税率），店内用 10%
    var taxRate: Int {
        switch self {
        case .eatIn: return 10
        case .takeOut: return 8
        }
    }
}

// MARK: - 支付

enum PaymentGroup: String, CaseIterable, Identifiable {
    case cash
    case card
    case qr
    case platform

    var id: String { rawValue }

    var label: String {
        switch self {
        case .cash: return "现金"
        case .card: return "卡・交通IC・电子钱"
        case .qr: return "QR码"
        case .platform: return "平台已付"
        }
    }

    var methods: [PaymentMethod] {
        PaymentMethod.allCases.filter { $0.group == self }
    }
}

enum PaymentMethod: String, Codable, CaseIterable, Identifiable {
    case cash
    case credit
    case transitIC
    case iD
    case quicPay
    case eMoney
    case payPay
    case rakutenPay
    case dBarai
    case auPay
    case otherQR
    case platform

    var id: String { rawValue }

    var label: String {
        switch self {
        case .cash: return "现金"
        case .credit: return "信用卡"
        case .transitIC: return "交通IC"
        case .iD: return "iD"
        case .quicPay: return "QUICPay"
        case .eMoney: return "其他电子钱"
        case .payPay: return "PayPay"
        case .rakutenPay: return "楽天ペイ"
        case .dBarai: return "d払い"
        case .auPay: return "au PAY"
        case .otherQR: return "其他QR"
        case .platform: return "平台已付"
        }
    }

    /// 小票和报税 CSV 用的日文名
    var labelJP: String {
        switch self {
        case .cash: return "現金"
        case .credit: return "クレジット"
        case .transitIC: return "交通系IC"
        case .iD: return "iD"
        case .quicPay: return "QUICPay"
        case .eMoney: return "電子マネー"
        case .payPay: return "PayPay"
        case .rakutenPay: return "楽天ペイ"
        case .dBarai: return "d払い"
        case .auPay: return "au PAY"
        case .otherQR: return "その他QR"
        case .platform: return "プラットフォーム決済"
        }
    }

    var group: PaymentGroup {
        switch self {
        case .cash: return .cash
        case .credit, .transitIC, .iD, .quicPay, .eMoney: return .card
        case .payPay, .rakutenPay, .dBarai, .auPay, .otherQR: return .qr
        case .platform: return .platform
        }
    }
}

// MARK: - 订单

enum OrderStatus: String, Codable, CaseIterable, Identifiable {
    case making
    case done
    case refunded

    var id: String { rawValue }

    var label: String {
        switch self {
        case .making: return "制作中"
        case .done: return "已完成"
        case .refunded: return "已退款"
        }
    }
}

/// 下单时的小料快照（之后改菜单不影响历史订单）
struct ToppingPick: Codable, Hashable {
    var id: String
    var name: String
    var nameJP: String
    var price: Int
}

struct OrderLine: Codable, Identifiable, Hashable {
    var id: UUID
    var itemID: String
    var name: String
    var nameJP: String
    var size: DrinkSize
    var temp: Temperature
    var sweetness: Sweetness
    var toppings: [ToppingPick]
    /// 这一杯饮品本身的含税价（不含小料）
    var basePrice: Int
    var quantity: Int

    init(
        id: UUID = UUID(),
        itemID: String,
        name: String,
        nameJP: String,
        size: DrinkSize,
        temp: Temperature,
        sweetness: Sweetness,
        toppings: [ToppingPick],
        basePrice: Int,
        quantity: Int = 1
    ) {
        self.id = id
        self.itemID = itemID
        self.name = name
        self.nameJP = nameJP
        self.size = size
        self.temp = temp
        self.sweetness = sweetness
        self.toppings = toppings
        self.basePrice = basePrice
        self.quantity = quantity
    }

    var unitPrice: Int { basePrice + toppings.reduce(0) { $0 + $1.price } }
    var total: Int { unitPrice * quantity }

    /// 购物车显示：「L・70%・少冰・+珍珠」
    var cartSummary: String {
        var parts = [size.label, sweetness.label, temp.label]
        parts += toppings.map { "+" + $0.name }
        return parts.joined(separator: "・")
    }

    /// 标签显示：「L / 少冰 / 50%」
    var labelSpec: String {
        [size.label, temp.label, sweetness.label].joined(separator: " / ")
    }

    /// 标签显示：「+珍珠 +芝士奶盖」
    var labelToppings: String {
        toppings.map { "+" + $0.name }.joined(separator: " ")
    }

    /// 同款同规格的判定键，用于合并购物车行和统计「常点」组合
    var comboKey: String {
        let toppingKey = toppings.map(\.id).sorted().joined(separator: "+")
        return [itemID, size.rawValue, temp.rawValue, String(sweetness.rawValue), toppingKey].joined(separator: "|")
    }

    var toppingIDs: [String] { toppings.map(\.id) }
}

struct Order: Codable, Identifiable, Hashable {
    var id: UUID
    var storeID: String
    var businessDay: String
    var pickupNumber: Int
    var createdAt: Date
    var channel: Channel
    var dining: DiningOption
    var lines: [OrderLine]
    var total: Int
    var taxRate: Int
    /// 含税价中包含的消费税（按单、按税率一次取整）
    var taxAmount: Int
    var payment: PaymentMethod
    var cashReceived: Int?
    /// 外卖平台订单号（后 4 位）
    var platformOrderRef: String?
    var status: OrderStatus
    var completedAt: Date?
    var refundedAt: Date?
    /// 扫码点单接过来的订单
    var online: OnlineOrderRef? = nil

    var cupCount: Int { lines.reduce(0) { $0 + $1.quantity } }
    var change: Int? { cashReceived.map { $0 - total } }
    var pickupLabel: String { Order.pickupLabel(pickupNumber) }
    var isRefunded: Bool { status == .refunded }

    static func pickupLabel(_ number: Int) -> String {
        number < 1000 ? String(format: "%03d", number) : String(number)
    }
}
