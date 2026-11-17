// 人脸检查：用 macOS 自带 Vision 找图里的人脸，逐张输出「文件名<TAB>人脸数<TAB>最大脸占画面宽的比例」
// 用法：./facecheck 图1.jpg 图2.jpg …   （选片时查「画面里有没有人脸」，只读，不改图）
import Foundation
import Vision
import AppKit

for path in CommandLine.arguments.dropFirst() {
    guard let img = NSImage(contentsOfFile: path),
          let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
        print("\(path)\t-1\t0"); continue
    }
    let req = VNDetectFaceRectanglesRequest()
    let h = VNImageRequestHandler(cgImage: cg, options: [:])
    try? h.perform([req])
    let faces = (req.results ?? []).filter { $0.confidence > 0.6 }
    let maxw = faces.map { Double($0.boundingBox.width) }.max() ?? 0
    print("\(path)\t\(faces.count)\t\(String(format: "%.3f", maxw))")
}
