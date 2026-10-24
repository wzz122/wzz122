import Foundation

/// 店内用与外带的定价方式（需要和老板确认）
enum EatInPricing: String, Codable, CaseIterable, Identifiable {
    /// 同一含税价，系统内部按 10% / 8% 倒算税额（常见做法）
    case sameTaxIncluded
    /// 菜单价视为外带（8%）价，店内用按 110/108 换算
    case convertByTaxRate

    var id: String { rawValue }

    var label: String {
        switch self {
        case .sameTaxIncluded: return "同一含税价（推荐）"
        case .convertByTaxRate: return "店内用按税率换算"
        }
    }
}

struct ShopSettings: Codable, Hashable {
    /// 每张表从第一天就带门店 ID，以后复制给其他店时区分数据
    var storeID: String = "chalichali-01"
    var shopName: String = "茶里茶里"
    var shopNameJP: String = "茶里茶里"
    /// 适格请求书发行事业者登记号码（T+13 位）
    var invoiceNumber: String = ""
    var address: String = ""
    var phone: String = ""
    var ownerPIN: String = ShopSettings.defaultPIN
    /// 找零备用金
    var cashFloat: Int = 0
    /// 外卖平台抽成（%），key 为 Channel.rawValue
    var commissionPercent: [String: Double] = [:]
    var autoPrintLabels: Bool = true
    var eatInPricing: EatInPricing = .sameTaxIncluded
    var defaultDining: DiningOption = .takeOut
    /// 营业日切换时间（点）。凌晨这个时间之前的订单算前一天。
    var dayCutoffHour: Int = 4
    /// 选中的 AirPrint 标签打印机 / 小票打印机
    var labelPrinterURL: String?
    var receiptPrinterURL: String?

    static let defaultPIN = "0000"

    var usesDefaultPIN: Bool { ownerPIN == ShopSettings.defaultPIN }

    init() {}

    /// 逐个字段读取：以后新增设置项时，旧的 settings.json 仍能读出来
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let d = ShopSettings()
        storeID = try c.decodeIfPresent(String.self, forKey: .storeID) ?? d.storeID
        shopName = try c.decodeIfPresent(String.self, forKey: .shopName) ?? d.shopName
        shopNameJP = try c.decodeIfPresent(String.self, forKey: .shopNameJP) ?? d.shopNameJP
        invoiceNumber = try c.decodeIfPresent(String.self, forKey: .invoiceNumber) ?? d.invoiceNumber
        address = try c.decodeIfPresent(String.self, forKey: .address) ?? d.address
        phone = try c.decodeIfPresent(String.self, forKey: .phone) ?? d.phone
        ownerPIN = try c.decodeIfPresent(String.self, forKey: .ownerPIN) ?? d.ownerPIN
        cashFloat = try c.decodeIfPresent(Int.self, forKey: .cashFloat) ?? d.cashFloat
        commissionPercent = try c.decodeIfPresent([String: Double].self, forKey: .commissionPercent) ?? d.commissionPercent
        autoPrintLabels = try c.decodeIfPresent(Bool.self, forKey: .autoPrintLabels) ?? d.autoPrintLabels
        eatInPricing = try c.decodeIfPresent(EatInPricing.self, forKey: .eatInPricing) ?? d.eatInPricing
        defaultDining = try c.decodeIfPresent(DiningOption.self, forKey: .defaultDining) ?? d.defaultDining
        dayCutoffHour = try c.decodeIfPresent(Int.self, forKey: .dayCutoffHour) ?? d.dayCutoffHour
        labelPrinterURL = try c.decodeIfPresent(String.self, forKey: .labelPrinterURL)
        receiptPrinterURL = try c.decodeIfPresent(String.self, forKey: .receiptPrinterURL)
    }

    func commission(for channel: Channel) -> Double {
        commissionPercent[channel.rawValue] ?? 0
    }

    /// T + 13 位数字
    var isInvoiceNumberValid: Bool {
        let chars = Array(invoiceNumber)
        return chars.count == 14 && chars[0] == "T" && chars.dropFirst().allSatisfy { $0.isASCII && $0.isNumber }
    }
}
