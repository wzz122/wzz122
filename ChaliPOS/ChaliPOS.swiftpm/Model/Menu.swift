import Foundation

// MARK: - 选项

enum DrinkSize: String, Codable, CaseIterable, Identifiable {
    case m = "M"
    case l = "L"

    var id: String { rawValue }
    var label: String { rawValue }
}

enum Temperature: String, Codable, CaseIterable, Identifiable {
    case hot
    case normalIce
    case lessIce
    case roomTemp
    case noIce

    var id: String { rawValue }

    var label: String {
        switch self {
        case .hot: return "HOT"
        case .normalIce: return "普通冰"
        case .lessIce: return "少冰"
        case .roomTemp: return "常温"
        case .noIce: return "去冰"
        }
    }

    var labelJP: String {
        switch self {
        case .hot: return "ホット"
        case .normalIce: return "氷普通"
        case .lessIce: return "氷少なめ"
        case .roomTemp: return "常温"
        case .noIce: return "氷なし"
        }
    }

    /// 「仅冷」饮品允许的温度
    static let coldOnly: [Temperature] = [.normalIce, .lessIce, .roomTemp, .noIce]
}

enum Sweetness: Int, Codable, CaseIterable, Identifiable {
    case s120 = 120
    case s100 = 100
    case s70 = 70
    case s50 = 50
    case s30 = 30
    case s0 = 0

    var id: Int { rawValue }
    var label: String { "\(rawValue)%" }
}

// MARK: - 菜单

struct Topping: Codable, Identifiable, Hashable {
    var id: String
    var name: String
    var nameJP: String
    var price: Int
}

struct MenuCategory: Codable, Identifiable, Hashable {
    var id: String
    var name: String
    var nameJP: String
    /// 卡片和分类栏的颜色，例如 "2E7D4F"
    var colorHex: String
}

struct SizePrices: Codable, Hashable {
    var m: Int?
    var l: Int?

    subscript(size: DrinkSize) -> Int? {
        get { size == .m ? m : l }
        set {
            if size == .m { m = newValue } else { l = newValue }
        }
    }

    var isEmpty: Bool { m == nil && l == nil }
}

struct MenuItem: Codable, Identifiable, Hashable {
    var id: String
    var name: String
    var nameJP: String
    var categoryID: String
    /// 店内含税价。没有价格的规格表示不提供。
    var prices: SizePrices
    /// 外卖平台价格，key 为 Channel.rawValue。没设置的规格沿用店内价。
    var platformPrices: [String: SizePrices]
    var allowedTemps: [Temperature]
    var allowedSweetness: [Sweetness]
    var allowedToppingIDs: [String]
    var defaultSize: DrinkSize
    var defaultTemp: Temperature
    var defaultSweetness: Sweetness
    /// 标记售罄的营业日（yyyy-MM-dd）。只对当天有效，第二天开店自动恢复。
    var soldOutDay: String?
    /// 关掉后不在点单界面显示（例如季节限定下架）
    var isActive: Bool

    init(
        id: String = UUID().uuidString,
        name: String,
        nameJP: String,
        categoryID: String,
        prices: SizePrices,
        platformPrices: [String: SizePrices] = [:],
        allowedTemps: [Temperature],
        allowedSweetness: [Sweetness] = Sweetness.allCases,
        allowedToppingIDs: [String],
        defaultSize: DrinkSize? = nil,
        defaultTemp: Temperature = .normalIce,
        defaultSweetness: Sweetness = .s100,
        soldOutDay: String? = nil,
        isActive: Bool = true
    ) {
        self.id = id
        self.name = name
        self.nameJP = nameJP
        self.categoryID = categoryID
        self.prices = prices
        self.platformPrices = platformPrices
        self.allowedTemps = allowedTemps
        self.allowedSweetness = allowedSweetness
        self.allowedToppingIDs = allowedToppingIDs
        self.defaultSize = defaultSize ?? (prices.l != nil ? .l : .m)
        self.defaultTemp = defaultTemp
        self.defaultSweetness = defaultSweetness
        self.soldOutDay = soldOutDay
        self.isActive = isActive
    }

