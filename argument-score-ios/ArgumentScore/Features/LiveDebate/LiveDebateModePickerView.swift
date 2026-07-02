import SwiftUI

/// 现场评理模式选择页
struct LiveDebateModePickerView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(ReportHistoryStore.self) private var history

    @State private var draft: SessionDraft?
    @State private var activeStore: DebateSessionStore?

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                if let draft {
                    draftBanner(draft)
                }

                modeCard(
                    mode: .quick,
                    icon: "bolt.fill",
                    subtitle: "各说 1 分钟，评委直接出终评",
                    duration: "约 3 分钟",
                    costLevel: "¥"
                )
                modeCard(
                    mode: .rounds,
                    icon: "arrow.left.arrow.right",
                    subtitle: "前情 → 开篇 → 两轮反驳 → 总结",
                    duration: "约 10 分钟",
                    costLevel: "¥¥",
                    highlight: true
                )
                comingSoonCard
            }
            .padding(20)
        }
        .background(DS.screenGradient.ignoresSafeArea())
        .navigationTitle("现场评理")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { draft = SessionDraft.load() }
        .fullScreenCover(item: $activeStore) { store in
            DebateFlowView(store: store) {
                activeStore = nil
                draft = SessionDraft.load()
            }
        }
    }

    private func modeCard(
        mode: DebateMode,
        icon: String,
        subtitle: String,
        duration: String,
        costLevel: String,
        highlight: Bool = false
    ) -> some View {
        NavigationLink {
            DebateSetupView(mode: mode)
        } label: {
            HStack(spacing: 16) {
                Image(systemName: icon)
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(highlight ? AnyShapeStyle(DS.brandGradient) : AnyShapeStyle(DS.Palette.textSecondary))
                    .frame(width: 46, height: 46)
                    .background(
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .fill(DS.Palette.surface)
                    )
                VStack(alignment: .leading, spacing: 5) {
                    HStack(spacing: 8) {
                        Text(mode.title)
                            .font(.system(.headline, design: .rounded))
                            .foregroundStyle(DS.Palette.textPrimary)
                        if highlight {
                            TagChip(text: "主打", tint: DS.Palette.brandEnd)
                        }
                    }
                    Text(subtitle)
                        .font(.system(.footnote, design: .rounded))
                        .foregroundStyle(DS.Palette.textSecondary)
                    HStack(spacing: 10) {
                        Label(duration, systemImage: "clock")
                        Label(costLevel, systemImage: "yensign.circle")
                    }
                    .font(.system(.caption2, design: .rounded))
                    .foregroundStyle(DS.Palette.textTertiary)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(DS.Palette.textTertiary)
            }
            .padding(18)
            .cardStyle()
        }
        .buttonStyle(.plain)
    }

    private var comingSoonCard: some View {
        HStack(spacing: 16) {
            Image(systemName: "waveform")
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(DS.Palette.textTertiary)
                .frame(width: 46, height: 46)
                .background(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(DS.Palette.surface)
                )
            VStack(alignment: .leading, spacing: 5) {
                Text("连续录音评审")
                    .font(.system(.headline, design: .rounded))
                    .foregroundStyle(DS.Palette.textTertiary)
                Text("从头录到尾，AI 自动切回合 · 即将上线")
                    .font(.system(.footnote, design: .rounded))
                    .foregroundStyle(DS.Palette.textTertiary)
            }
            Spacer()
        }
        .padding(18)
        .cardStyle()
        .opacity(0.6)
    }

    private func draftBanner(_ draft: SessionDraft) -> some View {
        HStack(spacing: 12) {
            Button {
                activeStore = DebateSessionStore(
                    draft: draft,
                    api: makeAnalysisAPI(settings: settings),
                    history: history
                )
            } label: {
                HStack(spacing: 12) {
                    Image(systemName: "arrow.uturn.backward.circle.fill")
                        .font(.system(size: 24))
                        .foregroundStyle(DS.Palette.warning)
                    VStack(alignment: .leading, spacing: 3) {
                        Text("继续上次未完成的评理")
                            .font(.system(.subheadline, design: .rounded).weight(.semibold))
                            .foregroundStyle(DS.Palette.textPrimary)
                        Text("\(draft.config.mode.title) · 已完成 \(draft.digests.count) 个回合")
                            .font(.system(.caption, design: .rounded))
                            .foregroundStyle(DS.Palette.textSecondary)
                    }
                    Spacer()
                }
            }
            .buttonStyle(.plain)

            Button {
                SessionDraft.clear()
                self.draft = nil
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .foregroundStyle(DS.Palette.textTertiary)
            }
            .buttonStyle(.plain)
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: DS.Radius.card, style: .continuous)
                .fill(DS.Palette.warning.opacity(0.10))
                .overlay(
                    RoundedRectangle(cornerRadius: DS.Radius.card, style: .continuous)
                        .strokeBorder(DS.Palette.warning.opacity(0.25), lineWidth: 1)
                )
        )
    }
}
