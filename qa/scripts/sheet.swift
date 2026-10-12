// 프레임 여러 장 → 6열 시트 한 장 (파일명 라벨 포함)
// usage: swift qa/scripts/sheet.swift <출력.png> <프레임들...>
import AppKit

let a = CommandLine.arguments
guard a.count >= 3 else {
  print("usage: sheet.swift <out.png> <frames...>")
  exit(1)
}
let files = Array(a[2...]), cols = 6
let imgs = files.compactMap { NSImage(contentsOfFile: $0) }
guard let first = imgs.first else {
  print("no readable frames")
  exit(1)
}
let w = first.size.width, h = first.size.height
let rows = (imgs.count + cols - 1) / cols
let sheet = NSImage(size: NSSize(width: w * CGFloat(cols), height: (h + 24) * CGFloat(rows)))
sheet.lockFocus()
NSColor.white.setFill()
NSRect(origin: .zero, size: sheet.size).fill()
for (i, img) in imgs.enumerated() {
  let x = CGFloat(i % cols) * w, y = sheet.size.height - CGFloat(i / cols + 1) * (h + 24)
  img.draw(in: NSRect(x: x, y: y, width: w, height: h))
  ((files[i] as NSString).lastPathComponent as NSString).draw(
    at: NSPoint(x: x + 4, y: y + h + 4),
    withAttributes: [.font: NSFont.boldSystemFont(ofSize: 14), .foregroundColor: NSColor.red])
}
sheet.unlockFocus()
try NSBitmapImageRep(data: sheet.tiffRepresentation!)!.representation(using: .png, properties: [:])!
  .write(to: URL(fileURLWithPath: a[1]))
print("sheet → \(a[1])")
