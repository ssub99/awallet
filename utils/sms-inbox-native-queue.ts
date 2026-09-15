/** iOS App Intent / Android SMS Receiver 대기 큐 → 기존 ingest 플러시. */

import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

import { ingestSmsInboxMessage } from '@/utils/sms-inbox-ingest';
import { normalizeSmsOriginalBody } from '@/utils/sms-inbox-store';

export type PendingSmsInboxNativeItem = {
  id?: string;
  body?: string;
  sender?: string;
  enqueuedAt?: string;
};

type WidgetDataSyncSmsInboxModule = {
  drainPendingSmsInbox?: () => Promise<PendingSmsInboxNativeItem[]>;
  getPendingSmsInbox?: () => Promise<PendingSmsInboxNativeItem[]>;
  acknowledgePendingSmsInbox?: (ids: string[]) => Promise<void>;
};

const SMS_INBOX_PENDING_ENQUEUED_EVENT = 'SmsInboxPendingEnqueued';

const widgetDataSync = NativeModules.WidgetDataSync as WidgetDataSyncSmsInboxModule | undefined;

let flushChain: Promise<void> = Promise.resolve();

function isPendingItem(value: unknown): value is PendingSmsInboxNativeItem {
  if (value == null || typeof value !== 'object') return false;
  const body = (value as PendingSmsInboxNativeItem).body;
  return typeof body === 'string' && body.trim().length > 0;
}

async function drainPendingList(): Promise<PendingSmsInboxNativeItem[]> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return [];
  }
  const fn =
    Platform.OS === 'android'
      ? widgetDataSync?.getPendingSmsInbox
      : widgetDataSync?.drainPendingSmsInbox;
  if (typeof fn !== 'function') {
    return [];
  }
  try {
    const raw = await fn.call(widgetDataSync);
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw.filter(isPendingItem);
  } catch {
    return [];
  }
}

async function acknowledgeAndroidItems(ids: string[]): Promise<void> {
  if (Platform.OS !== 'android' || ids.length === 0) return;
  const fn = widgetDataSync?.acknowledgePendingSmsInbox;
  if (typeof fn !== 'function') return;
  await fn.call(widgetDataSync, ids);
}

/**
 * 네이티브 대기 큐를 기존 ingest 파이프라인으로 적재한다.
 * Android는 처리 완료 항목만 ack하여 예외 발생 항목을 다음 실행에서 재시도한다.
 */
export function flushPendingSmsInboxFromNative(): Promise<number> {
  const run = flushChain.then(async () => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
      return 0;
    }
    const items = await drainPendingList();
    for (const entry of items) {
      try {
        await ingestSmsInboxMessage({
          body: normalizeSmsOriginalBody(entry.body ?? ''),
          sender: (entry.sender ?? '').trim(),
        });
        if (entry.id) {
          await acknowledgeAndroidItems([entry.id]);
        }
      } catch {
        // Android는 ack하지 않아 다음 앱 실행/복귀 때 재시도한다.
      }
    }
    return items.length;
  });

  flushChain = run.then(
    () => undefined,
    () => undefined,
  );

  return run.catch(() => 0);
}

/** 네이티브 enqueue → RN. 구독 해제 함수 반환. */
export function subscribeSmsInboxPendingEnqueued(listener: () => void): () => void {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return () => {};
  }
  const mod = NativeModules.WidgetDataSync;
  if (mod == null) {
    return () => {};
  }
  const emitter = new NativeEventEmitter(mod);
  const subscription = emitter.addListener(SMS_INBOX_PENDING_ENQUEUED_EVENT, listener);
  return () => {
    subscription.remove();
  };
}
