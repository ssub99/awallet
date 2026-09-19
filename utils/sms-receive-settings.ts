/** 문자 수신 설정 — JS 저장소와 Android Receiver 저장소를 함께 유지한다. */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';

export const SMS_RECEIVE_ENABLED_KEY = '@awallet/smsReceiveEnabled';
export const SMS_RECEIVE_NUMBERS_KEY = '@awallet/smsReceiveNumbers';
export const SMS_RECEIVE_DISCLOSURE_ACCEPTED_KEY = '@awallet/smsReceiveDisclosureAccepted';

type SmsReceiveNativeModule = {
  syncSmsReceiveSettings?: (enabled: boolean, numbers: string[]) => Promise<void>;
  clearSmsInboxNativeState?: () => Promise<void>;
};

const smsReceiveNative = NativeModules.WidgetDataSync as SmsReceiveNativeModule | undefined;

type SmsReceiveEnabledListener = (enabled: boolean) => void;
const enabledListeners = new Set<SmsReceiveEnabledListener>();

/** 수신 ON/OFF 변경 구독 (간편생성 칩·숏 뱃지 즉시 반영) */
export function subscribeSmsReceiveEnabled(listener: SmsReceiveEnabledListener): () => void {
  enabledListeners.add(listener);
  return () => {
    enabledListeners.delete(listener);
  };
}

function notifySmsReceiveEnabled(enabled: boolean): void {
  enabledListeners.forEach((listener) => {
    listener(enabled);
  });
}

export async function loadSmsReceiveEnabled(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(SMS_RECEIVE_ENABLED_KEY);
  if (raw === null) return false;
  try {
    return JSON.parse(raw) === true;
  } catch {
    return false;
  }
}

export async function saveSmsReceiveEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(SMS_RECEIVE_ENABLED_KEY, JSON.stringify(enabled));
  await syncSmsReceiveSettingsToNative();
  notifySmsReceiveEnabled(enabled);
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

export async function loadSmsReceiveDisclosureAccepted(): Promise<boolean> {
  return (await AsyncStorage.getItem(SMS_RECEIVE_DISCLOSURE_ACCEPTED_KEY)) === 'true';
}

export async function saveSmsReceiveDisclosureAccepted(): Promise<void> {
  await AsyncStorage.setItem(SMS_RECEIVE_DISCLOSURE_ACCEPTED_KEY, 'true');
}

/** 앱 시작·설정 변경 시 종료 상태 Receiver가 읽을 Android 설정을 갱신한다. */
export async function syncSmsReceiveSettingsToNative(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const fn = smsReceiveNative?.syncSmsReceiveSettings;
  if (typeof fn !== 'function') return;
  const [enabled, numbers] = await Promise.all([
    loadSmsReceiveEnabled(),
    loadSmsReceiveNumbers(),
  ]);
  try {
    if (__DEV__) {
      console.warn(
        '[SmsInbox][android] syncSettings',
        JSON.stringify({ enabled, numbers, count: numbers.length }),
      );
    }
    await fn.call(smsReceiveNative, enabled, numbers);
  } catch {
    // Expo Go처럼 네이티브 브리지가 없는 환경에서는 JS 설정만 유지한다.
  }
}

export async function clearSmsReceiveNativeState(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const fn = smsReceiveNative?.clearSmsInboxNativeState;
  if (typeof fn !== 'function') return;
  try {
    await fn.call(smsReceiveNative);
  } catch {
    // 전체 초기화는 네이티브 정리 실패만으로 중단하지 않는다.
  }
}