    /// 逐个字段读取：以后新增字段时，旧的 menu.json 仍能读出来
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = try c.decode(String.self, forKey: .name)
        nameJP = try c.decodeIfPresent(String.self, forKey: .nameJP) ?? ""
        categoryID = try c.decode(String.self, forKey: .categoryID)
        prices = try c.decode(SizePrices.self, forKey: .prices)
        platformPrices = try c.decodeIfPresent([String: SizePrices].self, forKey: .platformPrices) ?? [:]
        allowedTemps = try c.decodeIfPresent([Temperature].self, forKey: .allowedTemps) ?? Temperature.coldOnly
        allowedSweetness = try c.decodeIfPresent([Sweetness].self, forKey: .allowedSweetness) ?? Sweetness.allCases
        allowedToppingIDs = try c.decodeIfPresent([String].self, forKey: .allowedToppingIDs) ?? []
        defaultSize = try c.decodeIfPresent(DrinkSize.self, forKey: .defaultSize) ?? (prices.l != nil ? .l : .m)
        defaultTemp = try c.decodeIfPresent(Temperature.self, forKey: .defaultTemp) ?? .normalIce
        defaultSweetness = try c.decodeIfPresent(Sweetness.self, forKey: .defaultSweetness) ?? .s100
        soldOutDay = try c.decodeIfPresent(String.self, forKey: .soldOutDay)
        isActive = try c.decodeIfPresent(Bool.self, forKey: .isActive) ?? true
    }

    var availableSizes: [DrinkSize] {
        DrinkSize.allCases.filter { prices[$0] != nil }
    }

    func isSoldOut(on day: String) -> Bool {
        soldOutDay == day
    }

    /// 编辑后把默认值收回到允许范围内
    mutating func normalizeDefaults() {
        allowedTemps = Temperature.allCases.filter { allowedTemps.contains($0) }
        allowedSweetness = Sweetness.allCases.filter { allowedSweetness.contains($0) }
        if prices[defaultSize] == nil, let first = availableSizes.last {
            defaultSize = first
        }
        if !allowedTemps.contains(defaultTemp) {
            defaultTemp = allowedTemps.contains(.normalIce) ? .normalIce : (allowedTemps.first ?? .normalIce)
        }
        if !allowedSweetness.contains(defaultSweetness) {
            defaultSweetness = allowedSweetness.contains(.s100) ? .s100 : (allowedSweetness.first ?? .s100)
        }
    }

    /// 能否保存：至少一个规格、一个温度、一个甜度，名字不为空
    var validationMessage: String? {
        if name.trimmingCharacters(in: .whitespaces).isEmpty { return "请填写中文名" }
        if availableSizes.isEmpty { return "至少设置一个规格的价格" }
        if allowedTemps.isEmpty { return "至少允许一种温度" }
        if allowedSweetness.isEmpty { return "至少允许一种甜度" }
        return nil
    }
}

struct ShopMenu: Codable, Hashable {
    var categories: [MenuCategory]
    var items: [MenuItem]
    var toppings: [Topping]

    func items(in categoryID: String, includeInactive: Bool = false) -> [MenuItem] {
        items.filter { $0.categoryID == categoryID && (includeInactive || $0.isActive) }
    }

    func item(id: String) -> MenuItem? {
        items.first { $0.id == id }
    }

    func topping(id: String) -> Topping? {
        toppings.first { $0.id == id }
    }

    func category(id: String) -> MenuCategory? {
        categories.first { $0.id == id }
    }

    func toppings(for item: MenuItem) -> [Topping] {
        toppings.filter { item.allowedToppingIDs.contains($0.id) }
    }

    /// 「复制一款」：新增季节限定时复制后改名改价
    @discardableResult
    mutating func duplicateItem(id: String) -> MenuItem? {
        guard let index = items.firstIndex(where: { $0.id == id }) else { return nil }
        var copy = items[index]
        copy.id = UUID().uuidString
        copy.name += "（复制）"
        copy.soldOutDay = nil
        items.insert(copy, at: index + 1)
        return copy
    }
}
