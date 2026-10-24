import SwiftUI

enum Theme {
    /// 菜单屏的绿色主色
    static let green = Color(hex: "2E7D4F")
    static let greenSoft = Color(hex: "E3F1E7")
    /// 季节限定的粉色
    static let pink = Color(hex: "D94F7A")
    static let ink = Color(hex: "1F2A24")
    static let background = Color(hex: "F2F4F1")
    static let line = Color.black.opacity(0.1)
    static let danger = Color(hex: "C62828")
    static let blue = Color(hex: "1E63C6")

    static func channelColor(_ channel: Channel) -> Color {
        switch channel {
        case .inStore: return green
        case .uber: return Color(hex: "1A1A1A")
        case .panda: return Color(hex: "E8A100")
        case .rocket: return Color(hex: "E5483B")
        }
    }

    static func statusColor(_ status: OrderStatus) -> Color {
        switch status {
        case .making: return Color(hex: "E07B39")
        case .done: return green
        case .refunded: return danger
        }
    }
}

extension Color {
    init(hex: String) {
        let cleaned = hex.trimmingCharacters(in: CharacterSet(charactersIn: "# "))
        let value = UInt64(cleaned, radix: 16) ?? 0
        self.init(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }
}
