import XCTest
@testable import ChaliCore

final class CoreTests: XCTestCase {
    let menu = SeedMenu.menu
    let tokyo = TimeZone(identifier: "Asia/Tokyo")!

    func item(_ id: String) -> MenuItem { menu.item(id: id)! }

    func makeOrder(_ cart: Cart, payment: PaymentMethod = .cash, number: Int = 1, at date: Date = Date(timeIntervalSince1970: 1_792_800_000), status: OrderStatus = .making, ref: String? = nil) -> Order {
        Order(
            id: UUID(), storeID: "s", businessDay: "2026-10-24", pickupNumber: number, createdAt: date,
            channel: cart.channel, dining: cart.dining, lines: cart.lines, total: cart.total,
            taxRate: cart.taxRate, taxAmount: cart.taxAmount, payment: payment,
            cashReceived: payment == .cash ? 2000 : nil, platformOrderRef: ref, status: status,
            completedAt: nil, refundedAt: nil
        )
    }

    func testSeedMenuRules() {
        XCTAssertEqual(menu.categories.count, 5)
        XCTAssertEqual(menu.toppings.count, 8)
        let oolong = item("oolong-roast-milk")
        XCTAssertEqual(oolong.availableSizes, [.m, .l])
        XCTAssertEqual(oolong.defaultSize, .l)
        XCTAssertTrue(oolong.allowedTemps.contains(.hot))
        let trio = item("milktea-trio")
        XCTAssertEqual(trio.availableSizes, [.l])
        let kiwi = item("kiwi-trip")
        XCTAssertFalse(kiwi.allowedTemps.contains(.hot), "鲜果不能做热的")
        let salt = item("salt-osmanthus-milk")
        XCTAssertEqual(salt.availableSizes, [.m])
        XCTAssertEqual(salt.defaultSize, .m)
        for i in menu.items { XCTAssertNil(i.validationMessage, i.name) }
        XCTAssertEqual(Set(menu.items.map(\.id)).count, menu.items.count)
    }

    func testPricingAndTax() {
        let oolong = item("oolong-roast-milk")
        XCTAssertEqual(Pricing.basePrice(for: oolong, size: .m, channel: .inStore, dining: .takeOut, eatInPricing: .sameTaxIncluded), 580)
        XCTAssertEqual(Pricing.basePrice(for: oolong, size: .l, channel: .inStore, dining: .eatIn, eatInPricing: .sameTaxIncluded), 680)
        // 680 × 110 / 108 = 692.59 → 693
        XCTAssertEqual(Pricing.basePrice(for: oolong, size: .l, channel: .inStore, dining: .eatIn, eatInPricing: .convertByTaxRate), 693)
        XCTAssertNil(Pricing.basePrice(for: item("milktea-trio"), size: .m, channel: .inStore, dining: .takeOut, eatInPricing: .sameTaxIncluded))
        // 内税：1360 × 8 / 108 = 100.7 → 100；1360 × 10 / 110 = 123.6 → 123
        XCTAssertEqual(Pricing.includedTax(total: 1360, rate: 8), 100)
        XCTAssertEqual(Pricing.includedTax(total: 1360, rate: 10), 123)
        XCTAssertEqual(Pricing.taxRate(channel: .uber, dining: .eatIn), 8)
        XCTAssertEqual(Money.yen(15640), "¥15,640")
        XCTAssertEqual(Money.yen(-200), "-¥200")
    }

    func testPlatformPrice() {
        var m = menu
        let idx = m.items.firstIndex { $0.id == "oolong-roast-milk" }!
        m.items[idx].platformPrices["uber"] = SizePrices(m: nil, l: 820)
        let oolong = m.items[idx]
        XCTAssertEqual(Pricing.basePrice(for: oolong, size: .l, channel: .uber, dining: .takeOut, eatInPricing: .sameTaxIncluded), 820)
        XCTAssertEqual(Pricing.basePrice(for: oolong, size: .m, channel: .uber, dining: .takeOut, eatInPricing: .sameTaxIncluded), 580, "没设置的规格沿用店内价")
        XCTAssertEqual(Pricing.basePrice(for: oolong, size: .l, channel: .panda, dining: .takeOut, eatInPricing: .sameTaxIncluded), 680)

        var cart = Cart()
        cart.add(Pricing.defaultLine(item: oolong, menu: m, channel: .inStore, dining: .takeOut, eatInPricing: .sameTaxIncluded)!)
        XCTAssertEqual(cart.total, 680)
        cart.channel = .uber
        cart.reprice(menu: m, eatInPricing: .sameTaxIncluded)
        XCTAssertEqual(cart.total, 820)
        XCTAssertEqual(cart.taxRate, 8)
    }

