import SwiftUI

/// 判决页：可横滑的截图卡片组 + 回合点评 + 逐字稿 + 成本
struct DebateResultView: View {
    @State var saved: SavedReport
    /// 从评理流程进入时传入，显示"完成"按钮
    var onFinish: (() -> Void)? = nil

    @Environment(ReportHistoryStore.self) private var history
    @State private var shareItem: ShareItem?
    @State private var selectedCard: ResultCardKind = .overview

    private var report: VerdictReport { saved.report }
    private var config: SessionConfig { saved.config }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                cardDeck

                if let notes = report.roundNotes, !notes.isEmpty {
                    roundNotesSection(notes)
                }

                if let lines = report.transcriptLines, !lines.isEmpty {
                    transcriptSection(lines)
                }

                footer

                if let onFinish {
                    Button("完成") { onFinish() }
                        .buttonStyle(PrimaryButtonStyle())
                        .padding(.top, 4)
                }
            }
            .padding(20)
        }
        .background(DS.screenGradient.ignoresSafeArea())
        .navigationTitle("评理报告")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $shareItem) { item in
            ShareSheet(items: [item.image])
        }
    }

    // MARK: - 卡片组

    private var cardDeck: some View {
        VStack(spacing: 10) {
            TabView(selection: $selectedCard) {
                ForEach(ResultCardKind.allCases) { kind in
                    VStack(spacing: 0) {
                        HStack {
                            TagChip(text: kind.title)
                            Spacer()
                            Button {
                                shareCard(kind)
                            } label: {
                                Image(systemName: "square.and.arrow.up")
                                    .font(.system(size: 15, weight: .semibold))
                                    .foregroundStyle(DS.Palette.textSecondary)
                            }
                        }
                        .padding(.bottom, 14)

                        ResultCardBody(kind: kind, report: report, config: config)
                            .frame(maxHeight: .infinity)
                    }
                    .padding(20)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .cardStyle()
                    .padding(.horizontal, 4)
                    .tag(kind)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .frame(height: 430)

            // 自定义页点
            HStack(spacing: 6) {
                ForEach(ResultCardKind.allCases) { kind in
                    Circle()
                        .fill(kind == selectedCard ? DS.Palette.brandStart : DS.Palette.textTertiary)
                        .frame(width: 6, height: 6)
                }
            }
        }
    }

    private func shareCard(_ kind: ResultCardKind) {
        if let image = ShareCardRenderer.render(content: {
            ResultCardBody(kind: kind, report: report, config: config)
        }) {
            shareItem = ShareItem(image: image)
            Haptics.impact(.light)
        }
    }

    // MARK: - 回合点评

    private func roundNotesSection(_ notes: [RoundNote]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(title: "逐回合点评")
            ForEach(notes) { note in
                HStack(alignment: .top, spacing: 10) {
                    if let side = note.sharperSide {
                        Circle()
                            .fill(DS.color(forRaw: side))
                            .frame(width: 8, height: 8)
                            .padding(.top, 5)
                    } else {
                        Circle()
                            .fill(DS.Palette.textTertiary)
                            .frame(width: 8, height: 8)
                            .padding(.top, 5)
                    }
                    VStack(alignment: .leading, spacing: 3) {
                        Text(phaseTitle(note.phase) + " · 第 \(note.roundIndex + 1) 轮")
                            .font(.system(.caption2, design: .rounded))
                            .foregroundStyle(DS.Palette.textTertiary)
                        Text(note.note)
                            .font(.system(.footnote, design: .rounded))
                            .foregroundStyle(DS.Palette.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardStyle()
    }

    private func phaseTitle(_ raw: String) -> String {
        DebatePhase(rawValue: raw)?.title ?? raw
    }

    // MARK: - 逐字稿

    private func transcriptSection(_ lines: [TranscriptLine]) -> some View {
        DisclosureGroup {
            VStack(alignment: .leading, spacing: 12) {
                ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                    HStack(alignment: .top, spacing: 8) {
                        Text(config.displayName(forRaw: line.speaker))
                            .font(.system(.caption, design: .rounded).weight(.bold))
                            .foregroundStyle(DS.color(forRaw: line.speaker))
                            .frame(width: 56, alignment: .leading)
                        Text(line.text)
                            .font(.system(.footnote, design: .rounded))
                            .foregroundStyle(DS.Palette.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .padding(.top, 10)
        } label: {
            Label("完整逐字稿", systemImage: "text.quote")
                .font(.system(.subheadline, design: .rounded).weight(.medium))
                .foregroundStyle(DS.Palette.textPrimary)
        }
        .padding(18)
        .cardStyle()
        .tint(DS.Palette.textSecondary)
    }

    // MARK: - 页脚

    private var footer: some View {
        VStack(spacing: 10) {
            if report.mode == .postmortem {
                Button("双方称呼标反了？一键互换") {
                    swapParticipants()
                }
                .buttonStyle(GhostButtonStyle())
            }
            if let cost = report.costMeter {
                Text(String(format: "本场评理成本 ≈ ¥%.1f 日元", cost.sessionTotalJpy))
                    .font(.system(.caption, design: .rounded))
                    .foregroundStyle(DS.Palette.textTertiary)
            }
            Text(report.disclaimer)
                .font(.system(.caption2, design: .rounded))
                .foregroundStyle(DS.Palette.textTertiary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
    }

    private func swapParticipants() {
        let aName = saved.config.participant(.a).displayName
        let bName = saved.config.participant(.b).displayName
        saved.config.participants = [
            Participant(id: .a, displayName: bName),
            Participant(id: .b, displayName: aName),
        ]
        history.update(saved)
        Haptics.impact(.light)
    }
}
