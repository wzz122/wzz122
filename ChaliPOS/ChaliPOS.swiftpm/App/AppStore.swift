import SwiftUI
import AudioToolbox

struct ToastMessage: Identifiable, Equatable {
    let id = UUID()
    let text: String
    let isError: Bool
}

/// App 的全部状态。菜单、订单、日结都先写入本地文件，断网照常营业。
@MainActor
final class AppStore: ObservableObject {
    @Published private(set) var menu: ShopMenu
    @Published private(set) var settings: ShopSettings
    @Published private(set) var today: String
    @Published private(set) var todayOrders: [Order]
    @Published private(set) var closes: [DailyClose]
    @Published private(set) var frequentCombos: [ComboRow] = []
    /// true：「常点」来自今天；false：今天还没单，用最近 7 天
    @Published private(set) var frequentIsToday = true
    @Published var cart = Cart()
    @Published var toast: ToastMessage?

    /// 扫码点单
    @Published private(set) var onlineOrders: [OnlineOrder] = []
    @Published private(set) var onlineSync = OnlineSyncState()
    /// 让 RootView 切换页面 / 让点单页打开结账（接扫码单时用）
    @Published var screenRequest: Screen?
    @Published var checkoutRequest = false

    let files: FileStore
    private var pastOrdersCache: [String: [Order]] = [:]
    private var onlineSince: Date?
    private var seenOnlineIDs: Set<UUID> = []
    private var isPolling = false
    private var publishTask: Task<Void, Never>?
    /// 网络断了没发出去的状态更新，下次轮询时重发
    private var pendingOnlineUpdates: [UUID: PendingOnlineUpdate] = [:]

    struct OnlineSyncState: Equatable {
        var lastSync: Date?
        var menuPublishedAt: Date?
        var error: String?
    }

    private struct PendingOnlineUpdate {
        var status: OnlineOrderStatus
        var pickupNumber: Int?
        var reason: String?
    }

    init(files: FileStore = FileStore()) {
        self.files = files
        let settings = files.loadSettings() ?? ShopSettings()
        let savedMenu = files.loadMenu()
        let day = BusinessCalendar(cutoffHour: settings.dayCutoffHour).day(for: Date())
        self.settings = settings
        self.menu = savedMenu ?? SeedMenu.menu
        self.today = day
        self.todayOrders = files.loadOrders(day: day)
        self.closes = files.loadCloses()
        self.cart = Cart(channel: .inStore, dining: settings.defaultDining)
        if savedMenu == nil { persistMenu() }
        refreshFrequent()
    }

    var calendar: BusinessCalendar { BusinessCalendar(cutoffHour: settings.dayCutoffHour) }
    var todaySummary: SalesSummary { Reports.summary(todayOrders) }
    var nextPickupNumber: Int { (todayOrders.map(\.pickupNumber).max() ?? 0) + 1 }
    var makingCount: Int { todayOrders.filter { $0.status == .making }.count }

    // MARK: - 营业日

    /// 过了营业日切换时间：取餐号从 001 重新开始，售罄自动恢复
    func rollOverIfNeeded() {
        let day = calendar.day(for: Date())
        guard day != today else { return }
        today = day
        todayOrders = files.loadOrders(day: day)
        refreshFrequent()
        onlineOrders.removeAll { !$0.status.isOpen }
        onlineSince = nil
        schedulePublish()
    }

    // MARK: - 点单

    func isSoldOut(_ item: MenuItem) -> Bool {
        item.isSoldOut(on: today)
    }

    var soldOutCount: Int {
        menu.items.filter { $0.isActive && isSoldOut($0) }.count
    }

    func setChannel(_ channel: Channel) {
        if cart.online != nil && channel != .inStore {
            showToast("这是扫码单，不能改成外卖渠道", isError: true)
            return
        }
        cart.channel = channel
        if channel.isDelivery { cart.dining = .takeOut }
        cart.reprice(menu: menu, eatInPricing: settings.eatInPricing)
    }

    func setDining(_ dining: DiningOption) {
        cart.dining = dining
        cart.reprice(menu: menu, eatInPricing: settings.eatInPricing)
    }