    func testCartMergeAndEdit() {
        let oolong = item("oolong-roast-milk")
        var cart = Cart()
        let line = Pricing.makeLine(item: oolong, size: .l, temp: .lessIce, sweetness: .s50, toppingIDs: ["pearl"], menu: menu, channel: .inStore, dining: .takeOut, eatInPricing: .sameTaxIncluded)!
        XCTAssertEqual(line.unitPrice, 750)
        XCTAssertEqual(line.cartSummary, "L・50%・少冰・+珍珠")
        XCTAssertEqual(line.labelSpec, "L / 少冰 / 50%")
        cart.add(line)
        cart.add(Pricing.makeLine(item: oolong, size: .l, temp: .lessIce, sweetness: .s50, toppingIDs: ["pearl"], menu: menu, channel: .inStore, dining: .takeOut, eatInPricing: .sameTaxIncluded)!)
        XCTAssertEqual(cart.lines.count, 1, "同款同规格合并")
        XCTAssertEqual(cart.lines[0].quantity, 2)
        XCTAssertEqual(cart.total, 1500)
        cart.add(Pricing.defaultLine(item: oolong, menu: menu, channel: .inStore, dining: .takeOut, eatInPricing: .sameTaxIncluded)!)
        XCTAssertEqual(cart.lines.count, 2)
        XCTAssertEqual(cart.cupCount, 3)

        // 把第二行改成和第一行一样 → 合并
        let edited = Pricing.makeLine(item: oolong, size: .l, temp: .lessIce, sweetness: .s50, toppingIDs: ["pearl"], menu: menu, channel: .inStore, dining: .takeOut, eatInPricing: .sameTaxIncluded)!
        cart.replace(lineID: cart.lines[1].id, with: edited)
        XCTAssertEqual(cart.lines.count, 1)
        XCTAssertEqual(cart.lines[0].quantity, 3)

        cart.changeQuantity(lineID: cart.lines[0].id, by: -3)
        XCTAssertTrue(cart.isEmpty)
    }

    func testToppingToLastCup() {
        var cart = Cart()
        let pearl = menu.topping(id: "pearl")!
        XCTAssertNotNil(cart.addToppingToLastCup(pearl, menu: menu, eatInPricing: .sameTaxIncluded))
        var line = Pricing.defaultLine(item: item("oolong-roast-milk"), menu: menu, channel: .inStore, dining: .takeOut, eatInPricing: .sameTaxIncluded)!
        line.quantity = 2
        cart.add(line)
        XCTAssertNil(cart.addToppingToLastCup(pearl, menu: menu, eatInPricing: .sameTaxIncluded))
        XCTAssertEqual(cart.lines.count, 2, "两杯拆成一杯不加 + 一杯加珍珠")
        XCTAssertEqual(cart.lines[0].quantity, 1)
        XCTAssertEqual(cart.lines[1].toppings.map(\.id), ["pearl"])
        XCTAssertEqual(cart.total, 680 + 750)
        XCTAssertNotNil(cart.addToppingToLastCup(pearl, menu: menu, eatInPricing: .sameTaxIncluded), "不能重复加")
    }

    func testRepriceDropsDeletedItems() {
        var cart = Cart()
        cart.add(Pricing.defaultLine(item: item("kiwi-trip"), menu: menu, channel: .inStore, dining: .takeOut, eatInPricing: .sameTaxIncluded)!)
        var m = menu
        m.items.removeAll { $0.id == "kiwi-trip" }
        cart.reprice(menu: m, eatInPricing: .sameTaxIncluded)
        XCTAssertTrue(cart.isEmpty)
    }

