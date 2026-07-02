import SwiftUI

struct SettingsView: View {
    @Environment(AppSettings.self) private var settings

    var body: some View {
        @Bindable var settings = settings
        NavigationStack {
            Form {
                Section {
                    Toggle("演示模式", isOn: $settings.useMock)
                        .tint(DS.Palette.brandStart)
                } header: {
                    Text("模式")
                } footer: {
                    Text("演示模式全流程走本地示例数据，不发网络请求、不消耗 API 费用。关闭后使用下方服务配置。")
                }

                Section {
                    TextField("服务地址", text: $settings.baseURLString)
                        .keyboardType(.URL)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                    SecureField("访问令牌", text: $settings.apiToken)
                } header: {
                    Text("云端服务")
                } footer: {
                    Text("App 只连接你自己的 Cloudflare Worker；OpenAI / Gemini 的 key 只存在于服务端，不会进入手机。")
                }

                Section {
                    LabeledContent("现场评理", value: "约 ¥20–40 / 小时")
                    LabeledContent("事后复盘", value: "约 ¥60 / 小时")
                    LabeledContent("单场预算上限", value: "¥100（服务端强制）")
                } header: {
                    Text("成本参考")
                } footer: {
                    Text("成本按回合实时累计并显示在评理页右上角；超过预算 80% 会提醒收尾，到达上限只能生成终评。")
                }

                Section {
                    Text("沟通责任估计，不代表事实裁决。评分用于复盘和娱乐。AI 仅基于双方陈述和录音内容，不代表真实全部事实。不输出胜负判定、人格评判、心理诊断或法律建议。")
                        .font(.footnote)
                        .foregroundStyle(DS.Palette.textSecondary)
                } header: {
                    Text("边界与免责声明")
                }

                Section {
                    LabeledContent("版本", value: "2.0.0")
                } header: {
                    Text("关于")
                }
            }
            .scrollContentBackground(.hidden)
            .background(DS.screenGradient.ignoresSafeArea())
            .navigationTitle("设置")
        }
    }
}
