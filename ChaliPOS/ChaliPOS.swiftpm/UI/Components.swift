import SwiftUI

/// 一排大按钮里的单个选项（规格、温度、甜度、渠道…）
struct ChipButton: View {
    let title: String
    var subtitle: String? = nil
    let selected: Bool
    var color: Color = Theme.green
    var large = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 1) {
                Text(title)
                    .font(.system(size: large ? 19 : 16, weight: .bold))
                if let subtitle {
                    Text(subtitle)
                        .font(.system(size: 12, weight: .medium))
                        .opacity(0.85)
                }
            }
            .lineLimit(1)
            .padding(.horizontal, large ? 16 : 14)
            .frame(minWidth: large ? 88 : 64, minHeight: large ? 56 : 40)
            .foregroundColor(selected ? .white : Theme.ink)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(selected ? color : Color.white)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(selected ? color : Theme.line, lineWidth: 1.5)
            )
            .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

struct BigButton: View {
    let title: String
    var systemImage: String? = nil
    var color: Color = Theme.green
    var disabled = false
    var fullWidth = false
    var height: CGFloat = 60
    let action: () -> Void

    init(
        _ title: String,
        systemImage: String? = nil,
        color: Color = Theme.green,
        disabled: Bool = false,
        fullWidth: Bool = false,
        height: CGFloat = 60,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.systemImage = systemImage
        self.color = color
        self.disabled = disabled
        self.fullWidth = fullWidth
        self.height = height
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if let systemImage {
                    Image(systemName: systemImage)
                }
                Text(title)
            }
            .font(.system(size: 21, weight: .bold))
            .lineLimit(1)
            .padding(.horizontal, 24)
            .frame(minWidth: 140, maxWidth: fullWidth ? .infinity : nil, minHeight: height)
            .foregroundColor(.white)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(disabled ? Color.gray.opacity(0.35) : color)
            )
            .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(disabled)
    }
}

struct SecondaryButton: View {
    let title: String
    var systemImage: String? = nil
    var color: Color = Theme.ink
    var height: CGFloat = 60
    let action: () -> Void

    init(_ title: String, systemImage: String? = nil, color: Color = Theme.ink, height: CGFloat = 60, action: @escaping () -> Void) {
        self.title = title
        self.systemImage = systemImage
        self.color = color
        self.height = height
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if let systemImage {
                    Image(systemName: systemImage)
                }
                Text(title)
            }
            .font(.system(size: 18, weight: .semibold))
            .lineLimit(1)
            .padding(.horizontal, 20)
            .frame(minHeight: height)
            .foregroundColor(color)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Color.white)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Theme.line, lineWidth: 1.5)
            )
            .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

/// 白底圆角卡片
struct Card<Content: View>: View {
    let title: String?
    let content: Content

    init(_ title: String? = nil, @ViewBuilder content: () -> Content) {
        self.title = title
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let title {
                Text(title)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(Theme.ink)
            }
            content
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Color.white)
        )
    }
}

struct KeyValueRow: View {
    let key: String
    let value: String
    var emphasized = false
    var valueColor: Color = Theme.ink

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(key)
                .foregroundColor(emphasized ? Theme.ink : .secondary)
            Spacer(minLength: 12)
            Text(value)
                .font(.system(size: emphasized ? 24 : 17, weight: emphasized ? .heavy : .semibold, design: .rounded))
                .foregroundColor(valueColor)
                .monospacedDigit()
        }
        .font(.system(size: emphasized ? 18 : 16, weight: emphasized ? .bold : .regular))
    }
}

struct Badge: View {
    let text: String
    let color: Color

    var body: some View {
        Text(text)
            .font(.system(size: 13, weight: .bold))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .foregroundColor(.white)
            .background(Capsule().fill(color))
    }
}

enum PadKey: Hashable {
    case digit(Int)
    case doubleZero
    case backspace
    case clear
}

/// 大号数字键盘（现金实收、老板密码）
struct NumberPad: View {
    var showsDoubleZero = true
    var keyHeight: CGFloat = 62
    let onKey: (PadKey) -> Void

