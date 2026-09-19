/**
 * iOS 단축어 — iCloud 공유 단축어(플로우와 동일 설치 UX).
 * 단축어 본문은 App Intent「문자 수신함」에 본문·발신번호를 연결한 형태.
 * Swift Intent: ios/awallet/SmsInboxAppIntent.swift
 *
 * 최신 공유 링크는 Vercel static `sms-inbox-shortcut.json` (깃 관리).
 * 배선 수정본(unsigned): `static/sms-inbox-shortcut-fixed.plist`
 *   - body ← ExtensionInput (Shortcut Input)
 *   - sender ← empty (do not coerce message body to phone)
 * 앱은 fetch 후 iCloud URL을 열어 단축어 앱으로 넘긴다 (별도 웹 UI 없음).
 */

import { SMS_INBOX_SHORTCUT_CONFIG_URL } from '@/constants/api';

/**
 * 번들 폴백 (원격 JSON 실패·미배포 시).
 * 예: https://www.icloud.com/shortcuts/xxxxxxxx
 */
export const SMS_INBOX_SHORTCUT_ICLOUD_URL =
  'https://www.icloud.com/shortcuts/e873c9423bc5427c85d8d8f12c2122ce';

function isIcloudShortcutsUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      parsed.hostname === 'www.icloud.com' &&
      parsed.pathname.startsWith('/shortcuts/')
    );
  } catch {
    return false;
  }
}

/**
 * 원격 JSON → iCloud URL. 실패 시 번들 폴백.
 * `shortcuts://import-shortcut?url=` 래핑은 일부 iOS에서 포맷 오류가 나므로 https를 그대로 연다.
 */
export async function resolveSmsInboxShortcutInstallUrl(): Promise<string> {
  const fallback = SMS_INBOX_SHORTCUT_ICLOUD_URL.trim();
  try {
    const res = await fetch(SMS_INBOX_SHORTCUT_CONFIG_URL, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      return fallback.length > 0 ? fallback : 'shortcuts://';
    }
    const payload: unknown = await res.json();
    if (payload == null || typeof payload !== 'object') {
      return fallback.length > 0 ? fallback : 'shortcuts://';
    }
    const url = (payload as { url?: unknown }).url;
    if (typeof url !== 'string') {
      return fallback.length > 0 ? fallback : 'shortcuts://';
    }
    const trimmed = url.trim();
    if (!isIcloudShortcutsUrl(trimmed)) {
      return fallback.length > 0 ? fallback : 'shortcuts://';
    }
    return trimmed;
  } catch {
    return fallback.length > 0 ? fallback : 'shortcuts://';
  }
}
