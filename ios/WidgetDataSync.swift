import Foundation
import React
import WidgetKit

@objc(WidgetDataSync)
class WidgetDataSync: NSObject, RCTBridgeModule {
  private let revealStateKey = "monthlyExpenseRevealState"
  private let revealUntilKey = "monthlyExpenseRevealUntil"

  /// App Group identifier is chosen based on the current bundle id.
  /// - Production app:  com.ssong.awallet              → group.com.ssong.awallet
  /// - Stage app:       com.ssong.awallet.stage        → group.com.ssong.awallet.stage
  private var appGroupIdentifier: String {
    let bundleId = Bundle.main.bundleIdentifier ?? ""
    if bundleId.contains(".stage") {
      return "group.com.ssong.awallet.stage"
    } else {
      return "group.com.ssong.awallet"
    }
  }

  @objc
  func saveMonthlyExpenseData(
    _ data: [String: Any],
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let sharedDefaults = UserDefaults(suiteName: appGroupIdentifier) else {
      reject("ERROR", "Failed to access App Group UserDefaults", nil)
      return
    }

    // React Native 브릿지는 number를 NSNumber로 넘김. as? Double/Int는 실패하므로 NSNumber로 파싱.
    guard let expense = (data["expense"] as? NSNumber)?.doubleValue,
          let income = (data["income"] as? NSNumber)?.doubleValue,
          let balance = (data["balance"] as? NSNumber)?.doubleValue else {
      reject("ERROR", "Invalid data format (expense/income/balance)", nil)
      return
    }
    let monthStartDay = (data["monthStartDay"] as? NSNumber)?.intValue ?? 1

    let expenseData = MonthlyExpenseData(
      expense: expense,
      income: income,
      balance: balance,
      monthStartDay: monthStartDay,
      lastUpdated: Date()
    )

    do {
      let encoder = JSONEncoder()
      encoder.dateEncodingStrategy = .deferredToDate
      let encoded = try encoder.encode(expenseData)
      sharedDefaults.set(encoded, forKey: "monthlyExpenseData")
      sharedDefaults.synchronize()

      // App Group 쓰기가 위젯 프로세스에 보이도록 짧은 지연 후 reload (iOS가 getTimeline 호출 시점을 늦출 수 있음)
      let bundleId = Bundle.main.bundleIdentifier ?? ""
      let widgetKind = bundleId.contains(".stage") ? "MonthlyExpenseWidgetStage" : "MonthlyExpenseWidget"
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
        WidgetCenter.shared.reloadTimelines(ofKind: widgetKind)
        WidgetCenter.shared.reloadAllTimelines()
        resolve(nil)
      }
    } catch {
      reject("ERROR", "Failed to encode data: \(error.localizedDescription)", error)
    }
  }

  @objc
  func clearMonthlyExpenseRevealState(
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let sharedDefaults = UserDefaults(suiteName: appGroupIdentifier) else {
      reject("ERROR", "Failed to access App Group UserDefaults", nil)
      return
    }

    sharedDefaults.set(false, forKey: revealStateKey)
    sharedDefaults.removeObject(forKey: revealUntilKey)
    sharedDefaults.synchronize()

    let bundleId = Bundle.main.bundleIdentifier ?? ""
    let widgetKind = bundleId.contains(".stage") ? "MonthlyExpenseWidgetStage" : "MonthlyExpenseWidget"
    WidgetCenter.shared.reloadTimelines(ofKind: widgetKind)
    WidgetCenter.shared.reloadAllTimelines()
    resolve(nil)
  }

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return true
  }

  @objc
  static func moduleName() -> String {
    return "WidgetDataSync"
  }
}

// MARK: - Data Model
struct MonthlyExpenseData: Codable {
  let expense: Double
  let income: Double
  let balance: Double
  let monthStartDay: Int
  let lastUpdated: Date
}

