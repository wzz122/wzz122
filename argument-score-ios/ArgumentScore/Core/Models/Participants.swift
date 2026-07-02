import Foundation

enum ParticipantID: String, Codable, CaseIterable, Hashable {
    case a = "A"
    case b = "B"

    var other: ParticipantID { self == .a ? .b : .a }
}

struct Participant: Codable, Hashable, Identifiable {
    var id: ParticipantID
    var displayName: String
}

enum Tone: String, Codable, CaseIterable, Hashable {
    case roast
    case gentle

    var title: String { self == .roast ? "毒舌评委" : "温和教练" }
}

struct SessionConfig: Codable, Hashable {
    var mode: DebateMode
    var topic: String?
    var tone: Tone
    var participants: [Participant]

    func participant(_ id: ParticipantID) -> Participant {
        participants.first(where: { $0.id == id })
            ?? Participant(id: id, displayName: id == .a ? "男方" : "女方")
    }

    /// 报告 JSON 里的 participant 字段是 "A"/"B" 字符串，这里统一解析成显示名
    func displayName(forRaw raw: String) -> String {
        participant(raw == "B" ? .b : .a).displayName
    }

    static func makeDefault(mode: DebateMode) -> SessionConfig {
        SessionConfig(
            mode: mode,
            topic: nil,
            tone: .gentle,
            participants: [
                Participant(id: .a, displayName: "男方"),
                Participant(id: .b, displayName: "女方"),
            ]
        )
    }
}
