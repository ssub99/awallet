/**
 * OS 앱 아이콘 뱃지 (기록 수신함 미확인 건수).
 * - iOS: setBadgeCount (알림 본문 없음)
 * - Android: 조용한 로컬 알림 1개 + setNumber
 * 네이티브가 lastSynced + pending 을 합산. JS는 실건수 sync만.
 */

import { NativeModules, Platform } from 'react-native';

type RecordInboxBadgeNativeModule = {
  setRecordInboxSyncedCount?: (count: number) => Promise<void>;
};

const badgeNative = NativeModules.WidgetDataSync as RecordInboxBadgeNativeModule | undefined;

let syncChain: Promise<void> = Promise.resolve();

/** 수신함 실건수로 네이티브 lastSynced·아이콘 뱃지 재맞춤 */
export function syncRecordInboxIconBadge(count: number): Promise<void> {
  const next = Math.max(0, Math.floor(count));
  const run = syncChain.then(async () => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
      return;
    }
    const fn = badgeNative?.setRecordInboxSyncedCount;
    if (typeof fn !== 'function') {
      return;
    }
    try {
      await fn.call(badgeNative, next);
    } catch {
      // Expo Go 등 브리지 없음 — 무시
    }
  });
  syncChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run.catch(() => undefined);
}
