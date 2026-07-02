import SwiftUI
import UIKit

struct ShareItem: Identifiable {
    let id = UUID()
    let image: UIImage
}

struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

/// 9:16 分享卡片外框：品牌头 + 内容 + 固定免责声明（渲染进图，截不掉）
struct ShareCardFrame<Content: View>: View {
    var content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Circle()
                    .fill(DS.brandGradient)
                    .frame(width: 22, height: 22)
                Text("冷静报告")
                    .font(.system(.subheadline, design: .rounded).weight(.bold))
                    .foregroundStyle(DS.Palette.textPrimary)
                Spacer()
                Text("AI 吵架评审")
                    .font(.system(.caption2, design: .rounded))
                    .foregroundStyle(DS.Palette.textTertiary)
            }
            .padding(.horizontal, 24)
            .padding(.top, 28)

            Spacer(minLength: 16)

            content
                .padding(.horizontal, 24)

            Spacer(minLength: 16)

            Text("沟通责任估计，不代表事实裁决 · 评分用于复盘和娱乐")
                .font(.system(size: 9, design: .rounded))
                .foregroundStyle(DS.Palette.textTertiary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)
                .padding(.bottom, 24)
        }
        .frame(width: 360, height: 640)
        .background(DS.screenGradient)
    }
}

@MainActor
enum ShareCardRenderer {
    static func render<Content: View>(@ViewBuilder content: () -> Content) -> UIImage? {
        let renderer = ImageRenderer(content: ShareCardFrame(content: content))
        renderer.scale = 3
        renderer.proposedSize = ProposedViewSize(width: 360, height: 640)
        return renderer.uiImage
    }
}
