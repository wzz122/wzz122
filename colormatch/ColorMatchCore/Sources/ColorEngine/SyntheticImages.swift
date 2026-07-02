import Foundation

/// 确定性合成测试图。与 reference/grade_math.py 的 base_scene / variant 逐位一致，
/// 用于算法验收与跨语言 golden 校验。App 运行时不使用。
public enum SyntheticImages {
    public static let variantNames = ["warm", "bright_soft", "teal_orange", "faded"]

    /// 基准场景：双向渐变 + 中央“肤色”矩形 + 四角色块（蓝天/绿植/暖橙/深阴影）
    public static func baseScene(width: Int = 96, height: Int = 96) -> RGBAImage {
        var img = RGBAImage(width: width, height: height)
        for y in 0..<height {
            for x in 0..<width {
                let r = Double(x) / Double(width - 1)
                let g = Double(y) / Double(height - 1)
                let b = Double(x + y) / Double(width + height - 2)
                img.setRGB(
                    SIMD3(r * 0.85 + 0.05, g * 0.75 + 0.1, b * 0.8 + 0.08),
                    atPixel: y * width + x
                )
            }
        }
        for y in (height / 3)..<(2 * height / 3) {
            for x in (width / 3)..<(2 * width / 3) {
                img.setRGB(SIMD3(0.85, 0.62, 0.5), atPixel: y * width + x)
            }
        }
        let q = max(1, width / 6)
        func fill(_ xs: Range<Int>, _ ys: Range<Int>, _ rgb: SIMD3<Double>) {
            for y in ys {
                for x in xs {
                    img.setRGB(rgb, atPixel: y * width + x)
                }
            }
        }
        fill(0..<q, 0..<q, SIMD3(0.35, 0.55, 0.85))
        fill((width - q)..<width, 0..<q, SIMD3(0.3, 0.65, 0.35))
        fill(0..<q, (height - q)..<height, SIMD3(0.9, 0.55, 0.25))
        fill((width - q)..<width, (height - q)..<height, SIMD3(0.12, 0.1, 0.14))
        return img
    }

    /// 对基准场景做确定性风格化，得到“参考图”
    public static func variant(_ base: RGBAImage, name: String) -> RGBAImage {
        var out = base
        for i in 0..<base.pixelCount {
            var rgb = base.rgb(atPixel: i)
            switch name {
            case "warm":
                rgb = SIMD3(
                    min(rgb.x * 1.12, 1),
                    min(rgb.y * 1.0, 1),
                    min(rgb.z * 0.86, 1)
                )
            case "bright_soft":
                var lin = SIMD3(
                    ColorMath.srgbDecode(rgb.x),
                    ColorMath.srgbDecode(rgb.y),
                    ColorMath.srgbDecode(rgb.z)
                ) * 1.6
                lin = SIMD3(min(lin.x, 1), min(lin.y, 1), min(lin.z, 1))
                rgb = SIMD3(
                    ColorMath.srgbEncode(lin.x),
                    ColorMath.srgbEncode(lin.y),
                    ColorMath.srgbEncode(lin.z)
                )
                rgb = SIMD3(repeating: 0.5) + (rgb - SIMD3(repeating: 0.5)) * 0.85
            case "teal_orange":
                let hsl = ColorMath.rgbToHSL(rgb)
                let shadowW = ColorMath.clamp(1 - hsl.z / 0.5, 0, 1)
                let hiW = ColorMath.clamp((hsl.z - 0.5) / 0.5, 0, 1)
                rgb += SIMD3(-0.06, 0.02, 0.08) * shadowW + SIMD3(0.08, 0.02, -0.06) * hiW
                rgb = GradeRenderer.clamp01(rgb)
            case "faded":
                rgb = SIMD3(repeating: 0.5) + (rgb - SIMD3(repeating: 0.5)) * 0.8
                rgb = GradeRenderer.clamp01(rgb + SIMD3(repeating: 0.06))
                let hsl = ColorMath.rgbToHSL(rgb)
                rgb = ColorMath.hslToRGB(hsl.x, hsl.y * 0.7, hsl.z)
            default:
                preconditionFailure("unknown variant: \(name)")
            }
            out.setRGB(rgb, atPixel: i)
        }
        return out
    }
}
