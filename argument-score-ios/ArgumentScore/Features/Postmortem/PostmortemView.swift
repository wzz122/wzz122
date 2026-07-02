import SwiftUI
import UniformTypeIdentifiers

/// 事后复盘：导入整段录音 → diarization → 复盘报告
struct PostmortemView: View {
    @Environment(AppSettings.self) private var settings
    @Environment(ReportHistoryStore.self) private var history

    @State private var nameA = "男方"
    @State private var nameB = "女方"
    @State private var topic = ""
    @State private var tone: Tone = .gentle
    @State private var pickedFile: URL?
    @State private var showImporter = false
    @State private var isAnalyzing = false
    @State private var errorMessage: String?
    @State private var result: SavedReport?

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                importCard

                VStack(alignment: .leading, spacing: 14) {
                    SectionHeader(title: "双方称呼")
                    HStack(spacing: 10) {
                        Circle().fill(DS.Palette.participantA).frame(width: 10, height: 10)
                        TextField("先出现的一方", text: $nameA)
                            .font(.system(.body, design: .rounded))
                    }
                    HStack(spacing: 10) {
                        Circle().fill(DS.Palette.participantB).frame(width: 10, height: 10)
                        TextField("后出现的一方", text: $nameB)
                            .font(.system(.body, design: .rounded))
                    }
                    Text("AI 按说话顺序分离双方；报告页可一键互换称呼")
                        .font(.system(.caption2, design: .rounded))
                        .foregroundStyle(DS.Palette.textTertiary)
                }
                .padding(18)
                .cardStyle()

                VStack(alignment: .leading, spacing: 14) {
                    SectionHeader(title: "议题与文风")
                    TextField("这次吵的是什么？（可选）", text: $topic)
                        .font(.system(.body, design: .rounded))
                    Picker("评委文风", selection: $tone) {
                        ForEach(Tone.allCases, id: \.self) { tone in
                            Text(tone.title).tag(tone)
                        }
                    }
                    .pickerStyle(.segmented)
                }
                .padding(18)
                .cardStyle()

                if let errorMessage {
                    Label(errorMessage, systemImage: "exclamationmark.triangle")
                        .font(.system(.footnote, design: .rounded))
                        .foregroundStyle(DS.Palette.danger)
                }

                Button {
                    analyze()
                } label: {
                    if isAnalyzing {
                        HStack(spacing: 10) {
                            ProgressView().tint(.black)
                            Text("AI 正在复盘，长录音可能需要几分钟…")
                        }
                    } else {
                        Text("开始复盘")
                    }
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(pickedFile == nil || isAnalyzing)
                .opacity(pickedFile == nil ? 0.5 : 1)

                Text("整段复盘需要说话人分离，成本高于现场评理（约 ¥60/小时）")
                    .font(.system(.caption2, design: .rounded))
                    .foregroundStyle(DS.Palette.textTertiary)
                    .multilineTextAlignment(.center)
            }
            .padding(20)
        }
        .background(DS.screenGradient.ignoresSafeArea())
        .navigationTitle("事后复盘")
        .navigationBarTitleDisplayMode(.inline)
        .fileImporter(
            isPresented: $showImporter,
            allowedContentTypes: [.audio],
            allowsMultipleSelection: false
        ) { outcome in
            handlePick(outcome)
        }
        .navigationDestination(item: $result) { saved in
            DebateResultView(saved: saved)
        }
    }

    private var importCard: some View {
        Button {
            showImporter = true
        } label: {
            VStack(spacing: 12) {
                Image(systemName: pickedFile == nil ? "square.and.arrow.down" : "checkmark.circle.fill")
                    .font(.system(size: 34))
                    .foregroundStyle(pickedFile == nil
                                     ? AnyShapeStyle(DS.brandGradient)
                                     : AnyShapeStyle(DS.Palette.participantA))
                Text(pickedFile?.lastPathComponent ?? "导入争吵录音")
                    .font(.system(.headline, design: .rounded))
                    .foregroundStyle(DS.Palette.textPrimary)
                    .lineLimit(1)
                Text(pickedFile == nil
                     ? "支持 m4a 等音频 · 上限 75 分钟"
                     : "点击可重新选择")
                    .font(.system(.caption, design: .rounded))
                    .foregroundStyle(DS.Palette.textTertiary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 32)
            .cardStyle()
        }
        .buttonStyle(.plain)
    }

    private func handlePick(_ outcome: Result<[URL], Error>) {
        errorMessage = nil
        guard case .success(let urls) = outcome, let url = urls.first else { return }
        // security-scoped 资源先复制进沙盒再用
        guard url.startAccessingSecurityScopedResource() else {
            errorMessage = "无法读取所选文件"
            return
        }
        defer { url.stopAccessingSecurityScopedResource() }
        let dest = FileManager.default.temporaryDirectory
            .appendingPathComponent("import-\(UUID().uuidString)-\(url.lastPathComponent)")
        do {
            try FileManager.default.copyItem(at: url, to: dest)
            pickedFile = dest
        } catch {
            errorMessage = "导入失败：\(error.localizedDescription)"
        }
    }

    private func analyze() {
        guard let fileURL = pickedFile else { return }
        isAnalyzing = true
        errorMessage = nil
        let config = SessionConfig(
            mode: .postmortem,
            topic: topic.trimmingCharacters(in: .whitespaces).isEmpty ? nil : topic,
            tone: tone,
            participants: [
                Participant(id: .a, displayName: nameA.isEmpty ? "男方" : nameA),
                Participant(id: .b, displayName: nameB.isEmpty ? "女方" : nameB),
            ]
        )
        let api = makeAnalysisAPI(settings: settings)
        Task {
            defer { isAnalyzing = false }
            do {
                let report = try await api.analyzeRecording(fileURL: fileURL, config: config)
                let saved = SavedReport(config: config, report: report)
                history.add(saved)
                result = saved
                Haptics.success()
            } catch {
                errorMessage = error.localizedDescription
                Haptics.error()
            }
        }
    }
}
