import Foundation
import Observation

/// 现场评理的核心状态机：回合脚本推进、录音、上传、终评、草稿恢复。
@MainActor
@Observable
final class DebateSessionStore: Identifiable {
    enum Stage: Equatable {
        case handoff        // 等待当前发言人接过手机
        case recording
        case uploading      // 上传 + 单回合分析中
        case turnReady      // 展示本回合 AI 小结
        case finalizing
        case done
        case failed(String)
    }

    private enum PendingAction {
        case submitTurn(RecordedClip)
        case finalize
    }

    let id = UUID()
    let recorder = AudioRecorderService()

    private(set) var config: SessionConfig
    private(set) var script: [TurnSlot]
    private(set) var index: Int
    private(set) var digests: [TurnDigest] = []
    private(set) var stage: Stage = .handoff
    private(set) var sessionCostJpy: Double = 0
    private(set) var budgetWarning = false
    private(set) var lastAnalysis: TurnAnalysis?
    private(set) var savedReport: SavedReport?

    private var sessionID: String?
    private var pendingAction: PendingAction?
    private let api: any AnalysisAPI
    private let history: ReportHistoryStore

    var currentSlot: TurnSlot? { index < script.count ? script[index] : nil }
    var isLastSlot: Bool { index == script.count - 1 }
    var completedTurnCount: Int { digests.count }

    init(config: SessionConfig, api: any AnalysisAPI, history: ReportHistoryStore) {
        self.config = config
        self.script = DebateScript.slots(for: config.mode)
        self.index = 0
        self.api = api
        self.history = history
    }

    /// 从落盘草稿恢复
    init(draft: SessionDraft, api: any AnalysisAPI, history: ReportHistoryStore) {
        self.config = draft.config
        self.script = DebateScript.slots(for: draft.config.mode)
        self.index = min(draft.index, DebateScript.slots(for: draft.config.mode).count)
        self.digests = draft.digests
        self.sessionCostJpy = draft.sessionCostJpy
        self.sessionID = draft.sessionID
        self.api = api
        self.history = history
        if currentSlot == nil {
            finalizeSession()
        }
    }

    // MARK: - 录音

    func beginRecording() {
        guard let slot = currentSlot else { return }
        recorder.onAutoStop = { [weak self] clip in
            Task { @MainActor in
                Haptics.impact(.heavy)
                self?.submit(clip)
            }
        }
        do {
            try recorder.start(limit: slot.limit)
            stage = .recording
            Haptics.impact(.medium)
        } catch {
            stage = .failed("无法开始录音：\(error.localizedDescription)")
        }
    }

    func finishRecording() {
        guard let clip = recorder.stop() else {
            stage = .failed("这一段太短了，没录到有效内容")
            pendingAction = nil
            return
        }
        submit(clip)
    }

    func skipCurrentSlot() {
        guard let slot = currentSlot, slot.skippable else { return }
        index += 1
        saveDraft()
        if currentSlot == nil {
            finalizeSession()
        } else {
            stage = .handoff
        }
    }

    // MARK: - 上传与推进

    private func submit(_ clip: RecordedClip) {
        guard let slot = currentSlot else { return }
        stage = .uploading
        pendingAction = .submitTurn(clip)
        Task {
            do {
                let sid = try await ensureSession()
                let (analysis, cost) = try await api.submitTurn(
                    sessionID: sid,
                    clip: clip,
                    slot: slot,
                    config: config,
                    sessionCostJpy: sessionCostJpy
                )
                digests.append(TurnDigest(slot: slot, analysis: analysis))
                sessionCostJpy = cost.sessionTotalJpy
                budgetWarning = cost.budgetWarning
                lastAnalysis = analysis
                pendingAction = nil
                try? FileManager.default.removeItem(at: clip.fileURL)
                saveDraft()
                stage = .turnReady
                Haptics.success()
            } catch {
                stage = .failed(error.localizedDescription)
            }
        }
    }

    /// turnReady 之后：交给下一个人，或进入终评
    func advance() {
        index += 1
        saveDraft()
        if currentSlot == nil {
            finalizeSession()
        } else {
            stage = .handoff
        }
    }

    func finalizeSession() {
        stage = .finalizing
        pendingAction = .finalize
        Task {
            do {
                let sid = try await ensureSession()
                var report = try await api.finalize(
                    sessionID: sid,
                    config: config,
                    turns: digests,
                    sessionCostJpy: sessionCostJpy
                )
                if report.transcriptLines == nil {
                    report.transcriptLines = digests.map {
                        TranscriptLine(speaker: $0.speaker.rawValue, text: $0.transcript)
                    }
                }
                let saved = SavedReport(config: config, report: report)
                history.add(saved)
                savedReport = saved
                pendingAction = nil
                SessionDraft.clear()
                stage = .done
                Haptics.success()
            } catch {
                stage = .failed(error.localizedDescription)
            }
        }
    }

    func retry() {
        switch pendingAction {
        case .submitTurn(let clip):
            submit(clip)
        case .finalize:
            finalizeSession()
        case nil:
            stage = currentSlot == nil ? .finalizing : .handoff
            if currentSlot == nil { finalizeSession() }
        }
    }

    /// 用户主动退出：清理录音和草稿
    func abandon() {
        recorder.cancel()
        SessionDraft.clear()
    }

    // MARK: - 私有

    private func ensureSession() async throws -> String {
        if let sessionID { return sessionID }
        let sid = try await api.createSession(config: config)
        sessionID = sid
        return sid
    }

    private func saveDraft() {
        SessionDraft(
            config: config,
            sessionID: sessionID,
            index: index,
            digests: digests,
            sessionCostJpy: sessionCostJpy
        ).save()
    }
}
