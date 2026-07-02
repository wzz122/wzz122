import ColorEngine
import Foundation

/// 3D LUT：GradeParameters 的采样表示。
/// 同一份数据驱动三个消费者，从根上保证“预览 = 导出”：
/// 1. `ciCubeData` -> CIColorCube（PreviewRenderer）
/// 2. `apply(to:)` -> CPU 三线性插值（测试 / 批量导出）
/// 3. `cubeFileText` -> .cube 文件（v1.1 Pro 功能，实现已就绪）
public struct LUT: Sendable {
    public static let defaultSize = 33

    public let size: Int
    /// RGBA float，索引序 [b][g][r]（CIColorCube 约定），count == size³ * 4
    public let data: [Float]

    /// 从参数构建：对网格逐点跑 GradeRenderer
    public init(params: GradeParameters, size: Int = LUT.defaultSize) {
        precondition(size >= 2 && size <= 64, "LUT size must be in 2...64")
        self.size = size
        var data = [Float](repeating: 1, count: size * size * size * 4)
        let denom = Double(size - 1)
        var offset = 0
        for b in 0..<size {
            for g in 0..<size {
                for r in 0..<size {
                    let input = SIMD3(Double(r) / denom, Double(g) / denom, Double(b) / denom)
                    let out = GradeRenderer.apply(input, params: params)
                    data[offset] = Float(out.x)
                    data[offset + 1] = Float(out.y)
                    data[offset + 2] = Float(out.z)
                    // alpha 保持 1
                    offset += 4
                }
            }
        }
        self.data = data
    }

    /// 网格点取值（测试用）
    public func sample(bIndex: Int, gIndex: Int, rIndex: Int) -> SIMD3<Double> {
        let o = ((bIndex * size + gIndex) * size + rIndex) * 4
        return SIMD3(Double(data[o]), Double(data[o + 1]), Double(data[o + 2]))
    }

    /// CIColorCube 的 cubeData（RGBA float32）
    public var ciCubeData: Data {
        data.withUnsafeBufferPointer { Data(buffer: $0) }
    }

    /// CPU 三线性插值应用（与 reference/grade_math.py 的 apply_lut 一致）
    public func apply(to image: RGBAImage) -> RGBAImage {
        var out = image
        let maxIndex = size - 2
        let scale = Double(size - 1)
        for i in 0..<image.pixelCount {
            let rgb = image.rgb(atPixel: i)
            let pos = rgb * scale
            let r0 = min(max(Int(pos.x.rounded(.down)), 0), maxIndex)
            let g0 = min(max(Int(pos.y.rounded(.down)), 0), maxIndex)
            let b0 = min(max(Int(pos.z.rounded(.down)), 0), maxIndex)
            let fr = pos.x - Double(r0)
            let fg = pos.y - Double(g0)
            let fb = pos.z - Double(b0)

            let c000 = sample(bIndex: b0, gIndex: g0, rIndex: r0)
            let c100 = sample(bIndex: b0, gIndex: g0, rIndex: r0 + 1)
            let c010 = sample(bIndex: b0, gIndex: g0 + 1, rIndex: r0)
            let c110 = sample(bIndex: b0, gIndex: g0 + 1, rIndex: r0 + 1)
            let c001 = sample(bIndex: b0 + 1, gIndex: g0, rIndex: r0)
            let c101 = sample(bIndex: b0 + 1, gIndex: g0, rIndex: r0 + 1)
            let c011 = sample(bIndex: b0 + 1, gIndex: g0 + 1, rIndex: r0)
            let c111 = sample(bIndex: b0 + 1, gIndex: g0 + 1, rIndex: r0 + 1)

            let c00 = c000 * (1 - fr) + c100 * fr
            let c10 = c010 * (1 - fr) + c110 * fr
            let c01 = c001 * (1 - fr) + c101 * fr
            let c11 = c011 * (1 - fr) + c111 * fr
            let c0 = c00 * (1 - fg) + c10 * fg
            let c1 = c01 * (1 - fg) + c11 * fg
            out.setRGB(c0 * (1 - fb) + c1 * fb, atPixel: i)
        }
        return out
    }

    /// .cube 文件文本（Resolve/Premiere/FCP 通用格式）。
    /// 注意：.cube 的行序是 r 最快、b 最慢，与内部存储一致。
    public func cubeFileText(title: String) -> String {
        var lines: [String] = []
        lines.reserveCapacity(size * size * size + 4)
        lines.append("TITLE \"\(title)\"")
        lines.append("LUT_3D_SIZE \(size)")
        lines.append("DOMAIN_MIN 0.0 0.0 0.0")
        lines.append("DOMAIN_MAX 1.0 1.0 1.0")
        var offset = 0
        for _ in 0..<(size * size * size) {
            let r = data[offset], g = data[offset + 1], b = data[offset + 2]
            lines.append(String(format: "%.6f %.6f %.6f", r, g, b))
            offset += 4
        }
        return lines.joined(separator: "\n") + "\n"
    }
}
