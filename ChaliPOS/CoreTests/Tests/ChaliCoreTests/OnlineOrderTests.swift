import XCTest
@testable import ChaliCore

/// 扫码点单：发布菜单的格式、解码数据库返回的订单、接单放进购物车
final class OnlineOrderTests: XCTestCase {
    let menu = SeedMenu.menu

    /// `chali_staff_orders` 在本地 Postgres + PostgREST 上的真实返回（一张已做好、一张已拒单）
    let staffOrdersJSON = #"""
[{"id":"64c06a5c-69b8-442e-a55e-3549c2a3cbff","note":"少一点珍珠","seat":"T3","lines":[{"name":"乌龙烤鲜奶","size":"L","temp":"lessIce","itemID":"oolong-roast-milk","nameJP":"焙煎ウーロンミルク","quantity":2,"toppings":[{"id":"pearl","name":"珍珠","price":70,"nameJP":"タピオカ"}],"basePrice":680,"sweetness":50,"unitPrice":750},{"name":"奇异之旅","size":"L","temp":"normalIce","itemID":"kiwi-trip","nameJP":"キウイトリップ","quantity":1,"toppings":[],"basePrice":780,"sweetness":100,"unitPrice":780}],"total":2280,"dining":"takeOut","number":1,"status":"ready","cupCount":3,"createdAt":"2026-10-24T16:42:44.139876+00:00","updatedAt":"2026-10-24T16:42:44.260548+00:00","businessDay":"2026-10-24","cancelReason":null,"pickupNumber":41},{"id":"7e91bed5-84e9-4e85-9bfd-ea65d5a4b8a8","note":null,"seat":null,"lines":[{"name":"老盐桂花牛乳茶","size":"M","temp":"noIce","itemID":"salt-osmanthus-milk","nameJP":"塩キンモクセイミルクティー","quantity":1,"toppings":[{"id":"cheese","name":"芝士奶盖","price":120,"nameJP":"チーズフォーム"}],"basePrice":680,"sweetness":30,"unitPrice":800}],"total":800,"dining":"eatIn","number":2,"status":"cancelled","cupCount":1,"createdAt":"2026-10-24T16:42:44.148254+00:00","updatedAt":"2026-10-24T16:42:44.265318+00:00","businessDay":"2026-10-24","cancelReason":"老盐桂花卖完了","pickupNumber":null}]
"""#

    func testDecodeStaffOrdersFromDatabase() throws {
        let orders = try OnlineJSON.decoder.decode([OnlineOrder].self, from: Data(staffOrdersJSON.utf8))
        XCTAssertEqual(orders.count, 2)
        let first = orders[0]
        XCTAssertEqual(first.numberLabel, "Q1")
        XCTAssertEqual(first.seat, "T3")
        XCTAssertEqual(first.dining, .takeOut)
        XCTAssertEqual(first.status, .ready)
        XCTAssertEqual(first.pickupNumber, 41)
        XCTAssertEqual(first.total, 2280)
        XCTAssertEqual(first.cupCount, 3)
        XCTAssertEqual(first.lines[0].toppings.map(\.name), ["珍珠"])
        XCTAssertEqual(first.summary, "乌龙烤鲜奶×2、奇异之旅")
        XCTAssertTrue(first.updatedAt >= first.createdAt)
        XCTAssertEqual(orders[1].status, .cancelled)
        XCTAssertEqual(orders[1].cancelReason, "老盐桂花卖完了")
        XCTAssertFalse(orders[1].status.isOpen)
    }

    func testAcceptIntoCartKeepsCustomerPrices() throws {
        let order = try OnlineJSON.decoder.decode([OnlineOrder].self, from: Data(staffOrdersJSON.utf8))[0]
        let cart = order.makeCart()
        XCTAssertEqual(cart.total, order.total, "收银金额和顾客看到的一样")
        XCTAssertEqual(cart.cupCount, 3)
        XCTAssertEqual(cart.dining, .takeOut)
        XCTAssertEqual(cart.online?.numberLabel, "Q1")
        XCTAssertEqual(cart.online?.seat, "T3")
        XCTAssertEqual(cart.lines[0].cartSummary, "L・50%・少冰・+珍珠")
        XCTAssertTrue(order.warnings(menu: menu, businessDay: "2026-10-24").isEmpty)

        var changed = menu
        let i = changed.items.firstIndex { $0.id == "kiwi-trip" }!
        changed.items[i].prices.l = 800
        changed.items[i].soldOutDay = "2026-10-24"
        let warnings = order.warnings(menu: changed, businessDay: "2026-10-24")
        XCTAssertEqual(warnings.count, 2)

        var emptied = cart
        emptied.clear()
        XCTAssertNil(emptied.online, "清空购物车时也不再关联扫码单")
    }

    func testPublishedMenu() throws {
        var m = menu
        let soldOut = m.items.firstIndex { $0.id == "strawberry" }!
        m.items[soldOut].soldOutDay = "2026-10-24"
        let hidden = m.items.firstIndex { $0.id == "durian-milk" }!
        m.items[hidden].isActive = false
        let published = PublishedMenu(menu: m, settings: ShopSettings(), businessDay: "2026-10-24")
        XCTAssertEqual(published.items.count, m.items.count - 1, "下架的不发布")
        XCTAssertEqual(published.items.first { $0.id == "strawberry" }?.soldOut, true)
        XCTAssertEqual(published.items.first { $0.id == "kiwi-trip" }?.soldOut, false)

        // 数据库函数依赖的字段名
        let json = try JSONSerialization.jsonObject(with: OnlineJSON.encoder.encode(published)) as! [String: Any]
        XCTAssertEqual(json["businessDay"] as? String, "2026-10-24")
        XCTAssertEqual(json["eatInPricing"] as? String, "sameTaxIncluded")
        let item = (json["items"] as! [[String: Any]]).first { $0["id"] as? String == "oolong-roast-milk" }!
        XCTAssertEqual((item["prices"] as! [String: Int])["l"], 680)
        XCTAssertEqual(item["allowedTemps"] as? [String], ["hot", "normalIce", "lessIce", "roomTemp", "noIce"])
        XCTAssertEqual(item["allowedSweetness"] as? [Int], [120, 100, 70, 50, 30, 0])
        let kiwi = (json["items"] as! [[String: Any]]).first { $0["id"] as? String == "kiwi-trip" }!
        XCTAssertNil((kiwi["prices"] as! [String: Int])["m"], "不提供的规格不出现在 prices 里")
    }

    func testParsePostgresDates() {
        XCTAssertNotNil(OnlineJSON.parseDate("2026-10-24T16:42:44.139876+00:00"))
        XCTAssertNotNil(OnlineJSON.parseDate("2026-10-24T16:42:44+09:00"))
        XCTAssertNotNil(OnlineJSON.parseDate("2026-10-24T16:42:44.1Z"))
        XCTAssertEqual(
            OnlineJSON.parseDate("2026-10-24T16:42:44.999+00:00"),
            OnlineJSON.parseDate("2026-10-25T01:42:44+09:00")
        )
        XCTAssertNil(OnlineJSON.parseDate("yesterday"))
    }

    func testQROrderURL() {
        var s = ShopSettings()
        XCTAssertNil(s.qrOrderURL())
        s.qrPageURL = "https://wzz122.github.io/chalichali/"
        XCTAssertEqual(s.qrOrderURL()?.absoluteString, "https://wzz122.github.io/chalichali/?s=chalichali-01")
        XCTAssertEqual(s.qrOrderURL(seat: " T3 ")?.absoluteString, "https://wzz122.github.io/chalichali/?s=chalichali-01&t=T3")
        s.qrPageURL = "https://example.com/order?s=old&lang=zh"
        XCTAssertEqual(s.qrOrderURL()?.absoluteString, "https://example.com/order?lang=zh&s=chalichali-01")
        s.qrPageURL = "javascript:alert(1)"
        XCTAssertNil(s.qrOrderURL())
        XCTAssertFalse(s.isQRConfigured)
    }

    func testOnlineOrderLabelAndBackwardCompatibleOrders() throws {
        let order = try OnlineJSON.decoder.decode([OnlineOrder].self, from: Data(staffOrdersJSON.utf8))[0]
        let cart = order.makeCart()
        let placed = Order(
            id: UUID(), storeID: "s", businessDay: "2026-10-24", pickupNumber: 41,
            createdAt: Date(timeIntervalSince1970: 1_792_800_000),
            channel: cart.channel, dining: cart.dining, lines: cart.lines, total: cart.total,
            taxRate: cart.taxRate, taxAmount: cart.taxAmount, payment: .payPay, cashReceived: nil,
            platformOrderRef: nil, status: .making, completedAt: nil, refundedAt: nil, online: cart.online
        )
        let label = LabelBuilder.labels(for: placed, calendar: BusinessCalendar(cutoffHour: 4, timeZone: TimeZone(identifier: "Asia/Tokyo")!))[0]
        XCTAssertTrue(label.footer.hasPrefix("扫码 Q1 T3 外带 "), label.footer)

        // 旧版本保存的订单没有 online 字段，照样能读
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        var json = try JSONSerialization.jsonObject(with: encoder.encode(placed)) as! [String: Any]
        json.removeValue(forKey: "online")
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let old = try decoder.decode(Order.self, from: JSONSerialization.data(withJSONObject: json))
        XCTAssertNil(old.online)
    }
}
