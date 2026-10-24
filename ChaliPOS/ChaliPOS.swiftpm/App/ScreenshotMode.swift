import SwiftUI

/// 只给 CI 截图用：模拟器启动参数 `-screenshot <页面>`。
/// 数据放在临时目录、使用示例订单，不会碰到店里的真实数据；平时启动时完全不生效。
enum ScreenshotMode {
    static let page: String? = {
        let args = ProcessInfo.processInfo.arguments
        guard let index = args.firstIndex(of: "-screenshot"), index + 1 < args.count else { return nil }
        return args[index + 1]
    }()

    static var isActive: Bool { page != nil }

    static func isPage(_ name: String) -> Bool { page == name }

    static var initialScreen: Screen {
        switch page {
        case "orders": return .orders
        case "qr", "qrposter": return .qr
        case "soldout": return .soldOut
        case "close": return .close
        case "reports", "menu": return .admin
        default: return .order
        }
    }

    @MainActor
    static func makeStore() -> AppStore {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("ChaliPOS-screenshot-\(UUID().uuidString)")
        let files = FileStore(baseURL: dir)

        var settings = ShopSettings()
        settings.ownerPIN = "2580"
        settings.invoiceNumber = "T1234567890123"
        settings.cashFloat = 20000
        settings.commissionPercent = [Channel.uber.rawValue: 35, Channel.panda.rawValue: 25, Channel.rocket.rawValue: 20]
        // 扫码页面：启用但不填连接信息，截图时不联网
        settings.qrEnabled = true
        settings.qrPageURL = "https://wzz122.github.io/chalichali/"
        try? files.saveSettings(settings)

        let calendar = BusinessCalendar(cutoffHour: settings.dayCutoffHour)
        let today = calendar.day(for: Date())

        var menu = SeedMenu.menu
        for index in menu.items.indices where ["strawberry", "durian-milk"].contains(menu.items[index].id) {
            menu.items[index].soldOutDay = today
        }
        try? files.saveMenu(menu)
        try? files.saveOrders(demoOrders(menu: menu, settings: settings, day: today, calendar: calendar), day: today)

        let store = AppStore(files: files)
        store.injectOnlineOrdersForScreenshot(demoOnlineOrders(menu: menu, day: today))
        if page == "order" || page == "checkout" {
            let specs: [(String, DrinkSize, Temperature, Sweetness, [String], Int)] = [
                ("oolong-roast-milk", .l, .lessIce, .s50, ["pearl"], 2),
                ("kiwi-trip", .l, .normalIce, .s70, [], 1),
                ("salt-osmanthus-milk", .m, .noIce, .s30, ["cheese"], 1),
            ]
            for spec in specs {
                if let item = menu.item(id: spec.0),
                   var line = store.makeLine(item: item, size: spec.1, temp: spec.2, sweetness: spec.3, toppingIDs: spec.4) {
                    line.quantity = spec.5
                    store.addToCart(line)
                }
            }
        }
        return store
    }

    /// 一天的示例订单：店内、外卖、不同支付方式，最后几单还在制作中，有一单退款
    private static func demoOrders(menu: ShopMenu, settings: ShopSettings, day: String, calendar: BusinessCalendar) -> [Order] {
        let combos: [(String, DrinkSize, Temperature, Sweetness, [String])] = [
            ("oolong-roast-milk", .l, .lessIce, .s50, ["pearl"]),
            ("oolong-roast-milk", .l, .normalIce, .s100, []),
            ("pearl-milktea", .l, .lessIce, .s70, []),
            ("kiwi-trip", .l, .normalIce, .s100, []),
            ("mango-pomelo", .l, .lessIce, .s70, ["sago"]),
            ("lemon-oolong", .l, .normalIce, .s50, []),
            ("salt-osmanthus-milk", .m, .noIce, .s30, ["cheese"]),
            ("pink-guava-grape", .l, .lessIce, .s100, ["coconutJelly"]),
            ("milktea-trio", .l, .hot, .s70, []),
            ("passion-q", .l, .normalIce, .s100, ["nata"]),
        ]
        let channels: [Channel] = [.inStore, .inStore, .inStore, .uber, .inStore, .panda, .inStore, .inStore, .rocket, .inStore]
        let payments: [PaymentMethod] = [.cash, .credit, .payPay, .cash, .transitIC, .cash, .payPay, .iD]
        let dayStart = (calendar.date(for: day) ?? Date()).addingTimeInterval(Double(calendar.cutoffHour) * 3600 + 60)
        let lastOrder = Date().addingTimeInterval(-180)

        var orders: [Order] = []
        for number in 1...38 {
            let channel = channels[number % channels.count]
            let dining: DiningOption = channel.isDelivery || number % 3 != 0 ? .takeOut : .eatIn
            var cart = Cart(channel: channel, dining: dining)
            let cups = 1 + (number * 7) % 3
            for cup in 0..<cups {
                let combo = combos[(number * 3 + cup * 5 + (cup == 0 ? 0 : number)) % combos.count]
                guard let item = menu.item(id: combo.0),
                      let line = Pricing.makeLine(item: item, size: combo.1, temp: combo.2, sweetness: combo.3, toppingIDs: combo.4,
                                                  menu: menu, channel: channel, dining: dining, eatInPricing: settings.eatInPricing)
                else { continue }
                cart.add(line)
            }
            let payment: PaymentMethod = channel.isDelivery ? .platform : payments[number % payments.count]
            let total = cart.total
            orders.append(Order(
                id: UUID(),
                storeID: settings.storeID,
                businessDay: day,
                pickupNumber: number,
                createdAt: max(dayStart, lastOrder.addingTimeInterval(-Double(38 - number) * 13 * 60)),
                channel: channel,
                dining: cart.dining,
                lines: cart.lines,
                total: total,
                taxRate: cart.taxRate,
                taxAmount: cart.taxAmount,
                payment: payment,
                cashReceived: payment == .cash ? ((total + 999) / 1000) * 1000 : nil,
                platformOrderRef: channel.isDelivery ? String(format: "%04d", (number * 379) % 10000) : nil,
                status: number == 12 ? .refunded : (number > 34 ? .making : .done),
                completedAt: nil,
                refundedAt: nil
            ))
        }
        return orders
    }

