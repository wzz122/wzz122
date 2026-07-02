import SwiftUI
import UIKit

/// 开场配置：双方称呼、议题、评委文风
struct DebateSetupView: View {
    var mode: DebateMode

    @Environment(AppSettings.self) private var settings
    @Environment(ReportHistoryStore.self) private var history

    @State private var nameA = "男方"
    @State private var nameB = "女方"
    @State private var topic = ""
    @State private var tone: Tone = .gentle
    @State private var activeStore: DebateSessionStore?
    @State private var showMicAlert = false

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                VStack(alignment: .leading, spacing: 14) {
                    SectionHeader(title: "双方称呼（可改成任意两个人）")
                    nameField(binding: $nameA, color: DS.Palette.participantA, placeholder: "先说的一方")
                    nameField(binding: $nameB, color: DS.Palette.participantB, placeholder: "后说的一方")
                }
                .padding(18)
                .cardStyle()

                VStack(alignment: .leading, spacing: 14) {
                    SectionHeader(title: "这次吵的是什么？（可选）")
                    TextField("例如：周末要不要回父母家", text: $topic)
                        .font(.system(.body, design: .rounded))
                        .foregroundStyle(DS.Palette.textPrimary)
                        .padding(12)
                        .background(
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .fill(Color.white.opacity(0.04))
                        )
                }
                .padding(18)
                .cardStyle()

                VStack(alignment: .leading, spacing: 14) {
                    SectionHeader(title: "评委文风")
                    Picker("评委文风", selection: $tone) {
                        ForEach(Tone.allCases, id: \.self) { tone in
                            Text(tone.title).tag(tone)
                        }
                    }
                    .pickerStyle(.segmented)
                    Text(tone == .roast
                         ? "毒舌只锐评论证方式，不攻击人"
                         : "诚恳具体，给双方台阶下")
                        .font(.system(.caption, design: .rounded))
                        .foregroundStyle(DS.Palette.textTertiary)
                }
                .padding(18)
                .cardStyle()

                Button("开始评理") {
                    startSession()
                }
                .buttonStyle(PrimaryButtonStyle())
                .padding(.top, 8)

                Text("双方均同意录音后再开始 · 音频仅用于本次分析")
                    .font(.system(.caption2, design: .rounded))
                    .foregroundStyle(DS.Palette.textTertiary)
            }
            .padding(20)
        }
        .background(DS.screenGradient.ignoresSafeArea())
        .navigationTitle(mode.title)
        .navigationBarTitleDisplayMode(.inline)
        .fullScreenCover(item: $activeStore) { store in
            DebateFlowView(store: store) {
                activeStore = nil
            }
        }
        .alert("需要麦克风权限", isPresented: $showMicAlert) {
            Button("去设置") {
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    UIApplication.shared.open(url)
                }
            }
            Button("取消", role: .cancel) {}
        } message: {
            Text("现场评理需要录音，请在系统设置里允许冷静报告使用麦克风")
        }
    }

    private func nameField(binding: Binding<String>, color: Color, placeholder: String) -> some View {
        HStack(spacing: 10) {
            Circle().fill(color).frame(width: 10, height: 10)
            TextField(placeholder, text: binding)
                .font(.system(.body, design: .rounded))
                .foregroundStyle(DS.Palette.textPrimary)
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.white.opacity(0.04))
        )
    }

    private func startSession() {
        Task {
            guard await AudioRecorderService.requestPermission() else {
                showMicAlert = true
                return
            }
            let config = SessionConfig(
                mode: mode,
                topic: topic.trimmingCharacters(in: .whitespaces).isEmpty ? nil : topic,
                tone: tone,
                participants: [
                    Participant(id: .a, displayName: nameA.isEmpty ? "男方" : nameA),
                    Participant(id: .b, displayName: nameB.isEmpty ? "女方" : nameB),
                ]
            )
            SessionDraft.clear() // 新开一场，丢弃旧草稿
            activeStore = DebateSessionStore(
                config: config,
                api: makeAnalysisAPI(settings: settings),
                history: history
            )
        }
    }
}
