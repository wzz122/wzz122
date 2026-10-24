import SwiftUI

enum Screen: String, CaseIterable, Identifiable {
    case order
    case orders
    case qr
    case soldOut
    case close
    case admin

    var id: String { rawValue }

    var title: String {
        switch self {
        case .order: return "点单"
        case .orders: return "订单"
        case .qr: return "扫码"
        case .soldOut: return "售罄"
        case .close: return "日结"
        case .admin: return "管理"
        }
    }

    var icon: String {
        switch self {
        case .order: return "cup.and.saucer.fill"
        case .orders: return "list.bullet.rectangle"
        case .qr: return "qrcode.viewfinder"
        case .soldOut: return "nosign"
        case .close: return "yensign.circle"
        case .admin: return "lock.shield"
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.scenePhase) private var scenePhase
    @State private var screen: Screen = ScreenshotMode.initialScreen

    private let dayTimer = Timer.publish(every: 30, on: .main, in: .common).autoconnect()
    private let onlineTimer = Timer.publish(every: 5, on: .main, in: .common).autoconnect()

    var body: some View {
        VStack(spacing: 0) {
            TopBar(screen: $screen)
            Divider()
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(Theme.background.ignoresSafeArea())
        .overlay(alignment: .bottom) { ToastOverlay() }
        .animation(.easeOut(duration: 0.2), value: store.toast)
        .onAppear {
            // 收银机不自动锁屏
            UIApplication.shared.isIdleTimerDisabled = true
            store.schedulePublish()
        }
        .onReceive(dayTimer) { _ in
            store.rollOverIfNeeded()
        }
        .onReceive(onlineTimer) { _ in
            guard scenePhase == .active else { return }
            Task { await store.pollOnlineOrders() }
        }
        .onChange(of: scenePhase) { phase in
            if phase == .active { store.rollOverIfNeeded() }
        }
        .onChange(of: store.screenRequest) { request in
            if let request {
                screen = request
                store.screenRequest = nil
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch screen {
        case .order: OrderScreen()
        case .orders: OrdersScreen()
        case .qr: QRInboxScreen()
        case .soldOut: SoldOutScreen()
        case .close: DailyCloseScreen()
        case .admin: AdminScreen()
        }
    }
}

private struct TopBar: View {
    @EnvironmentObject private var store: AppStore
    @Binding var screen: Screen

    var body: some View {
        HStack(spacing: 12) {
            HStack(spacing: 6) {
                Text(store.settings.shopName)
                    .font(.system(size: 24, weight: .heavy))
                    .foregroundColor(Theme.green)
                    .lineLimit(1)
                Text("POS")
                    .font(.system(size: 11, weight: .heavy))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .foregroundColor(.white)
                    .background(Capsule().fill(Theme.green))
            }
            .layoutPriority(1)

            Spacer(minLength: 8)

            // 竖屏放不下时去掉图标
            ViewThatFits(in: .horizontal) {
                tabs(showIcons: true)
                tabs(showIcons: false)
            }

            Spacer(minLength: 8)

            TimelineView(.everyMinute) { context in
                VStack(alignment: .trailing, spacing: 0) {
                    Text(store.calendar.timeString(context.date))
                        .font(.system(size: 20, weight: .semibold, design: .rounded))
                        .monospacedDigit()
                    Text("今日 \(store.todayOrders.filter { !$0.isRefunded }.count) 单")
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                }
            }
        }
        .padding(.horizontal, 16)
        .frame(height: 60)
        .background(Color.white)
    }

    private func badge(for item: Screen) -> Int {
        switch item {
        case .orders: return store.makingCount
        case .qr: return store.pendingOnlineCount
        case .soldOut: return store.soldOutCount
        default: return 0
        }
    }

    private func badgeColor(for item: Screen) -> Color {
        switch item {
        case .soldOut: return Theme.danger
        case .qr: return Theme.pink
        default: return Theme.statusColor(.making)
        }
    }

    private func tabs(showIcons: Bool) -> some View {
        HStack(spacing: 4) {
            ForEach(Screen.allCases) { item in
                tabButton(item, showIcon: showIcons)
            }
        }
    }

    private func tabButton(_ item: Screen, showIcon: Bool) -> some View {
        let selected = screen == item
        let count = badge(for: item)
        return Button {
            screen = item
        } label: {
            HStack(spacing: 6) {
                if showIcon {
                    Image(systemName: item.icon)
                }
                Text(item.title)
                if count > 0 {
                    Text("\(count)")
                        .font(.system(size: 12, weight: .bold))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 1)
                        .foregroundColor(.white)
                        .background(Capsule().fill(badgeColor(for: item)))
                }
            }
            .font(.system(size: 17, weight: .semibold))
            .fixedSize()
            .padding(.horizontal, 12)
            .frame(height: 42)
            .foregroundColor(selected ? .white : Theme.ink)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(selected ? Theme.green : Color.clear)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
