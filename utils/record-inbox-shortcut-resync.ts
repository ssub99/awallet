/**
 * 1.2.4+ 단축어 재설정 게이트.
 * OS는 설치된 단축어 Intent를 조회할 수 없으므로
 * 앱 버전(≥ 1.2.4) + 완료 플래그로만 식별한다. iOS 전용.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { getAppVersion, isAtLeastVersion } from '@/utils/app-version';

export const RECORD_INBOX_SHORTCUT_RESYNC_DONE_KEY =
  '@awallet/recordInboxShortcutResyncDone';

/** 이 버전 이상이면 재설정 완료 전까지 기록 수신함 메인 진입 차단 */
export const RECORD_INBOX_SHORTCUT_RESYNC_MIN_VERSION = '1.2.4';

export function isRecordInboxShortcutResyncVersion(
  version: string | undefined = getAppVersion(),
): boolean {
  return isAtLeastVersion(version, RECORD_INBOX_SHORTCUT_RESYNC_MIN_VERSION);
}

export async function isRecordInboxShortcutResyncDone(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(RECORD_INBOX_SHORTCUT_RESYNC_DONE_KEY);
    return value === '1';
  } catch {
    return false;
  }
}

export async function markRecordInboxShortcutResyncDone(): Promise<void> {
  await AsyncStorage.setItem(RECORD_INBOX_SHORTCUT_RESYNC_DONE_KEY, '1');
}

export async function clearRecordInboxShortcutResyncDone(): Promise<void> {
  await AsyncStorage.removeItem(RECORD_INBOX_SHORTCUT_RESYNC_DONE_KEY);
}

/**
 * true면 기록 수신함 메인 오픈을 막고 설정으로 유도한다.
 * Android·버전 미만·완료 플래그 있으면 false.
 */
export async function shouldBlockRecordInboxForShortcutResync(): Promise<boolean> {
  if (Platform.OS !== 'ios') {
    return false;
  }
  if (!isRecordInboxShortcutResyncVersion()) {
    return false;
  }
  return !(await isRecordInboxShortcutResyncDone());
}
