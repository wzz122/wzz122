import SwiftUI

/// 小票（适格简易请求书）：只在客人需要时打印。
/// 包含：事业者名、登记号码、交易日期、明细（轻减税率对象标 ※）、按税率合计和税额。
struct ReceiptView: View {
    let order: Order
    let settings: ShopSettings
    let calendar: BusinessCalendar

    /// 80mm 热敏纸的打印宽度约 72mm
    static let width: CGFloat = 300

    private var isReduced: Bool { order.taxRate == 8 }
    private var shopName: String { settings.shopNameJP.isEmpty ? settings.shopName : settings.shopNameJP }

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            headerSection
            dashed
            ForEach(order.lines) { line in
                VStack(alignment: .leading, spacing: 1) {
                    Text(line.nameJP.isEmpty ? line.name : line.nameJP)
                        .font(.system(size: 14, weight: .semibold))
                    HStack(alignment: .firstTextBaseline) {
                        Text(lineDetail(line))
                            .font(.system(size: 12))
                        Spacer(minLength: 6)
                        Text(Money.yen(line.total) + (isReduced ? " ※" : ""))
                            .monospacedDigit()
                    }
                }
            }
            dashed
            totalSection
            dashed
            paymentSection
            Text("ありがとうございました")
                .frame(maxWidth: .infinity)
                .padding(.top, 8)
        }
        .font(.system(size: 13))
        .foregroundColor(.black)
        .padding(14)
        .frame(width: Self.width)
        .background(Color.white)
    }

    private var headerSection: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(shopName)
                .font(.system(size: 22, weight: .heavy))
                .frame(maxWidth: .infinity)
            Text("領収書")
                .font(.system(size: 15, weight: .bold))
                .frame(maxWidth: .infinity)
            if !settings.invoiceNumber.isEmpty {
                Text("登録番号 \(settings.invoiceNumber)")
            }
            if !settings.address.isEmpty {
                Text(settings.address)
            }
            if !settings.phone.isEmpty {
                Text("TEL \(settings.phone)")
            }
            HStack {
                Text(calendar.dateTimeString(order.createdAt))
                Spacer()
                Text("No.\(order.pickupLabel)")
            }
            Text(order.channel.isDelivery ? order.channel.labelJP : order.dining.labelJP)
        }
    }

    private var totalSection: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(alignment: .firstTextBaseline) {
                Text("合計")
                    .font(.system(size: 16, weight: .bold))
                Spacer()
                Text(Money.yen(order.total))
                    .font(.system(size: 22, weight: .heavy))
                    .monospacedDigit()
            }
            HStack {
                Text("\(order.taxRate)%対象")
                Spacer()
                Text(Money.yen(order.total)).monospacedDigit()
            }
            HStack {
                Text("　内消費税")
                Spacer()
                Text(Money.yen(order.taxAmount)).monospacedDigit()
            }
            if isReduced {
                Text("※は軽減税率(8%)対象商品です")
                    .font(.system(size: 11))
            }
        }
    }

    private var paymentSection: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                Text("お支払")
                Spacer()
                Text(order.payment.labelJP)
            }
            if let cash = order.cashReceived, let change = order.change {
                HStack {
                    Text("お預り")
                    Spacer()
                    Text(Money.yen(cash)).monospacedDigit()
                }
                HStack {
                    Text("お釣り")
                    Spacer()
                    Text(Money.yen(change)).monospacedDigit()
                }
            }
            if order.isRefunded {
                Text("【返金済】")
                    .font(.system(size: 16, weight: .bold))
                    .frame(maxWidth: .infinity)
            }
        }
    }

    private var dashed: some View {
        DashedLine()
            .stroke(style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
            .frame(height: 1)
            .padding(.vertical, 3)
    }

    private func lineDetail(_ line: OrderLine) -> String {
        var parts = [line.size.label]
        parts += line.toppings.map { "+" + $0.nameJP }
        return parts.joined(separator: " ") + "  \(Money.yen(line.unitPrice)) × \(line.quantity)"
    }
}

private struct DashedLine: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: 0, y: rect.midY))
        path.addLine(to: CGPoint(x: rect.width, y: rect.midY))
        return path
    }
}
