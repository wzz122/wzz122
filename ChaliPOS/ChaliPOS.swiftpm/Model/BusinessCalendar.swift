import Foundation

/// 营业日：凌晨 cutoffHour 点之前的订单算前一天，取餐号和售罄都按营业日切换。
struct BusinessCalendar {
    var cutoffHour: Int
    var timeZone: TimeZone = .current

    private var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = timeZone
        return c
    }

    private var dayFormatter: DateFormatter {
        let f = DateFormatter()
        f.calendar = calendar
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = timeZone
        f.dateFormat = "yyyy-MM-dd"
        return f
    }

    func day(for date: Date) -> String {
        dayFormatter.string(from: date.addingTimeInterval(-Double(cutoffHour) * 3600))
    }

    /// 该营业日 0:00 的时间（用于日期选择器）
    func date(for day: String) -> Date? {
        dayFormatter.date(from: day)
    }

    func addingDays(_ count: Int, to day: String) -> String {
        guard let date = date(for: day),
              let moved = calendar.date(byAdding: .day, value: count, to: date) else { return day }
        return dayFormatter.string(from: moved)
    }

    /// 闭区间 [from, to] 内的所有营业日
    func days(from: String, to: String) -> [String] {
        guard from <= to else { return [] }
        var result: [String] = []
        var current = from
        while current <= to, result.count < 3700 {
            result.append(current)
            current = addingDays(1, to: current)
        }
        return result
    }

    /// 本周（周一开始）到今天
    func weekToDate(today: String) -> [String] {
        guard let date = date(for: today) else { return [today] }
        let weekday = calendar.component(.weekday, from: date) // 1 = 周日
        let offset = (weekday + 5) % 7
        return days(from: addingDays(-offset, to: today), to: today)
    }

    /// 本月 1 日到今天
    func monthToDate(today: String) -> [String] {
        days(from: String(today.prefix(8)) + "01", to: today)
    }

    /// 某个月的所有日子（month 为 "yyyy-MM"）
    func days(inMonth month: String) -> [String] {
        let first = month + "-01"
        guard let date = date(for: first),
              let range = calendar.range(of: .day, in: .month, for: date) else { return [] }
        return days(from: first, to: addingDays(range.count - 1, to: first))
    }

    func hour(of date: Date) -> Int {
        calendar.component(.hour, from: date)
    }

    func timeString(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = timeZone
        f.dateFormat = "HH:mm"
        return f.string(from: date)
    }

    func dateTimeString(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = timeZone
        f.dateFormat = "yyyy/MM/dd HH:mm"
        return f.string(from: date)
    }
}
