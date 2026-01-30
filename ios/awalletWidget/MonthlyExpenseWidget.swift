import WidgetKit
import SwiftUI

// MARK: - Shared model (must match WidgetDataSync.swift)
struct MonthlyExpenseData: Codable {
  let expense: Double
  let income: Double
  let balance: Double
  let monthStartDay: Int
  let lastUpdated: Date
}

// MARK: - App Group helper
// 프로덕션 위젯은 고정값 사용 (동적 판단 제거로 안정성 향상)
private var appGroupIdentifier: String {
  return "group.com.ssong.awallet"
}

// MARK: - Timeline Entry
struct MonthlyExpenseEntry: TimelineEntry {
  let date: Date
  let data: MonthlyExpenseData?
}

// MARK: - Provider
struct MonthlyExpenseProvider: TimelineProvider {
  func placeholder(in context: Context) -> MonthlyExpenseEntry {
    MonthlyExpenseEntry(
      date: Date(),
      data: MonthlyExpenseData(
        expense: 120000.0,
        income: 300000.0,
        balance: 180000.0,
        monthStartDay: 1,
        lastUpdated: Date()
      )
    )
  }

  func getSnapshot(in context: Context, completion: @escaping (MonthlyExpenseEntry) -> Void) {
    let entry = loadEntry() ?? placeholder(in: context)
    completion(entry)
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<MonthlyExpenseEntry>) -> Void) {
    let entry = loadEntry() ?? MonthlyExpenseEntry(date: Date(), data: nil)

    // 단순히 현재 시점 기준 30분 후에 다시 요청되도록 설정
    let refreshDate = Calendar.current.date(byAdding: .minute, value: 30, to: Date()) ?? Date().addingTimeInterval(1800)
    let timeline = Timeline(entries: [entry], policy: .after(refreshDate))
    completion(timeline)
  }

  private func loadEntry() -> MonthlyExpenseEntry? {
    guard let defaults = UserDefaults(suiteName: appGroupIdentifier),
          let raw = defaults.data(forKey: "monthlyExpenseData") else {
      return nil
    }

    let decoder = JSONDecoder()
    guard let decoded = try? decoder.decode(MonthlyExpenseData.self, from: raw) else {
      return nil
    }

    return MonthlyExpenseEntry(date: Date(), data: decoded)
  }
}

// MARK: - Widget typography (홈/잠금 통일: 타이틀 14, 본문 18)
private enum WidgetFont {
  static let titleSize: CGFloat = 14
  static let bodySize: CGFloat = 18
}

// MARK: - Widget 여백 (상하좌우)
private enum WidgetPadding {
  static let horizontal: CGFloat = 16
  static let vertical: CGFloat = 10
}

// MARK: - View
struct MonthlyExpenseWidgetEntryView: View {
  var entry: MonthlyExpenseProvider.Entry
  @Environment(\.widgetFamily) var family

  var body: some View {
    if #available(iOS 16.0, *) {
      switch family {
      case .accessoryRectangular:
        accessoryRectangularView
      case .accessoryInline:
        accessoryInlineView
      default:
        homeScreenView
      }
    } else {
      homeScreenView
    }
  }

  // 홈 화면 (systemSmall / systemMedium)
  // iOS 17+ containerBackground 사용 시 SpringBoard 호환성 개선 (시뮬레이터 크래시 완화 목적)
  @ViewBuilder
  private var homeScreenView: some View {
    let content = VStack(alignment: .leading, spacing: 2) {
      Text("이번달 소비")
        .font(.system(size: WidgetFont.titleSize, weight: .medium))
        .foregroundColor(Color(white: 0.4))

      Text(formattedExpenseText)
        .font(.system(size: WidgetFont.bodySize, weight: .bold))
        .foregroundColor(.black)
        .lineLimit(1)
        .minimumScaleFactor(0.5)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .padding(EdgeInsets(top: WidgetPadding.vertical, leading: WidgetPadding.horizontal, bottom: WidgetPadding.vertical, trailing: WidgetPadding.horizontal))

    if #available(iOS 17.0, *) {
      content
        .containerBackground(for: .widget) { Color.white }
    } else {
      ZStack(alignment: .leading) {
        Color.white
        content
      }
    }
  }

  // 잠금화면 - 사각 (라벨 + 금액, iOS 16+)
  @available(iOS 16.0, *)
  private var accessoryRectangularView: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text("이번달 소비")
        .font(.system(size: WidgetFont.titleSize))
        .foregroundColor(.secondary)
      Text(formattedExpenseText)
        .font(.system(size: WidgetFont.bodySize, weight: .semibold))
        .lineLimit(1)
        .minimumScaleFactor(0.5)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .padding(EdgeInsets(top: WidgetPadding.vertical, leading: WidgetPadding.horizontal, bottom: WidgetPadding.vertical, trailing: WidgetPadding.horizontal))
  }

  // 잠금화면 - 인라인 (한 줄, iOS 16+)
  @available(iOS 16.0, *)
  private var accessoryInlineView: some View {
    Label(formattedExpenseText, systemImage: "wonsign.circle.fill")
      .font(.system(size: WidgetFont.bodySize, weight: .medium))
      .lineLimit(1)
      .minimumScaleFactor(0.5)
      .padding(.horizontal, WidgetPadding.horizontal)
  }

  /// 홈/사각용: 천 단위 구분 포맷 (예: 120,000원), 정수만 표기
  private var formattedExpenseText: String {
    guard let data = entry.data else {
      return "0원"
    }
    let formatter = NumberFormatter()
    formatter.numberStyle = .decimal
    formatter.maximumFractionDigits = 0
    formatter.minimumFractionDigits = 0
    let value = Int(data.expense)
    let formatted = formatter.string(from: NSNumber(value: value)) ?? "\(value)"
    return "\(formatted)원"
  }

}

// MARK: - Widget
@main
struct MonthlyExpenseWidget: Widget {
  // NOTE: WidgetDataSync.swift에서 reloadTimelines(ofKind:)에 사용하는 kind 값과 일치해야 합니다.
  private let kind: String = "MonthlyExpenseWidget"

  /// iOS 16+ 에서만 잠금화면(accessory) 패밀리 포함
  private static var supportedFamilies: [WidgetFamily] {
    if #available(iOS 16.0, *) {
      return Self.familiesWithAccessory
    } else {
      return [.systemSmall, .systemMedium]
    }
  }

  @available(iOS 16.0, *)
  private static var familiesWithAccessory: [WidgetFamily] {
    [.systemSmall, .systemMedium, .accessoryRectangular, .accessoryInline]
  }

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: MonthlyExpenseProvider()) { entry in
      MonthlyExpenseWidgetEntryView(entry: entry)
    }
    .configurationDisplayName("이번달 소비")
    .description("이번달 소비 금액을 한눈에 확인할 수 있어요.")
    .supportedFamilies(Self.supportedFamilies)
  }
}

