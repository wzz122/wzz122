import Foundation

/// 演示模式客户端：全流程本地 fixture，不发网络请求、不消耗 API 费用。
/// SwiftUI Preview、App Store 审核演示、无后端试用都走这里。
final class MockAnalysisAPIClient: AnalysisAPI {

    func createSession(config: SessionConfig) async throws -> String {
        try await Task.sleep(nanoseconds: 300_000_000)
        return "mock-session"
    }

    func submitTurn(
        sessionID: String,
        clip: RecordedClip,
        slot: TurnSlot,
        config: SessionConfig,
        sessionCostJpy: Double
    ) async throws -> (TurnAnalysis, CostMeter) {
        try await Task.sleep(nanoseconds: 1_200_000_000)
        let name = config.participant(slot.speaker).displayName
        let fixtures = Self.turnFixtures
        var analysis = fixtures[abs(slot.roundIndex * 2 + (slot.speaker == .a ? 0 : 1)) % fixtures.count]
        analysis.stance = "\(name)：" + analysis.stance
        let total = sessionCostJpy + 0.5
        return (
            analysis,
            CostMeter(thisCallJpy: 0.5, sessionTotalJpy: total, budgetWarning: total >= 80)
        )
    }

    func finalize(
        sessionID: String,
        config: SessionConfig,
        turns: [TurnDigest],
        sessionCostJpy: Double
    ) async throws -> VerdictReport {
        try await Task.sleep(nanoseconds: 2_500_000_000)
        var report = Self.verdictFixture(mode: config.mode)
        report.roundNotes = turns.enumerated().map { index, turn in
            RoundNote(
                roundIndex: turn.roundIndex,
                phase: turn.phase.rawValue,
                note: index % 2 == 0
                    ? "这一回合 A 更抓住了问题本身，B 有点扩大化"
                    : "B 用具体例子接住了话头，A 开始重复自己",
                sharperSide: index % 2 == 0 ? "A" : "B"
            )
        }
        report.transcriptLines = turns.map {
            TranscriptLine(speaker: $0.speaker.rawValue, text: $0.transcript)
        }
        report.costMeter = CostMeter(
            thisCallJpy: 1.5, sessionTotalJpy: sessionCostJpy + 1.5, budgetWarning: false
        )
        return report
    }

    func analyzeRecording(fileURL: URL, config: SessionConfig) async throws -> VerdictReport {
        try await Task.sleep(nanoseconds: 3_000_000_000)
        var report = Self.verdictFixture(mode: .postmortem)
        report.transcriptLines = [
            TranscriptLine(speaker: "A", text: "我不是说不去，我是说这周真的排不开。"),
            TranscriptLine(speaker: "B", text: "你每次都说排不开，上个月也是这句话。"),
            TranscriptLine(speaker: "A", text: "上个月是项目上线，你明明知道的。"),
            TranscriptLine(speaker: "B", text: "我知道，所以我才提前两周跟你说这次的事。"),
        ]
        report.costMeter = CostMeter(thisCallJpy: 38.2, sessionTotalJpy: 38.2, budgetWarning: false)
        return report
    }

    // MARK: - Fixtures

