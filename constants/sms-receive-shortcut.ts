/**
 * iOS 단축어 — iCloud 공유 단축어(플로우와 동일 설치 UX).
 * 단축어 본문은 App Intent「문자 수신함」에 본문·발신번호를 연결한 형태.
 * Swift Intent: ios/awallet/RecordInboxAppIntent.swift
 *
 * 앱은 fetch 후 iCloud URL을 열어 단축어 앱으로 넘긴다 (별도 웹 UI 없음).
 * 배선 수정본(unsigned): `static/sms-inbox-shortcut-fixed.plist`
 *
 * --- 구 링크 vs 신 링크 ---
 * [구] 1.2.4 미만 앱 · `/sms-inbox-shortcut.json` · 아래 LEGACY_* / 구 iCloud URL
 * [신] 1.2.4+ 앱 · `/record-inbox-shortcut.json` · 아래 NEW_* / 신 iCloud URL
 * 새 단축어 발행 후: NEW_* 상수 + `static/record-inbox-shortcut.json`만 교체.
 * LEGACY_* · `static/sms-inbox-shortcut.json`은 미업데이트 단말용으로 유지.
 */

import {
  LEGACY_SMS_INBOX_SHORTCUT_CONFIG_URL,
  RECORD_INBOX_SHORTCUT_CONFIG_URL,
  isStageBuildProfile,
} from '@/constants/api';

/** 단축어는 App Intent 번들 ID에 묶이므로 스테이지(`.stage`)·정식 앱 링크를 따로 둔다. */
const IS_STAGE_APP = isStageBuildProfile();

/**
 * [구] 문자 수신 단축어 iCloud — 1.2.4 미만·레거시 JSON 폴백용.
 * 원격: `LEGACY_SMS_INBOX_SHORTCUT_CONFIG_URL` → static/sms-inbox-shortcut.json
 */
export const LEGACY_SMS_RECEIVE_SHORTCUT_ICLOUD_URL = IS_STAGE_APP
  ? 'https://www.icloud.com/shortcuts/6d11773653d5425e90d745394c0eff9a'
  : 'https://www.icloud.com/shortcuts/510dcef1f34e42549fc76fd2486c5bf2';

/**
 * [신] 문자 수신 단축어 iCloud — 1.2.4+ 정식·번들 폴백.
 * 원격: `RECORD_INBOX_SHORTCUT_CONFIG_URL` → static/record-inbox-shortcut.json
 * TODO: 신규 단축어 발행 후 이 URL을 새 iCloud 링크로 교체 (지금은 구와 동일).
 */
export const NEW_SMS_RECEIVE_SHORTCUT_ICLOUD_URL = IS_STAGE_APP
  ? 'https://www.icloud.com/shortcuts/6d11773653d5425e90d745394c0eff9a' // TODO: 신 스테이지 링크
  : 'https://www.icloud.com/shortcuts/510dcef1f34e42549fc76fd2486c5bf2'; // TODO: 신 프로덕션 링크

/**
 * [구] 알림 수신 단축어 iCloud — 미업데이트·레거시용.
 * TODO(신): 신규 알림 단축어 발행 시 NEW_* 상수로 분리해 1.2.4+만 신 링크 사용.
 */
export const LEGACY_APP_NOTIFICATION_RECEIVE_SHORTCUT_ICLOUD_URL = IS_STAGE_APP
  ? 'https://www.icloud.com/shortcuts/34795f74b1ac41c18103a88f99027559'
  : 'https://www.icloud.com/shortcuts/1ab2185798264ead9cf9308cd4c5e9a1';

/**
 * [신] 알림 수신 단축어 iCloud — 1.2.4+용.
 * TODO: 신규 단축어 발행 후 새 iCloud 링크로 교체 (지금은 구와 동일).
 */
export const NEW_APP_NOTIFICATION_RECEIVE_SHORTCUT_ICLOUD_URL = IS_STAGE_APP
  ? 'https://www.icloud.com/shortcuts/34795f74b1ac41c18103a88f99027559' // TODO: 신 스테이지 링크
  : 'https://www.icloud.com/shortcuts/1ab2185798264ead9cf9308cd4c5e9a1'; // TODO: 신 프로덕션 링크

/** @deprecated 이름 호환 — [신] 문자 단축어. 신규 코드는 NEW_SMS_RECEIVE_SHORTCUT_ICLOUD_URL */
export const SMS_RECEIVE_SHORTCUT_ICLOUD_URL = NEW_SMS_RECEIVE_SHORTCUT_ICLOUD_URL;

/** @deprecated 이름 호환 — [신] 알림 단축어. 신규 코드는 NEW_APP_NOTIFICATION_RECEIVE_SHORTCUT_ICLOUD_URL */
export const APP_NOTIFICATION_RECEIVE_SHORTCUT_ICLOUD_URL =
  NEW_APP_NOTIFICATION_RECEIVE_SHORTCUT_ICLOUD_URL;

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
 * [신] 1.2.4+ 설치 URL — 신 JSON 우선, 실패 시 구 JSON, 마지막에 NEW_* 번들 폴백.
 * `shortcuts://import-shortcut?url=` 래핑은 일부 iOS에서 포맷 오류가 나므로 https를 그대로 연다.
 */
export async function resolveSmsReceiveShortcutInstallUrl(): Promise<string> {
  // [신] 번들 폴백 (원격 실패 시)
  const fallback = NEW_SMS_RECEIVE_SHORTCUT_ICLOUD_URL.trim();
  try {
    const fetchJson = async (url: string): Promise<unknown | null> => {
      const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return null;
      return res.json();
    };
    // [신] record-inbox-shortcut.json → 없으면 [구] sms-inbox-shortcut.json
    const payload =
      (await fetchJson(RECORD_INBOX_SHORTCUT_CONFIG_URL)) ??
      (await fetchJson(LEGACY_SMS_INBOX_SHORTCUT_CONFIG_URL));
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
