/** 문자 수신 설정 — JS 저장소와 Android Receiver 저장소를 함께 유지한다. */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';

export const SMS_RECEIVE_ENABLED_KEY = '@awallet/smsReceiveEnabled';
export const SMS_RECEIVE_NUMBERS_KEY = '@awallet/smsReceiveNumbers';
export const SMS_RECEIVE_DISCLOSURE_ACCEPTED_KEY = '@awallet/smsReceiveDisclosureAccepted';
/** 앱 알림 수신(iOS 27+ 단축어 · Android 알림 리스너). 문자 수신과 상호 배타. */
export const APP_NOTIFICATION_RECEIVE_ENABLED_KEY = '@awallet/appNotificationReceiveEnabled';
/** Android 알림 수신 대상 금융 앱 */
export const APP_NOTIFICATION_RECEIVE_TARGETS_KEY = '@awallet/appNotificationReceiveTargets';

/** iOS: 단축어「알림 수신」자동화 트리거는 iOS 27+ · Android: 알림 리스너 */
export const SUPPORTS_APP_NOTIFICATION_RECEIVE =
  Platform.OS === 'android' ||
  (Platform.OS === 'ios' && Number.parseInt(String(Platform.Version), 10) >= 27);

export type AppNotificationReceiveTarget = {
  packageName: string;
  label: string;
  /** 기기 런처 아이콘 PNG data URI */
  icon?: string;
};

type SmsReceiveNativeModule = {
  syncSmsReceiveSettings?: (enabled: boolean, numbers: string[]) => Promise<void>;
  syncAppNotificationReceiveSettings?: (enabled: boolean, packages: string[]) => Promise<void>;
  /** iOS: App Group 수신 ON 게이트 (Intent enqueue·아이콘 뱃지) */
  syncRecordInboxReceiveEnabled?: (smsEnabled: boolean, appEnabled: boolean) => Promise<void>;
  clearRecordInboxNativeState?: () => Promise<void>;
  clearSmsInboxNativeState?: () => Promise<void>;
};

const smsReceiveNative = NativeModules.WidgetDataSync as SmsReceiveNativeModule | undefined;

type RecordInboxReceiveEnabledListener = (enabled: boolean) => void;
const enabledListeners = new Set<RecordInboxReceiveEnabledListener>();

/** 수신함 수신(문자 또는 앱 알림) ON/OFF 변경 구독 (간편생성 칩·숏 뱃지 즉시 반영) */
export function subscribeRecordInboxReceiveEnabled(listener: RecordInboxReceiveEnabledListener): () => void {
  enabledListeners.add(listener);
  return () => {
    enabledListeners.delete(listener);
  };
}

function notifyRecordInboxReceiveEnabled(enabled: boolean): void {
  enabledListeners.forEach((listener) => {
    listener(enabled);
  });
}

async function loadBooleanFlag(key: string): Promise<boolean> {
  const raw = await AsyncStorage.getItem(key);
  if (raw === null) return false;
  try {
    return JSON.parse(raw) === true;
  } catch {
    return false;
  }
}

export async function loadSmsReceiveEnabled(): Promise<boolean> {
  return loadBooleanFlag(SMS_RECEIVE_ENABLED_KEY);
}

export async function loadAppNotificationReceiveEnabled(): Promise<boolean> {
  if (!SUPPORTS_APP_NOTIFICATION_RECEIVE) return false;
  return loadBooleanFlag(APP_NOTIFICATION_RECEIVE_ENABLED_KEY);
}

/** 수신함 진입 노출 기준 — 문자 또는 앱 알림 중 하나라도 ON */
export async function loadRecordInboxReceiveEnabled(): Promise<boolean> {
  const [sms, app] = await Promise.all([
    loadSmsReceiveEnabled(),
    loadAppNotificationReceiveEnabled(),
  ]);
  return sms || app;
}

export async function saveSmsReceiveEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(SMS_RECEIVE_ENABLED_KEY, JSON.stringify(enabled));
  if (enabled) {
    await AsyncStorage.setItem(APP_NOTIFICATION_RECEIVE_ENABLED_KEY, JSON.stringify(false));
  }
  await syncSmsReceiveSettingsToNative();
  notifyRecordInboxReceiveEnabled(await loadRecordInboxReceiveEnabled());
}

export async function saveAppNotificationReceiveEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(APP_NOTIFICATION_RECEIVE_ENABLED_KEY, JSON.stringify(enabled));
  if (enabled) {
    await AsyncStorage.setItem(SMS_RECEIVE_ENABLED_KEY, JSON.stringify(false));
  }
  await syncSmsReceiveSettingsToNative();
  notifyRecordInboxReceiveEnabled(await loadRecordInboxReceiveEnabled());
}

export async function loadSmsReceiveNumbers(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(SMS_RECEIVE_NUMBERS_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  } catch {
    return [];
  }
}

export async function saveSmsReceiveNumbers(numbers: string[]): Promise<void> {
  await AsyncStorage.setItem(SMS_RECEIVE_NUMBERS_KEY, JSON.stringify(numbers));
  await syncSmsReceiveSettingsToNative();
}

export async function loadAppNotificationReceiveTargets(): Promise<AppNotificationReceiveTarget[]> {
  const raw = await AsyncStorage.getItem(APP_NOTIFICATION_RECEIVE_TARGETS_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is AppNotificationReceiveTarget =>
        item != null &&
        typeof item === 'object' &&
        typeof (item as AppNotificationReceiveTarget).packageName === 'string' &&
        typeof (item as AppNotificationReceiveTarget).label === 'string',
    );
  } catch {
    return [];
  }
}

export async function saveAppNotificationReceiveTargets(
  targets: AppNotificationReceiveTarget[],
): Promise<void> {
  await AsyncStorage.setItem(APP_NOTIFICATION_RECEIVE_TARGETS_KEY, JSON.stringify(targets));
  await syncSmsReceiveSettingsToNative();
}

export async function loadSmsReceiveDisclosureAccepted(): Promise<boolean> {
  return (await AsyncStorage.getItem(SMS_RECEIVE_DISCLOSURE_ACCEPTED_KEY)) === 'true';
}

export async function saveSmsReceiveDisclosureAccepted(): Promise<void> {
  await AsyncStorage.setItem(SMS_RECEIVE_DISCLOSURE_ACCEPTED_KEY, 'true');
}

/**
 * 앱 시작·설정 변경 시 네이티브 수신 게이트를 갱신한다.
 * - Android: Receiver/알림 리스너 설정 파일
 * - iOS: App Group 수신 ON (Intent enqueue·아이콘 뱃지). 키 없음=OFF(재설치 잔재 뱃지 방지)
 * 수신 OFF면 아이콘 뱃지도 0으로 맞춤.
 */
export async function syncSmsReceiveSettingsToNative(): Promise<void> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return;
  const [enabled, numbers, appEnabled, targets] = await Promise.all([
    loadSmsReceiveEnabled(),
    loadSmsReceiveNumbers(),
    loadAppNotificationReceiveEnabled(),
    loadAppNotificationReceiveTargets(),
  ]);
  try {
    if (Platform.OS === 'android') {
      await smsReceiveNative?.syncSmsReceiveSettings?.(enabled, numbers);
      await smsReceiveNative?.syncAppNotificationReceiveSettings?.(
        appEnabled,
        targets.map((target) => target.packageName),
      );
    } else {
      const syncEnabled = smsReceiveNative?.syncRecordInboxReceiveEnabled;
      if (typeof syncEnabled === 'function') {
        await syncEnabled.call(smsReceiveNative, enabled, appEnabled);
      }
    }
  } catch {
    // Expo Go처럼 네이티브 브리지가 없는 환경에서는 JS 설정만 유지한다.
  }

  try {
    const { loadRecordInboxItems } = await import('@/utils/record-inbox-store');
    const { syncRecordInboxIconBadge } = await import('@/utils/record-inbox-icon-badge');
    const receiveOn = enabled || appEnabled;
    const count = receiveOn ? (await loadRecordInboxItems()).length : 0;
    await syncRecordInboxIconBadge(count);
  } catch {
    // 뱃지 동기화 실패는 설정 저장을 막지 않음
  }
}

export async function clearSmsReceiveNativeState(): Promise<void> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return;
  const fn = smsReceiveNative?.clearRecordInboxNativeState ?? smsReceiveNative?.clearSmsInboxNativeState;
  if (typeof fn !== 'function') return;
  try {
    // Android: pending·설정·뱃지 알림 / iOS: App Group 큐·lastSynced·아이콘 뱃지
    await fn.call(smsReceiveNative);
  } catch {
    // 전체 초기화는 네이티브 정리 실패만으로 중단하지 않는다.
  }
}
