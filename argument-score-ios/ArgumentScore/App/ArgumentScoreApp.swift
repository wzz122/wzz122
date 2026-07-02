import SwiftUI

@main
@MainActor
struct ArgumentScoreApp: App {
    @State private var settings = AppSettings()
    @State private var history = ReportHistoryStore()

    var body: some Scene {
        WindowGroup {
            RootTabView()
                .environment(settings)
                .environment(history)
                .preferredColorScheme(.dark)
                .tint(DS.Palette.brandStart)
        }
    }
}

struct RootTabView: View {
    var body: some View {
        TabView {
            HomeView()
                .tabItem { Label("首页", systemImage: "house.fill") }
            ReportsListView()
                .tabItem { Label("记录", systemImage: "list.bullet.rectangle.fill") }
            SettingsView()
                .tabItem { Label("设置", systemImage: "gearshape.fill") }
        }
    }
}
