import SwiftUI

/// 现场评理全流程容器：按状态机切换子界面
struct DebateFlowView: View {
    var store: DebateSessionStore
    var onExit: () -> Void

    @State private var showExitConfirm = false

    var body: some View {
        NavigationStack {
            ZStack {
                DS.screenGradient.ignoresSafeArea()
                content
                    .animation(.spring(response: 0.45, dampingFraction: 0.85), value: store.stage)
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    if store.stage != .done {
                        Button {
                            showExitConfirm = true
                        } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(DS.Palette.textSecondary)
                        }
                    }
                }
                ToolbarItem(placement: .principal) {
                    Text(store.config.mode.title)
                        .font(.system(.subheadline, design: .rounded).weight(.semibold))
                        .foregroundStyle(DS.Palette.textPrimary)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    if store.sessionCostJpy > 0 {
                        Text(String(format: "¥%.1f", store.sessionCostJpy))
                            .font(.system(.caption, design: .rounded).weight(.medium))
                            .foregroundStyle(
                                store.budgetWarning ? DS.Palette.warning : DS.Palette.textTertiary
                            )
                    }
                }
            }
            .confirmationDialog("要退出这场评理吗？", isPresented: $showExitConfirm, titleVisibility: .visible) {
                Button("退出并放弃", role: .destructive) {
                    store.abandon()
                    onExit()
                }
                Button("继续评理", role: .cancel) {}
            } message: {
                Text("已完成的回合会保留草稿，下次可以继续")
            }
        }
        .preferredColorScheme(.dark)
        .interactiveDismissDisabled()
    }

    @ViewBuilder
    private var content: some View {
        switch store.stage {
        case .handoff:
            if let slot = store.currentSlot {
                HandoffView(store: store, slot: slot)
            }
        case .recording:
            if let slot = store.currentSlot {
                DebateTurnRecorderView(store: store, slot: slot)
            }
        case .uploading:
            UploadingTurnView(store: store)
        case .turnReady:
            TurnReadyView(store: store)
        case .finalizing:
            DebateProcessingView(store: store)
        case .done:
            if let saved = store.savedReport {
                DebateResultView(saved: saved, onFinish: onExit)
            }
        case .failed(let message):
            FlowErrorView(message: message) {
                store.retry()
            } onExit: {
                store.abandon()
                onExit()
            }
        }
    }
}

// MARK: - 出错页

struct FlowErrorView: View {
    var message: String
    var onRetry: () -> Void
    var onExit: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "exclamationmark.bubble")
                .font(.system(size: 44))
                .foregroundStyle(DS.Palette.warning)
            Text("这一步出了点问题")
                .font(.system(.title3, design: .rounded).weight(.bold))
                .foregroundStyle(DS.Palette.textPrimary)
            Text(message)
                .font(.system(.footnote, design: .rounded))
                .foregroundStyle(DS.Palette.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 30)
            Button("重试") { onRetry() }
                .buttonStyle(PrimaryButtonStyle())
                .padding(.horizontal, 40)
            Button("退出") { onExit() }
                .buttonStyle(GhostButtonStyle())
        }
        .padding(24)
    }
}
