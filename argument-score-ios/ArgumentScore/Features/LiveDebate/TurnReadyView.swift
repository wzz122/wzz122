import SwiftUI

/// 回合小结页：等待交接时展示 AI 对上一回合的即时分析
struct TurnReadyView: View {
    var store: DebateSessionStore

    private var nextSpeakerName: String? {
        guard store.index + 1 < store.script.count else { return nil }
        return store.config.participant(store.script[store.index + 1].speaker).displayName
    }

    var body: some View {
        VStack(spacing: 0) {
            PhaseProgressView(slots: store.script, currentIndex: store.index)
                .padding(.top, 8)

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let digest = store.digests.last, let analysis = store.lastAnalysis {
                        let speaker = store.config.participant(digest.speaker)
                        let color = DS.color(for: digest.speaker)

                        HStack {
                            Circle().fill(color).frame(width: 9, height: 9)
                            Text("\(speaker.displayName) · \(digest.phase.title)")
                                .font(.system(.subheadline, design: .rounded).weight(.semibold))
                                .foregroundStyle(DS.Palette.textPrimary)
                            Spacer()
                            TagChip(text: "AI 小结", tint: DS.Palette.brandStart)
                        }

                        Text(analysis.compactSummary)
                            .font(.system(.body, design: .rounded))
                            .foregroundStyle(DS.Palette.textPrimary)
                            .fixedSize(horizontal: false, vertical: true)

                        if !analysis.claims.isEmpty {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("论点")
                                    .font(.system(.caption, design: .rounded).weight(.semibold))
                                    .foregroundStyle(DS.Palette.textSecondary)
                                ForEach(analysis.claims, id: \.self) { claim in
                                    HStack(alignment: .top, spacing: 6) {
                                        Image(systemName: "arrow.turn.down.right")
                                            .font(.system(size: 10))
                                            .foregroundStyle(color)
                                            .padding(.top, 3)
                                        Text(claim)
                                            .font(.system(.footnote, design: .rounded))
                                            .foregroundStyle(DS.Palette.textSecondary)
                                    }
                                }
                            }
                        }

                        if !analysis.roundTake.isEmpty {
                            HStack(alignment: .top, spacing: 8) {
                                Image(systemName: "quote.bubble.fill")
                                    .font(.system(size: 13))
                                    .foregroundStyle(DS.Palette.warning)
                                Text(analysis.roundTake)
                                    .font(.system(.footnote, design: .rounded))
                                    .foregroundStyle(DS.Palette.textSecondary)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            .padding(12)
                            .background(
                                RoundedRectangle(cornerRadius: 12, style: .continuous)
                                    .fill(DS.Palette.warning.opacity(0.08))
                            )
                        }

                        if !analysis.fallacies.isEmpty {
                            HStack(spacing: 6) {
                                ForEach(analysis.fallacies, id: \.self) { fallacy in
                                    TagChip(text: fallacy, tint: DS.Palette.danger)
                                }
                            }
                        }
                    }
                }
                .padding(20)
                .frame(maxWidth: .infinity, alignment: .leading)
                .cardStyle()
                .padding(.top, 20)
            }

            Spacer(minLength: 0)

            if store.budgetWarning {
                Label("接近本场预算上限，建议尽快收尾", systemImage: "yensign.circle")
                    .font(.system(.caption, design: .rounded))
                    .foregroundStyle(DS.Palette.warning)
                    .padding(.bottom, 10)
            }

            Button(nextSpeakerName.map { "交给 \($0)" } ?? "生成终评") {
                store.advance()
            }
            .buttonStyle(PrimaryButtonStyle())
        }
        .padding(24)
    }
}
