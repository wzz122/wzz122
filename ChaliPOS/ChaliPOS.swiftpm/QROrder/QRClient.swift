import Foundation

/// 调用 Supabase 上的 chali_* 数据库函数（没有用 SDK，Swift Playgrounds 里也能编译）
struct QRClient {
    let restURL: URL
    let apiKey: String
    let storeID: String
    let staffKey: String

    init?(settings: ShopSettings) {
        guard settings.isQRConfigured else { return nil }
        self.init(
            projectURL: settings.qrSupabaseURL,
            apiKey: settings.qrAnonKey,
            storeID: settings.storeID,
            staffKey: settings.qrStaffKey
        )
    }

    init?(projectURL: String, apiKey: String, storeID: String, staffKey: String) {
        let trimmed = projectURL.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let base = URL(string: trimmed.hasSuffix("/") ? String(trimmed.dropLast()) : trimmed),
              base.scheme == "https" || base.scheme == "http",
              base.host != nil else { return nil }
        restURL = base.appendingPathComponent("rest/v1")
        self.apiKey = apiKey.trimmingCharacters(in: .whitespacesAndNewlines)
        self.storeID = storeID
        self.staffKey = staffKey.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    struct ServerError: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    // MARK: - 接口

    func publishMenu(_ menu: PublishedMenu, accepting: Bool, cutoffHour: Int) async throws {
        let menuObject = try JSONSerialization.jsonObject(with: OnlineJSON.encoder.encode(menu))
        let _: PublishResult = try await call("chali_staff_publish_menu", [
            "p_store": storeID,
            "p_key": staffKey,
            "p_menu": menuObject,
            "p_accepting": accepting,
            "p_cutoff_hour": cutoffHour,
        ])
    }

    func fetchOrders(since: Date?) async throws -> [OnlineOrder] {
        var body: [String: Any] = ["p_store": storeID, "p_key": staffKey]
        if let since {
            body["p_since"] = ISO8601DateFormatter().string(from: since)
        }
        return try await call("chali_staff_orders", body)
    }

    func updateOrder(id: UUID, status: OnlineOrderStatus, pickupNumber: Int?, reason: String?) async throws -> OnlineOrder {
        var body: [String: Any] = [
            "p_store": storeID,
            "p_key": staffKey,
            "p_order": id.uuidString.lowercased(),
            "p_status": status.rawValue,
        ]
        if let pickupNumber { body["p_pickup_number"] = pickupNumber }
        if let reason { body["p_reason"] = reason }
        return try await call("chali_staff_update_order", body)
    }

    // MARK: -

    private struct PublishResult: Decodable {
        let ok: Bool
    }

    private struct ErrorBody: Decodable {
        let message: String?
        let code: String?
    }

    private func call<T: Decodable>(_ function: String, _ body: [String: Any]) async throws -> T {
        var request = URLRequest(url: restURL.appendingPathComponent("rpc/\(function)"))
        request.httpMethod = "POST"
        request.timeoutInterval = 15
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(apiKey, forHTTPHeaderField: "apikey")
        // 旧版 anon key 是 JWT，需要同时放在 Authorization；新版 publishable key 只放 apikey
        if apiKey.hasPrefix("eyJ") {
            request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw ServerError(message: "连不上服务器：\(error.localizedDescription)")
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let detail = (try? JSONDecoder().decode(ErrorBody.self, from: data))
            throw ServerError(message: QRClient.describe(status: status, message: detail?.message, code: detail?.code))
        }
        do {
            return try OnlineJSON.decoder.decode(T.self, from: data)
        } catch {
            throw ServerError(message: "服务器返回的数据读不懂：\(error.localizedDescription)")
        }
    }

    static func describe(status: Int, message: String?, code: String?) -> String {
        let text = message ?? ""
        if text.contains("unauthorized") { return "门店密钥不对（设置 → 扫码点单）" }
        if code == "PGRST202" || text.contains("Could not find the function") {
            return "数据库里还没有扫码点单的函数，请先执行 SQL"
        }
        if status == 401 || status == 403 { return "API key 不对（设置 → 扫码点单）" }
        if text.contains("order_not_found") { return "找不到这张扫码单" }
        if text.isEmpty { return "服务器错误（\(status)）" }
        return "服务器错误：\(text)"
    }
}
