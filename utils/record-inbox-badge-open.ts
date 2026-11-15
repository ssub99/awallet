/**
 * Android 기록 수신함 아이콘 뱃지 알림 탭 → flush 후 앱만 연다.
 * 수신함은 열지 않는다. (수신함 진입 경로를 홈 dim 탭 / 안내 카드 두 가지로 고정해
 * 진입 분석을 단순하게 유지하기 위함)
 */

import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

import { syncRecordInboxIconBadge } from '@/utils/record-inbox-icon-badge';
import { flushPendingRecordInboxFromNative } from '@/utils/record-inbox-native-queue';
import { loadRecordInboxItems } from '@/utils/record-inbox-store';

type OpenPendingNativeModule = {
  consumeOpenRecordInboxPending?: () => Promise<boolean>;
};

const OPEN_RECORD_INBOX_EVENT = 'RecordInboxOpenPending';

const openNative = NativeModules.WidgetDataSync as OpenPendingNativeModule | undefined;

let openChain: Promise<void> = Promise.resolve();

/**
 * flush 이후 — 네이티브의 탭 pending 플래그만 소비(초기화)한다.
 * 수신함 오픈은 예약하지 않는다. 플래그를 지우지 않으면 네이티브에 남아 있기 때문에 소비는 유지한다.
 */
export async function consumeRecordInboxBadgeOpenPendingAfterFlush(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  const fn = openNative?.consumeOpenRecordInboxPending;
  if (typeof fn !== 'function') {
    return;
  }
  try {
    await fn.call(openNative);
  } catch {
    // 소비 실패는 무시 (다음 flush에서 다시 시도)
  }
}

/**
 * flush → 뱃지 재맞춤 → 탭 pending 소비. 수신함은 열지 않는다.
 * 알림 탭 이벤트(앱 이미 실행 중)용.
 */
export function handleRecordInboxBadgeNotificationOpen(): Promise<void> {
  if (Platform.OS !== 'android') {
    return Promise.resolve();
  }
  const run = openChain.then(async () => {
    await flushPendingRecordInboxFromNative();
    const items = await loadRecordInboxItems();
    await syncRecordInboxIconBadge(items.length);
    await consumeRecordInboxBadgeOpenPendingAfterFlush();
  });
  openChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run.catch(() => undefined);
}

/** 앱이 떠 있는 동안 뱃지 알림 탭 구독 */
export function subscribeRecordInboxBadgeNotificationOpen(listener: () => void): () => void {
  if (Platform.OS !== 'android') {
    return () => {};
  }
  const mod = NativeModules.WidgetDataSync;
  if (mod == null) {
    return () => {};
  }
  const emitter = new NativeEventEmitter(mod);
  const subscription = emitter.addListener(OPEN_RECORD_INBOX_EVENT, listener);
  return () => {
    subscription.remove();
  };
}
