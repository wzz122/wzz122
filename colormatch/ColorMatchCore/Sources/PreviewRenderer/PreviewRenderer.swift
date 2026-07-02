#if canImport(CoreImage)
import ColorEngine
import CoreImage
import LUTBuilder

/// Core Image 预览渲染层：LUT -> CIColorCube。
/// 预览与导出共用同一份 LUT 数据，从根上保证“所见即所得”。
public final class PreviewRenderer {
    public enum RenderError: Error {
        case filterCreationFailed
        case renderFailed
    }

    private let context: CIContext

    public init(context: CIContext? = nil) {
        self.context = context ?? CIContext(options: [
            .workingColorSpace: CGColorSpace(name: CGColorSpace.sRGB) as Any,
            .outputColorSpace: CGColorSpace(name: CGColorSpace.sRGB) as Any,
        ])
    }

    /// LUT -> CIColorCube 滤镜
    public func filter(for lut: LUT) throws -> CIFilter {
        guard let filter = CIFilter(name: "CIColorCubeWithColorSpace") else {
            throw RenderError.filterCreationFailed
        }
        filter.setValue(lut.size, forKey: "inputCubeDimension")
        filter.setValue(lut.ciCubeData, forKey: "inputCubeData")
        filter.setValue(CGColorSpace(name: CGColorSpace.sRGB), forKey: "inputColorSpace")
        return filter
    }

    /// 对 CIImage 应用 LUT（实时预览路径：上游可用降采样 proxy）
    public func apply(_ lut: LUT, to image: CIImage) throws -> CIImage {
        let filter = try filter(for: lut)
        filter.setValue(image, forKey: kCIInputImageKey)
        guard let output = filter.outputImage else { throw RenderError.renderFailed }
        return output
    }

    /// 对 CGImage 应用 LUT 并落地（导出路径：传全分辨率图）
    public func apply(_ lut: LUT, to image: CGImage) throws -> CGImage {
        let output = try apply(lut, to: CIImage(cgImage: image))
        guard let rendered = context.createCGImage(
            output,
            from: output.extent,
            format: .RGBA8,
            colorSpace: CGColorSpace(name: CGColorSpace.sRGB)
        ) else {
            throw RenderError.renderFailed
        }
        return rendered
    }
}
#endif