    func makeLine(item: MenuItem, size: DrinkSize, temp: Temperature, sweetness: Sweetness, toppingIDs: [String]) -> OrderLine? {
        Pricing.makeLine(
            item: item,
            size: size,
            temp: temp,
            sweetness: sweetness,
            toppingIDs: toppingIDs,
            menu: menu,
            channel: cart.channel,
            dining: cart.dining,
            eatInPricing: settings.eatInPricing
        )
    }

    func price(for item: MenuItem, size: DrinkSize) -> Int? {
        Pricing.basePrice(for: item, size: size, channel: cart.channel, dining: cart.dining, eatInPricing: settings.eatInPricing)
    }

    func toppingPrice(_ topping: Topping) -> Int {
        Pricing.toppingPrice(topping, channel: cart.channel, dining: cart.dining, eatInPricing: settings.eatInPricing)
    }

    /// 卡片上的价格：「M ¥580 / L ¥680」或「L ¥780」
    func priceText(for item: MenuItem) -> String {
        item.availableSizes
            .compactMap { size in price(for: item, size: size).map { "\(size.label) \(Money.yen($0))" } }
            .joined(separator: " / ")
    }

    func color(for item: MenuItem) -> Color {
        menu.category(id: item.categoryID).map { Color(hex: $0.colorHex) } ?? Theme.green
    }

    func addToCart(_ line: OrderLine) {
        cart.add(line)
    }

    func replaceLine(_ lineID: UUID, with line: OrderLine) {
        cart.replace(lineID: lineID, with: line)
    }

    func changeQuantity(_ lineID: UUID, by delta: Int) {
        cart.changeQuantity(lineID: lineID, by: delta)
    }

    func removeLine(_ lineID: UUID) {
        cart.remove(lineID: lineID)
    }

    func clearCart() {
        cart.clear()
    }

    /// 长按卡片：跳过弹层，按默认值加入
    func quickAdd(_ item: MenuItem) {
        guard !isSoldOut(item) else {
            showToast("「\(item.name)」今日售罄", isError: true)
            return
        }
        guard let line = Pricing.defaultLine(item: item, menu: menu, channel: cart.channel, dining: cart.dining, eatInPricing: settings.eatInPricing) else { return }
        cart.add(line)
        showToast("已加入 \(line.name)  \(line.cartSummary)")
    }

    /// 「常点」：一点就加入
    func addCombo(_ template: OrderLine) {
        guard let item = menu.item(id: template.itemID), item.isActive else {
            showToast("菜单里已经没有这款饮品", isError: true)
            return
        }
        guard !isSoldOut(item) else {
            showToast("「\(item.name)」今日售罄", isError: true)
            return
        }
        guard let line = makeLine(item: item, size: template.size, temp: template.temp, sweetness: template.sweetness, toppingIDs: template.toppingIDs) else {
            showToast("这个规格已经不提供了", isError: true)
            return
        }
        cart.add(line)
        showToast("已加入 \(line.name)  \(line.cartSummary)")
    }

    func addToppingToLastCup(_ topping: Topping) {
        if let message = cart.addToppingToLastCup(topping, menu: menu, eatInPricing: settings.eatInPricing) {
            showToast(message, isError: true)
        } else if let last = cart.lines.last {
            showToast("已加到「\(last.name)」：\(last.cartSummary)")
        }
    }

    // MARK: - 下单

    func placeOrder(payment: PaymentMethod, cashReceived: Int? = nil, platformRef: String? = nil) -> Order? {
        rollOverIfNeeded()
        guard !cart.isEmpty else { return nil }
        let now = Date(timeIntervalSince1970: floor(Date().timeIntervalSince1970))
        let order = Order(
            id: UUID(),
            storeID: settings.storeID,
            businessDay: today,
            pickupNumber: nextPickupNumber,
            createdAt: now,
            channel: cart.channel,
            dining: cart.channel.isDelivery ? .takeOut : cart.dining,
            lines: cart.lines,
            total: cart.total,
            taxRate: cart.taxRate,
            taxAmount: cart.taxAmount,
            payment: payment,
            cashReceived: cashReceived,
            platformOrderRef: platformRef,
            status: .making,
            completedAt: nil,
            refundedAt: nil,
            online: cart.online
        )
        todayOrders.append(order)
        persistOrders(todayOrders, day: today)
        cart = Cart(channel: .inStore, dining: settings.defaultDining)
        refreshFrequent()
        if let online = order.online {
            sendOnlineStatus(online.id, .accepted, pickupNumber: order.pickupNumber)
        }
        return order
    }

