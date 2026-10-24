import SwiftUI

/// 管理（需老板密码）：报表、菜单（改价 / 季节限定）、报税导出、设置
struct AdminScreen: View {
    @EnvironmentObject private var store: AppStore
    @State private var unlocked = false
    @State private var tab: AdminTab = .reports

    enum AdminTab: String, CaseIterable, Identifiable {
        case reports, menu, export, settings
        var id: String { rawValue }
        var title: String {
            switch self {
            case .reports: return "报表"
            case .menu: return "菜单"
            case .export: return "导出 / 备份"
            case .settings: return "设置"
            }
        }
    }

    var body: some View {
        if unlocked {
            VStack(spacing: 0) {
                HStack(spacing: 16) {
                    Picker("管理", selection: $tab) {
                        ForEach(AdminTab.allCases) { item in
                            Text(item.title).tag(item)
                        }
                    }
                    .pickerStyle(.segmented)
                    .frame(maxWidth: 520)
                    if store.settings.usesDefaultPIN {
                        Label("还在用初始密码 0000，请在「设置」里修改", systemImage: "exclamationmark.triangle.fill")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(Theme.danger)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    }
                    Spacer()
                    Button {
                        unlocked = false
                    } label: {
                        Label("锁定", systemImage: "lock.fill")
                            .font(.system(size: 16, weight: .semibold))
                    }
                    .buttonStyle(.borderless)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(Color.white)
                Divider()
                switch tab {
                case .reports: ReportsView()
                case .menu: MenuEditorView()
                case .export: ExportView()
                case .settings: SettingsView()
                }
            }
        } else {
            PINPadView(title: "管理功能需要老板密码", onSuccess: { unlocked = true })
                .frame(width: 400)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

/// 4 位数字密码
struct PINPadView: View {
    @EnvironmentObject private var store: AppStore
    let title: String
    let onSuccess: () -> Void
    var onCancel: (() -> Void)? = nil

    @State private var input = ""
    @State private var wrong = false

    var body: some View {
        VStack(spacing: 18) {
            Image(systemName: "lock.fill")
                .font(.system(size: 34))
                .foregroundColor(Theme.green)
            Text(title)
                .font(.system(size: 22, weight: .bold))
                .multilineTextAlignment(.center)
            HStack(spacing: 16) {
                ForEach(0..<4, id: \.self) { index in
                    Circle()
                        .fill(index < input.count ? Theme.ink : Color.clear)
                        .overlay(Circle().stroke(Theme.ink, lineWidth: 2))
                        .frame(width: 18, height: 18)
                }
            }
            Text(wrong ? "密码不对，请重试" : (store.settings.usesDefaultPIN ? "初始密码是 0000" : " "))
                .font(.system(size: 15))
                .foregroundColor(wrong ? Theme.danger : .secondary)
            NumberPad(showsDoubleZero: false, keyHeight: 60) { key in
                press(key)
            }
            if let onCancel {
                Button("取消", action: onCancel)
                    .font(.system(size: 17, weight: .semibold))
            }
        }
        .padding(28)
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(Color.white)
        )
        .shadow(color: .black.opacity(0.12), radius: 16, y: 4)
    }

    private func press(_ key: PadKey) {
        switch key {
        case .digit(let digit):
            guard input.count < 4 else { return }
            wrong = false
            input.append(String(digit))
            if input.count == 4 {
                if input == store.settings.ownerPIN {
                    input = ""
                    onSuccess()
                } else {
                    wrong = true
                    input = ""
                }
            }
        case .backspace:
            if !input.isEmpty { input.removeLast() }
        case .clear:
            input = ""
        case .doubleZero:
            break
        }
    }
}