    private var rows: [[PadKey]] {
        [
            [.digit(1), .digit(2), .digit(3)],
            [.digit(4), .digit(5), .digit(6)],
            [.digit(7), .digit(8), .digit(9)],
            [showsDoubleZero ? .doubleZero : .clear, .digit(0), .backspace],
        ]
    }

    var body: some View {
        VStack(spacing: 10) {
            ForEach(rows, id: \.self) { row in
                HStack(spacing: 10) {
                    ForEach(row, id: \.self) { key in
                        Button {
                            onKey(key)
                        } label: {
                            label(for: key)
                                .frame(maxWidth: .infinity)
                                .frame(height: keyHeight)
                                .background(
                                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                                        .fill(Theme.background)
                                )
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func label(for key: PadKey) -> some View {
        switch key {
        case .digit(let value):
            Text("\(value)")
                .font(.system(size: 28, weight: .semibold, design: .rounded))
                .foregroundColor(Theme.ink)
        case .doubleZero:
            Text("00")
                .font(.system(size: 28, weight: .semibold, design: .rounded))
                .foregroundColor(Theme.ink)
        case .backspace:
            Image(systemName: "delete.left")
                .font(.system(size: 24, weight: .semibold))
                .foregroundColor(Theme.ink)
        case .clear:
            Text("清除")
                .font(.system(size: 20, weight: .semibold))
                .foregroundColor(Theme.ink)
        }
    }

    /// 按键作用到一个整数金额上
    static func apply(_ key: PadKey, to value: Int, maxDigits: Int = 7) -> Int {
        let limit = Int(pow(10, Double(maxDigits)))
        switch key {
        case .digit(let digit):
            let next = value * 10 + digit
            return next < limit ? next : value
        case .doubleZero:
            let next = value * 100
            return next < limit ? next : value
        case .backspace:
            return value / 10
        case .clear:
            return 0
        }
    }
}

/// 弹层后面的半透明遮罩
struct ModalBackdrop: View {
    var onTap: (() -> Void)? = nil

    var body: some View {
        Color.black.opacity(0.35)
            .ignoresSafeArea()
            .onTapGesture { onTap?() }
    }
}

struct ToastOverlay: View {
    @EnvironmentObject private var store: AppStore

    var body: some View {
        if let toast = store.toast {
            Text(toast.text)
                .font(.system(size: 17, weight: .semibold))
                .foregroundColor(.white)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 22)
                .padding(.vertical, 12)
                .background(Capsule().fill(toast.isError ? Theme.danger : Theme.ink.opacity(0.92)))
                .padding(.bottom, 28)
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .id(toast.id)
                .allowsHitTesting(false)
        }
    }
}

/// 打勾格子（售罄同步、外卖下架提醒）
struct CheckRow: View {
    let title: String
    let checked: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                Image(systemName: checked ? "checkmark.square.fill" : "square")
                    .font(.system(size: 28))
                    .foregroundColor(checked ? Theme.green : .secondary)
                Text(title)
                    .font(.system(size: 19, weight: .semibold))
                    .foregroundColor(Theme.ink)
                Spacer()
            }
            .padding(.horizontal, 16)
            .frame(height: 58)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(Theme.background)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// 只允许输入数字的文本绑定（价格、金额）
func digitsBinding(_ value: Binding<Int?>) -> Binding<String> {
    Binding(
        get: { value.wrappedValue.map(String.init) ?? "" },
        set: { text in
            let digits = text.filter { $0.isASCII && $0.isNumber }
            value.wrappedValue = digits.isEmpty ? nil : Int(digits.prefix(9))
        }
    )
}

func digitsBinding(_ value: Binding<Int>) -> Binding<String> {
    Binding(
        get: { value.wrappedValue == 0 ? "" : String(value.wrappedValue) },
        set: { text in
            let digits = text.filter { $0.isASCII && $0.isNumber }
            value.wrappedValue = Int(digits.prefix(9)) ?? 0
        }
    )
}

func percentText(_ ratio: Double) -> String {
    String(format: "%.0f%%", ratio * 100)
}
