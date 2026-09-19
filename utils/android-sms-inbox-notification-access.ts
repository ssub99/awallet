/** Android 문자 수신 — 알림 접근·기본 메시지 앱 알림 설정 브리지 */

import { NativeModules, Platform } from 'react-native';

type SmsInboxNotificationNativeModule = {
  isSmsInboxNotificationAccessEnabled?: () => Promise<boolean>;
  openSmsInboxNotificationAccessSettings?: () => Promise<void>;
  areDefaultSmsAppNotificationsEnabled?: () => Promise<boolean>;
  openDefaultSmsAppNotificationSettings?: () => Promise<void>;
};

const widgetDataSync = NativeModules.WidgetDataSync as
  | SmsInboxNotificationNativeModule
  | undefined;

export async function hasAndroidSmsInboxNotificationAccess(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const fn = widgetDataSync?.isSmsInboxNotificationAccessEnabled;
  if (typeof fn !== 'function') return false;
  try {
    return (await fn.call(widgetDataSync)) === true;
  } catch {
    return false;
  }
}

export async function openAndroidSmsInboxNotificationAccessSettings(): Promise<void> {
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
