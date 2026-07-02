import Foundation

struct CostMeter: Codable, Hashable {
    var thisCallJpy: Double
    var sessionTotalJpy: Double
    var budgetWarning: Bool
}

struct ResponsibilitySplit: Codable, Hashable {
    var aShare: Int
    var note: String
}

struct SidePanel: Codable, Hashable, Identifiable {
    var participant: String
    var bestPoint: String
    var blindSpot: String
    var expressionScore: Int
    var id: String { participant }
}

struct MVPVerdict: Codable, Hashable {
    var participant: String
    var reason: String
}

struct EvidenceQuote: Codable, Hashable, Identifiable {
    var participant: String
    var quote: String
    var context: String?
    var id: String { participant + quote }
}

struct RadarDimension: Codable, Hashable, Identifiable {
    var dimension: String
    var score: Int
    var id: String { dimension }
}

struct RoundNote: Codable, Hashable, Identifiable {
    var roundIndex: Int
    var phase: String
    var note: String
    var sharperSide: String?
    var id: String { "\(phase)-\(roundIndex)-\(note.prefix(8))" }
}

struct TranscriptLine: Codable, Hashable {
    var speaker: String
    var text: String
}

struct VerdictReport: Codable, Hashable {
    var mode: DebateMode
    var coreIssue: String
    var overallScore: Int
    var responsibility: ResponsibilitySplit
    var sides: [SidePanel]
    var mvp: MVPVerdict
    var goldenQuote: String
    var evidenceQuotes: [EvidenceQuote]
    var radar: [RadarDimension]
    var roundNotes: [RoundNote]?
    var repairActions: [String]
    var missingSentence: String
    var finalRemark: String
    var disclaimer: String
    var transcriptLines: [TranscriptLine]?
    var costMeter: CostMeter?

    func side(_ id: ParticipantID) -> SidePanel {
        sides.first(where: { $0.participant == id.rawValue })
            ?? SidePanel(participant: id.rawValue, bestPoint: "—", blindSpot: "—", expressionScore: 50)
    }
}

/// 历史记录条目：报告 + 会话配置 + 时间
struct SavedReport: Codable, Hashable, Identifiable {
    let id: UUID
    let createdAt: Date
    var config: SessionConfig
    var report: VerdictReport

    var title: String { report.coreIssue }

    init(config: SessionConfig, report: VerdictReport) {
        self.id = UUID()
        self.createdAt = Date()
        self.config = config
        self.report = report
    }
}
