/**
 * Expo Go (Android, SDK 53+) does not support expo-notifications at import time.
 * Use this module instead of importing expo-notifications directly.
 */

import Constants from 'expo-constants';
import { Platform } from 'react-native';

export type ExpoNotificationsModule = typeof import('expo-notifications');

let cachedModule: ExpoNotificationsModule | null | undefined;

/** Android Expo Go — remote/local notifications API unavailable */
export function isExpoNotificationsSupported(): boolean {
  return !(Platform.OS === 'android' && Constants.appOwnership === 'expo');
}

export function getExpoNotifications(): ExpoNotificationsModule | null {
  if (!isExpoNotificationsSupported()) {
    return null;
  }
  if (cachedModule !== undefined) {
    return cachedModule;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedModule = require('expo-notifications') as ExpoNotificationsModule;
  } catch {
    cachedModule = null;
  }
  return cachedModule;
}

/** Foreground notification presentation (dev build / standalone only) */
export function configureForegroundNotificationHandler(): void {
  const Notifications = getExpoNotifications();
  if (!Notifications) {
    return;
  }
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
  if (Platform.OS === 'android') {
    // 기본 채널 id를 유지해야 사용자가 꺼둔 설정이 보존된다. 이름만 「Miscellaneous」→「알림」.
    void Notifications.setNotificationChannelAsync('expo_notifications_fallback_notification_channel', {
      name: '알림',
      importance: Notifications.AndroidImportance.HIGH,
    }).catch(() => undefined);
  }
}
