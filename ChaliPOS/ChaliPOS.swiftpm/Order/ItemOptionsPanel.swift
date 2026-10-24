import SwiftUI

/// 规格弹层：只显示这款饮品允许的选项，默认值已选好（L、普通冰、100%）
struct ItemOptionsPanel: View {
    @EnvironmentObject private var store: AppStore
    let context: OptionsContext
    let onClose: () -> Void

    @State private var size: DrinkSize
    @State private var temp: Temperature
    @State private var sweetness: Sweetness
    @State private var toppingIDs: Set<String>
    @State private var addedCount = 0

    init(context: OptionsContext, onClose: @escaping () -> Void) {
        self.context = context
        self.onClose = onClose
        let item = context.item
        let line = context.editingLine
        _size = State(initialValue: line?.size ?? item.defaultSize)
        _temp = State(initialValue: line?.temp ?? item.defaultTemp)
        _sweetness = State(initialValue: line?.sweetness ?? item.defaultSweetness)
        _toppingIDs = State(initialValue: Set(line?.toppingIDs ?? []))
    }

    private var item: MenuItem { context.item }
    private var isEditing: Bool { context.editingLine != nil }

    private var currentLine: OrderLine? {
        store.makeLine(item: item, size: size, temp: temp, sweetness: sweetness, toppingIDs: Array(toppingIDs))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            Divider()
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if item.availableSizes.count > 1 {
                        optionRow("规格") {
                            ForEach(item.availableSizes) { option in
                                ChipButton(
                                    title: option.label,
                                    subtitle: store.price(for: item, size: option).map(Money.yen),
                                    selected: size == option,
                                    large: true
                                ) { size = option }
                            }
                        }
                    }
                    optionRow("温度") {
                        ForEach(item.allowedTemps) { option in
                            ChipButton(
                                title: option.label,
                                selected: temp == option,
                                color: option == .hot ? Color(hex: "E07B39") : Theme.green,
                                large: true
                            ) { temp = option }
                        }
                    }
                    optionRow("甜度") {
                        ForEach(item.allowedSweetness) { option in
                            ChipButton(
                                title: option.label,
                                selected: sweetness == option,
                                large: true
                            ) { sweetness = option }
                        }
                    }
                    toppingSection
                }
                .padding(.horizontal, 22)
                .padding(.vertical, 16)
            }
            Divider()
            footer
        }
        .frame(maxWidth: 740, maxHeight: 700)
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(Color.white)
        )
        .compositingGroup()
        .shadow(color: .black.opacity(0.2), radius: 20, y: 6)
    }

    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                Text(item.name)
                    .font(.system(size: 28, weight: .heavy))
                    .foregroundColor(Theme.ink)
                Text(item.nameJP)
                    .font(.system(size: 15))
                    .foregroundColor(.secondary)
            }
            Spacer()
            if item.availableSizes.count == 1, let only = item.availableSizes.first {
                Badge(text: "仅 \(only.label)", color: Theme.ink.opacity(0.6))
                    .padding(.top, 8)
                    .padding(.trailing, 8)
            }
            Button(action: onClose) {
                Image(systemName: "xmark")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(Theme.ink)
                    .frame(width: 46, height: 46)
                    .background(Circle().fill(Theme.background))
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 22)
        .padding(.vertical, 12)
    }

    @ViewBuilder
    private var toppingSection: some View {
        let toppings = store.menu.toppings(for: item)
        if !toppings.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text("小料（可多选）")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.secondary)
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 4), spacing: 10) {
                    ForEach(toppings) { topping in
                        toppingToggle(topping)
                    }
                }
            }
        }
    }

    private func toppingToggle(_ topping: Topping) -> some View {
        let isOn = toppingIDs.contains(topping.id)
        return Button {
            if isOn {
                toppingIDs.remove(topping.id)
            } else {
                toppingIDs.insert(topping.id)
            }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: isOn ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 18))
                    .foregroundColor(isOn ? .white : .secondary)
                VStack(alignment: .leading, spacing: 0) {
                    Text(topping.name)
                        .font(.system(size: 16, weight: .bold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                    Text("+" + Money.yen(store.toppingPrice(topping)))
                        .font(.system(size: 12, weight: .medium))
                        .opacity(0.85)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 10)
            .frame(height: 52)
            .foregroundColor(isOn ? .white : Theme.ink)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(isOn ? Theme.green : Color.white)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(isOn ? Theme.green : Theme.line, lineWidth: 1.5)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var footer: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 0) {
                Text("单价")
                    .font(.system(size: 13))
                    .foregroundColor(.secondary)
                Text(Money.yen(currentLine?.unitPrice ?? 0))
                    .font(.system(size: 30, weight: .heavy, design: .rounded))
                    .monospacedDigit()
            }
            if addedCount > 0 {
                Text("本款已加入 \(addedCount) 杯")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(Theme.green)
            }
            Spacer()
            if isEditing {
                BigButton("保存修改", systemImage: "checkmark") { save() }
            } else {
                SecondaryButton("加入并再来一杯", systemImage: "plus") { addAndContinue() }
                BigButton("加入", systemImage: "cart.badge.plus") { addAndClose() }
            }
        }
        .padding(.horizontal, 22)
        .padding(.vertical, 12)
    }

    private func optionRow<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.system(size: 16, weight: .bold))
                .foregroundColor(.secondary)
            HStack(spacing: 10) {
                content()
            }
        }
    }

    // MARK: - 动作

    private func addAndClose() {
        guard let line = currentLine else { return }
        store.addToCart(line)
        onClose()
    }

    /// 连点同款：加入后保留弹层，选项回到默认值
    private func addAndContinue() {
        guard let line = currentLine else { return }
        store.addToCart(line)
        addedCount += 1
        size = item.defaultSize
        temp = item.defaultTemp
        sweetness = item.defaultSweetness
        toppingIDs = []
    }

    private func save() {
        guard let line = currentLine, let editing = context.editingLine else { return }
        store.replaceLine(editing.id, with: line)
        onClose()
    }
}
