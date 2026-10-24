import SwiftUI

/// 菜单编辑：改价、上下架、复制一款做季节限定、调整顺序、小料
struct MenuEditorView: View {
    @EnvironmentObject private var store: AppStore
    @State private var itemTarget: ItemTarget?
    @State private var toppingTarget: ToppingTarget?
    @State private var editMode: EditMode = .inactive
    @State private var confirmReset = false

    struct ItemTarget: Identifiable {
        let id = UUID()
        let item: MenuItem
        let isNew: Bool
    }

    struct ToppingTarget: Identifiable {
        let id = UUID()
        let topping: Topping
        let isNew: Bool
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("点饮品修改；左滑可复制或删除。新增季节限定：复制一款，改名改价即可。")
                    .font(.system(size: 14))
                    .foregroundColor(.secondary)
                Spacer()
                Button(editMode == .active ? "完成排序" : "调整顺序") {
                    editMode = editMode == .active ? .inactive : .active
                }
                .font(.system(size: 16, weight: .semibold))
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 10)

            List {
                ForEach(store.menu.categories) { category in
                    Section {
                        ForEach(store.menu.items(in: category.id, includeInactive: true)) { item in
                            Button {
                                itemTarget = ItemTarget(item: item, isNew: false)
                            } label: {
                                MenuItemRow(item: item, soldOut: store.isSoldOut(item))
                            }
                            .swipeActions(edge: .trailing) {
                                Button(role: .destructive) {
                                    store.deleteItem(id: item.id)
                                } label: {
                                    Label("删除", systemImage: "trash")
                                }
                                Button {
                                    if let copy = store.duplicateItem(id: item.id) {
                                        itemTarget = ItemTarget(item: copy, isNew: false)
                                    }
                                } label: {
                                    Label("复制", systemImage: "plus.square.on.square")
                                }
                                .tint(Theme.blue)
                            }
                        }
                        .onMove { source, destination in
                            store.moveItems(in: category.id, from: source, to: destination)
                        }
                    } header: {
                        HStack {
                            Text(category.name)
                                .font(.system(size: 16, weight: .bold))
                                .foregroundColor(Color(hex: category.colorHex))
                            Spacer()
                            Button {
                                itemTarget = ItemTarget(item: newItem(in: category), isNew: true)
                            } label: {
                                Label("新增饮品", systemImage: "plus")
                                    .font(.system(size: 14, weight: .semibold))
                            }
                        }
                    }
                }

                Section {
                    ForEach(store.menu.toppings) { topping in
                        Button {
                            toppingTarget = ToppingTarget(topping: topping, isNew: false)
                        } label: {
                            HStack {
                                Text(topping.name)
                                    .foregroundColor(Theme.ink)
                                Text(topping.nameJP)
                                    .font(.system(size: 13))
                                    .foregroundColor(.secondary)
                                Spacer()
                                Text("+" + Money.yen(topping.price))
                                    .foregroundColor(Theme.ink)
                            }
                        }
                    }
                } header: {
                    HStack {
                        Text("小料")
                            .font(.system(size: 16, weight: .bold))
                        Spacer()
                        Button {
                            toppingTarget = ToppingTarget(topping: Topping(id: UUID().uuidString, name: "", nameJP: "", price: 70), isNew: true)
                        } label: {
                            Label("新增小料", systemImage: "plus")
                                .font(.system(size: 14, weight: .semibold))
                        }
                    }
                }

                Section {
                    Button("恢复成示例菜单", role: .destructive) {
                        confirmReset = true
                    }
                } footer: {
                    Text("会覆盖现在的菜单（历史订单不受影响）。")
                }
            }
            .listStyle(.insetGrouped)
            .environment(\.editMode, $editMode)
        }
        .background(Theme.background)
        .sheet(item: $itemTarget) { target in
            ItemEditorView(item: target.item, isNew: target.isNew)
                .environmentObject(store)
        }
        .sheet(item: $toppingTarget) { target in
            ToppingEditorView(topping: target.topping, isNew: target.isNew)
                .environmentObject(store)
        }
        .alert("恢复成示例菜单？", isPresented: $confirmReset) {
            Button("恢复", role: .destructive) { store.resetMenuToSample() }
            Button("取消", role: .cancel) {}
        } message: {
            Text("现在菜单里的修改会丢失。")
        }
    }

    private func newItem(in category: MenuCategory) -> MenuItem {
        let template = store.menu.items(in: category.id, includeInactive: true).last
        return MenuItem(
            name: "",
            nameJP: "",
            categoryID: category.id,
            prices: template?.prices ?? SizePrices(m: nil, l: 680),
            allowedTemps: template?.allowedTemps ?? Temperature.coldOnly,
            allowedToppingIDs: store.menu.toppings.map(\.id)
        )
    }
}

