import SwiftUI
import CoreImage.CIFilterBuiltins

enum QRCodeImage {
    /// 生成黑白二维码（不模糊放大）
    static func make(_ text: String, scale: CGFloat = 12) -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(text.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: scale, y: scale)),
              let cgImage = CIContext().createCGImage(output, from: output.extent) else { return nil }
        return UIImage(cgImage: cgImage)
    }
}

/// 贴在柜台 / 桌上的二维码海报（日文为主，下面一行中文）
struct QRPosterView: View {
    let shopName: String
    let url: URL
    let seat: String

    var body: some View {
        VStack(spacing: 10) {
            Text(shopName)
                .font(.system(size: 34, weight: .heavy))
                .foregroundColor(Theme.green)
            Text("モバイルオーダー")
                .font(.system(size: 22, weight: .bold))
            Text("スマホで注文 → レジでお支払い")
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(Theme.ink.opacity(0.75))
            if let image = QRCodeImage.make(url.absoluteString) {
                Image(uiImage: image)
                    .interpolation(.none)
                    .resizable()
                    .frame(width: 250, height: 250)
                    .padding(10)
            }
            if !seat.isEmpty {
                Text("席 \(seat)")
                    .font(.system(size: 22, weight: .heavy))
                    .padding(.horizontal, 16)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(Theme.greenSoft))
            }
            Text("扫码点单 · 到柜台付款")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(.secondary)
        }
        .foregroundColor(Theme.ink)
        .padding(28)
        .frame(width: 380)
        .background(Color.white)
    }
}

struct QRPosterSheet: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss
    @State private var seat = ""

    private var url: URL? { store.settings.qrOrderURL(seat: seat) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    if let url {
                        TextField("桌号（可不填；填了顾客下单时自动带上）", text: $seat)
                            .textFieldStyle(.roundedBorder)
                            .frame(maxWidth: 380)
                        QRPosterView(shopName: store.settings.shopNameJP, url: url, seat: seat.trimmingCharacters(in: .whitespaces))
                            .overlay(
                                RoundedRectangle(cornerRadius: 4)
                                    .stroke(Theme.line, lineWidth: 1)
                            )
                        Text(url.absoluteString)
                            .font(.system(size: 12, design: .monospaced))
                            .foregroundColor(.secondary)
                            .textSelection(.enabled)
                        HStack(spacing: 12) {
                            if let image = posterImage(url: url) {
                                ShareLink(
                                    item: Image(uiImage: image),
                                    preview: SharePreview("扫码点单二维码", image: Image(uiImage: image))
                                ) {
                                    Label("分享 / 保存图片", systemImage: "square.and.arrow.up")
                                        .font(.system(size: 17, weight: .semibold))
                                        .padding(.horizontal, 18)
                                        .frame(height: 52)
                                        .background(
                                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                                .stroke(Theme.line, lineWidth: 1.5)
                                        )
                                }
                                BigButton("打印", systemImage: "printer", height: 52) {
                                    PrintService.printPoster(image, store: store)
                                }
                            }
                        }
                    } else {
                        Text("请先在「管理 → 设置 → 扫码点单」里填写顾客页面地址（https://…）。")
                            .foregroundColor(.secondary)
                            .padding(40)
                    }
                }
                .padding(24)
                .frame(maxWidth: .infinity)
            }
            .background(Theme.background)
            .navigationTitle("扫码点单二维码")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("完成") { dismiss() }
                }
            }
        }
    }

    private func posterImage(url: URL) -> UIImage? {
        PrintService.render(QRPosterView(shopName: store.settings.shopNameJP, url: url, seat: seat.trimmingCharacters(in: .whitespaces)))
    }
}
