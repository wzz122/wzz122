import SwiftUI

/// 报税 CSV 导出和全部数据备份
struct ExportView: View {
    @EnvironmentObject private var store: AppStore
    @State private var month = ""
    @State private var files: [ExportedFile] = []

    struct ExportedFile: Identifiable {
        let id = UUID()
        let title: String
        let url: URL
    }

    private var monthOptions: [String] {
        var months = Set(store.files.orderDays().map { String($0.prefix(7)) })
        months.insert(String(store.today.prefix(7)))
        return months.sorted(by: >)
    }

    private var selectedMonth: String { month.isEmpty ? String(store.today.prefix(7)) : month }

    var body: some View {
        Form {
            Section {
                Picker("月份", selection: Binding(get: { selectedMonth }, set: { month = $0 })) {
                    ForEach(monthOptions, id: \.self) { value in
                        Text(value).tag(value)
                    }
                }
                Button {
                    exportDaily()
                } label: {
                    Label("生成「每日销售・税率汇总」CSV", systemImage: "tablecells")
                }
                Button {
                    exportDetail()
                } label: {
                    Label("生成「订单明细」CSV", systemImage: "list.bullet.rectangle")
                }
            } header: {
                Text("报税导出")
            } footer: {
                Text("每天一行，按税率（8% / 10%）和收款方式拆分金额，退款单不计入。UTF-8（Excel 可直接打开），交给会计，或整理后导入 freee・弥生・Money Forward。")
            }

            if !files.isEmpty {
                Section("生成的文件（点一下分享 / 存到「文件」）") {
                    ForEach(files) { file in
                        ShareLink(item: file.url) {
                            Label(file.title, systemImage: "square.and.arrow.up")
                        }
                    }
                }
            }

            Section {
                Button {
                    exportBackup()
                } label: {
                    Label("生成全部数据备份（JSON）", systemImage: "externaldrive")
                }
            } header: {
                Text("备份")
            } footer: {
                Text("现阶段数据只保存在这台 iPad 上（第 1 期接入 Supabase 后自动同步）。建议每周备份一次到「文件」、Google Drive 或 AirDrop 到电脑。")
            }

            Section("数据位置") {
                Text(store.files.baseURL.path)
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundColor(.secondary)
                    .textSelection(.enabled)
                KeyValueRow(key: "门店 ID", value: store.settings.storeID)
                KeyValueRow(key: "有订单的营业日", value: "\(store.files.orderDays().count) 天")
            }
        }
    }

    private func exportDaily() {
        let days = store.calendar.days(inMonth: selectedMonth).filter { $0 <= store.today }
        var byDay: [String: [Order]] = [:]
        for day in days {
            byDay[day] = store.orders(for: day)
        }
        let csv = CSVExport.dailyTaxCSV(days: days, ordersByDay: byDay)
        write(csv, name: "\(store.settings.shopName)_\(selectedMonth)_日次売上集計.csv", title: "\(selectedMonth) 每日销售・税率汇总")
    }

    private func exportDetail() {
        let days = store.calendar.days(inMonth: selectedMonth).filter { $0 <= store.today }
        let csv = CSVExport.orderDetailCSV(orders: store.orders(days: days), calendar: store.calendar)
        write(csv, name: "\(store.settings.shopName)_\(selectedMonth)_注文明細.csv", title: "\(selectedMonth) 订单明细")
    }

    private func exportBackup() {
        do {
            let data = try store.files.backupData(menu: store.menu, settings: store.settings, closes: store.closes)
            let stamp = store.today.replacingOccurrences(of: "-", with: "")
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("ChaliPOS_backup_\(stamp).json")
            try data.write(to: url, options: .atomic)
            files.insert(ExportedFile(title: "全部数据备份 \(store.today)", url: url), at: 0)
        } catch {
            store.showToast("备份失败：\(error.localizedDescription)", isError: true)
        }
    }

    private func write(_ text: String, name: String, title: String) {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)
        do {
            try text.data(using: .utf8)?.write(to: url, options: .atomic)
            files.insert(ExportedFile(title: title, url: url), at: 0)
        } catch {
            store.showToast("导出失败：\(error.localizedDescription)", isError: true)
        }
    }
}
