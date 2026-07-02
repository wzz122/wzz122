import Foundation
import Observation

@Observable
final class AppSettings {
    var baseURLString: String {
        didSet { UserDefaults.standard.set(baseURLString, forKey: Keys.baseURL) }
    }
    var apiToken: String {
        didSet { UserDefaults.standard.set(apiToken, forKey: Keys.token) }
    }
    /// 演示模式：全流程走本地 Mock，不发网络请求、不消耗 API 费用
    var useMock: Bool {
        didSet { UserDefaults.standard.set(useMock, forKey: Keys.useMock) }
    }

    private enum Keys {
        static let baseURL = "settings.baseURL"
        static let token = "settings.apiToken"
        static let useMock = "settings.useMock"
    }

    init() {
        let defaults = UserDefaults.standard
        baseURLString = defaults.string(forKey: Keys.baseURL)
            ?? "https://argument-score-api.wzzsgdtc.workers.dev"
        apiToken = defaults.string(forKey: Keys.token) ?? ""
        useMock = defaults.object(forKey: Keys.useMock) as? Bool ?? true
    }
}