    private static let turnFixtures: [TurnAnalysis] = [
        TurnAnalysis(
            transcript: "我不是不想陪你，是这周工作真的堆到喘不过气，你提的时间点我实在动不了。",
            stance: "不是态度问题，是这周客观没时间",
            claims: ["本周工作量客观超载", "拒绝的是时间点，不是事情本身"],
            evidenceQuotes: ["我不是不想陪你，是这周真的堆到喘不过气"],
            emotionalCues: ["语气疲惫", "带一点委屈"],
            fallacies: [],
            compactSummary: "主张本周客观没时间，强调拒绝的是时间点而非陪伴本身，情绪偏疲惫。",
            roundTake: "抓住了争点，但没有给出替代方案，容易被理解为推脱。"
        ),
        TurnAnalysis(
            transcript: "问题不是这一次，是每一次都这样，我已经不记得上次你主动安排是什么时候了。",
            stance: "单次拒绝背后是长期模式",
            claims: ["拒绝已成模式而非偶发", "对方缺乏主动性"],
            evidenceQuotes: ["我已经不记得上次你主动安排是什么时候了"],
            emotionalCues: ["失望累积", "语气升级"],
            fallacies: ["扩大化：从这一次推到'每一次'"],
            compactSummary: "把单次冲突升级为长期模式指控，核心诉求是希望对方主动，存在扩大化。",
            roundTake: "诉求真实但'每一次'的说法在扩大化，给了对方反驳空间。"
        ),
        TurnAnalysis(
            transcript: "你说每一次，那上上周六是谁推掉聚会陪你去看展的？我觉得你只记得我没做到的。",
            stance: "用反例反驳'每一次'的指控",
            claims: ["存在明确反例", "对方存在选择性记忆"],
            evidenceQuotes: ["上上周六是谁推掉聚会陪你去看展的？"],
            emotionalCues: ["带反问", "防御姿态"],
            fallacies: [],
            compactSummary: "拿出具体反例击破'每一次'，但顺势指责对方选择性记忆，攻防转换。",
            roundTake: "反例有效，但'你只记得'的反击让话题从议题滑向互相指责。"
        ),
        TurnAnalysis(
            transcript: "好，我承认不是每一次。但我真正想说的是，我不想每次都当那个先开口的人。",
            stance: "退一步，说出真实诉求",
            claims: ["收回'每一次'的说法", "核心诉求是不想总当发起方"],
            evidenceQuotes: ["我不想每次都当那个先开口的人"],
            emotionalCues: ["语气放软", "袒露脆弱"],
            fallacies: [],
            compactSummary: "主动让步并说出真实诉求：希望对方也当主动发起的一方，情绪转向袒露。",
            roundTake: "本场最高质量的一回合：让步+说出真诉求，把争吵拉回沟通。"
        ),
    ]

    private static func verdictFixture(mode: DebateMode) -> VerdictReport {
        VerdictReport(
            mode: mode,
            coreIssue: "这场架真正在吵的不是'这周去不去'，而是'谁来当主动安排的那个人'",
            overallScore: 72,
            responsibility: ResponsibilitySplit(
                aShare: 44,
                note: "A 的拒绝方式缺少替代方案，B 的表达存在扩大化，责任略偏 B"
            ),
            sides: [
                SidePanel(
                    participant: "A",
                    bestPoint: "用具体反例（推掉聚会陪看展）精准击破了'每一次'的指控",
                    blindSpot: "只顾自证清白，没接住对方'希望你主动'的真实诉求",
                    expressionScore: 74
                ),
                SidePanel(
                    participant: "B",
                    bestPoint: "最终说出'不想每次都当先开口的人'，把争吵拉回了真问题",
                    blindSpot: "开场的'每一次都这样'是扩大化，白送了对方一个反驳点",
                    expressionScore: 78
                ),
            ],
            mvp: MVPVerdict(
                participant: "B",
                reason: "敢于当场收回过头话并袒露真实诉求，这是本场唯一一次让沟通前进的发言"
            ),
            goldenQuote: "你们吵的是日程表，疼的是安全感。",
            evidenceQuotes: [
                EvidenceQuote(
                    participant: "B",
                    quote: "我不想每次都当那个先开口的人",
                    context: "全场真正的诉求句，比前面所有指控都有效"
                ),
                EvidenceQuote(
                    participant: "A",
                    quote: "上上周六是谁推掉聚会陪你去看展的？",
                    context: "有效反例，但用反问句式说出来，防御大于沟通"
                ),
            ],
            radar: [
                RadarDimension(dimension: "争点清晰度", score: 68),
                RadarDimension(dimension: "证据密度", score: 74),
                RadarDimension(dimension: "倾听程度", score: 55),
                RadarDimension(dimension: "情绪热度", score: 62),
                RadarDimension(dimension: "逻辑漏洞", score: 58),
                RadarDimension(dimension: "修复空间", score: 85),
            ],
            roundNotes: nil,
            repairActions: [
                "A 本周内主动发起一次具体的安排（时间地点都定好再开口）",
                "B 把'每一次'改成'最近三次里有两次'，指控降级、可信度升级",
                "两人约定：拒绝时必须附带一个替代时间",
            ],
            missingSentence: "「我知道你累，我也想你——这两件事可以同时成立。」",
            finalRemark: "这场吵得其实很有质量：有反例、有让步、有真诚诉求，就是顺序反了——如果 B 的最后一句话放在开头，这场架根本吵不起来。评委建议：把'谁主动'做成轮值制，别做成考试。",
            disclaimer: "沟通责任估计，不代表事实裁决 · 评分用于复盘和娱乐 · AI 仅基于双方陈述，不代表全部事实",
            transcriptLines: nil,
            costMeter: nil
        )
    }
}
