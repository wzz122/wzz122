import SwiftUI

/// 设计令牌：全部界面只从这里取色/取值，保证整体一致。
enum DS {
    enum Palette {
        static let background = Color(red: 0.055, green: 0.065, blue: 0.10)
        static let backgroundTop = Color(red: 0.09, green: 0.10, blue: 0.16)
        static let surface = Color.white.opacity(0.06)
        static let surfaceStroke = Color.white.opacity(0.09)
        static let textPrimary = Color.white.opacity(0.94)
        static let textSecondary = Color.white.opacity(0.55)
        static let textTertiary = Color.white.opacity(0.35)

        /// 参与者色刻意避开粉/蓝的性别刻板印象
        static let participantA = Color(red: 0.24, green: 0.85, blue: 0.76) // 青
        static let participantB = Color(red: 1.00, green: 0.62, blue: 0.34) // 橙

        static let brandStart = Color(red: 0.32, green: 0.80, blue: 0.92)
        static let brandEnd = Color(red: 0.58, green: 0.47, blue: 0.97)
        static let danger = Color(red: 1.00, green: 0.36, blue: 0.36)
        static let warning = Color(red: 1.00, green: 0.78, blue: 0.30)
    }

    static let brandGradient = LinearGradient(
        colors: [Palette.brandStart, Palette.brandEnd],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    static let screenGradient = LinearGradient(
        colors: [Palette.backgroundTop, Palette.background],
        startPoint: .top,
        endPoint: .bottom
    )

    enum Radius {
        static let card: CGFloat = 22
        static let chip: CGFloat = 10
        static let button: CGFloat = 16
    }

    static func color(for participant: ParticipantID) -> Color {
        participant == .a ? Palette.participantA : Palette.participantB
    }

    /// 报告 JSON 里的 "A"/"B" 字符串直接取色
    static func color(forRaw raw: String) -> Color {
        raw == "B" ? Palette.participantB : Palette.participantA
    }

    static func scoreColor(_ score: Int) -> Color {
        switch score {
        case ..<40: return Palette.danger
        case ..<70: return Palette.warning
        default: return Palette.participantA
        }
    }
}