    func orders(for day: String) -> [Order] {
        if day == today { return todayOrders }
        if let cached = pastOrdersCache[day] { return cached }
        let loaded = files.loadOrders(day: day)
        pastOrdersCache[day] = loaded
        return loaded
    }

    func orders(days: [String]) -> [Order] {
        days.flatMap { orders(for: $0) }
    }

    func modifyOrder(id: UUID, day: String, _ change: (inout Order) -> Void) {
        if day == today {
            guard let index = todayOrders.firstIndex(where: { $0.id == id }) else { return }
            change(&todayOrders[index])
            persistOrders(todayOrders, day: today)
            refreshFrequent()
        } else {
            var list = files.loadOrders(day: day)
            guard let index = list.firstIndex(where: { $0.id == id }) else { return }
            change(&list[index])
            persistOrders(list, day: day)
            pastOrdersCache[day] = list
            objectWillChange.send()
        }
    }

    func setStatus(_ status: OrderStatus, orderID: UUID, day: String) {
        modifyOrder(id: orderID, day: day) { order in
            order.status = status
            order.completedAt = status == .done ? Date() : nil
        }
        // 扫码单：做好了 → 顾客手机上显示「可取餐」
        if let online = orders(for: day).first(where: { $0.id == orderID })?.online {
            sendOnlineStatus(online.id, status == .done ? .ready : .accepted, pickupNumber: nil)
        }
    }

    func refund(orderID: UUID, day: String) {
        modifyOrder(id: orderID, day: day) { order in
            order.status = .refunded
            order.refundedAt = Date()
        }
        if let online = orders(for: day).first(where: { $0.id == orderID })?.online {
            sendOnlineStatus(online.id, .cancelled, pickupNumber: nil, reason: "已退款")
        }
        showToast("已登记退款")
    }

    // MARK: - 售罄

    func setSoldOut(_ itemIDs: [String], soldOut: Bool) {
        for id in itemIDs {
            guard let index = menu.items.firstIndex(where: { $0.id == id }) else { continue }
            menu.items[index].soldOutDay = soldOut ? today : nil
        }
        persistMenu()
        schedulePublish()
    }

    // MARK: - 菜单编辑（老板）

    func upsertItem(_ item: MenuItem) {
        if let index = menu.items.firstIndex(where: { $0.id == item.id }) {
            menu.items[index] = item
        } else {
            menu.items.append(item)
        }
        menuChanged()
    }

    func deleteItem(id: String) {
        menu.items.removeAll { $0.id == id }
        menuChanged()
    }

    func duplicateItem(id: String) -> MenuItem? {
        let copy = menu.duplicateItem(id: id)
        menuChanged()
        return copy
    }

    func moveItems(in categoryID: String, from source: IndexSet, to destination: Int) {
        var subset = menu.items.filter { $0.categoryID == categoryID }
        subset.move(fromOffsets: source, toOffset: destination)
        var iterator = subset.makeIterator()
        menu.items = menu.items.map { item in
            item.categoryID == categoryID ? (iterator.next() ?? item) : item
        }
        menuChanged()
    }

    func upsertTopping(_ topping: Topping, allowOnAllItems: Bool) {
        if let index = menu.toppings.firstIndex(where: { $0.id == topping.id }) {
            menu.toppings[index] = topping
        } else {
            menu.toppings.append(topping)
            if allowOnAllItems {
                for index in menu.items.indices {
                    menu.items[index].allowedToppingIDs.append(topping.id)
                }
            }
        }
        menuChanged()
    }

    func deleteTopping(id: String) {
        menu.toppings.removeAll { $0.id == id }
        for index in menu.items.indices {
            menu.items[index].allowedToppingIDs.removeAll { $0 == id }
        }
        menuChanged()
    }

    func resetMenuToSample() {
        menu = SeedMenu.menu
        menuChanged()
    }

    private func menuChanged() {
        persistMenu()
        if cart.online == nil {
            cart.reprice(menu: menu, eatInPricing: settings.eatInPricing)
        }
        schedulePublish()
    }

    // MARK: - 设置与日结

    func updateSettings(_ newValue: ShopSettings) {
        settings = newValue
        do {
            try files.saveSettings(newValue)
        } catch {
            showToast("设置保存失败：\(error.localizedDescription)", isError: true)
        }
        if cart.online == nil {
            cart.reprice(menu: menu, eatInPricing: settings.eatInPricing)
        }
        rollOverIfNeeded()
        schedulePublish()
    }

