// 이모지를 Apple Color Emoji로 렌더링해 대표색을 계산한다 (macOS 전용).
// 입력: stdin에 이모지 한 줄에 하나. 출력: "이모지<TAB>#RRGGBB" 또는 "이모지<TAB>-"(무채색: 대표색 없음).
//
// 대표색 = 색상(hue)을 12구간으로 나눠, 채도·명도로 가중한 픽셀이 가장 많이 모인 구간의 가중 평균색.
// 뚜렷한 색 픽셀이 거의 없는 무채색 이모지는 불투명 픽셀 평균색을 쓰고,
// 그 평균이 흰색에 가까우면(밝기 0.8 초과) 흰 배경에서 안 보이므로 "-"로 두어 앱이 기본 회색 배경을 쓰게 한다.
import CoreGraphics
import CoreText
import Foundation

let canvas = 220
let font = CTFontCreateWithName("AppleColorEmoji" as CFString, 100, nil)

func render(_ text: String) -> [UInt8] {
  var data = [UInt8](repeating: 0, count: canvas * canvas * 4)
  data.withUnsafeMutableBytes { raw in
    guard
      let ctx = CGContext(
        data: raw.baseAddress, width: canvas, height: canvas, bitsPerComponent: 8,
        bytesPerRow: canvas * 4, space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
    else { return }
    let attr = NSAttributedString(string: text, attributes: [kCTFontAttributeName as NSAttributedString.Key: font])
    let line = CTLineCreateWithAttributedString(attr)
    ctx.textPosition = CGPoint(x: 30, y: 70)
    CTLineDraw(line, ctx)
  }
  return data
}

func rgbToHsv(_ r: Double, _ g: Double, _ b: Double) -> (h: Double, s: Double, v: Double) {
  let mx = max(r, g, b), mn = min(r, g, b), d = mx - mn
  var h = 0.0
  if d > 0 {
    if mx == r { h = ((g - b) / d).truncatingRemainder(dividingBy: 6) }
    else if mx == g { h = (b - r) / d + 2 }
    else { h = (r - g) / d + 4 }
    h *= 60
    if h < 0 { h += 360 }
  }
  return (h, mx == 0 ? 0 : d / mx, mx)
}

func dominant(_ data: [UInt8]) -> String {
  var opaque = 0
  var meanR = 0.0, meanG = 0.0, meanB = 0.0
  var weight = [Double](repeating: 0, count: 12)
  var sr = [Double](repeating: 0, count: 12), sg = sr, sb = sr
  for i in stride(from: 0, to: data.count, by: 4) {
    let a = Double(data[i + 3]) / 255
    if a < 0.8 { continue }
    opaque += 1
    // premultiplied → straight
    let r = min(1, Double(data[i]) / 255 / a), g = min(1, Double(data[i + 1]) / 255 / a), b = min(1, Double(data[i + 2]) / 255 / a)
    meanR += r; meanG += g; meanB += b
    let hsv = rgbToHsv(r, g, b)
    if hsv.s < 0.3 || hsv.v < 0.25 { continue }  // 무채색·너무 어두운 픽셀은 색 판단에서 제외
    let w = hsv.s * hsv.v
    let bin = min(11, Int(hsv.h / 30))
    weight[bin] += w
    sr[bin] += w * r; sg[bin] += w * g; sb[bin] += w * b
  }
  guard opaque > 0 else { return "-" }
  var best = 0
  for i in 1..<12 where weight[i] > weight[best] { best = i }
  func hex(_ v: Double, _ d: Double) -> String { String(format: "%02X", Int((v / d * 255).rounded())) }
  // 뚜렷한 색 픽셀이 전체(불투명)의 3% 미만이면 무채색 이모지로 본다 → 평균색 (너무 밝으면 대표색 없음)
  if weight[best] < Double(opaque) * 0.03 {
    let n = Double(opaque)
    let luminance = 0.2126 * meanR / n + 0.7152 * meanG / n + 0.0722 * meanB / n
    if luminance > 0.8 { return "-" }
    return "#" + hex(meanR, n) + hex(meanG, n) + hex(meanB, n)
  }
  let w = weight[best]
  return "#" + hex(sr[best], w) + hex(sg[best], w) + hex(sb[best], w)
}

while let line = readLine(strippingNewline: true) {
  let e = line.trimmingCharacters(in: .whitespaces)
  if e.isEmpty { continue }
  print("\(e)\t\(dominant(render(e)))")
}
