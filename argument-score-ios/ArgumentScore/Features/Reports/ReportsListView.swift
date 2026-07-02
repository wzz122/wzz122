import SwiftUI

struct ReportsListView: View {
    @Environment(ReportHistoryStore.self) private var history

    var body: some View {
        NavigationStack {
            Group {
                if history.reports.isEmpty {
                    emptyState
                } else {
                    ScrollView {
                        VStack(spacing: 12) {
                            ForEach(history.reports) { saved in
                                NavigationLink {
                                    DebateResultView(saved: saved)
                                } label: {
                                    ReportRow(saved: saved)
                                }
                                .buttonStyle(.plain)
                                .contextMenu {
                                    Button(role: .destructive) {
                                        delete(saved)
                                    } label: {
                                        Label("删除", systemImage: "trash")
                                    }
                                }
                            }
                        }
                        .padding(20)
                    }
                }
            }
            .background(DS.screenGradient.ignoresSafeArea())
            .navigationTitle("评理记录")
        }
    }

    private var emptyState: some View {
        VStack(spacing: 14) {
            Image(systemName: "tray")
                .font(.system(size: 40))
                .foregroundStyle(DS.Palette.textTertiary)
            Text("还没有评理记录")
                .font(.system(.headline, design: .rounded))
                .foregroundStyle(DS.Palette.textSecondary)
            Text("去首页开一场现场评理试试")
                .font(.system(.footnote, design: .rounded))
                .foregroundStyle(DS.Palette.textTertiary)
        }
    }

    private func delete(_ saved: SavedReport) {
        if let index = history.reports.firstIndex(where: { $0.id == saved.id }) {
            history.delete(at: IndexSet(integer: index))
        }
    }
}
