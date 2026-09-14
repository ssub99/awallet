/**
 * 문자 수신함 — Shortcuts / 메시지 자동화용 App Intent.
 * 메인 앱 타깃 전용 (위젯 extension에 넣지 않음).
 *
 * 역할 분리:
 * - 자동화: 발신번호 트리거
 * - 단축어: 「입력 내용」←「단축어 입력」(메시지 내용)
 *           「발신번호」←「발신자」(메시지 발신자)
 *
 * 앱 종료 상태에서도 적재: 앱 UI를 열지 않고 App Group 큐에만 기록.
 * JS가 다음 기동/포그라운드에서 drain → ingest → sms-inbox-store → UI.
 *
 * 입력 내용이 비면 적재하지 않고 조용히 종료 (실패/완료 반응용 에러 throw 없음).
 * ※ OS 단축어「실행됨」알림은 시스템이 띄울 수 있으며 앱에서 막을 수 없음.
 */

import AppIntents
import Foundation

@available(iOS 17.0, *)
struct IngestSmsInboxIntent: AppIntent {
  static var title: LocalizedStringResource = "문자 수신함"
  static var description = IntentDescription(
    "메시지 자동화로 받은 문자 원문을 에이월렛 문자 수신함 가기록으로 전달합니다."
  )
  /// 앱을 켜지 않음 — 백그라운드/종료 상태에서도 App Group만 기록.
  static var openAppWhenRun: Bool = false

  @Parameter(
    title: "입력 내용",
    description: "메시지 본문. 자동화 실행 시「단축어 입력」을 연결하세요."
  )
  var body: String

  @Parameter(
    title: "발신번호",
    description: "메시지 발신자. 자동화에서「발신자」를 연결하세요.",
    default: ""
  )
  var sender: String

  static var parameterSummary: some ParameterSummary {
    Summary("문자 수신함") {
      \.$body
      \.$sender
    }
  }

  func perform() async throws -> some IntentResult {
    let trimmed = body.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty {
      NSLog("[SmsInbox] intent skip: empty body (no enqueue)")
      return .result()
    }
    let senderTrimmed = sender.trimmingCharacters(in: .whitespacesAndNewlines)
    SmsInboxAppGroupQueue.enqueue(body: trimmed, sender: senderTrimmed)
    return .result()
  }
}

@available(iOS 17.0, *)
struct SmsInboxAppShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: IngestSmsInboxIntent(),
      phrases: [
        "\(.applicationName) 문자 수신함",
      ],
      shortTitle: "문자 수신함",
      systemImageName: "envelope.badge"
    )
  }
}
