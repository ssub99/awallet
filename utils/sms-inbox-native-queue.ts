/** iOS App Intent / Android SMS Receiver 대기 큐 → 기존 ingest 플러시. */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

import { ingestSmsInboxMessage } from '@/utils/sms-inbox-ingest';
import { normalizeSmsOriginalBody } from '@/utils/sms-inbox-store';

export type PendingSmsInboxNativeItem = {
  id?: string;
  body?: string;
  sender?: string;
  enqueuedAt?: string;
};

export type SmsInboxFlushItemResult =
  | { ok: true; action?: string; preview: string }
  | { ok: false; reason: string; preview: string };

export type SmsInboxFlushReport = {
  platform: string;
  peeked: number;
  acked: number;
  results: SmsInboxFlushItemResult[];
  at: string;
};

type WidgetDataSyncSmsInboxModule = {
  drainPendingSmsInbox?: () => Promise<PendingSmsInboxNativeItem[]>;
  peekPendingSmsInbox?: () => Promise<PendingSmsInboxNativeItem[]>;
  getPendingSmsInbox?: () => Promise<PendingSmsInboxNativeItem[]>;
  acknowledgePendingSmsInbox?: (ids: string[]) => Promise<void>;
  getSmsInboxLastIntent?: () => Promise<Record<string, unknown> | null>;
  getSmsInboxBridgeVersion?: () => Promise<string>;
};

const SMS_INBOX_PENDING_ENQUEUED_EVENT = 'SmsInboxPendingEnqueued';
const LAST_FLUSH_KEY = '@awallet/smsInboxLastFlush';

const widgetDataSync = NativeModules.WidgetDataSync as WidgetDataSyncSmsInboxModule | undefined;

let flushChain: Promise<void> = Promise.resolve();

function isPendingItem(value: unknown): value is PendingSmsInboxNativeItem {
  if (value == null || typeof value !== 'object') return false;
  const body = (value as PendingSmsInboxNativeItem).body;
  return typeof body === 'string' && body.trim().length > 0;
}

function previewBody(body: string): string {
  const compact = body.replace(/\s+/g, ' ').trim();
  return compact.length > 80 ? `${compact.slice(0, 80)}…` : compact;
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

async function saveLastFlush(report: SmsInboxFlushReport): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_FLUSH_KEY, JSON.stringify(report));
  } catch {
    // 진단용. 실패해도 flush는 계속한다.
  }
}

export async function loadLastSmsInboxFlushReport(): Promise<SmsInboxFlushReport | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_FLUSH_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (parsed == null || typeof parsed !== 'object') return null;
    return parsed as SmsInboxFlushReport;
  } catch {
    return null;
  }
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
    const report: SmsInboxFlushReport = {
      platform: Platform.OS,
      peeked: 0,
      acked: 0,
      results: [],
      at: new Date().toISOString(),
    };
    const items = await peekPendingList();
    report.peeked = items.length;

    for (const entry of items) {
      const body = normalizeSmsOriginalBody(entry.body ?? '');
      const sender = (entry.sender ?? '').trim();
      const preview = previewBody(body);
      try {
        const result = await ingestSmsInboxMessage({ body, sender });
        if (result.ok) {
          report.results.push({ ok: true, action: result.action, preview });
          if (entry.id) {
            await acknowledgePendingItems([entry.id]);
            report.acked += 1;
          }
        } else {
          report.results.push({ ok: false, reason: result.reason, preview });
          // 실패 항목은 ack하지 않음 → 다음 flush에서 재시도.
          // 영구 실패(allowlist/parse)도 남기면 반복되므로, reason이 재시도 무의미한 경우만 제거.
          if (
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
            await acknowledgePendingItems([entry.id]);
            report.acked += 1;
          }
        }
      } catch {
        report.results.push({ ok: false, reason: 'ingest-throw', preview });
      }
    }

    if (report.peeked > 0 || report.results.length > 0) {
      console.warn('[SmsInbox] flush', JSON.stringify(report));
    }
    await saveLastFlush(report);
    return report.peeked;
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

/** 개발 진단: peek + lastIntent + lastFlush. UI 없음 — console만. */
export async function diagnoseSmsInboxNativeQueue(): Promise<{
  bridgeVersion: string | null;
  pendingCount: number;
  pendingPreviews: string[];
  lastIntent: Record<string, unknown> | null;
  lastFlush: SmsInboxFlushReport | null;
}> {
  let bridgeVersion: string | null = null;
  if (typeof widgetDataSync?.getSmsInboxBridgeVersion === 'function') {
    try {
      bridgeVersion = await widgetDataSync.getSmsInboxBridgeVersion();
    } catch {
      bridgeVersion = null;
    }
  }

  const pending = await peekPendingList();
  let lastIntent: Record<string, unknown> | null = null;
  if (Platform.OS === 'ios' && typeof widgetDataSync?.getSmsInboxLastIntent === 'function') {
    try {
      const raw = await widgetDataSync.getSmsInboxLastIntent();
      if (raw != null && typeof raw === 'object') {
        lastIntent = raw;
      }
    } catch {
      lastIntent = null;
    }
  }

  const lastFlush = await loadLastSmsInboxFlushReport();
  const report = {
    bridgeVersion,
    pendingCount: pending.length,
    pendingPreviews: pending.map((item) => previewBody(item.body ?? '')),
    lastIntent,
    lastFlush,
  };
  console.warn('[SmsInbox] diagnose', JSON.stringify(report));
  return report;
}