    func testBusinessDayCutoff() {
        let cal = BusinessCalendar(cutoffHour: 4, timeZone: tokyo)
        var comps = DateComponents()
        comps.year = 2026; comps.month = 10; comps.day = 25; comps.hour = 2; comps.minute = 30
        var greg = Calendar(identifier: .gregorian); greg.timeZone = tokyo
        let lateNight = greg.date(from: comps)!
        XCTAssertEqual(cal.day(for: lateNight), "2026-10-24", "凌晨 2:30 算前一天")
        comps.hour = 4; comps.minute = 0
        XCTAssertEqual(cal.day(for: greg.date(from: comps)!), "2026-10-25")
        XCTAssertEqual(cal.addingDays(1, to: "2026-10-31"), "2026-11-01")
        XCTAssertEqual(cal.days(from: "2026-10-30", to: "2026-11-02").count, 4)
        XCTAssertEqual(cal.days(inMonth: "2026-02").count, 28)
        XCTAssertEqual(cal.monthToDate(today: "2026-10-24").count, 24)
        // 2026-10-24 是周六 → 本周从 10-19（周一）开始
        XCTAssertEqual(cal.weekToDate(today: "2026-10-24").first, "2026-10-19")
        XCTAssertEqual(cal.weekToDate(today: "2026-10-19"), ["2026-10-19"])
        XCTAssertEqual(cal.weekToDate(today: "2026-10-25").first, "2026-10-19", "周日属于本周")
    }

    func testReportsAndCombos() {
        let oolong = item("oolong-roast-milk")
        var a = Cart()
        a.add(Pricing.makeLine(item: oolong, size: .l, temp: .lessIce, sweetness: .s50, toppingIDs: ["pearl"], menu: menu, channel: .inStore, dining: .takeOut, eatInPricing: .sameTaxIncluded, quantity: 3)!)
        var b = Cart()
        b.dining = .eatIn
        b.add(Pricing.defaultLine(item: item("kiwi-trip"), menu: menu, channel: .inStore, dining: .eatIn, eatInPricing: .sameTaxIncluded)!)
        var c = Cart()
        c.channel = .uber
        c.add(Pricing.defaultLine(item: oolong, menu: menu, channel: .uber, dining: .takeOut, eatInPricing: .sameTaxIncluded)!)
        let refunded = makeOrder(b, payment: .credit, number: 4, status: .refunded)
        let orders = [makeOrder(a), makeOrder(b, payment: .payPay, number: 2), makeOrder(c, payment: .platform, number: 3, ref: "4821"), refunded]
        let s = Reports.summary(orders)
        XCTAssertEqual(s.orderCount, 3)
        XCTAssertEqual(s.cupCount, 5)
        XCTAssertEqual(s.gross, 2250 + 780 + 680)
        XCTAssertEqual(s.payment(.cash), 2250)
        XCTAssertEqual(s.payment(.payPay), 780)
        XCTAssertEqual(s.channel(.uber), 680)
        XCTAssertEqual(s.taxableByRate[8], 2250 + 680)
        XCTAssertEqual(s.taxableByRate[10], 780)
        XCTAssertEqual(s.taxByRate[10], 70)
        XCTAssertEqual(s.refundCount, 1)
        XCTAssertEqual(s.refundAmount, 780)

        var settings = ShopSettings()
        settings.commissionPercent["uber"] = 35
        XCTAssertEqual(Reports.net(for: .uber, gross: 1000, settings: settings), 650)
        XCTAssertEqual(Reports.net(for: .inStore, gross: 1000, settings: settings), 1000)

        let ranking = Reports.ranking(orders)
        XCTAssertEqual(ranking.first?.itemID, "oolong-roast-milk")
        XCTAssertEqual(ranking.first?.cups, 4)

        let combos = Reports.topCombos(orders)
        XCTAssertEqual(combos.first?.line.cartSummary, "L・50%・少冰・+珍珠")
        XCTAssertEqual(combos.first?.cups, 3)
        XCTAssertEqual(combos.first?.line.quantity, 1)
        XCTAssertEqual(combos.count, 3)

        let sweet = Reports.sweetnessShare(orders)
        XCTAssertEqual(sweet.first { $0.label == "50%" }?.count, 3)
        XCTAssertEqual(sweet.first { $0.label == "100%" }?.count, 2)
        let toppings = Reports.toppingShare(orders, menu: menu)
        XCTAssertEqual(toppings.map(\.label), ["珍珠"])
        XCTAssertEqual(toppings.first!.ratio, 3.0 / 5.0, accuracy: 0.001)
    }

