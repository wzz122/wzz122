import SwiftUI

/// 六维责任雷达图（纯 Path 实现）
struct RadarChartView: View {
    var dimensions: [RadarDimension]

    var body: some View {
        GeometryReader { geo in
            let center = CGPoint(x: geo.size.width / 2, y: geo.size.height / 2)
            let radius = min(geo.size.width, geo.size.height) / 2 - 34
            let count = max(dimensions.count, 3)

            ZStack {
                // 网格环
                ForEach([0.33, 0.66, 1.0], id: \.self) { fraction in
                    polygon(center: center, radius: radius * fraction, count: count)
                        .stroke(Color.white.opacity(0.08), lineWidth: 1)
                }
                // 轴线
                Path { path in
                    for i in 0..<count {
                        path.move(to: center)
                        path.addLine(to: point(index: i, count: count, radius: radius, center: center))
                    }
                }
                .stroke(Color.white.opacity(0.06), lineWidth: 1)

                // 数值多边形
                valuePolygon(center: center, radius: radius, count: count)
                    .fill(DS.Palette.brandStart.opacity(0.22))
                valuePolygon(center: center, radius: radius, count: count)
                    .stroke(DS.Palette.brandStart, lineWidth: 2)

                // 维度标签
                ForEach(Array(dimensions.enumerated()), id: \.offset) { index, dim in
                    let labelPoint = point(
                        index: index, count: count, radius: radius + 22, center: center
                    )
                    VStack(spacing: 1) {
                        Text(dim.dimension)
                            .font(.system(size: 10, design: .rounded))
                            .foregroundStyle(DS.Palette.textSecondary)
                        Text("\(dim.score)")
                            .font(.system(size: 11, weight: .bold, design: .rounded))
                            .foregroundStyle(DS.Palette.textPrimary)
                    }
                    .position(labelPoint)
                }
            }
        }
    }

    private func point(index: Int, count: Int, radius: CGFloat, center: CGPoint) -> CGPoint {
        let angle = -Double.pi / 2 + Double(index) * 2 * .pi / Double(count)
        return CGPoint(
            x: center.x + radius * CGFloat(cos(angle)),
            y: center.y + radius * CGFloat(sin(angle))
        )
    }

    private func polygon(center: CGPoint, radius: CGFloat, count: Int) -> Path {
        Path { path in
            for i in 0..<count {
                let p = point(index: i, count: count, radius: radius, center: center)
                if i == 0 { path.move(to: p) } else { path.addLine(to: p) }
            }
            path.closeSubpath()
        }
    }

    private func valuePolygon(center: CGPoint, radius: CGFloat, count: Int) -> Path {
        Path { path in
            for i in 0..<count {
                let score = i < dimensions.count ? dimensions[i].score : 0
                let r = radius * CGFloat(score) / 100
                let p = point(index: i, count: count, radius: r, center: center)
                if i == 0 { path.move(to: p) } else { path.addLine(to: p) }
            }
            path.closeSubpath()
        }
    }
}
