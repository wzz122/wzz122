import SwiftUI

/// 交接手机过场页：轮到谁说话，把仪式感做足
struct HandoffView: View {
    var store: DebateSessionStore
    var slot: TurnSlot

    private var speaker: Participant { store.config.participant(slot.speaker) }
    private var color: Color { DS.color(for: slot.speaker) }

    var body: some View {
        VStack(spacing: 0) {
            PhaseProgressView(slots: store.script, currentIndex: store.index)
                .padding(.top, 8)

            Spacer()

            ZStack {
                Circle()
                    .fill(color.opacity(0.14))
                    .frame(width: 180, height: 180)
                Circle()
                    .fill(color.opacity(0.22))
                    .frame(width: 132, height: 132)
                Text(String(speaker.displayName.prefix(1)))
                    .font(.system(size: 56, weight: .heavy, design: .rounded))
                    .foregroundStyle(color)
            }
            .padding(.bottom, 26)

            Text("请把手机交给")
                .font(.system(.subheadline, design: .rounded))
                .foregroundStyle(DS.Palette.textSecondary)
            Text(speaker.displayName)
                .font(.system(.largeTitle, design: .rounded).weight(.heavy))
                .foregroundStyle(DS.Palette.textPrimary)
                .padding(.top, 2)

            HStack(spacing: 8) {
                TagChip(text: slot.phase.title + "阶段", tint: color)
                TagChip(text: "限时 \(Int(slot.limit)) 秒", tint: DS.Palette.textSecondary)
            }
            .padding(.top, 12)

            Text(slot.phase.guidance)
                .font(.system(.footnote, design: .rounded))
                .foregroundStyle(DS.Palette.textSecondary)
                .padding(.top, 8)

            if let topic = store.config.topic, !topic.isEmpty {
                Text("议题：\(topic)")
                    .font(.system(.caption, design: .rounded))
                    .foregroundStyle(DS.Palette.textTertiary)
                    .padding(.top, 4)
            }

            Spacer()

            if store.budgetWarning {
                Label("本场快到预算上限了，建议尽快进入总结", systemImage: "yensign.circle")
                    .font(.system(.caption, design: .rounded))
                    .foregroundStyle(DS.Palette.warning)
                    .padding(.bottom, 10)
            }

            Button("我准备好了，开始说") {
                store.beginRecording()
            }
            .buttonStyle(PrimaryButtonStyle(tint: color))

            if slot.skippable {
                Button("跳过这一段") {
                    store.skipCurrentSlot()
                }
                .buttonStyle(GhostButtonStyle())
                .padding(.top, 8)
            }
        }
        .padding(24)
    }
}
