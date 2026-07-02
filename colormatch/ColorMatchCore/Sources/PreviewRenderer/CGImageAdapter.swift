#if canImport(CoreGraphics)
import ColorEngine
import CoreGraphics
import Foundation

/// CGImage -> RGBAImage 适配器：统计与匹配的入口。
/// 解码时限制最长边，控制内存占用（交接文档 OOM 红线）。
public enum CGImageAdapter {
    public enum AdapterError: Error {
        case contextCreationFailed
    }

    /// 转成平台无关的 RGBA8 位图
    /// - Parameter maxDimension: 最长边限制；统计用途 1024 已足够
    public static func rgbaImage(
        from cgImage: CGImage,
        maxDimension: Int = 1024
    ) throws -> RGBAImage {
        let longest = max(cgImage.width, cgImage.height)
        let scale = longest > maxDimension ? Double(maxDimension) / Double(longest) : 1
        let width = max(1, Int((Double(cgImage.width) * scale).rounded(.down)))
        let height = max(1, Int((Double(cgImage.height) * scale).rounded(.down)))

        var pixels = [UInt8](repeating: 0, count: width * height * 4)
        let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
        let drawn = pixels.withUnsafeMutableBytes { buffer -> Bool in
            guard let ctx = CGContext(
                data: buffer.baseAddress,
                width: width,
                height: height,
                bitsPerComponent: 8,
                bytesPerRow: width * 4,
                space: colorSpace,
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            ) else { return false }
            ctx.interpolationQuality = .medium
            ctx.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
            return true
        }
        guard drawn else { throw AdapterError.contextCreationFailed }
        return RGBAImage(width: width, height: height, pixels: pixels)
    }
}
#endif