    func close(for day: String) -> DailyClose? {
        closes.first { $0.businessDay == day }
    }

    func saveClose(_ close: DailyClose) {
        closes.removeAll { $0.businessDay == close.businessDay }
        closes.append(close)
        closes.sort { $0.businessDay < $1.businessDay }
        do {
            try files.saveCloses(closes)
            showToast("日结已保存")
        } catch {
            showToast("日结保存失败：\(error.localizedDescription)", isError: true)
        }
    }

    // MARK: - 扫码点单

    var qrClient: QRClient? { QRClient(settings: settings) }
    var pendingOnlineCount: Int { onlineOrders.filter { $0.status == .received }.count }

    /// 每 5 秒由 RootView 调用：先补发失败的状态更新，再拉取有变化的扫码单
    func pollOnlineOrders() async {
        guard let client = qrClient, !isPolling else { return }
        isPolling = true
        defer { isPolling = false }
        await flushPendingOnlineUpdates(client)
        do {
            let changed = try await client.fetchOrders(since: onlineSince)
            mergeOnlineOrders(changed, notify: true)
            onlineSync.lastSync = Date()
            if pendingOnlineUpdates.isEmpty { onlineSync.error = nil }
        } catch {
            onlineSync.error = error.localizedDescription
        }
    }

    private func mergeOnlineOrders(_ changed: [OnlineOrder], notify: Bool) {
        var newOnes: [OnlineOrder] = []
        for order in changed {
            if let index = onlineOrders.firstIndex(where: { $0.id == order.id }) {
                // 本地刚改过、还没发出去的状态以本地为准
                if pendingOnlineUpdates[order.id] == nil {
                    onlineOrders[index] = order
                }
            } else {
                onlineOrders.append(order)
            }
            if order.status == .received && !seenOnlineIDs.contains(order.id) {
                newOnes.append(order)
            }
            seenOnlineIDs.insert(order.id)
            if onlineSince == nil || order.updatedAt > onlineSince! {
                onlineSince = order.updatedAt
            }
        }
        onlineOrders.sort { $0.createdAt < $1.createdAt }
        if notify && !newOnes.isEmpty {
            AudioServicesPlaySystemSound(1007)
            showToast("新扫码单 " + newOnes.map(\.numberLabel).joined(separator: "、"))
        }
    }

    /// 接扫码单：放进购物车并打开结账。购物车里有别的东西时返回 false，让界面先确认。
    @discardableResult
    func beginCheckout(_ order: OnlineOrder, replacingCart: Bool = false) -> Bool {
        if !cart.isEmpty && cart.online?.id != order.id && !replacingCart {
            return false
        }
        cart = order.makeCart()
        screenRequest = .order
        checkoutRequest = true
        return true
    }

    func rejectOnlineOrder(_ order: OnlineOrder, reason: String) {
        sendOnlineStatus(order.id, .cancelled, pickupNumber: nil, reason: reason)
        if cart.online?.id == order.id { cart.clear() }
        showToast("已拒单 \(order.numberLabel)")
    }

    /// 做好了：本地订单标记完成（顺带通知顾客）；本机没有对应订单时直接通知
    func markOnlineReady(_ order: OnlineOrder) {
        if let local = todayOrders.first(where: { $0.online?.id == order.id }) {
            setStatus(.done, orderID: local.id, day: local.businessDay)
        } else {
            sendOnlineStatus(order.id, .ready, pickupNumber: nil)
        }
    }

    func markOnlinePickedUp(_ order: OnlineOrder) {
        sendOnlineStatus(order.id, .completed, pickupNumber: nil)
    }

    func localOrder(for online: OnlineOrder) -> Order? {
        todayOrders.first { $0.online?.id == online.id }
    }

    func setQRAccepting(_ accepting: Bool) {
        var updated = settings
        updated.qrAccepting = accepting
        updateSettings(updated)
        showToast(accepting ? "扫码点单：接单中" : "扫码点单：已暂停接单")
    }

