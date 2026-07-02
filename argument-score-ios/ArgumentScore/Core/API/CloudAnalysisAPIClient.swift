import Foundation

/// 真实后端客户端：只和自己的 Cloudflare Worker 通信，永不直接触碰 OpenAI/Gemini。
final class CloudAnalysisAPIClient: AnalysisAPI {
    private let baseURL: URL?
    private let token: String

    private static let session: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 600 // 整段录音转写可能很慢
        return URLSession(configuration: config)
    }()

    @MainActor
    init(settings: AppSettings) {
        self.baseURL = URL(string: settings.baseURLString)
        self.token = settings.apiToken
    }

    func createSession(config: SessionConfig) async throws -> String {
        struct Body: Encodable { let config: SessionConfig }
        struct Reply: Decodable { let sessionId: String }
        let reply: Reply = try await postJSON(path: "sessions", body: Body(config: config))
        return reply.sessionId
    }

    func submitTurn(
        sessionID: String,
        clip: RecordedClip,
        slot: TurnSlot,
        config: SessionConfig,
        sessionCostJpy: Double
    ) async throws -> (TurnAnalysis, CostMeter) {
        struct Meta: Encodable {
            let speaker: String
            let phase: String
            let roundIndex: Int
            let speakerName: String
            let otherName: String
            let topic: String?
            let sessionCostJpy: Double
        }
        struct Reply: Decodable {
            let analysis: TurnAnalysis
            let costMeter: CostMeter
        }
        let meta = Meta(
            speaker: slot.speaker.rawValue,
            phase: slot.phase.rawValue,
            roundIndex: slot.roundIndex,
            speakerName: config.participant(slot.speaker).displayName,
            otherName: config.participant(slot.speaker.other).displayName,
            topic: config.topic,
            sessionCostJpy: sessionCostJpy
        )
        let reply: Reply = try await postMultipart(
            path: "sessions/\(sessionID)/turns", audioURL: clip.fileURL, meta: meta
        )
        return (reply.analysis, reply.costMeter)
    }

    func finalize(
        sessionID: String,
        config: SessionConfig,
        turns: [TurnDigest],
        sessionCostJpy: Double
    ) async throws -> VerdictReport {
        struct Body: Encodable {
            let config: SessionConfig
            let turns: [TurnDigest]
            let sessionCostJpy: Double
        }
        return try await postJSON(
            path: "sessions/\(sessionID)/finalize",
            body: Body(config: config, turns: turns, sessionCostJpy: sessionCostJpy)
        )
    }

    func analyzeRecording(fileURL: URL, config: SessionConfig) async throws -> VerdictReport {
        struct Meta: Encodable {
            let aName: String
            let bName: String
            let tone: String
            let topic: String?
        }
        let meta = Meta(
            aName: config.participant(.a).displayName,
            bName: config.participant(.b).displayName,
            tone: config.tone.rawValue,
            topic: config.topic
        )
        return try await postMultipart(path: "analyze", audioURL: fileURL, meta: meta)
    }

    // MARK: - 传输

    private func makeRequest(path: String) throws -> URLRequest {
        guard let baseURL, let url = URL(string: path, relativeTo: baseURL) else {
            throw APIError.notConfigured
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 600
        if !token.isEmpty {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        return request
    }

    private func postJSON<Body: Encodable, Reply: Decodable>(
        path: String, body: Body
    ) async throws -> Reply {
        var request = try makeRequest(path: path)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await Self.session.data(for: request)
        return try decode(data: data, response: response)
    }

    /// multipart 体先组装到临时文件再 uploadTask(fromFile:) —— 长录音不进内存
    private func postMultipart<Meta: Encodable, Reply: Decodable>(
        path: String, audioURL: URL, meta: Meta
    ) async throws -> Reply {
        var request = try makeRequest(path: path)
        let body = try MultipartBodyFile()
        defer { body.cleanup() }
        let metaJSON = String(data: try JSONEncoder().encode(meta), encoding: .utf8) ?? "{}"
        try body.appendField(name: "meta", value: metaJSON)
        try body.appendFile(
            name: "audio",
            filename: audioURL.lastPathComponent,
            mimeType: "audio/mp4",
            fileURL: audioURL
        )
        try body.finish()
        request.setValue(
            "multipart/form-data; boundary=\(body.boundary)", forHTTPHeaderField: "Content-Type"
        )
        let (data, response) = try await Self.session.upload(for: request, fromFile: body.fileURL)
        return try decode(data: data, response: response)
    }

    private func decode<Reply: Decodable>(data: Data, response: URLResponse) throws -> Reply {
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            struct ServerError: Decodable { let error: String }
            let message = (try? JSONDecoder().decode(ServerError.self, from: data))?.error
                ?? "服务器错误（\(http.statusCode)）"
            throw APIError.server(status: http.statusCode, message: message)
        }
        do {
            return try JSONDecoder().decode(Reply.self, from: data)
        } catch {
            throw APIError.invalidResponse
        }
    }
}

/// 把 multipart 请求体流式写进临时文件
private final class MultipartBodyFile {
    let boundary = "ArgumentScore-\(UUID().uuidString)"
    let fileURL: URL
    private let handle: FileHandle

    init() throws {
        fileURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("upload-\(UUID().uuidString).tmp")
        FileManager.default.createFile(atPath: fileURL.path, contents: nil)
        handle = try FileHandle(forWritingTo: fileURL)
    }

    func appendField(name: String, value: String) throws {
        try write("--\(boundary)\r\n")
        try write("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n")
        try write(value)
        try write("\r\n")
    }

    func appendFile(name: String, filename: String, mimeType: String, fileURL src: URL) throws {
        try write("--\(boundary)\r\n")
        try write("Content-Disposition: form-data; name=\"\(name)\"; filename=\"\(filename)\"\r\n")
        try write("Content-Type: \(mimeType)\r\n\r\n")
        let input = try FileHandle(forReadingFrom: src)
        defer { try? input.close() }
        while let chunk = try input.read(upToCount: 1 << 20), !chunk.isEmpty {
            try handle.write(contentsOf: chunk)
        }
        try write("\r\n")
    }

    func finish() throws {
        try write("--\(boundary)--\r\n")
        try handle.close()
    }

    func cleanup() {
        try? FileManager.default.removeItem(at: fileURL)
    }

    private func write(_ string: String) throws {
        try handle.write(contentsOf: Data(string.utf8))
    }
}
