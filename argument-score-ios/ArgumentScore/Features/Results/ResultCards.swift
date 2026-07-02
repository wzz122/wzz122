import SwiftUI

/// 判决页卡片组：每张卡都是一个传播点，展示与分享共用同一套内容视图。
enum ResultCardKind: String, CaseIterable, Identifiable {
    case overview
    case coreIssue
    case bestA
    case bestB
    case mvp
    case quote
    case radar
    case repair

    var id: String { rawValue }

    var title: String {
        switch self {
        case .overview: return "总评"
        case .coreIssue: return "核心矛盾"
        case .bestA: return "A 方论点"
        case .bestB: return "B 方论点"
        case .mvp: return "本场 MVP"
        case .quote: return "评委金句"
        case .radar: return "责任雷达"
        case .repair: return "修复行动"
        }
    }
}

struct ResultCardBody: View {
    var kind: ResultCardKind
    var report: VerdictReport
    var config: SessionConfig

    private var aName: String { config.participant(.a).displayName }
    private var bName: String { config.participant(.b).displayName }

    var body: some View {
        switch kind {
        case .overview: overview
        case .coreIssue: coreIssue
        case .bestA: sideCard(report.side(.a), name: aName, color: DS.Palette.participantA)
        case .bestB: sideCard(report.side(.b), name: bName, color: DS.Palette.participantB)
        case .mvp: mvpCard
        case .quote: quoteCard
        case .radar: radarCard
        case .repair: repairCard
        }
    }

    private var overview: some View {
        VStack(spacing: 20) {
            ScoreRing(score: report.overallScore, size: 158)
            ResponsibilityBar(aShare: report.responsibility.aShare, aName: aName, bName: bName)
            Text(report.finalRemark)
                .font(.system(.footnote, design: .rounded))
                .foregroundStyle(DS.Palette.textSecondary)
                .lineLimit(5)
                .multilineTextAlignment(.leading)
        }
    }

    private var coreIssue: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("这场架真正在吵的是")
                .font(.system(.footnote, design: .rounded))
                .foregroundStyle(DS.Palette.textSecondary)
            Text(report.coreIssue)
                .font(.system(.title2, design: .rounded).weight(.bold))
                .foregroundStyle(DS.Palette.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
            Divider().overlay(DS.Palette.surfaceStroke)
            Label {
                Text(report.responsibility.note)
                    .font(.system(.footnote, design: .rounded))
                    .foregroundStyle(DS.Palette.textSecondary)
            } icon: {
                Image(systemName: "scalemass")
                    .foregroundStyle(DS.Palette.brandStart)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func sideCard(_ side: SidePanel, name: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Circle().fill(color).frame(width: 10, height: 10)
                Text(name)
                    .font(.system(.headline, design: .rounded))
                    .foregroundStyle(DS.Palette.textPrimary)
                Spacer()
                TagChip(text: "表达力 \(side.expressionScore)", tint: color)
            }
            VStack(alignment: .leading, spacing: 6) {
                Text("最佳论点")
                    .font(.system(.caption, design: .rounded).weight(.semibold))
                    .foregroundStyle(color)
                Text(side.bestPoint)
                    .font(.system(.body, design: .rounded).weight(.medium))
                    .foregroundStyle(DS.Palette.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            VStack(alignment: .leading, spacing: 6) {
                Text("盲区")
                    .font(.system(.caption, design: .rounded).weight(.semibold))
                    .foregroundStyle(DS.Palette.textTertiary)
                Text(side.blindSpot)
                    .font(.system(.footnote, design: .rounded))
                    .foregroundStyle(DS.Palette.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var mvpCard: some View {
        let name = config.displayName(forRaw: report.mvp.participant)
        let color = DS.color(forRaw: report.mvp.participant)
        return VStack(spacing: 16) {
            Image(systemName: "crown.fill")
                .font(.system(size: 40))
                .foregroundStyle(DS.Palette.warning)
            Text("本场沟通 MVP")
                .font(.system(.footnote, design: .rounded))
                .foregroundStyle(DS.Palette.textSecondary)
            Text(name)
                .font(.system(.largeTitle, design: .rounded).weight(.heavy))
                .foregroundStyle(color)
            Text(report.mvp.reason)
                .font(.system(.footnote, design: .rounded))
                .foregroundStyle(DS.Palette.textSecondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var quoteCard: some View {
        VStack(alignment: .leading, spacing: 18) {
            Image(systemName: "quote.opening")
                .font(.system(size: 26))
                .foregroundStyle(DS.Palette.brandStart)
            Text(report.goldenQuote)
                .font(.system(.title3, design: .rounded).weight(.bold))
                .foregroundStyle(DS.Palette.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
            Text("—— AI 评委")
                .font(.system(.caption, design: .rounded))
                .foregroundStyle(DS.Palette.textTertiary)
            ForEach(report.evidenceQuotes.prefix(2)) { quote in
                VStack(alignment: .leading, spacing: 4) {
                    Text("「\(quote.quote)」")
                        .font(.system(.footnote, design: .rounded).weight(.medium))
                        .foregroundStyle(DS.color(forRaw: quote.participant))
                    if let context = quote.context {
                        Text(context)
                            .font(.system(.caption2, design: .rounded))
                            .foregroundStyle(DS.Palette.textTertiary)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var radarCard: some View {
        VStack(spacing: 8) {
            Text("沟通六维雷达")
                .font(.system(.footnote, design: .rounded))
                .foregroundStyle(DS.Palette.textSecondary)
            RadarChartView(dimensions: report.radar)
                .frame(height: 240)
        }
    }

    private var repairCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 8) {
                Text("最需要说出口的一句话")
                    .font(.system(.caption, design: .rounded).weight(.semibold))
                    .foregroundStyle(DS.Palette.brandStart)
                Text(report.missingSentence)
                    .font(.system(.body, design: .rounded).weight(.semibold))
                    .foregroundStyle(DS.Palette.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Divider().overlay(DS.Palette.surfaceStroke)
            VStack(alignment: .leading, spacing: 10) {
                Text("和解动作")
                    .font(.system(.caption, design: .rounded).weight(.semibold))
                    .foregroundStyle(DS.Palette.textSecondary)
                ForEach(Array(report.repairActions.enumerated()), id: \.offset) { index, action in
                    HStack(alignment: .top, spacing: 8) {
                        Text("\(index + 1)")
                            .font(.system(.caption2, design: .rounded).weight(.bold))
                            .foregroundStyle(Color.black.opacity(0.8))
                            .frame(width: 18, height: 18)
                            .background(Circle().fill(DS.Palette.participantA))
                        Text(action)
                            .font(.system(.footnote, design: .rounded))
                            .foregroundStyle(DS.Palette.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
