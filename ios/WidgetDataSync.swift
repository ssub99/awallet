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

  @objc(clearMonthlyExpenseRevealState:rejecter:)
  func clearMonthlyExpenseRevealState(
    _ resolve: @escaping RCTPromiseResolveBlock,
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

  /// 재설치 검증용. 값이 `sms-inbox-1`이면 peek/drain 포함 빌드.
  @objc(getSmsInboxBridgeVersion:rejecter:)
  func getSmsInboxBridgeVersion(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    resolve("sms-inbox-1")
  }

  /// App Intent가 쌓아 둔 문자 수신함 대기 큐를 읽고 비운다.
  @objc(drainPendingSmsInbox:rejecter:)
  func drainPendingSmsInbox(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let items = SmsInboxAppGroupQueue.drain()
    NSLog("[SmsInbox] drain count=%d", items.count)
    resolve(items)
  }

  /// 대기 큐만 조회 (비우지 않음) — 전송/수신 검증용.
  @objc(peekPendingSmsInbox:rejecter:)
  func peekPendingSmsInbox(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let items = SmsInboxAppGroupQueue.peek()
    NSLog("[SmsInbox] peek count=%d", items.count)
    resolve(items)
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

// MARK: - SMS inbox pending queue (App Intent → JS)

enum SmsInboxAppGroupQueue {
  static let storageKey = "smsInboxPendingQueue"

  private static var appGroupIdentifier: String {
    let bundleId = Bundle.main.bundleIdentifier ?? ""
    if bundleId.contains(".stage") {
      return "group.com.ssong.awallet.stage"
    }
    return "group.com.ssong.awallet"
  }

  static func enqueue(body: String, sender: String = "") {
    let trimmed = body.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      NSLog("[SmsInbox] enqueue skipped: empty body")
      return
    }
    guard let defaults = UserDefaults(suiteName: appGroupIdentifier) else {
      NSLog("[SmsInbox] enqueue failed: no App Group %@", appGroupIdentifier)
      return
    }

    let senderTrimmed = sender.trimmingCharacters(in: .whitespacesAndNewlines)
    var queue = loadQueue(from: defaults)
    queue.append([
      "id": UUID().uuidString,
      "body": trimmed,
      "sender": senderTrimmed,
      "enqueuedAt": ISO8601DateFormatter().string(from: Date()),
    ])
    defaults.set(queue, forKey: storageKey)
    defaults.synchronize()
    NSLog(
      "[SmsInbox] enqueue ok group=%@ queueCount=%d bodyLen=%d senderLen=%d",
      appGroupIdentifier,
      queue.count,
      trimmed.count,
      senderTrimmed.count
    )
  }

  /// 대기 항목을 반환하고 큐를 비운다.
  static func drain() -> [[String: Any]] {
    guard let defaults = UserDefaults(suiteName: appGroupIdentifier) else {
      return []
    }
    let queue = loadQueue(from: defaults)
    defaults.removeObject(forKey: storageKey)
    defaults.synchronize()
    return queue
  }

  /// 대기 항목만 조회 (큐 유지).
  static func peek() -> [[String: Any]] {
    guard let defaults = UserDefaults(suiteName: appGroupIdentifier) else {
      return []
    }
    return loadQueue(from: defaults)
  }

  private static func loadQueue(from defaults: UserDefaults) -> [[String: Any]] {
    guard let raw = defaults.array(forKey: storageKey) else {
      return []
    }
    return raw.compactMap { entry in
      guard let dict = entry as? [String: Any],
            let body = dict["body"] as? String,
            !body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      else {
        return nil
      }
      return dict
    }
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

