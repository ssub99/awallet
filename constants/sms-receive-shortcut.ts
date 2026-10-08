/**
 * iOS 단축어 — iCloud 공유 단축어(플로우와 동일 설치 UX).
 * 단축어 본문은 App Intent「문자 수신함」에 본문·발신번호를 연결한 형태.
 * Swift Intent: ios/awallet/RecordInboxAppIntent.swift
 *
 * 최신 공유 링크는 Vercel static `sms-inbox-shortcut.json` (깃 관리).
 * 배선 수정본(unsigned): `static/sms-inbox-shortcut-fixed.plist`
 *   - body ← ExtensionInput (Shortcut Input)
 *   - sender ← empty (do not coerce message body to phone)
 * 앱은 fetch 후 iCloud URL을 열어 단축어 앱으로 넘긴다 (별도 웹 UI 없음).
 */

import { SMS_RECEIVE_SHORTCUT_CONFIG_URL, isStageBuildProfile } from '@/constants/api';

/** 단축어는 App Intent 번들 ID에 묶이므로 스테이지(`.stage`)·정식 앱 링크를 따로 둔다. */
const IS_STAGE_APP = isStageBuildProfile();

/**
 * 번들 폴백 (원격 JSON 실패·미배포 시).
 * 원격 JSON 키: 스테이지 `stageUrl`, 정식 `productionUrl`.
 */
export const SMS_RECEIVE_SHORTCUT_ICLOUD_URL = IS_STAGE_APP
  ? 'https://www.icloud.com/shortcuts/d7d8ee8ea9324cfd997e353b74f02ce7'
  : 'https://www.icloud.com/shortcuts/510dcef1f34e42549fc76fd2486c5bf2';

/** iOS 27+ 단축어「알림 수신함」— App Intent「알림 수신함」공유 단축어 */
export const APP_NOTIFICATION_RECEIVE_SHORTCUT_ICLOUD_URL = IS_STAGE_APP
  ? 'https://www.icloud.com/shortcuts/d425c167b6244f51a04c6500c7468c59'
  : 'https://www.icloud.com/shortcuts/1ab2185798264ead9cf9308cd4c5e9a1';

const SMS_RECEIVE_SHORTCUT_CONFIG_KEY = IS_STAGE_APP ? 'stageUrl' : 'productionUrl';

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
export async function resolveSmsReceiveShortcutInstallUrl(): Promise<string> {
  const fallback = SMS_RECEIVE_SHORTCUT_ICLOUD_URL.trim();
  try {
    const res = await fetch(SMS_RECEIVE_SHORTCUT_CONFIG_URL, {
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
    const url = (payload as Record<string, unknown>)[SMS_RECEIVE_SHORTCUT_CONFIG_KEY];
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
