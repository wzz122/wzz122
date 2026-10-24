import SwiftUI

/// 售罄：在这里点一次，点单界面立刻变灰；同时提醒去外卖平台下架。第二天开店自动恢复。
struct SoldOutScreen: View {
    @EnvironmentObject private var store: AppStore
    @State private var pending: PendingChange?

    struct PendingChange: Identifiable {
        let id = UUID()
        let items: [MenuItem]
        let soldOut: Bool
    }

    private let columns = [GridItem(.adaptive(minimum: 190), spacing: 12)]

    private var soldOutItems: [MenuItem] {
        store.menu.items.filter { $0.isActive && store.isSoldOut($0) }
    }

    var body: some View {
        ZStack {
            VStack(spacing: 0) {
                header
                Divider()
                ScrollView {
                    VStack(alignment: .leading, spacing: 22) {
                        ForEach(store.menu.categories) { category in
                            let items = store.menu.items(in: category.id)
                            if !items.isEmpty {
                                VStack(alignment: .leading, spacing: 10) {
                                    Text(category.name)
                                        .font(.system(size: 18, weight: .bold))
                                        .foregroundColor(Color(hex: category.colorHex))
                                    LazyVGrid(columns: columns, spacing: 12) {
                                        ForEach(items) { item in
                                            toggleCard(item)
                                        }
                                    }
                                }
                            }
                        }
                    }
                    .padding(16)
                }
            }

            if let pending {
                ModalBackdrop { self.pending = nil }
                DelistChecklist(change: pending) {
                    store.setSoldOut(pending.items.map(\.id), soldOut: pending.soldOut)
                    store.showToast(pending.soldOut ? "已标记售罄" : "已恢复供应")
                    self.pending = nil
                } onCancel: {
                    self.pending = nil
                }
                .id(pending.id)
            }
        }
        .animation(.easeOut(duration: 0.15), value: pending?.id)
    }

    private var header: some View {
        HStack(alignment: .center, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Text("售罄管理")
                    .font(.system(size: 24, weight: .heavy))
                Text("点一下标记「今日售罄」，点单界面同时变灰。第二天开店自动恢复。")
                    .font(.system(size: 14))
                    .foregroundColor(.secondary)
            }
            Spacer()
            if !soldOutItems.isEmpty {
                Text("今日售罄 \(soldOutItems.count) 款")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundColor(Theme.danger)
                SecondaryButton("全部恢复", systemImage: "arrow.counterclockwise", height: 48) {
                    pending = PendingChange(items: soldOutItems, soldOut: false)
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
        .background(Color.white)
    }

    private func toggleCard(_ item: MenuItem) -> some View {
        let soldOut = store.isSoldOut(item)
        return Button {
            pending = PendingChange(items: [item], soldOut: !soldOut)
        } label: {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(item.name)
                        .font(.system(size: 19, weight: .bold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                    Text(item.nameJP)
                        .font(.system(size: 12))
                        .lineLimit(1)
                        .opacity(0.8)
                }
                Spacer(minLength: 4)
                Text(soldOut ? "售罄" : "供应中")
                    .font(.system(size: 14, weight: .bold))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(Capsule().fill(soldOut ? Color.white : Theme.greenSoft))
                    .foregroundColor(soldOut ? Theme.danger : Theme.green)
            }
            .padding(.horizontal, 14)
            .frame(height: 76)
            .foregroundColor(soldOut ? .white : Theme.ink)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(soldOut ? Theme.danger : Color.white)
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// 标记售罄时必须逐个确认外卖平台已下架，防止平台卖出已经没有的饮品
struct DelistChecklist: View {
    let change: SoldOutScreen.PendingChange
    let onConfirm: () -> Void
    let onCancel: () -> Void
    @State private var checked: Set<Channel> = []

    private var names: String {
        let list = change.items.map(\.name)
        return list.count > 3 ? list.prefix(3).joined(separator: "、") + " 等 \(list.count) 款" : list.joined(separator: "、")
    }

    private var allChecked: Bool { checked.count == Channel.deliveryChannels.count }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(change.soldOut ? "标记售罄：\(names)" : "恢复供应：\(names)")
                .font(.system(size: 24, weight: .heavy))
                .foregroundColor(Theme.ink)
            Text(change.soldOut
                 ? "请同时去外卖平台把它下架，防止卖出已经没有的饮品。每个平台下架后打勾："
                 : "如果之前在外卖平台下架了，记得重新上架（可以不打勾直接完成）：")
                .font(.system(size: 16))
                .foregroundColor(.secondary)
            ForEach(Channel.deliveryChannels) { channel in
                CheckRow(title: "\(channel.label) 已\(change.soldOut ? "下架" : "重新上架")", checked: checked.contains(channel)) {
                    if checked.contains(channel) {
                        checked.remove(channel)
                    } else {
                        checked.insert(channel)
                    }
                }
            }
            HStack(spacing: 12) {
                SecondaryButton("取消", action: onCancel)
                Spacer()
                BigButton(
                    change.soldOut ? "完成，标记售罄" : "完成，恢复供应",
                    color: change.soldOut ? Theme.danger : Theme.green,
                    disabled: change.soldOut && !allChecked,
                    action: onConfirm
                )
            }
            .padding(.top, 6)
        }
        .padding(26)
        .frame(width: 580)
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(Color.white)
        )
        .compositingGroup()
        .shadow(color: .black.opacity(0.2), radius: 20, y: 6)
    }
}
