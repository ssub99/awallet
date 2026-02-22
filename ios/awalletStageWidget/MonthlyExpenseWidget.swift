import WidgetKit
import SwiftUI
import AppIntents

// MARK: - Shared model (must match WidgetDataSync.swift)
struct MonthlyExpenseData: Codable {
  let expense: Double
  let income: Double
  let balance: Double
  let monthStartDay: Int
  let lastUpdated: Date
}

// MARK: - App Group helper
// 스테이지 위젯은 고정값 사용 (동적 판단 제거로 안정성 향상)
private var appGroupIdentifier: String {
  return "group.com.ssong.awallet.stage"
}

private let revealStateKey = "monthlyExpenseRevealState"
private let revealUntilKey = "monthlyExpenseRevealUntil"
private let widgetKind = "MonthlyExpenseWidgetStage"
private let monthlyExpenseDeepLink = "awallet:///"
private let revealDuration: TimeInterval = 5

// MARK: - Timeline Entry
struct MonthlyExpenseEntry: TimelineEntry {
  let date: Date
  let data: MonthlyExpenseData?
  let isRevealed: Bool
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
      ),
      isRevealed: false
    )
  }

  func getSnapshot(in context: Context, completion: @escaping (MonthlyExpenseEntry) -> Void) {
    let entry = loadEntry() ?? placeholder(in: context)
    completion(entry)
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<MonthlyExpenseEntry>) -> Void) {
    let entry = loadEntry() ?? MonthlyExpenseEntry(date: Date(), data: nil, isRevealed: false)

    let now = Date()
    let entries: [MonthlyExpenseEntry]
    let refreshDate: Date

    if entry.isRevealed {
      // 공개 상태: 지금(공개) + 5초 후(마스킹) 두 엔트리로 전달 → 시스템이 시간 되면 자동 전환
      let maskedEntry = MonthlyExpenseEntry(date: now.addingTimeInterval(revealDuration), data: entry.data, isRevealed: false)
      entries = [entry, maskedEntry]
      refreshDate = now.addingTimeInterval(revealDuration + 1)
    } else {
      entries = [entry]
      refreshDate = Calendar.current.date(byAdding: .minute, value: 30, to: now) ?? now.addingTimeInterval(1800)
    }

    let timeline = Timeline(entries: entries, policy: .after(refreshDate))
    completion(timeline)
  }

  private func loadEntry() -> MonthlyExpenseEntry? {
    guard let defaults = UserDefaults(suiteName: appGroupIdentifier),
          let raw = defaults.data(forKey: "monthlyExpenseData") else {
      return nil
    }

    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .deferredToDate
    guard let decoded = try? decoder.decode(MonthlyExpenseData.self, from: raw) else {
      return nil
    }

    let revealUntil = defaults.double(forKey: revealUntilKey)
    let isRevealed = defaults.bool(forKey: revealStateKey) && revealUntil > Date().timeIntervalSince1970
    if !isRevealed {
      defaults.set(false, forKey: revealStateKey)
      defaults.removeObject(forKey: revealUntilKey)
    }
    return MonthlyExpenseEntry(date: Date(), data: decoded, isRevealed: isRevealed)
  }
}

@available(iOS 17.0, *)
struct RevealMonthlyExpenseIntent: AppIntent {
  static var title: LocalizedStringResource = "Reveal Monthly Expense"

  func perform() async throws -> some IntentResult {
    guard let defaults = UserDefaults(suiteName: appGroupIdentifier) else {
      return .result()
    }

    defaults.set(true, forKey: revealStateKey)
    defaults.set(Date().addingTimeInterval(revealDuration).timeIntervalSince1970, forKey: revealUntilKey)
    defaults.synchronize()
    WidgetCenter.shared.reloadTimelines(ofKind: widgetKind)
    return .result()
  }
}

// MARK: - Widget typography (홈/잠금 통일: 타이틀 12, 본문 21)
private enum WidgetFont {
  static let titleSize: CGFloat = 12
  static let bodySize: CGFloat = 21
}

// MARK: - Widget 여백 (상하좌우, 타이틀-본문 간격)
private enum WidgetPadding {
  static let horizontal: CGFloat = 16
  static let vertical: CGFloat = 8
  static let titleBodySpacing: CGFloat = 4
}

// MARK: - View
struct MonthlyExpenseWidgetEntryView: View {
  var entry: MonthlyExpenseProvider.Entry
  @Environment(\.widgetFamily) var family

  var body: some View {
    switch family {
    case .accessoryRectangular:
      accessoryRectangularView
    case .accessoryInline:
      accessoryInlineView
    default:
      accessoryRectangularView
    }
  }

  // 잠금화면 - 사각 (라벨 + 금액, iOS 16+)
  private var accessoryRectangularView: some View {
    VStack(alignment: .leading, spacing: WidgetPadding.titleBodySpacing) {
      Text("이번달 소비")
        .font(.system(size: WidgetFont.titleSize))
        .foregroundColor(.secondary)
      amountView
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .padding(EdgeInsets(top: WidgetPadding.vertical, leading: WidgetPadding.horizontal, bottom: WidgetPadding.vertical, trailing: WidgetPadding.horizontal))
  }

  // 잠금화면 - 인라인 (한 줄, iOS 16+)
  private var accessoryInlineView: some View {
    HStack(spacing: 4) {
      Image(systemName: "wonsign.circle.fill")
      amountView
    }
    .font(.system(size: WidgetFont.bodySize, weight: .medium))
    .lineLimit(1)
    .minimumScaleFactor(0.5)
    .padding(.horizontal, WidgetPadding.horizontal)
  }

  @ViewBuilder
  private var amountView: some View {
    if entry.isRevealed, let destination = URL(string: monthlyExpenseDeepLink) {
      Link(destination: destination) {
        Text(formattedExpenseText)
          .font(.system(size: WidgetFont.bodySize, weight: .semibold))
          .lineLimit(1)
          .minimumScaleFactor(0.5)
      }
    } else if #available(iOS 17.0, *) {
      Button(intent: RevealMonthlyExpenseIntent()) {
        Text(formattedExpenseText)
          .font(.system(size: WidgetFont.bodySize, weight: .semibold))
          .lineLimit(1)
          .minimumScaleFactor(0.5)
          .blur(radius: 8)
      }
      .buttonStyle(.plain)
    } else {
      Text(formattedExpenseText)
        .font(.system(size: WidgetFont.bodySize, weight: .semibold))
        .lineLimit(1)
        .minimumScaleFactor(0.5)
        .blur(radius: 8)
    }
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
  // Stage 위젯은 별도의 kind를 사용하여 프로덕션과 구분합니다.
  private let kind: String = widgetKind

  private static let supportedFamilies: [WidgetFamily] = [.accessoryRectangular, .accessoryInline]

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: MonthlyExpenseProvider()) { entry in
      MonthlyExpenseWidgetEntryView(entry: entry)
    }
    .configurationDisplayName("이번달 소비")
    .description("이번달 소비 금액을 한눈에 확인할 수 있어요.")
    .supportedFamilies(Self.supportedFamilies)
  }
}
