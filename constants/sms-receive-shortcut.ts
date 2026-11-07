/**
 * iOS 단축어 — iCloud 공유 단축어(플로우와 동일 설치 UX).
 * 단축어 본문은 App Intent「에이월렛 문자 수신함」에 본문·발신번호를 연결한 형태.
 * (1.2.4+ 표시명. 구버전 앱 Intent 표시명은 「문자 수신함」.)
 * Swift Intent: ios/awallet/RecordInboxAppIntent.swift
 *
 * 앱은 fetch 후 iCloud URL을 열어 단축어 앱으로 넘긴다 (별도 웹 UI 없음).
 * 배선 수정본(unsigned): `static/sms-inbox-shortcut-fixed.plist`
 *
 * --- 구 링크 vs 신 링크 ---
 * [구] 1.2.4 미만 앱 · `/sms-inbox-shortcut.json` · 아래 LEGACY_* / 구 iCloud URL
 * [신] 1.2.4+ 앱 · `/record-inbox-shortcut.json` · 아래 NEW_* / 신 iCloud URL
 * 새 단축어 발행 후: NEW_* 상수 + `static/record-inbox-shortcut.json`(→ public)만 교체.
 * LEGACY_* · `static/sms-inbox-shortcut.json`은 미업데이트 단말용으로 유지 (신 resolve 경로에서는 읽지 않음).
 */

import { RECORD_INBOX_SHORTCUT_CONFIG_URL, usesStageResources } from '@/constants/api';

/**
 * 스테이지(`.stage` / channel stage) · Expo Go → 스테이지 iCloud 링크.
 * 단축어 App Intent는 스테이지 앱 번들에 묶이므로, Go에서도 신 스테이지 링크로 설치 UX를 본다.
 */
const IS_STAGE_APP = usesStageResources();

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
 * 프로덕션: 테스트 후 신 iCloud 링크로 교체.
 */
export const NEW_SMS_RECEIVE_SHORTCUT_ICLOUD_URL = IS_STAGE_APP
  ? 'https://www.icloud.com/shortcuts/ec849117f8f744e08feb3ff2f9c4feba'
  : 'https://www.icloud.com/shortcuts/510dcef1f34e42549fc76fd2486c5bf2'; // TODO: 신 프로덕션 링크

/**
 * [구] 알림 수신 단축어 iCloud — 미업데이트·레거시용.
 */
export const LEGACY_APP_NOTIFICATION_RECEIVE_SHORTCUT_ICLOUD_URL = IS_STAGE_APP
  ? 'https://www.icloud.com/shortcuts/34795f74b1ac41c18103a88f99027559'
  : 'https://www.icloud.com/shortcuts/1ab2185798264ead9cf9308cd4c5e9a1';

/**
 * [신] 알림 수신 단축어 iCloud — 1.2.4+용.
 * 프로덕션: 테스트 후 신 iCloud 링크로 교체.
 */
export const NEW_APP_NOTIFICATION_RECEIVE_SHORTCUT_ICLOUD_URL = IS_STAGE_APP
  ? 'https://www.icloud.com/shortcuts/d012eef84bed4d14a4b2319c716ad4d8'
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
 * [신] 1.2.4+ 설치 URL — `record-inbox-shortcut.json` 우선, 없거나 실패 시 NEW_* 번들 폴백.
 * 구 `sms-inbox-shortcut.json`으로는 내려가지 않는다 (신·구 iCloud 링크가 갈라지면 구버전으로 잘못 연결됨).
 * `shortcuts://import-shortcut?url=` 래핑은 일부 iOS에서 포맷 오류가 나므로 https를 그대로 연다.
 */
export async function resolveSmsReceiveShortcutInstallUrl(): Promise<string> {
  const fallback = NEW_SMS_RECEIVE_SHORTCUT_ICLOUD_URL.trim();
  try {
    const res = await fetch(RECORD_INBOX_SHORTCUT_CONFIG_URL, {
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
