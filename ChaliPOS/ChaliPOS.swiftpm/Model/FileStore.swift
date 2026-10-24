import Foundation

/// 本地 JSON 存储。断网也能点单、收现金：所有数据先写在 iPad 上。
/// 订单按营业日分文件保存（orders/2026-10-24.json），每天的文件很小，写入不会越来越慢。
final class FileStore {
    let baseURL: URL
    private let fm = FileManager.default

    private let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        e.outputFormatting = [.sortedKeys]
        return e
    }()

    private let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    init(baseURL: URL? = nil) {
        if let baseURL {
            self.baseURL = baseURL
        } else {
            let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
                ?? FileManager.default.temporaryDirectory
            self.baseURL = support.appendingPathComponent("ChaliPOS", isDirectory: true)
        }
        try? fm.createDirectory(at: ordersURL, withIntermediateDirectories: true)
    }

    var ordersURL: URL { baseURL.appendingPathComponent("orders", isDirectory: true) }
    private var menuURL: URL { baseURL.appendingPathComponent("menu.json") }
    private var settingsURL: URL { baseURL.appendingPathComponent("settings.json") }
    private var closesURL: URL { baseURL.appendingPathComponent("closes.json") }

    private func ordersFile(day: String) -> URL {
        ordersURL.appendingPathComponent("\(day).json")
    }

    // MARK: 读

    func loadMenu() -> ShopMenu? { load(ShopMenu.self, from: menuURL) }
    func loadSettings() -> ShopSettings? { load(ShopSettings.self, from: settingsURL) }
    func loadCloses() -> [DailyClose] { load([DailyClose].self, from: closesURL) ?? [] }
    func loadOrders(day: String) -> [Order] { load([Order].self, from: ordersFile(day: day)) ?? [] }

    /// 有订单的所有营业日（升序）
    func orderDays() -> [String] {
        let names = (try? fm.contentsOfDirectory(atPath: ordersURL.path)) ?? []
        return names
            .filter { $0.hasSuffix(".json") }
            .map { String($0.dropLast(5)) }
            .sorted()
    }

    // MARK: 写

    func saveMenu(_ menu: ShopMenu) throws { try save(menu, to: menuURL) }
    func saveSettings(_ settings: ShopSettings) throws { try save(settings, to: settingsURL) }
    func saveCloses(_ closes: [DailyClose]) throws { try save(closes, to: closesURL) }
    func saveOrders(_ orders: [Order], day: String) throws { try save(orders, to: ordersFile(day: day)) }

    /// 全部数据打包成一个 JSON（备份用）
    func backupData(menu: ShopMenu, settings: ShopSettings, closes: [DailyClose]) throws -> Data {
        var ordersByDay: [String: [Order]] = [:]
        for day in orderDays() {
            ordersByDay[day] = loadOrders(day: day)
        }
        let backup = Backup(createdAt: Date(), menu: menu, settings: settings, closes: closes, ordersByDay: ordersByDay)
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        e.outputFormatting = [.sortedKeys, .prettyPrinted]
        return try e.encode(backup)
    }

    struct Backup: Codable {
        var createdAt: Date
        var menu: ShopMenu
        var settings: ShopSettings
        var closes: [DailyClose]
        var ordersByDay: [String: [Order]]
    }

    // MARK: -

    private func load<T: Decodable>(_ type: T.Type, from url: URL) -> T? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        do {
            return try decoder.decode(type, from: data)
        } catch {
            // 读不出来时保留原文件，避免被新数据覆盖
            let broken = url.deletingPathExtension().appendingPathExtension("broken-\(Int(Date().timeIntervalSince1970)).json")
            try? fm.copyItem(at: url, to: broken)
            return nil
        }
    }

    private func save<T: Encodable>(_ value: T, to url: URL) throws {
        let data = try encoder.encode(value)
        try data.write(to: url, options: [.atomic])
    }
}
