import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var store: AppStore
    @State private var draft = ShopSettings()
    @State private var loaded = false
    @State private var newPIN = ""

    private var hasChanges: Bool { loaded && draft != store.settings }

    var body: some View {
        VStack(spacing: 0) {
            Form {
                Section {
                    TextField("店名", text: $draft.shopName)
                    TextField("日文店名（小票用）", text: $draft.shopNameJP)
                    TextField("适格请求书登记号码（T + 13 位）", text: $draft.invoiceNumber)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                    if !draft.invoiceNumber.isEmpty && !draft.isInvoiceNumberValid {
                        Text("格式应为 T + 13 位数字，例如 T1234567890123")
                            .font(.system(size: 13))
                            .foregroundColor(Theme.danger)
                    }
                    TextField("地址（小票用）", text: $draft.address)
                    TextField("电话（小票用）", text: $draft.phone)
                        .keyboardType(.phonePad)
                } header: {
                    Text("店铺信息")
                } footer: {
                    Text("登记号码、按税率分开的金额会印在小票上（适格简易请求书）。")
                }

                Section {
                    HStack {
                        Text("找零备用金")
                        TextField("0", text: digitsBinding($draft.cashFloat))
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing)
                        Text("円").foregroundColor(.secondary)
                    }
                    Picker("店内用 / 外带定价", selection: $draft.eatInPricing) {
                        ForEach(EatInPricing.allCases) { option in
                            Text(option.label).tag(option)
                        }
                    }
                    Picker("默认用餐方式", selection: $draft.defaultDining) {
                        ForEach(DiningOption.allCases) { option in
                            Text(option.label).tag(option)
                        }
                    }
                    Stepper("营业日切换时间：凌晨 \(draft.dayCutoffHour):00", value: $draft.dayCutoffHour, in: 0...6)
                } header: {
                    Text("收银")
                } footer: {
                    Text("「同一含税价」：外带和店内用价格一样，系统按 8% / 10% 倒算税额。营业日切换时间之前的订单算前一天，取餐号从 001 重新开始、售罄自动恢复。")
                }

                Section {
                    ForEach(Channel.deliveryChannels) { channel in
                        HStack {
                            Text(channel.label)
                            TextField("0", text: commissionBinding(channel))
                                .keyboardType(.numberPad)
                                .multilineTextAlignment(.trailing)
                            Text("%").foregroundColor(.secondary)
                        }
                    }
                } header: {
                    Text("外卖平台抽成")
                } footer: {
                    Text("整数 %，用于报表和日结里计算实际到手金额。")
                }

                Section {
                    Toggle("结账后自动打印出杯标签", isOn: $draft.autoPrintLabels)
                    printerRow("标签打印机", url: draft.labelPrinterURL) { url in
                        draft.labelPrinterURL = url
                    }
                    printerRow("小票打印机", url: draft.receiptPrinterURL) { url in
                        draft.receiptPrinterURL = url
                    }
                    Button {
                        PrintService.printLabels([CupLabel.sample], jobName: "测试标签", printerURL: draft.labelPrinterURL, store: store)
                    } label: {
                        Label("测试打印一张标签", systemImage: "tag")
                    }
                } header: {
                    Text("打印（AirPrint）")
                } footer: {
                    Text("选好打印机后结账直接出标签，不再弹打印面板。标签按 40×30mm 排版；请用支持 AirPrint 的标签机，或之后接入厂商 SDK。")
                }

                Section {
                    SecureField("新密码（4 位数字）", text: $newPIN)
                        .keyboardType(.numberPad)
                        .onChange(of: newPIN) { value in
                            let digits = String(value.filter { $0.isASCII && $0.isNumber }.prefix(4))
                            if digits != value { newPIN = digits }
                        }
                    Button("设为新密码") {
                        var updated = store.settings
                        updated.ownerPIN = newPIN
                        store.updateSettings(updated)
                        draft.ownerPIN = newPIN
                        newPIN = ""
                        store.showToast("老板密码已修改")
                    }
                    .disabled(newPIN.count != 4)
                } header: {
                    Text("老板密码")
                } footer: {
                    Text("店员可以点单、收款、日结、标记售罄；改价、退款、看报表、改设置需要老板密码。")
                }
            }

            if hasChanges {
                HStack {
                    Text("有未保存的修改")
                        .foregroundColor(.secondary)
                    Spacer()
                    SecondaryButton("放弃", height: 50) { draft = store.settings }
                    BigButton("保存设置", systemImage: "checkmark", height: 50) {
                        store.updateSettings(draft)
                        store.showToast("设置已保存")
                    }
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 12)
                .background(Color.white)
            }
        }
        .onAppear {
            if !loaded {
                draft = store.settings
                loaded = true
            }
        }
    }

    private func printerRow(_ title: String, url: String?, onPick: @escaping (String?) -> Void) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                Text(PrintService.printerName(for: url))
                    .font(.system(size: 13))
                    .foregroundColor(.secondary)
            }
            Spacer()
            if url != nil {
                Button("清除") { onPick(nil) }
                    .buttonStyle(.borderless)
                    .foregroundColor(Theme.danger)
            }
            Button("选择") {
                PrintService.pickPrinter(current: url) { picked in onPick(picked) }
            }
            .buttonStyle(.borderless)
        }
    }

    private func commissionBinding(_ channel: Channel) -> Binding<String> {
        Binding(
            get: {
                guard let value = draft.commissionPercent[channel.rawValue], value > 0 else { return "" }
                return String(Int(value.rounded()))
            },
            set: { text in
                let digits = text.filter { $0.isASCII && $0.isNumber }
                if let value = Int(digits.prefix(3)), value > 0 {
                    draft.commissionPercent[channel.rawValue] = Double(min(value, 100))
                } else {
                    draft.commissionPercent[channel.rawValue] = nil
                }
            }
        )
    }
}
