import SwiftUI

struct HomeView: View {
    @Environment(ReportHistoryStore.self) private var history

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    hero

                    NavigationLink {
                        LiveDebateModePickerView()
                    } label: {
                        entryCard(
                            icon: "mic.fill",
                            iconStyle: AnyShapeStyle(DS.brandGradient),
                            title: "现场评理",
                            subtitle: "快速评理 · 回合制交锋",
                            badge: "主打"
                        )
                    }
                    .buttonStyle(.plain)

                    NavigationLink {
                        PostmortemView()
                    } label: {
                        entryCard(
                            icon: "waveform.and.magnifyingglass",
                            iconStyle: AnyShapeStyle(DS.Palette.textSecondary),
                            title: "事后复盘",
                            subtitle: "导入整段录音，AI 分离双方发言",
                            badge: nil
                        )
                    }
                    .buttonStyle(.plain)

                    if !history.reports.isEmpty {
                        recentSection
                    }
                }
                .padding(20)
            }
            .background(DS.screenGradient.ignoresSafeArea())
            .navigationTitle("冷静报告")
            .navigationBarTitleDisplayMode(.large)
        }
    }

    // MARK: - Hero

    @ViewBuilder
    private var hero: some View {
        if let latest = history.latest {
            NavigationLink {
                DebateResultView(saved: latest)
            } label: {
                VStack(spacing: 14) {
                    ScoreRing(score: latest.report.overallScore, size: 150, caption: "上一场沟通总分")
                    ResponsibilityBar(
                        aShare: latest.report.responsibility.aShare,
                        aName: latest.config.participant(.a).displayName,
                        bName: latest.config.participant(.b).displayName
                    )
                    Text(latest.report.coreIssue)
                        .font(.system(.footnote, design: .rounded))
                        .foregroundStyle(DS.Palette.textSecondary)
                        .lineLimit(2)
                        .multilineTextAlignment(.center)
                }
                .padding(22)
                .frame(maxWidth: .infinity)
                .cardStyle()
            }
            .buttonStyle(.plain)
        } else {
            VStack(spacing: 14) {
                ZStack {
                    Circle()
                        .stroke(DS.brandGradient, style: StrokeStyle(lineWidth: 12, lineCap: .round))
                        .frame(width: 120, height: 120)
                        .opacity(0.9)
                    Image(systemName: "scalemass.fill")
                        .font(.system(size: 36))
                        .foregroundStyle(DS.Palette.textPrimary)
                }
                Text("今天也别吵输了逻辑")
                    .font(.system(.headline, design: .rounded))
                    .foregroundStyle(DS.Palette.textPrimary)
                Text("吵架不可怕，吵完不明白才可怕。\n让 AI 评委帮你们把话说清楚。")
                    .font(.system(.footnote, design: .rounded))
                    .foregroundStyle(DS.Palette.textSecondary)
                    .multilineTextAlignment(.center)
            }
            .padding(26)
            .frame(maxWidth: .infinity)
            .cardStyle()
        }
    }

    // MARK: - 入口卡片

    private func entryCard(
        icon: String,
        iconStyle: AnyShapeStyle,
        title: String,
        subtitle: String,
        badge: String?
    ) -> some View {
        HStack(spacing: 16) {
            Image(systemName: icon)
                .font(.system(size: 22, weight: .semibold))
                .foregroundStyle(iconStyle)
                .frame(width: 48, height: 48)
                .background(
                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                        .fill(DS.Palette.surface)
                )
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Text(title)
                        .font(.system(.headline, design: .rounded))
                        .foregroundStyle(DS.Palette.textPrimary)
                    if let badge {
                        TagChip(text: badge, tint: DS.Palette.brandEnd)
                    }
                }
                Text(subtitle)
                    .font(.system(.footnote, design: .rounded))
                    .foregroundStyle(DS.Palette.textSecondary)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(DS.Palette.textTertiary)
        }
        .padding(18)
        .cardStyle()
    }

    // MARK: - 最近记录

    private var recentSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(title: "最近的报告")
            ForEach(history.reports.prefix(3)) { saved in
                NavigationLink {
                    DebateResultView(saved: saved)
                } label: {
                    ReportRow(saved: saved)
                }
                .buttonStyle(.plain)
            }
        }
    }
}

/// 报告列表行（首页和记录页共用）
struct ReportRow: View {
    var saved: SavedReport

    var body: some View {
        HStack(spacing: 14) {
            Text("\(saved.report.overallScore)")
                .font(.system(.headline, design: .rounded).weight(.heavy))
                .foregroundStyle(DS.scoreColor(saved.report.overallScore))
                .frame(width: 44, height: 44)
                .background(Circle().fill(DS.Palette.surface))
            VStack(alignment: .leading, spacing: 4) {
                Text(saved.report.coreIssue)
                    .font(.system(.subheadline, design: .rounded).weight(.medium))
                    .foregroundStyle(DS.Palette.textPrimary)
                    .lineLimit(1)
                HStack(spacing: 8) {
                    TagChip(text: saved.report.mode.title, tint: DS.Palette.textSecondary)
                    Text(saved.createdAt.formatted(date: .abbreviated, time: .shortened))
                        .font(.system(.caption2, design: .rounded))
                        .foregroundStyle(DS.Palette.textTertiary)
                }
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(DS.Palette.textTertiary)
        }
        .padding(14)
        .cardStyle()
    }
}
