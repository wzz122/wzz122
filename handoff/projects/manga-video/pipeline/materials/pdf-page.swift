// PDF 指定页 → PNG：swift pdf-page.swift in.pdf 页码(从1起) out.png [宽度像素，默认 2000]
import Foundation
import PDFKit
import AppKit
let a = CommandLine.arguments
guard a.count >= 4, let doc = PDFDocument(url: URL(fileURLWithPath: a[1])), let page = doc.page(at: Int(a[2])! - 1) else { print("用法：swift pdf-page.swift in.pdf 页码 out.png [宽度]"); exit(1) }
let box = page.bounds(for: .mediaBox)
let W = a.count > 4 ? CGFloat(Double(a[4])!) : 2000
let sc = W / box.width
let size = NSSize(width: box.width * sc, height: box.height * sc)
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(size.width), pixelsHigh: Int(size.height), bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
let ctx = NSGraphicsContext(bitmapImageRep: rep)!
NSGraphicsContext.current = ctx
ctx.cgContext.setFillColor(NSColor.white.cgColor)
ctx.cgContext.fill(CGRect(origin: .zero, size: size))
ctx.cgContext.scaleBy(x: sc, y: sc)
page.draw(with: .mediaBox, to: ctx.cgContext)
NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: a[3]))
print("\(a[3]) \(Int(size.width))x\(Int(size.height)) / 共 \(doc.pageCount) 页")
