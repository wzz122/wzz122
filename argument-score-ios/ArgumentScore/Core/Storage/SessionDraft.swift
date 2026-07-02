import Foundation

/// 进行中评理的落盘快照：每完成一回合写一次，App 被杀/崩溃后可从断点恢复。
struct SessionDraft: Codable {
    var config: SessionConfig
    var sessionID: String?
    var index: Int
    var digests: [TurnDigest]
    var sessionCostJpy: Double

    private static let fileURL: URL = {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("session-draft.json")
    }()

    static func load() -> SessionDraft? {
        guard let data = try? Data(contentsOf: fileURL) else { return nil }
        return try? JSONDecoder().decode(SessionDraft.self, from: data)
    }

    func save() {
        guard let data = try? JSONEncoder().encode(self) else { return }
        try? data.write(to: Self.fileURL, options: .atomic)
    }

    static func clear() {
        try? FileManager.default.removeItem(at: fileURL)
    }
}