struct MenuItemRow: View {
    let item: MenuItem
    let soldOut: Bool

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(item.name)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundColor(item.isActive ? Theme.ink : .secondary)
                    if !item.isActive {
                        Badge(text: "已下架", color: .gray)
                    }
                    if soldOut {
                        Badge(text: "今日售罄", color: Theme.danger)
                    }
                }
                Text(item.nameJP)
                    .font(.system(size: 13))
                    .foregroundColor(.secondary)
            }
            Spacer()
            Text(item.availableSizes.compactMap { size in item.prices[size].map { "\(size.label) \(Money.yen($0))" } }.joined(separator: " / "))
                .font(.system(size: 15, weight: .semibold, design: .rounded))
                .foregroundColor(Theme.ink)
            Text(item.allowedTemps.contains(.hot) ? "冷热" : "仅冷")
                .font(.system(size: 13))
                .foregroundColor(.secondary)
                .frame(width: 36)
        }
        .padding(.vertical, 2)
    }
}

struct ItemEditorView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    @State private var item: MenuItem
    @State private var error: String?
    let isNew: Bool

    init(item: MenuItem, isNew: Bool) {
        _item = State(initialValue: item)
        self.isNew = isNew
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("名称") {
                    TextField("中文名（点单界面、标签）", text: $item.name)
                    TextField("日文名（小票、菜单屏）", text: $item.nameJP)
                    Picker("分类", selection: $item.categoryID) {
                        ForEach(store.menu.categories) { category in
                            Text(category.name).tag(category.id)
                        }
                    }
                    Toggle("在点单界面显示", isOn: $item.isActive)
                }

                Section {
                    priceField("M", value: $item.prices.m)
                    priceField("L", value: $item.prices.l)
                } header: {
                    Text("店内价格（含税，日元）")
                } footer: {
                    Text("留空 = 不提供该规格。只填一个规格时，点单弹层不显示规格这一行。")
                }

                Section {
                    ForEach(Channel.deliveryChannels) { channel in
                        HStack {
                            Text(channel.label)
                                .frame(width: 96, alignment: .leading)
                            ForEach(item.availableSizes) { size in
                                TextField("\(size.label) 同店内", text: platformBinding(channel, size))
                                    .keyboardType(.numberPad)
                            }
                        }
                    }
                } header: {
                    Text("外卖平台价格")
                } footer: {
                    Text("留空 = 沿用店内价格。")
                }

                Section("允许的温度") {
                    ForEach(Temperature.allCases) { temp in
                        Toggle(temp.label, isOn: membership(\.allowedTemps, temp))
                    }
                }

                Section("允许的甜度") {
                    ForEach(Sweetness.allCases) { sweetness in
                        Toggle(sweetness.label, isOn: membership(\.allowedSweetness, sweetness))
                    }
                }

                Section("允许的小料") {
                    ForEach(store.menu.toppings) { topping in
                        Toggle("\(topping.name)（+\(Money.yen(topping.price))）", isOn: membership(\.allowedToppingIDs, topping.id))
                    }
                }

                Section {
                    Picker("规格", selection: $item.defaultSize) {
                        ForEach(item.availableSizes) { size in
                            Text(size.label).tag(size)
                        }
                    }
                    Picker("温度", selection: $item.defaultTemp) {
                        ForEach(item.allowedTemps) { temp in
                            Text(temp.label).tag(temp)
                        }
                    }
                    Picker("甜度", selection: $item.defaultSweetness) {
                        ForEach(item.allowedSweetness) { sweetness in
                            Text(sweetness.label).tag(sweetness)
                        }
                    }
                } header: {
                    Text("默认值")
                } footer: {
                    Text("打开规格弹层时预先选好；长按饮品卡片时直接按这个加入。")
                }

                if let error {
                    Section {
                        Text(error)
                            .foregroundColor(Theme.danger)
                    }
                }
            }
            .navigationTitle(isNew ? "新增饮品" : "编辑饮品")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("保存") { save() }
                }
            }
            .onChange(of: item.prices) { _ in item.normalizeDefaults() }
            .onChange(of: item.allowedTemps) { _ in item.normalizeDefaults() }
            .onChange(of: item.allowedSweetness) { _ in item.normalizeDefaults() }
        }
    }

    private func priceField(_ label: String, value: Binding<Int?>) -> some View {
        HStack {
            Text(label)
                .font(.system(size: 17, weight: .bold))
                .frame(width: 36, alignment: .leading)
            TextField("不提供", text: digitsBinding(value))
                .keyboardType(.numberPad)
            Text("円")
                .foregroundColor(.secondary)
        }
    }

    private func platformBinding(_ channel: Channel, _ size: DrinkSize) -> Binding<String> {
        Binding(
            get: { item.platformPrices[channel.rawValue]?[size].map(String.init) ?? "" },
            set: { text in
                let digits = text.filter { $0.isASCII && $0.isNumber }
                var prices = item.platformPrices[channel.rawValue] ?? SizePrices()
                prices[size] = digits.isEmpty ? nil : Int(digits.prefix(9))
                item.platformPrices[channel.rawValue] = prices.isEmpty ? nil : prices
            }
        )
    }

    private func membership<T: Equatable>(_ keyPath: WritableKeyPath<MenuItem, [T]>, _ value: T) -> Binding<Bool> {
        Binding(
            get: { item[keyPath: keyPath].contains(value) },
            set: { isOn in
                var list = item[keyPath: keyPath]
                list.removeAll { $0 == value }
                if isOn { list.append(value) }
                item[keyPath: keyPath] = list
            }
        )
    }

    private func save() {
        var result = item
        result.name = result.name.trimmingCharacters(in: .whitespacesAndNewlines)
        result.nameJP = result.nameJP.trimmingCharacters(in: .whitespacesAndNewlines)
        result.normalizeDefaults()
        if let message = result.validationMessage {
            error = message
            return
        }
        store.upsertItem(result)
        dismiss()
    }
}

