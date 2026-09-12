/**
 * 문자 수신 설정 — 로컬 저장.
 * 수신 번호 allowlist · 수신 on/off (NotificationListener 연동은 후속).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const ENABLED_KEY = '@awallet/smsReceiveEnabled';
const NUMBERS_KEY = '@awallet/smsReceiveNumbers';

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
  const raw = await AsyncStorage.getItem(ENABLED_KEY);
  if (raw === null) return false;
  try {
    return JSON.parse(raw) === true;
  } catch {
    return false;
  }
}

export async function saveSmsReceiveEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(ENABLED_KEY, JSON.stringify(enabled));
  notifySmsReceiveEnabled(enabled);
}

export async function loadSmsReceiveNumbers(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(NUMBERS_KEY);
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
  await AsyncStorage.setItem(NUMBERS_KEY, JSON.stringify(numbers));
}