    /// 扫码单示例：两张待接单、一张制作中、一张可取餐、一张已取消
    private static func demoOnlineOrders(menu: ShopMenu, day: String) -> [OnlineOrder] {
        func line(_ id: String, _ size: DrinkSize, _ temp: Temperature, _ sweetness: Sweetness, _ toppings: [String], _ quantity: Int) -> OnlineOrderLine? {
            guard let item = menu.item(id: id),
                  let made = Pricing.makeLine(item: item, size: size, temp: temp, sweetness: sweetness, toppingIDs: toppings,
                                              menu: menu, channel: .inStore, dining: .takeOut, eatInPricing: .sameTaxIncluded)
            else { return nil }
            return OnlineOrderLine(itemID: id, name: made.name, nameJP: made.nameJP, size: size, temp: temp, sweetness: sweetness,
                                   toppings: made.toppings, basePrice: made.basePrice, unitPrice: made.unitPrice, quantity: quantity)
        }
        func order(_ number: Int, minutesAgo: Double, seat: String?, dining: DiningOption, note: String?, status: OnlineOrderStatus,
                   pickup: Int?, reason: String? = nil, _ lines: [OnlineOrderLine?]) -> OnlineOrder {
            let items = lines.compactMap { $0 }
            let created = Date().addingTimeInterval(-minutesAgo * 60)
            return OnlineOrder(
                id: UUID(), number: number, businessDay: day, seat: seat, dining: dining, lines: items,
                total: items.reduce(0) { $0 + $1.unitPrice * $1.quantity }, cupCount: items.reduce(0) { $0 + $1.quantity },
                note: note, status: status, pickupNumber: pickup, cancelReason: reason, createdAt: created, updatedAt: created
            )
        }
        return [
            order(3, minutesAgo: 24, seat: nil, dining: .takeOut, note: nil, status: .cancelled, pickup: nil, reason: "顾客没有来付款",
                  [line("kiwi-trip", .l, .normalIce, .s100, [], 1)]),
            order(4, minutesAgo: 16, seat: "T2", dining: .eatIn, note: nil, status: .ready, pickup: 36,
                  [line("lemon-oolong", .l, .normalIce, .s50, [], 2)]),
            order(5, minutesAgo: 9, seat: nil, dining: .takeOut, note: nil, status: .accepted, pickup: 37,
                  [line("pink-guava-grape", .l, .lessIce, .s100, ["coconutJelly"], 1)]),
            order(6, minutesAgo: 3, seat: "T3", dining: .eatIn, note: "氷は別でお願いします", status: .received, pickup: nil,
                  [line("oolong-roast-milk", .l, .lessIce, .s50, ["pearl"], 2), line("kiwi-trip", .l, .normalIce, .s100, [], 1)]),
            order(7, minutesAgo: 1, seat: nil, dining: .takeOut, note: nil, status: .received, pickup: nil,
                  [line("salt-osmanthus-milk", .m, .noIce, .s30, ["cheese"], 1)]),
        ]
    }

    /// 日结截图：按应有现金填好面额
    static func cashCounts(for amount: Int) -> [Int: Int] {
        var rest = amount
        var counts: [Int: Int] = [:]
        for value in CashDrawer.denominations where value != 2000 {
            counts[value] = rest / value
            rest %= value
        }
        return counts.filter { $0.value > 0 }
    }
}
