import SwiftUI

/// 出杯标签（约 40×30mm）。做饮料的人只看贴纸：取餐号最大，其次饮品名和规格。
struct CupLabelView: View {
    let label: CupLabel

    /// 设计尺寸（4:3）。打印时按纸张大小缩放。
    static let size = CGSize(width: 240, height: 180)

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text(label.pickup)
                    .font(.system(size: 44, weight: .black, design: .rounded))
                Spacer(minLength: 4)
                Text("\(label.index)/\(label.count)")
                    .font(.system(size: 26, weight: .heavy, design: .rounded))
            }
            Text(label.name)
                .font(.system(size: 24, weight: .heavy))
                .lineLimit(1)
                .minimumScaleFactor(0.55)
            Text(label.nameJP)
                .font(.system(size: 12, weight: .medium))
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            Text(label.spec)
                .font(.system(size: 21, weight: .bold))
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .padding(.top, 2)
            if !label.toppings.isEmpty {
                Text(label.toppings)
                    .font(.system(size: 17, weight: .bold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
            }
            Spacer(minLength: 0)
            Text(label.footer)
                .font(.system(size: 13, weight: .semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .foregroundColor(.black)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .frame(width: Self.size.width, height: Self.size.height, alignment: .topLeading)
        .background(Color.white)
    }
}

extension CupLabel {
    /// 设置页「测试打印」用
    static let sample = CupLabel(
        id: "sample",
        pickup: "023",
        index: 2,
        count: 3,
        name: "乌龙烤鲜奶",
        nameJP: "焙煎ウーロンミルク",
        spec: "L / 少冰 / 50%",
        toppings: "+珍珠 +芝士奶盖",
        footer: "店内 外带 16:20"
    )
}
