import XCTest
@testable import ChaliCore

/// 只在设置了 CHALI_FIXTURE_DIR 时运行：导出发布给服务器的菜单，用于和数据库函数联调
final class ExportFixture: XCTestCase {
    func testExportPublishedMenu() throws {
        guard let dir = ProcessInfo.processInfo.environment["CHALI_FIXTURE_DIR"] else { return }
        var menu = SeedMenu.menu
        let day = ProcessInfo.processInfo.environment["CHALI_DAY"] ?? "2026-10-24"
        if let i = menu.items.firstIndex(where: { $0.id == "strawberry" }) { menu.items[i].soldOutDay = day }
        if let i = menu.items.firstIndex(where: { $0.id == "durian-milk" }) { menu.items[i].isActive = false }
        let published = PublishedMenu(menu: menu, settings: ShopSettings(), businessDay: day)
        try OnlineJSON.encoder.encode(published).write(to: URL(fileURLWithPath: dir).appendingPathComponent("published_menu.json"))
    }
}
