// 영상 → 프레임 PNG 추출 (ffmpeg 없이 macOS AVFoundation)
// usage: swift qa/scripts/frames.swift <영상> <출력폴더> <시작초> <끝초> <간격초> [크롭시작비율] [크롭높이비율]
import AVFoundation
import AppKit

let a = CommandLine.arguments
guard a.count >= 6 else {
  print("usage: frames.swift <video> <outDir> <start> <end> <step> [cropTopRatio] [cropHeightRatio]")
  exit(1)
}
let cropTop = a.count > 6 ? Double(a[6])! : 0.0
let cropH = a.count > 7 ? Double(a[7])! : 1.0
try FileManager.default.createDirectory(atPath: a[2], withIntermediateDirectories: true)
let gen = AVAssetImageGenerator(asset: AVURLAsset(url: URL(fileURLWithPath: a[1])))
gen.requestedTimeToleranceBefore = .zero
gen.requestedTimeToleranceAfter = .zero
gen.maximumSize = CGSize(width: 360, height: 760)
var t = Double(a[3])!, i = 0, written = 0
while t <= Double(a[4])! {
  do {
    let cg = try gen.copyCGImage(at: CMTime(seconds: t, preferredTimescale: 600), actualTime: nil)
    if let crop = cg.cropping(to: CGRect(x: 0, y: Int(Double(cg.height) * cropTop), width: cg.width, height: Int(Double(cg.height) * cropH))) {
      try NSBitmapImageRep(cgImage: crop).representation(using: .png, properties: [:])!
        .write(to: URL(fileURLWithPath: "\(a[2])/" + String(format: "f%03d_%04dms.png", i, Int(t * 1000))))
      written += 1
    }
  } catch {
    print("skip \(t)s: \(error.localizedDescription)")
  }
  t += Double(a[5])!
  i += 1
}
print("\(written)/\(i) frames → \(a[2])")