    private func sendOnlineStatus(_ id: UUID, _ status: OnlineOrderStatus, pickupNumber: Int?, reason: String? = nil) {
        // 先改本地，顾客页面在下一次请求成功后更新
        if let index = onlineOrders.firstIndex(where: { $0.id == id }) {
            onlineOrders[index].status = status
            if let pickupNumber { onlineOrders[index].pickupNumber = pickupNumber }
            if status == .cancelled { onlineOrders[index].cancelReason = reason }
        }
        let previous = pendingOnlineUpdates[id]
        pendingOnlineUpdates[id] = PendingOnlineUpdate(
            status: status,
            pickupNumber: pickupNumber ?? previous?.pickupNumber,
            reason: reason
        )
        guard let client = qrClient else { return }
        Task { @MainActor [weak self] in
            await self?.flushPendingOnlineUpdates(client)
        }
    }

    private func flushPendingOnlineUpdates(_ client: QRClient) async {
        for (id, update) in pendingOnlineUpdates {
            do {
                let saved = try await client.updateOrder(id: id, status: update.status, pickupNumber: update.pickupNumber, reason: update.reason)
                // 发送期间又有新的修改就保留，下次再发
                if pendingOnlineUpdates[id]?.status == update.status {
                    pendingOnlineUpdates[id] = nil
                }
                mergeOnlineOrders([saved], notify: false)
            } catch {
                onlineSync.error = "扫码单状态没有同步：\(error.localizedDescription)（会自动重试）"
                return
            }
        }
    }

    /// 菜单、售罄、设置变化后发布到顾客页面（合并 0.8 秒内的多次修改）
    func schedulePublish() {
        guard qrClient != nil else { return }
        publishTask?.cancel()
        publishTask = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: 800_000_000)
            guard !Task.isCancelled else { return }
            await self?.publishMenuNow()
        }
    }

    @discardableResult
    func publishMenuNow() async -> Bool {
        guard let client = qrClient else { return false }
        do {
            try await publish(with: client, settings: settings)
            onlineSync.menuPublishedAt = Date()
            onlineSync.error = nil
            return true
        } catch {
            onlineSync.error = "菜单没有发布：\(error.localizedDescription)"
            return false
        }
    }

    /// 设置页「测试连接」：用还没保存的设置试着发布一次菜单
    func testQRConnection(_ draft: ShopSettings) async -> String {
        guard draft.qrEnabled else { return "请先打开「启用扫码点单」" }
        guard let client = QRClient(settings: draft) else { return "请填写 Supabase URL、API key 和门店密钥" }
        do {
            try await publish(with: client, settings: draft)
            _ = try await client.fetchOrders(since: Date())
            return "连接成功，菜单已发布"
        } catch {
            return error.localizedDescription
        }
    }

    private func publish(with client: QRClient, settings: ShopSettings) async throws {
        let published = PublishedMenu(menu: menu, settings: settings, businessDay: today)
        try await client.publishMenu(published, accepting: settings.qrAccepting, cutoffHour: settings.dayCutoffHour)
    }

    /// 截图模式：不联网，直接放入示例扫码单
    func injectOnlineOrdersForScreenshot(_ orders: [OnlineOrder]) {
        seenOnlineIDs.formUnion(orders.map(\.id))
        onlineOrders = orders
        onlineSync.lastSync = Date()
        onlineSync.menuPublishedAt = Date()
    }

    // MARK: - 提示

    func showToast(_ text: String, isError: Bool = false) {
        let message = ToastMessage(text: text, isError: isError)
        toast = message
        Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: isError ? 3_000_000_000 : 1_600_000_000)
            if self?.toast?.id == message.id { self?.toast = nil }
        }
    }

    // MARK: - 保存

    private func persistMenu() {
        do {
            try files.saveMenu(menu)
        } catch {
            showToast("菜单保存失败：\(error.localizedDescription)", isError: true)
        }
    }

    private func persistOrders(_ orders: [Order], day: String) {
        do {
            try files.saveOrders(orders, day: day)
        } catch {
            showToast("订单保存失败：\(error.localizedDescription)", isError: true)
        }
    }

    private func refreshFrequent() {
        let todayCombos = Reports.topCombos(todayOrders)
        if !todayCombos.isEmpty {
            frequentCombos = todayCombos
            frequentIsToday = true
            return
        }
        let recentDays = (1...7).map { calendar.addingDays(-$0, to: today) }
        frequentCombos = Reports.topCombos(recentDays.flatMap { files.loadOrders(day: $0) })
        frequentIsToday = false
    }
}
