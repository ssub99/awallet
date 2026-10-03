/** Android 기록 수신 — 알림 접근·기본 메시지 앱 알림 설정·설치 앱 목록 브리지 */

import type { AppNotificationReceiveTarget } from '@/utils/record-inbox-receive-settings';
import { NativeModules, Platform } from 'react-native';

type RecordInboxNotificationNativeModule = {
  getLauncherApps?: () => Promise<unknown>;
  isSmsInboxNotificationAccessEnabled?: () => Promise<boolean>;
  openSmsInboxNotificationAccessSettings?: () => Promise<void>;
  areDefaultSmsAppNotificationsEnabled?: () => Promise<boolean>;
  openDefaultSmsAppNotificationSettings?: () => Promise<void>;
};

const widgetDataSync = NativeModules.WidgetDataSync as
  | RecordInboxNotificationNativeModule
  | undefined;

/** 홈 화면 아이콘이 있는 설치 앱 (이름순). 브리지 없으면 빈 배열. */
export async function loadAndroidLauncherApps(): Promise<AppNotificationReceiveTarget[]> {
  if (Platform.OS !== 'android') return [];
  const fn = widgetDataSync?.getLauncherApps;
  if (typeof fn !== 'function') return [];
  const raw = await fn.call(widgetDataSync);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is AppNotificationReceiveTarget =>
        item != null &&
        typeof item === 'object' &&
        typeof (item as AppNotificationReceiveTarget).packageName === 'string' &&
        typeof (item as AppNotificationReceiveTarget).label === 'string',
    )
    .sort((a, b) => a.label.localeCompare(b.label, 'ko'));
}

export async function hasAndroidRecordInboxNotificationAccess(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const fn = widgetDataSync?.isSmsInboxNotificationAccessEnabled;
  if (typeof fn !== 'function') return false;
  try {
    return (await fn.call(widgetDataSync)) === true;
  } catch {
    return false;
  }
}

export async function openAndroidRecordInboxNotificationAccessSettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const fn = widgetDataSync?.openSmsInboxNotificationAccessSettings;
  if (typeof fn !== 'function') return;
  try {
    await fn.call(widgetDataSync);
  } catch {
    // 설정 화면을 열지 못한 경우 호출측 Alert로 안내한다.
  }
}

/** 확인 불가면 true — 게이트를 막지 않는다. */
export async function areAndroidDefaultSmsAppNotificationsEnabled(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const fn = widgetDataSync?.areDefaultSmsAppNotificationsEnabled;
  if (typeof fn !== 'function') return true;
  try {
    return (await fn.call(widgetDataSync)) !== false;
  } catch {
    return true;
  }
}

export async function openAndroidDefaultSmsAppNotificationSettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const fn = widgetDataSync?.openDefaultSmsAppNotificationSettings;
  if (typeof fn !== 'function') return;
  try {
    await fn.call(widgetDataSync);
  } catch {
    // no-op
  }
}
