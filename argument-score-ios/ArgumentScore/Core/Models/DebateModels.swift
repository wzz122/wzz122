import Foundation

enum DebateMode: String, Codable, Hashable {
    case quick
    case rounds
    case postmortem

    var title: String {
        switch self {
        case .quick: return "快速评理"
        case .rounds: return "回合制"
        case .postmortem: return "事后复盘"
        }
    }
}

enum DebatePhase: String, Codable, Hashable, CaseIterable {
    case context
    case opening
    case rebuttal
    case summary

    var title: String {
        switch self {
        case .context: return "前情"
        case .opening: return "开篇"
        case .rebuttal: return "反驳"
        case .summary: return "总结"
        }
    }

    var guidance: String {
        switch self {
        case .context: return "用 30–60 秒讲讲事情的来龙去脉"
        case .opening: return "说出你的核心观点和理由"
        case .rebuttal: return "回应对方刚才的说法，别跑题"
        case .summary: return "用一句话总结你最想被听见的点"
        }
    }
}

struct TurnSlot: Codable, Hashable, Identifiable {
    var id = UUID()
    var speaker: ParticipantID
    var phase: DebatePhase
    var roundIndex: Int
    var limit: TimeInterval
    var skippable: Bool
}

/// Worker /turns 返回的单回合分析结果
struct TurnAnalysis: Codable, Hashable {
    var transcript: String
    var stance: String
    var claims: [String]
    var evidenceQuotes: [String]
    var emotionalCues: [String]
    var fallacies: [String]
    var compactSummary: String
    var roundTake: String
}

/// 回合分析 + 回合元信息，finalize 时整体传回后端（扁平结构与后端 JSON 对齐）
struct TurnDigest: Codable, Hashable, Identifiable {
    var id = UUID()
    var speaker: ParticipantID
    var phase: DebatePhase
    var roundIndex: Int
    var transcript: String
    var stance: String
    var claims: [String]
    var evidenceQuotes: [String]
    var emotionalCues: [String]
    var fallacies: [String]
    var compactSummary: String
    var roundTake: String

    init(slot: TurnSlot, analysis: TurnAnalysis) {
        self.speaker = slot.speaker
        self.phase = slot.phase
        self.roundIndex = slot.roundIndex
        self.transcript = analysis.transcript
        self.stance = analysis.stance
        self.claims = analysis.claims
        self.evidenceQuotes = analysis.evidenceQuotes
        self.emotionalCues = analysis.emotionalCues
        self.fallacies = analysis.fallacies
        self.compactSummary = analysis.compactSummary
        self.roundTake = analysis.roundTake
    }
}

enum DebateScript {
    /// 生成一场评理的回合脚本。确定性生成：草稿恢复时按 mode 重建即可。
    static func slots(for mode: DebateMode) -> [TurnSlot] {
        switch mode {
        case .quick:
            return pair(phase: .opening, roundIndex: 0, limit: 60, skippable: false)
        case .rounds:
            return pair(phase: .context, roundIndex: 0, limit: 60, skippable: true)
                + pair(phase: .opening, roundIndex: 0, limit: 60, skippable: false)
                + pair(phase: .rebuttal, roundIndex: 1, limit: 60, skippable: false)
                + pair(phase: .rebuttal, roundIndex: 2, limit: 60, skippable: false)
                + pair(phase: .summary, roundIndex: 0, limit: 45, skippable: true)
        case .postmortem:
            return []
        }
    }

    private static func pair(
        phase: DebatePhase, roundIndex: Int, limit: TimeInterval, skippable: Bool
    ) -> [TurnSlot] {
        [
            TurnSlot(speaker: .a, phase: phase, roundIndex: roundIndex, limit: limit, skippable: skippable),
            TurnSlot(speaker: .b, phase: phase, roundIndex: roundIndex, limit: limit, skippable: skippable),
        ]
    }
}
