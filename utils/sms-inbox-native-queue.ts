/**
 * App Intent → App Group 대기 큐 → ingest 플러시.
 */

import { NativeModules, Platform } from 'react-native';

import { ingestSmsInboxMessage } from '@/utils/sms-inbox-ingest';
import { normalizeSmsOriginalBody } from '@/utils/sms-inbox-store';

export type PendingSmsInboxNativeItem = {
  id?: string;
  body?: string;
  sender?: string;
  enqueuedAt?: string;
};

type WidgetDataSyncSmsInboxModule = {
  drainPendingSmsInbox: () => Promise<PendingSmsInboxNativeItem[]>;
};

const widgetDataSync = NativeModules.WidgetDataSync as WidgetDataSyncSmsInboxModule | undefined;

let flushChain: Promise<void> = Promise.resolve();

function isPendingItem(value: unknown): value is PendingSmsInboxNativeItem {
  if (value == null || typeof value !== 'object') return false;
  const body = (value as PendingSmsInboxNativeItem).body;
  return typeof body === 'string' && body.trim().length > 0;
}

async function drainPendingList(): Promise<PendingSmsInboxNativeItem[]> {
  if (Platform.OS !== 'ios') {
    return [];
  }
  const fn = widgetDataSync?.drainPendingSmsInbox;
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

/**
 * App Group 대기 큐를 비우고 기존 ingest 파이프라인으로 적재한다.
 */
export function flushPendingSmsInboxFromNative(): Promise<void> {
  flushChain = flushChain.then(async () => {
    if (Platform.OS !== 'ios') return;
    const items = await drainPendingList();
    for (const entry of items) {
      try {
        await ingestSmsInboxMessage({
          body: normalizeSmsOriginalBody(entry.body ?? ''),
          sender: (entry.sender ?? '').trim(),
        });
      } catch {
        // ingest 실패 건은 스킵하고 다음 항목 계속
      }
    }
  });

  return flushChain;
}
