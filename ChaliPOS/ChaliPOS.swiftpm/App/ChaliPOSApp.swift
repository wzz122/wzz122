import SwiftUI

@main
struct ChaliPOSApp: App {
    @StateObject private var store = ScreenshotMode.isActive ? ScreenshotMode.makeStore() : AppStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .preferredColorScheme(.light)
                .tint(Theme.green)
        }
    }
}
