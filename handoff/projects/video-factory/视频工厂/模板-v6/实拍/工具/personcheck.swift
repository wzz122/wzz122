// 夕张期补充检查：同一张图跑 Vision 人脸（含低置信度）+ 人体（全身/上半身）检测，并在 2×2 分块上各再查一次（找小脸）
// 输出：文件名<TAB>人脸数<TAB>人体数<TAB>最大框说明
import Foundation
import Vision
import AppKit

func detect(_ cg: CGImage) -> ([VNFaceObservation], [VNHumanObservation]) {
    let f = VNDetectFaceRectanglesRequest()
    let hb = VNDetectHumanRectanglesRequest(); hb.upperBodyOnly = false
    let hu = VNDetectHumanRectanglesRequest(); hu.upperBodyOnly = true
    let h = VNImageRequestHandler(cgImage: cg, options: [:])
    try? h.perform([f, hb, hu])
    let faces = (f.results ?? []).filter { $0.confidence > 0.4 }
    let hum = ((hb.results ?? []) + (hu.results ?? [])).filter { $0.confidence > 0.5 }
    return (faces, hum)
}
for path in CommandLine.arguments.dropFirst() {
    guard let img = NSImage(contentsOfFile: path),
          let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { print("\(path)\t-1\t-1\t读不出"); continue }
    var nf = 0, nh = 0; var note: [String] = []
    let (f0, h0) = detect(cg); nf += f0.count; nh += h0.count
    for o in f0 { note.append(String(format: "脸@%.2f,%.2f w%.3f", o.boundingBox.midX, 1 - o.boundingBox.midY, o.boundingBox.width)) }
    for o in h0 { note.append(String(format: "人@%.2f,%.2f h%.2f c%.2f", o.boundingBox.midX, 1 - o.boundingBox.midY, o.boundingBox.height, o.confidence)) }
    let W = cg.width, H = cg.height
    for (i, j) in [(0, 0), (1, 0), (0, 1), (1, 1)] {
        let r = CGRect(x: i * W / 2, y: j * H / 2, width: W / 2, height: H / 2)
        if let sub = cg.cropping(to: r) {
            let (f1, _) = detect(sub); nf += f1.count
            for o in f1 { note.append(String(format: "小脸@%.2f,%.2f", (Double(i) + o.boundingBox.midX) / 2, (Double(j) + 1 - o.boundingBox.midY) / 2)) }
        }
    }
    print("\(path)\t\(nf)\t\(nh)\t\(note.joined(separator: "; "))")
}