    func testLabels() {
        let cal = BusinessCalendar(cutoffHour: 4, timeZone: tokyo)
        var cart = Cart()
        cart.add(Pricing.makeLine(item: item("oolong-roast-milk"), size: .l, temp: .lessIce, sweetness: .s50, toppingIDs: ["pearl", "cheese"], menu: menu, channel: .inStore, dining: .takeOut, eatInPricing: .sameTaxIncluded, quantity: 2)!)
        cart.add(Pricing.defaultLine(item: item("kiwi-trip"), menu: menu, channel: .inStore, dining: .takeOut, eatInPricing: .sameTaxIncluded)!)
        let order = makeOrder(cart, number: 7)
        let labels = LabelBuilder.labels(for: order, calendar: cal)
        XCTAssertEqual(labels.count, 3)
        XCTAssertEqual(labels.map(\.index), [1, 2, 3])
        XCTAssertEqual(labels[0].pickup, "007")
        XCTAssertEqual(labels[0].count, 3)
        XCTAssertEqual(labels[0].toppings, "+芝士奶盖 +珍珠", "小料按菜单顺序")
        XCTAssertTrue(labels[2].footer.hasPrefix("店内 外带 "))
        XCTAssertEqual(Set(labels.map(\.id)).count, 3)

        var uber = Cart()
        uber.channel = .uber
        uber.add(Pricing.defaultLine(item: item("kiwi-trip"), menu: menu, channel: .uber, dining: .takeOut, eatInPricing: .sameTaxIncluded)!)
        let uberLabel = LabelBuilder.labels(for: makeOrder(uber, payment: .platform, ref: "4821"), calendar: cal)[0]
        XCTAssertTrue(uberLabel.footer.hasPrefix("Uber #4821 "))
    }

    func testCSV() {
        let cal = BusinessCalendar(cutoffHour: 4, timeZone: tokyo)
        var cart = Cart()
        cart.add(Pricing.defaultLine(item: item("oolong-roast-milk"), menu: menu, channel: .inStore, dining: .takeOut, eatInPricing: .sameTaxIncluded)!)
        let o = makeOrder(cart)
        let csv = CSVExport.dailyTaxCSV(days: ["2026-10-24", "2026-10-25"], ordersByDay: ["2026-10-24": [o]])
        XCTAssertTrue(csv.hasPrefix("\u{FEFF}日付,件数"))
        let rows = csv.dropFirst().components(separatedBy: "\r\n").filter { !$0.isEmpty }
        XCTAssertEqual(rows.count, 4)
        XCTAssertTrue(rows[1].hasPrefix("2026/10/24,1,1,680,680,50,0,0,680,"))
        XCTAssertTrue(rows[2].hasPrefix("2026/10/25,0,0,0,"))
        XCTAssertTrue(rows[3].hasPrefix("合計,1,1,680,"))
        let headerCount = rows[0].components(separatedBy: ",").count
        for row in rows { XCTAssertEqual(row.components(separatedBy: ",").count, headerCount) }

        XCTAssertEqual(CSVExport.escape("a,b"), "\"a,b\"")
        XCTAssertEqual(CSVExport.escape("say \"hi\""), "\"say \"\"hi\"\"\"")
        let detail = CSVExport.orderDetailCSV(orders: [o], calendar: cal)
        XCTAssertTrue(detail.contains("乌龙烤鲜奶 L・100%・普通冰 ×1 680"))
    }

    func testDailyClose() {
        var cart = Cart()
        cart.add(Pricing.defaultLine(item: item("oolong-roast-milk"), menu: menu, channel: .inStore, dining: .takeOut, eatInPricing: .sameTaxIncluded)!)
        let s = Reports.summary([makeOrder(cart), makeOrder(cart, payment: .credit)])
        var settings = ShopSettings()
        settings.cashFloat = 20000
        let counts = [10000: 2, 500: 1, 100: 1, 50: 1, 10: 3]
        XCTAssertEqual(CashDrawer.total(of: counts), 20680)
        let close = CashDrawer.makeClose(day: "2026-10-24", settings: settings, counts: counts, summary: s, note: "")
        XCTAssertEqual(close.expectedCash, 20680)
        XCTAssertEqual(close.difference, 0)
        XCTAssertEqual(close.paymentTotals["credit"], 680)
        let text = CashDrawer.reportText(close: close, summary: s, settings: settings, calendar: BusinessCalendar(cutoffHour: 4, timeZone: tokyo))
        XCTAssertTrue(text.contains("差额：¥0"))
        XCTAssertTrue(text.contains("信用卡：¥680"))
    }

