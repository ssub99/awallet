import Darwin
import Foundation
import React
import UIKit
import UserNotifications
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
    [RecordInboxPendingDarwin.eventName]
  }

  override func startObserving() {
    RecordInboxPendingDarwinObserver.shared.attach { [weak self] in
      self?.sendEvent(withName: RecordInboxPendingDarwin.eventName, body: nil)
    }
  }

  override func stopObserving() {
    RecordInboxPendingDarwinObserver.shared.detach()
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

  /// App Intent가 쌓아 둔 기록 수신함 대기 큐를 읽고 비운다. (레거시·진단용)
  @objc(drainPendingSmsInbox:rejecter:)
  func drainPendingSmsInbox(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    resolve(RecordInboxAppGroupQueue.drain())
  }

  /// 대기 큐만 조회 (비우지 않음).
  @objc(peekPendingSmsInbox:rejecter:)
  func peekPendingSmsInbox(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    resolve(RecordInboxAppGroupQueue.peek())
  }

  /// 처리 성공한 대기 항목만 id로 제거한다.
  @objc(acknowledgePendingSmsInbox:resolver:rejecter:)
  func acknowledgePendingSmsInbox(
    _ ids: [String],
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    RecordInboxAppGroupQueue.acknowledge(ids: ids)
    resolve(nil)
  }

  /// App Intent 마지막 enqueue/skip 기록 (진단용).
  @objc(getSmsInboxLastIntent:rejecter:)
  func getSmsInboxLastIntent(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    resolve(RecordInboxAppGroupQueue.lastIntent() ?? NSNull())
  }

  /// JS 수신함 실건수 → App Group lastSynced + 아이콘 뱃지 재맞춤.
  @objc(setRecordInboxSyncedCount:resolver:rejecter:)
  func setRecordInboxSyncedCount(
    _ count: NSNumber,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    RecordInboxIconBadge.setLastSynced(count.intValue)
    resolve(nil)
  }

  /// 리셋·수신함 비우기 — 큐/lastSynced/아이콘 뱃지 제거.
  @objc(clearSmsInboxNativeState:rejecter:)
  func clearSmsInboxNativeState(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    RecordInboxAppGroupQueue.clearAll()
    RecordInboxIconBadge.clear()
    resolve(nil)
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

enum RecordInboxPendingDarwin {
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

final class RecordInboxPendingDarwinObserver {
  static let shared = RecordInboxPendingDarwinObserver()

  private var handler: (() -> Void)?
  private var registered = false

  func attach(handler: @escaping () -> Void) {
    self.handler = handler
    guard !registered else { return }
    registered = true
    let name = RecordInboxPendingDarwin.notifyName
    CFNotificationCenterAddObserver(
      CFNotificationCenterGetDarwinNotifyCenter(),
      Unmanaged.passUnretained(self).toOpaque(),
      { _, observer, _, _, _ in
        guard let observer else { return }
        let box = Unmanaged<RecordInboxPendingDarwinObserver>.fromOpaque(observer).takeUnretainedValue()
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

enum RecordInboxAppGroupQueue {
  /// 레거시 UserDefaults 키 — 파일 큐로 이전 후 제거
  static let storageKey = "smsInboxPendingQueue"
  private static let queueFileName = "smsInboxPendingQueue.json"
  private static let lockFileName = "smsInboxPendingQueue.lock"
  private static let maxPendingCount = 200

  static var appGroupIdentifier: String {
    let bundleId = Bundle.main.bundleIdentifier ?? ""
    if bundleId.contains(".stage") {
      return "group.com.ssong.awallet.stage"
    }
    return "group.com.ssong.awallet"
  }

  static let lastIntentKey = "smsInboxLastIntent"

  /// Android `SUPPORTED_TRANSACTION_KEYWORDS`와 동일
  private static let supportedTransactionKeywords = ["취소", "승인", "출금"]

  static func hasSupportedTransactionKeyword(_ body: String) -> Bool {
    supportedTransactionKeywords.contains { body.contains($0) }
  }

  /// source: "sms"(문자 수신함 Intent) | "app"(알림 수신함 Intent) — JS가 수신 설정 분기에 사용
  /// 동시 Intent(보험 결제 2건 등)는 App Group 파일 + flock으로 직렬화해 유실 방지.
  static func enqueue(body: String, sender: String = "", source: String = "sms") {
    let trimmed = body.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      recordLastIntent(ok: false, reason: "empty-body", sender: sender)
      return
    }
    let senderTrimmed = sender.trimmingCharacters(in: .whitespacesAndNewlines)
    // 결제 후보만 큐·뱃지 반영. 마케팅 등은 lastIntent만 남기고 스킵 (Android 리스너와 동일).
    guard hasSupportedTransactionKeyword(trimmed) else {
      recordLastIntent(
        ok: false,
        reason: "no-keyword",
        sender: senderTrimmed,
        bodyPreview: String(trimmed.prefix(80))
      )
      return
    }
    guard UserDefaults(suiteName: appGroupIdentifier) != nil else {
      recordLastIntent(ok: false, reason: "app-group-unavailable", sender: senderTrimmed)
      return
    }

    let entry: [String: Any] = [
      "id": UUID().uuidString,
      "body": trimmed,
      "sender": senderTrimmed,
      "source": source,
      "enqueuedAt": ISO8601DateFormatter().string(from: Date()),
    ]
    withQueueLock {
      var queue = readQueueUnlocked()
      queue.append(entry)
      if queue.count > maxPendingCount {
        queue = Array(queue.suffix(maxPendingCount))
      }
      writeQueueUnlocked(queue)
    }
    recordLastIntent(ok: true, reason: "enqueued", sender: senderTrimmed, bodyPreview: String(trimmed.prefix(80)))
    RecordInboxIconBadge.refresh()
    RecordInboxPendingDarwin.post()
  }

  /// 대기 항목을 반환하고 큐를 비운다. (레거시·진단용)
  static func drain() -> [[String: Any]] {
    var drained: [[String: Any]] = []
    withQueueLock {
      drained = readQueueUnlocked()
      writeQueueUnlocked([])
    }
    RecordInboxIconBadge.refresh()
    return drained
  }

  /// 대기 항목만 조회 (큐 유지).
  static func peek() -> [[String: Any]] {
    var queue: [[String: Any]] = []
    withQueueLock {
      queue = readQueueUnlocked()
    }
    return queue
  }

  /// 처리 성공 id만 제거. 실패 항목은 다음 flush에서 재시도.
  static func acknowledge(ids: [String]) {
    guard !ids.isEmpty else { return }
    let remove = Set(ids)
    withQueueLock {
      let next = readQueueUnlocked().filter { entry in
        guard let id = entry["id"] as? String else { return true }
        return !remove.contains(id)
      }
      writeQueueUnlocked(next)
    }
  }

  /// 리셋: pending 큐·lastIntent 제거 (뱃지는 RecordInboxIconBadge.clear).
  static func clearAll() {
    withQueueLock {
      writeQueueUnlocked([])
      if let defaults = UserDefaults(suiteName: appGroupIdentifier) {
        defaults.removeObject(forKey: storageKey)
        defaults.removeObject(forKey: lastIntentKey)
        defaults.removeObject(forKey: RecordInboxIconBadge.lastSyncedKey)
        defaults.synchronize()
      }
    }
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

  // MARK: - File queue + cross-process lock (Android FileLock과 동일 목적)

  private static func containerDirectory() -> URL? {
    FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupIdentifier)
  }

  private static func queueFileURL() -> URL? {
    containerDirectory()?.appendingPathComponent(queueFileName)
  }

  private static func withQueueLock(_ body: () -> Void) {
    guard let dir = containerDirectory() else {
      body()
      return
    }
    let lockPath = dir.appendingPathComponent(lockFileName).path
    let fd = open(lockPath, O_CREAT | O_RDWR, 0o644)
    guard fd >= 0 else {
      body()
      return
    }
    defer { close(fd) }
    flock(fd, LOCK_EX)
    defer { flock(fd, LOCK_UN) }
    body()
  }

  private static func normalizeQueueEntries(_ raw: [Any]) -> [[String: Any]] {
    raw.compactMap { entry in
      guard let dict = entry as? [String: Any],
            let body = dict["body"] as? String,
            !body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      else {
        return nil
      }
      return dict
    }
  }

  private static func readQueueUnlocked() -> [[String: Any]] {
    if let url = queueFileURL(),
       let data = try? Data(contentsOf: url),
       let json = try? JSONSerialization.jsonObject(with: data),
       let array = json as? [Any]
    {
      return normalizeQueueEntries(array)
    }

    // 레거시 UserDefaults → 파일 이전 (한 번)
    if let defaults = UserDefaults(suiteName: appGroupIdentifier),
       let legacy = defaults.array(forKey: storageKey)
    {
      let migrated = normalizeQueueEntries(legacy)
      writeQueueUnlocked(migrated)
      defaults.removeObject(forKey: storageKey)
      defaults.synchronize()
      return migrated
    }
    return []
  }

  private static func writeQueueUnlocked(_ queue: [[String: Any]]) {
    guard let url = queueFileURL() else { return }
    let tmp = url.appendingPathExtension("tmp")
    do {
      let data = try JSONSerialization.data(withJSONObject: queue, options: [])
      try data.write(to: tmp, options: [.atomic])
      if FileManager.default.fileExists(atPath: url.path) {
        try FileManager.default.removeItem(at: url)
      }
      try FileManager.default.moveItem(at: tmp, to: url)
    } catch {
      try? FileManager.default.removeItem(at: tmp)
    }
  }

  /// 뱃지 갱신용 pending 건수 (락 포함)
  static func pendingCount() -> Int {
    peek().count
  }
}

// MARK: - App icon badge (기록 수신함 미확인 = lastSynced + pending)

enum RecordInboxIconBadge {
  static let lastSyncedKey = "recordInboxLastSyncedCount"

  /// JS 확정 실건수. 뱃지는 count만 (flush 중 pending 이중 집계 방지).
  static func setLastSynced(_ count: Int) {
    guard let defaults = UserDefaults(suiteName: RecordInboxAppGroupQueue.appGroupIdentifier) else {
      return
    }
    let safe = max(0, count)
    defaults.set(safe, forKey: lastSyncedKey)
    defaults.synchronize()
    apply(safe)
  }

  /// enqueue 직후: lastSynced + pending (파일 큐 건수)
  static func refresh(using defaults: UserDefaults? = nil) {
    let suite = defaults ?? UserDefaults(suiteName: RecordInboxAppGroupQueue.appGroupIdentifier)
    let synced = max(0, suite?.integer(forKey: lastSyncedKey) ?? 0)
    let pending = RecordInboxAppGroupQueue.pendingCount()
    apply(synced + pending)
  }

  static func clear() {
    guard let defaults = UserDefaults(suiteName: RecordInboxAppGroupQueue.appGroupIdentifier) else {
      apply(0)
      return
    }
    defaults.set(0, forKey: lastSyncedKey)
    defaults.synchronize()
    apply(0)
  }

  private static func apply(_ count: Int) {
    let value = max(0, count)
    if #available(iOS 16.0, *) {
      UNUserNotificationCenter.current().setBadgeCount(value) { _ in }
    } else {
      DispatchQueue.main.async {
        UIApplication.shared.applicationIconBadgeNumber = value
      }
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
