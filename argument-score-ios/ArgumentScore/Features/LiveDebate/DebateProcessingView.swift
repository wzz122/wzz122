import SwiftUI

/// 终评生成页：分阶段进度 + 趣味文案轮换
struct DebateProcessingView: View {
    var store: DebateSessionStore

    private static let captions = [
        "正在检查谁偷换了概念…",
        "正在寻找本场金句…",
        "正在测量情绪热度…",
        "正在评选本场 MVP…",
        "评委正在合议…",
    ]

    var body: some View {
        VStack(spacing: 28) {
            Spacer()

            ZStack {
                Circle()
                    .stroke(Color.white.opacity(0.08), lineWidth: 10)
                    .frame(width: 110, height: 110)
                Circle()
                    .trim(from: 0, to: 0.28)
                    .stroke(
                        DS.brandGradient,
                        style: StrokeStyle(lineWidth: 10, lineCap: .round)
                    )
                    .frame(width: 110, height: 110)
                    .rotationEffect(.degrees(rotation))
                    .animation(
                        .linear(duration: 1.1).repeatForever(autoreverses: false),
                        value: rotation
                    )
                Image(systemName: "sparkles")
                    .font(.system(size: 30))
                    .foregroundStyle(DS.Palette.textPrimary)
            }
            .onAppear { rotation = 360 }

            VStack(spacing: 14) {
                stageRow(done: true, text: "已录制 \(store.completedTurnCount) 个回合")
                stageRow(done: true, text: "逐回合分析完成")
                TimelineView(.periodic(from: .now, by: 2)) { context in
                    let index = Int(context.date.timeIntervalSince1970 / 2)
                        % Self.captions.count
                    stageRow(done: false, text: Self.captions[index])
                }
            }

            Spacer()

            Text("终评只读各回合摘要，不重复消耗全文 token")
                .font(.system(.caption2, design: .rounded))
                .foregroundStyle(DS.Palette.textTertiary)
                .padding(.bottom, 12)
        }
        .padding(24)
    }

    @State private var rotation: Double = 0

    private func stageRow(done: Bool, text: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: done ? "checkmark.circle.fill" : "circle.dotted")
                .font(.system(size: 16))
                .foregroundStyle(done ? DS.Palette.participantA : DS.Palette.brandStart)
            Text(text)
                .font(.system(.subheadline, design: .rounded))
                .foregroundStyle(done ? DS.Palette.textSecondary : DS.Palette.textPrimary)
        }
        .frame(width: 260, alignment: .leading)
    }
}
