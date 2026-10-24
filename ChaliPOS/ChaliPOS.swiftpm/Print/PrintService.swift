import SwiftUI
import UIKit

/// 通过 AirPrint 打印出杯标签和小票。
/// 在「设置」里选好打印机后直接打印、不弹窗；没选时弹出系统打印面板。
/// 以后换成 Brother / Epson 的 iOS SDK 时，只需要替换 send(_:...) 这一处。
@MainActor
enum PrintService {
    static func printLabels(for order: Order, store: AppStore) {
        let labels = LabelBuilder.labels(for: order, calendar: store.calendar)
        printLabels(labels, jobName: "取餐号 \(order.pickupLabel)", printerURL: store.settings.labelPrinterURL, store: store)
    }

    static func printLabels(_ labels: [CupLabel], jobName: String, printerURL: String?, store: AppStore) {
        let images = labels.compactMap { render(CupLabelView(label: $0)) }
        guard !images.isEmpty else { return }
        send(images, jobName: jobName, pageSize: CGSize(width: mm(40), height: mm(30)), printerURL: printerURL, store: store)
    }

    static func printReceipt(for order: Order, store: AppStore) {
        let view = ReceiptView(order: order, settings: store.settings, calendar: store.calendar)
        guard let image = render(view) else { return }
        let width = mm(80)
        let height = width * image.size.height / max(image.size.width, 1)
        send([image], jobName: "小票 \(order.pickupLabel)", pageSize: CGSize(width: width, height: height), printerURL: store.settings.receiptPrinterURL, store: store)
    }

    /// 扫码点单二维码海报（A6，用普通打印机打）
    static func printPoster(_ image: UIImage, store: AppStore) {
        send([image], jobName: "扫码点单二维码", pageSize: CGSize(width: mm(105), height: mm(148)), printerURL: nil, store: store)
    }

    /// 选择 AirPrint 打印机，返回打印机 URL
    static func pickPrinter(current: String?, completion: @escaping (String) -> Void) {
        let initial = current.flatMap { URL(string: $0) }.map { UIPrinter(url: $0) }
        let picker = UIPrinterPickerController(initiallySelectedPrinter: initial)
        let handler: UIPrinterPickerController.CompletionHandler = { controller, userDidSelect, _ in
            if userDidSelect, let printer = controller.selectedPrinter {
                completion(printer.url.absoluteString)
            }
        }
        if let view = topView {
            _ = picker.present(from: anchorRect(in: view), in: view, animated: true, completionHandler: handler)
        } else {
            _ = picker.present(animated: true, completionHandler: handler)
        }
    }

    static func printerName(for url: String?) -> String {
        guard let url, let parsed = URL(string: url) else { return "未选择（每次弹出打印面板）" }
        let name = UIPrinter(url: parsed).displayName
        return name.isEmpty ? parsed.absoluteString : name
    }

    // MARK: -

    static func render<V: View>(_ view: V) -> UIImage? {
        let renderer = ImageRenderer(content: view)
        renderer.scale = 3
        return renderer.uiImage
    }

    static func mm(_ value: CGFloat) -> CGFloat {
        value / 25.4 * 72
    }

    private static let paperDelegate = PaperDelegate()

    private static func send(_ images: [UIImage], jobName: String, pageSize: CGSize, printerURL: String?, store: AppStore) {
        let controller = UIPrintInteractionController.shared
        let info = UIPrintInfo(dictionary: nil)
        info.jobName = jobName
        info.outputType = .grayscale
        controller.printInfo = info
        controller.printingItems = images
        paperDelegate.pageSize = pageSize
        controller.delegate = paperDelegate

        let completion: UIPrintInteractionController.CompletionHandler = { _, completed, error in
            if let error {
                Task { @MainActor in
                    store.showToast("打印失败：\(error.localizedDescription)", isError: true)
                }
            } else if !completed, printerURL != nil {
                Task { @MainActor in
                    store.showToast("打印没有完成，请检查打印机", isError: true)
                }
            }
        }

        if let printerURL, let url = URL(string: printerURL) {
            _ = controller.print(to: UIPrinter(url: url), completionHandler: completion)
        } else if let view = topView {
            _ = controller.present(from: anchorRect(in: view), in: view, animated: true, completionHandler: completion)
        } else {
            _ = controller.present(animated: true, completionHandler: completion)
        }
    }

    private static var topView: UIView? {
        let window = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first { $0.isKeyWindow }
        var controller = window?.rootViewController
        while let presented = controller?.presentedViewController {
            controller = presented
        }
        return controller?.view
    }

    private static func anchorRect(in view: UIView) -> CGRect {
        CGRect(x: view.bounds.midX, y: view.bounds.minY + 80, width: 1, height: 1)
    }
}

/// 告诉打印机用多大的纸（标签 40×30mm / 小票 80mm 宽）
private final class PaperDelegate: NSObject, UIPrintInteractionControllerDelegate {
    var pageSize = CGSize(width: 113, height: 85)

    func printInteractionController(_ printInteractionController: UIPrintInteractionController, choosePaper paperList: [UIPrintPaper]) -> UIPrintPaper {
        UIPrintPaper.bestPaper(forPageSize: pageSize, withPapersFrom: paperList)
    }

    func printInteractionController(_ printInteractionController: UIPrintInteractionController, cutLengthFor paper: UIPrintPaper) -> CGFloat {
        pageSize.height
    }
}
