import EntitlementService
import XCTest

final class EntitlementServiceTests: XCTestCase {
    func testDailyMatchLimitAndRollover() {
        let limiter = UsageLimiter(store: InMemoryKeyValueStore())
        let day1 = "2026-07-02"

        XCTAssertEqual(limiter.remainingMatches(day: day1, isPro: false), 3)
        for _ in 0..<3 {
            XCTAssertTrue(limiter.canPerformMatch(day: day1, isPro: false))
            limiter.recordMatch(day: day1)
        }
        XCTAssertFalse(limiter.canPerformMatch(day: day1, isPro: false))
        XCTAssertEqual(limiter.remainingMatches(day: day1, isPro: false), 0)

        // 次日额度重置
        let day2 = "2026-07-03"
        XCTAssertTrue(limiter.canPerformMatch(day: day2, isPro: false))
        XCTAssertEqual(limiter.remainingMatches(day: day2, isPro: false), 3)
    }

    func testProBypassesAllLimits() {
        let limiter = UsageLimiter(store: InMemoryKeyValueStore())
        let day = "2026-07-02"
        for _ in 0..<10 {
            limiter.recordMatch(day: day)
            limiter.recordXMPExport()
        }
        XCTAssertTrue(limiter.canPerformMatch(day: day, isPro: true))
        XCTAssertTrue(limiter.canExportXMP(isPro: true))
        XCTAssertTrue(limiter.canSaveRecipe(currentCount: 100, isPro: true))
    }

    func testXMPExportIsCumulativeNotDaily() {
        let limiter = UsageLimiter(store: InMemoryKeyValueStore())
        XCTAssertEqual(limiter.remainingXMPExports(isPro: false), 3)
        limiter.recordXMPExport()
        limiter.recordXMPExport()
        XCTAssertEqual(limiter.remainingXMPExports(isPro: false), 1)
        limiter.recordXMPExport()
        XCTAssertFalse(limiter.canExportXMP(isPro: false), "免费 XMP 是累计额度，用完即撞墙")
    }

    func testRecipeCap() {
        let limiter = UsageLimiter(store: InMemoryKeyValueStore())
        XCTAssertTrue(limiter.canSaveRecipe(currentCount: 4, isPro: false))
        XCTAssertFalse(limiter.canSaveRecipe(currentCount: 5, isPro: false))
    }

    func testAIDiagnosisMonthlyQuotaProOnly() {
        let limiter = UsageLimiter(store: InMemoryKeyValueStore())
        let month = "2026-07"
        XCTAssertEqual(limiter.remainingAIDiagnoses(month: month, isPro: false), 0,
                       "免费版没有 AI 诊断额度")
        XCTAssertEqual(limiter.remainingAIDiagnoses(month: month, isPro: true), 30)
        for _ in 0..<30 {
            limiter.recordAIDiagnosis(month: month)
        }
        XCTAssertEqual(limiter.remainingAIDiagnoses(month: month, isPro: true), 0)
        // 次月重置
        XCTAssertEqual(limiter.remainingAIDiagnoses(month: "2026-08", isPro: true), 30)
    }

    func testDayAndMonthFormatting() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let date = Date(timeIntervalSince1970: 1_782_000_000) // 2026-06-21 UTC 附近
        let day = UsageLimiter.dayString(for: date, calendar: calendar)
        XCTAssertEqual(day.count, 10)
        XCTAssertTrue(day.hasPrefix("2026-"))
        let month = UsageLimiter.monthString(for: date, calendar: calendar)
        XCTAssertEqual(month.count, 7)
    }
}
