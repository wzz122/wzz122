import Foundation
import Observation

@MainActor
@Observable
final class ReportHistoryStore {
    private(set) var reports: [SavedReport] = []

    private let fileURL: URL = {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("reports.json")
    }()

    init() {
        load()
    }

    func add(_ report: SavedReport) {
        reports.insert(report, at: 0)
        save()
    }

    func delete(at offsets: IndexSet) {
        reports.remove(atOffsets: offsets)
        save()
    }

    func update(_ report: SavedReport) {
        guard let index = reports.firstIndex(where: { $0.id == report.id }) else { return }
        reports[index] = report
        save()
    }

    var latest: SavedReport? { reports.first }

    private func load() {
        guard let data = try? Data(contentsOf: fileURL) else { return }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        reports = (try? decoder.decode([SavedReport].self, from: data)) ?? []
    }

    private func save() {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        guard let data = try? encoder.encode(reports) else { return }
        try? data.write(to: fileURL, options: .atomic)
    }
}
