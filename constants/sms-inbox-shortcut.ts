/**
 * iOS 단축어 — iCloud 공유 단축어(플로우와 동일 설치 UX).
 * 단축어 본문은 App Intent「문자 수신함」에 본문·발신번호를 연결한 형태.
 * Swift Intent: ios/awallet/SmsInboxAppIntent.swift
 */

/**
 * 문자 수신함용 iCloud 공유 단축어 URL.
 * 예: https://www.icloud.com/shortcuts/xxxxxxxx
 * 비어 있으면 단축어 앱 홈만 연다.
 */
export const SMS_INBOX_SHORTCUT_ICLOUD_URL = '';

export function buildSmsInboxShortcutInstallUrl(
  icloudUrl: string = SMS_INBOX_SHORTCUT_ICLOUD_URL,
): string | null {
  const trimmed = icloudUrl.trim();
  if (!trimmed) return null;
  return `shortcuts://import-shortcut?url=${encodeURIComponent(trimmed)}`;
}
