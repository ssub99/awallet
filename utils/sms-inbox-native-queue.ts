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
  peekPendingSmsInbox?: () => Promise<PendingSmsInboxNativeItem[]>;
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

/** 큐를 비우지 않고 조회. iOS peek / Android getPending. */
async function peekPendingList(): Promise<PendingSmsInboxNativeItem[]> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return [];
  }
  const fn =
    Platform.OS === 'android'
      ? widgetDataSync?.getPendingSmsInbox
      : widgetDataSync?.peekPendingSmsInbox;
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

async function acknowledgePendingItems(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const fn = widgetDataSync?.acknowledgePendingSmsInbox;
  if (typeof fn !== 'function') return;
  await fn.call(widgetDataSync, ids);
}

/**
 * 네이티브 대기 큐를 기존 ingest 파이프라인으로 적재한다.
 * peek → 항목별 ingest → 성공(ok)한 id만 ack. 실패는 큐에 남겨 재시도.
 */
export function flushPendingSmsInboxFromNative(): Promise<number> {
  const run = flushChain.then(async () => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
      return 0;
    }
    const items = await peekPendingList();

    for (const entry of items) {
      const body = normalizeSmsOriginalBody(entry.body ?? '');
      const sender = (entry.sender ?? '').trim();
      try {
        const result = await ingestSmsInboxMessage({ body, sender });
        if (result.ok) {
          if (entry.id) {
            await acknowledgePendingItems([entry.id]);
          }
        } else if (
          entry.id &&
          (result.reason === 'disabled' ||
            result.reason === 'empty-allowlist' ||
            result.reason === 'sender-not-allowed' ||
            result.reason === 'no-keyword' ||
            result.reason === 'no-amount' ||
            result.reason === 'empty-body' ||
            result.reason === 'empty' ||
            result.reason === 'cancel-no-match')
        ) {
          // 영구 실패는 재시도 무의미 → 큐에서 제거.
          await acknowledgePendingItems([entry.id]);
        }
      } catch {
        // ingest 예외는 큐에 남겨 다음 flush에서 재시도.
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
