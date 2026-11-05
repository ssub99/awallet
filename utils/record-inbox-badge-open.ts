/**
 * Android 기록 수신함 아이콘 뱃지 알림 탭 → flush 후 수신함 오픈.
 */

import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

import { setHomePendingOpenRecordInbox } from '@/utils/home-open-record-inbox-pending';
import { syncRecordInboxIconBadge } from '@/utils/record-inbox-icon-badge';
import { flushPendingRecordInboxFromNative } from '@/utils/record-inbox-native-queue';
import { loadRecordInboxItems } from '@/utils/record-inbox-store';

type OpenPendingNativeModule = {
  consumeOpenRecordInboxPending?: () => Promise<boolean>;
};

const OPEN_RECORD_INBOX_EVENT = 'RecordInboxOpenPending';

const openNative = NativeModules.WidgetDataSync as OpenPendingNativeModule | undefined;

let openChain: Promise<void> = Promise.resolve();

/** flush 이후 — 탭 pending만 소비해 수신함 오픈 예약 */
export async function consumeRecordInboxBadgeOpenPendingAfterFlush(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  const fn = openNative?.consumeOpenRecordInboxPending;
  if (typeof fn !== 'function') {
    return;
  }
  let shouldOpen = false;
  try {
    shouldOpen = (await fn.call(openNative)) === true;
  } catch {
    return;
  }
  if (shouldOpen) {
    setHomePendingOpenRecordInbox();
  }
}

/**
 * flush → 뱃지 재맞춤 → 탭 pending 소비 → 홈 수신함 오픈 예약.
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
