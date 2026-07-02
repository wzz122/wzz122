import SwiftUI

/// 回合录音页：大倒计时环 + 电平呼吸 + 最后10秒警示
struct DebateTurnRecorderView: View {
    var store: DebateSessionStore
    var slot: TurnSlot

    private var speaker: Participant { store.config.participant(slot.speaker) }
    private var color: Color { DS.color(for: slot.speaker) }
    private var elapsed: TimeInterval { store.recorder.elapsed }
    private var remaining: TimeInterval { max(0, slot.limit - elapsed) }
    private var isEnding: Bool { remaining <= 10 }
    private var ringColor: Color { isEnding ? DS.Palette.danger : color }

    var body: some View {
        VStack(spacing: 0) {
            PhaseProgressView(slots: store.script, currentIndex: store.index)
                .padding(.top, 8)

            Spacer()

            HStack(spacing: 8) {
                Circle().fill(color).frame(width: 9, height: 9)
                Text("\(speaker.displayName) 正在发言")
                    .font(.system(.headline, design: .rounded))
                    .foregroundStyle(DS.Palette.textPrimary)
            }
            .padding(.bottom, 30)

            ZStack {
                // 电平呼吸圈
                Circle()
                    .fill(ringColor.opacity(0.10))
                    .frame(width: 230, height: 230)
                    .scaleEffect(1 + store.recorder.level * 0.22)
                    .animation(.easeOut(duration: 0.1), value: store.recorder.level)

                Circle()
                    .stroke(Color.white.opacity(0.08), lineWidth: 16)
                    .frame(width: 210, height: 210)

                Circle()
                    .trim(from: 0, to: min(1, elapsed / slot.limit))
                    .stroke(ringColor, style: StrokeStyle(lineWidth: 16, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .frame(width: 210, height: 210)
                    .animation(.linear(duration: 0.1), value: elapsed)

                VStack(spacing: 4) {
                    Text(timeString(remaining))
                        .font(.system(size: 52, weight: .heavy, design: .rounded))
                        .foregroundStyle(isEnding ? DS.Palette.danger : DS.Palette.textPrimary)
                        .monospacedDigit()
                    Text("剩余时间")
                        .font(.system(.caption, design: .rounded))
                        .foregroundStyle(DS.Palette.textSecondary)
                }
            }
            .onChange(of: Int(remaining)) { _, newValue in
                if newValue <= 10 && newValue > 0 && store.recorder.isRecording {
                    Haptics.impact(.light)
                }
            }

            Text(slot.phase.guidance)
                .font(.system(.footnote, design: .rounded))
                .foregroundStyle(DS.Palette.textSecondary)
                .padding(.top, 28)

            Spacer()

            Button(store.isLastSlot ? "说完了，请评委终评" : "说完了，交给对方") {
                Haptics.impact(.medium)
                store.finishRecording()
            }
            .buttonStyle(PrimaryButtonStyle(tint: color))
        }
        .padding(24)
    }

    private func timeString(_ interval: TimeInterval) -> String {
        let total = Int(interval.rounded())
        return String(format: "%d:%02d", total / 60, total % 60)
    }
}

/// 上传 + 单回合分析等待页
struct UploadingTurnView: View {
    var store: DebateSessionStore

    var body: some View {
        VStack(spacing: 18) {
            ProgressView()
                .controlSize(.large)
                .tint(DS.Palette.brandStart)
            Text("AI 正在听这一回合…")
                .font(.system(.headline, design: .rounded))
                .foregroundStyle(DS.Palette.textPrimary)
            Text("转写 → 提炼论点 → 记下证据句")
                .font(.system(.caption, design: .rounded))
                .foregroundStyle(DS.Palette.textTertiary)
        }
        .padding(24)
    }
}