    func testFileStoreRoundTripAndTolerantDecoding() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let store = FileStore(baseURL: dir)
        try store.saveMenu(menu)
        XCTAssertEqual(store.loadMenu(), menu)

        var settings = ShopSettings()
        settings.cashFloat = 30000
        settings.commissionPercent["panda"] = 20
        try store.saveSettings(settings)
        XCTAssertEqual(store.loadSettings(), settings)

        // 旧版本的设置文件缺字段也能读
        try #"{"shopName":"茶里茶里 测试店","cashFloat":5000}"#.data(using: .utf8)!.write(to: dir.appendingPathComponent("settings.json"))
        let old = store.loadSettings()
        XCTAssertEqual(old?.shopName, "茶里茶里 测试店")
        XCTAssertEqual(old?.cashFloat, 5000)
        XCTAssertEqual(old?.dayCutoffHour, 4)
        XCTAssertEqual(old?.ownerPIN, "0000")

        var cart = Cart()
        cart.add(Pricing.defaultLine(item: item("oolong-roast-milk"), menu: menu, channel: .inStore, dining: .takeOut, eatInPricing: .sameTaxIncluded)!)
        let order = makeOrder(cart)
        try store.saveOrders([order], day: "2026-10-24")
        try store.saveOrders([], day: "2026-10-23")
        XCTAssertEqual(store.loadOrders(day: "2026-10-24"), [order])
        XCTAssertEqual(store.orderDays(), ["2026-10-23", "2026-10-24"])

        let close = CashDrawer.makeClose(day: "2026-10-24", settings: settings, counts: [1000: 3], summary: Reports.summary([order]), note: "ok", now: Date(timeIntervalSince1970: 1_792_800_000))
        try store.saveCloses([close])
        XCTAssertEqual(store.loadCloses(), [close])

        let backup = try store.backupData(menu: menu, settings: settings, closes: [close])
        let decoded = try { () throws -> FileStore.Backup in
            let d = JSONDecoder(); d.dateDecodingStrategy = .iso8601
            return try d.decode(FileStore.Backup.self, from: backup)
        }()
        XCTAssertEqual(decoded.ordersByDay["2026-10-24"]?.count, 1)

        // 坏文件：返回 nil 并留一份备份
        try "not json".data(using: .utf8)!.write(to: dir.appendingPathComponent("menu.json"))
        XCTAssertNil(store.loadMenu())
        let names = try FileManager.default.contentsOfDirectory(atPath: dir.path)
        XCTAssertTrue(names.contains { $0.hasPrefix("menu.broken-") })
    }

    func testMenuItemNormalizeAndDuplicate() {
        var m = menu
        var kiwi = m.item(id: "kiwi-trip")!
        kiwi.allowedTemps = [.noIce, .lessIce]
        kiwi.allowedSweetness = [.s50, .s30]
        kiwi.normalizeDefaults()
        XCTAssertEqual(kiwi.allowedTemps, [.lessIce, .noIce])
        XCTAssertEqual(kiwi.defaultTemp, .lessIce)
        XCTAssertEqual(kiwi.defaultSweetness, .s50)
        kiwi.prices = SizePrices(m: 600, l: nil)
        kiwi.normalizeDefaults()
        XCTAssertEqual(kiwi.defaultSize, .m)

        let copy = m.duplicateItem(id: "passion-q")!
        XCTAssertNotEqual(copy.id, "passion-q")
        XCTAssertEqual(copy.name, "酸Q百香果（复制）")
        XCTAssertEqual(m.items.count, menu.items.count + 1)
        XCTAssertTrue(ShopSettings().usesDefaultPIN)
        var s = ShopSettings(); s.invoiceNumber = "T1234567890123"
        XCTAssertTrue(s.isInvoiceNumberValid)
        s.invoiceNumber = "T123"
        XCTAssertFalse(s.isInvoiceNumberValid)
    }
}
