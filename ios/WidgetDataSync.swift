import Foundation
import React
import WidgetKit

@objc(WidgetDataSync)
class WidgetDataSync: RCTEventEmitter {
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

  override func supportedEvents() -> [String]! {
    [SmsInboxPendingDarwin.eventName]
  }

  override func startObserving() {
    SmsInboxPendingDarwinObserver.shared.attach { [weak self] in
      self?.sendEvent(withName: SmsInboxPendingDarwin.eventName, body: nil)
    }
  }

  override func stopObserving() {
    SmsInboxPendingDarwinObserver.shared.detach()
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

  /// 재설치 검증용. `sms-inbox-3` = peek + id ack (성공 시에만 삭제).
  @objc(getSmsInboxBridgeVersion:rejecter:)
  func getSmsInboxBridgeVersion(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    resolve("sms-inbox-3")
  }

  /// App Intent가 쌓아 둔 문자 수신함 대기 큐를 읽고 비운다. (레거시·진단용)
  @objc(drainPendingSmsInbox:rejecter:)
  func drainPendingSmsInbox(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    resolve(SmsInboxAppGroupQueue.drain())
  }

  /// 대기 큐만 조회 (비우지 않음).
  @objc(peekPendingSmsInbox:rejecter:)
  func peekPendingSmsInbox(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    resolve(SmsInboxAppGroupQueue.peek())
  }

  /// 처리 성공한 대기 항목만 id로 제거한다.
  @objc(acknowledgePendingSmsInbox:resolver:rejecter:)
  func acknowledgePendingSmsInbox(
    _ ids: [String],
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    SmsInboxAppGroupQueue.acknowledge(ids: ids)
    resolve(nil)
  }

  /// App Intent 마지막 enqueue/skip 기록 (진단용).
  @objc(getSmsInboxLastIntent:rejecter:)
  func getSmsInboxLastIntent(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    resolve(SmsInboxAppGroupQueue.lastIntent() ?? NSNull())
  }

  @objc
  override static func requiresMainQueueSetup() -> Bool {
    return true
  }

  @objc
  override static func moduleName() -> String! {
    return "WidgetDataSync"
  }
}

// MARK: - Darwin notify (App Intent process → foreground RN)

enum SmsInboxPendingDarwin {
  static let eventName = "SmsInboxPendingEnqueued"

  static var notifyName: CFNotificationName {
    let bundleId = Bundle.main.bundleIdentifier ?? "com.ssong.awallet"
    return CFNotificationName("\(bundleId).smsInboxPendingEnqueued" as CFString)
  }

  static func post() {
    CFNotificationCenterPostNotification(
      CFNotificationCenterGetDarwinNotifyCenter(),
      notifyName,
      nil,
      nil,
      true
    )
  }
}

final class SmsInboxPendingDarwinObserver {
  static let shared = SmsInboxPendingDarwinObserver()

  private var handler: (() -> Void)?
  private var registered = false

  func attach(handler: @escaping () -> Void) {
    self.handler = handler
    guard !registered else { return }
    registered = true
    let name = SmsInboxPendingDarwin.notifyName
    CFNotificationCenterAddObserver(
      CFNotificationCenterGetDarwinNotifyCenter(),
      Unmanaged.passUnretained(self).toOpaque(),
      { _, observer, _, _, _ in
        guard let observer else { return }
        let box = Unmanaged<SmsInboxPendingDarwinObserver>.fromOpaque(observer).takeUnretainedValue()
        DispatchQueue.main.async {
          box.handler?()
        }
      },
      name.rawValue,
      nil,
      .deliverImmediately
    )
  }

  func detach() {
    handler = nil
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

  static let lastIntentKey = "smsInboxLastIntent"

  static func enqueue(body: String, sender: String = "") {
    let trimmed = body.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      recordLastIntent(ok: false, reason: "empty-body", sender: sender)
      return
    }
    guard let defaults = UserDefaults(suiteName: appGroupIdentifier) else {
      recordLastIntent(ok: false, reason: "app-group-unavailable", sender: sender)
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
    recordLastIntent(ok: true, reason: "enqueued", sender: senderTrimmed, bodyPreview: String(trimmed.prefix(80)))
    // 포그라운드 RN이 flush할 수 있게 프로세스 간 신호
    SmsInboxPendingDarwin.post()
  }

  /// 대기 항목을 반환하고 큐를 비운다. (레거시·진단용)
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

  /// 처리 성공 id만 제거. 실패 항목은 다음 flush에서 재시도.
  static func acknowledge(ids: [String]) {
    guard !ids.isEmpty else { return }
    guard let defaults = UserDefaults(suiteName: appGroupIdentifier) else { return }
    let remove = Set(ids)
    let next = loadQueue(from: defaults).filter { entry in
      guard let id = entry["id"] as? String else { return true }
      return !remove.contains(id)
    }
    defaults.set(next, forKey: storageKey)
    defaults.synchronize()
  }

  static func lastIntent() -> [String: Any]? {
    guard let defaults = UserDefaults(suiteName: appGroupIdentifier) else { return nil }
    return defaults.dictionary(forKey: lastIntentKey)
  }

  private static func recordLastIntent(
    ok: Bool,
    reason: String,
    sender: String,
    bodyPreview: String = ""
  ) {
    guard let defaults = UserDefaults(suiteName: appGroupIdentifier) else { return }
    defaults.set(
      [
        "ok": ok,
        "reason": reason,
        "sender": sender.trimmingCharacters(in: .whitespacesAndNewlines),
        "bodyPreview": bodyPreview,
        "at": ISO8601DateFormatter().string(from: Date()),
      ] as [String: Any],
      forKey: lastIntentKey
    )
    defaults.synchronize()
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
