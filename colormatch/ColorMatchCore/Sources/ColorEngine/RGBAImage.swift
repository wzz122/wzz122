import Foundation

/// 平台无关的 RGBA8 位图。iOS 侧由 PreviewRenderer 的 CGImage 适配器构造；
/// 测试与参照实现直接用合成生成器构造。
public struct RGBAImage: Sendable, Equatable {
    public let width: Int
    public let height: Int
    /// RGBA 交错，count == width * height * 4
    public var pixels: [UInt8]

    public init(width: Int, height: Int, pixels: [UInt8]) {
        precondition(pixels.count == width * height * 4, "pixel buffer size mismatch")
        self.width = width
        self.height = height
        self.pixels = pixels
    }

    public init(width: Int, height: Int) {
        self.init(
            width: width, height: height,
            pixels: [UInt8](repeating: 255, count: width * height * 4)
        )
    }

    public var pixelCount: Int { width * height }

    @inlinable
    public func rgb(atPixel i: Int) -> SIMD3<Double> {
        let o = i * 4
        return SIMD3(
            Double(pixels[o]) / 255.0,
            Double(pixels[o + 1]) / 255.0,
            Double(pixels[o + 2]) / 255.0
        )
    }

    @inlinable
    public mutating func setRGB(_ rgb: SIMD3<Double>, atPixel i: Int) {
        let o = i * 4
        pixels[o] = ColorMath.quantizeU8(rgb.x)
        pixels[o + 1] = ColorMath.quantizeU8(rgb.y)
        pixels[o + 2] = ColorMath.quantizeU8(rgb.z)
    }

    /// 确定性下采样：等步长抽取（与 Python downsample 一致，不做平均）
    public func downsampled(maxDimension: Int) -> RGBAImage {
        let longest = max(width, height)
        let step = max(1, (longest + maxDimension - 1) / maxDimension)
        guard step > 1 else { return self }
        let newW = (width + step - 1) / step
        let newH = (height + step - 1) / step
        var out = RGBAImage(width: newW, height: newH)
        for y in 0..<newH {
            for x in 0..<newW {
                let srcIndex = (y * step * width + x * step) * 4
                let dstIndex = (y * newW + x) * 4
                out.pixels[dstIndex] = pixels[srcIndex]
                out.pixels[dstIndex + 1] = pixels[srcIndex + 1]
                out.pixels[dstIndex + 2] = pixels[srcIndex + 2]
                out.pixels[dstIndex + 3] = pixels[srcIndex + 3]
            }
        }
        return out
    }

    /// 展开为浮点像素数组（gamma sRGB [0,1]），带等步长抽样
    public func floatPixels(stride strideValue: Int = 1) -> [SIMD3<Double>] {
        let n = pixelCount
        var out: [SIMD3<Double>] = []
        out.reserveCapacity(n / strideValue + 1)
        var i = 0
        while i < n {
            out.append(rgb(atPixel: i))
            i += strideValue
        }
        return out
    }
}
