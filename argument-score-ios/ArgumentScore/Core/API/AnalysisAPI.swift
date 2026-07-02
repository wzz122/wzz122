import Foundation

protocol AnalysisAPI {
    func createSession(config: SessionConfig) async throws -> String
    func submitTurn(
        sessionID: String,
        clip: RecordedClip,
        slot: TurnSlot,
        config: SessionConfig,
        sessionCostJpy: Double
    ) async throws -> (TurnAnalysis, CostMeter)
    func finalize(
        sessionID: String,
        config: SessionConfig,
        turns: [TurnDigest],
        sessionCostJpy: Double
    ) async throws -> VerdictReport
    func analyzeRecording(fileURL: URL, config: SessionConfig) async throws -> VerdictReport
}

enum APIError: LocalizedError {
    case server(status: Int, message: String)
    case invalidResponse
    case notConfigured

    var errorDescription: String? {
        switch self {
        case .server(_, let message): return message
        case .invalidResponse: return "服务器返回了无法解析的内容"
        case .notConfigured: return "请先在设置里填写服务地址和访问令牌"
        }
    }
}

@MainActor
func makeAnalysisAPI(settings: AppSettings) -> any AnalysisAPI {
    settings.useMock ? MockAnalysisAPIClient() : CloudAnalysisAPIClient(settings: settings)
}