struct ToppingEditorView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    @State private var topping: Topping
    @State private var allowOnAllItems = true
    @State private var confirmDelete = false
    let isNew: Bool

    init(topping: Topping, isNew: Bool) {
        _topping = State(initialValue: topping)
        self.isNew = isNew
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("小料") {
                    TextField("中文名", text: $topping.name)
                    TextField("日文名（小票用）", text: $topping.nameJP)
                    HStack {
                        Text("加价")
                        TextField("70", text: digitsBinding($topping.price))
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing)
                        Text("円")
                            .foregroundColor(.secondary)
                    }
                }
                if isNew {
                    Section {
                        Toggle("所有饮品都可以加", isOn: $allowOnAllItems)
                    } footer: {
                        Text("关掉后，需要在每款饮品里单独打开。")
                    }
                } else {
                    Section {
                        Button("删除这个小料", role: .destructive) { confirmDelete = true }
                    }
                }
            }
            .navigationTitle(isNew ? "新增小料" : "编辑小料")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("保存") {
                        var result = topping
                        result.name = result.name.trimmingCharacters(in: .whitespacesAndNewlines)
                        guard !result.name.isEmpty else { return }
                        store.upsertTopping(result, allowOnAllItems: allowOnAllItems)
                        dismiss()
                    }
                    .disabled(topping.name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .alert("删除「\(topping.name)」？", isPresented: $confirmDelete) {
                Button("删除", role: .destructive) {
                    store.deleteTopping(id: topping.id)
                    dismiss()
                }
                Button("取消", role: .cancel) {}
            } message: {
                Text("所有饮品里都会去掉这个小料，历史订单不受影响。")
            }
        }
    }
}
