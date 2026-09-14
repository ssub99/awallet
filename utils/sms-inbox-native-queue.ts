/**
 * App Intent → App Group 대기 큐 → ingest 검증/플러시.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';

import { ingestSmsInboxMessage } from '@/utils/sms-inbox-ingest';
import { loadSmsInboxItems, normalizeSmsOriginalBody } from '@/utils/sms-inbox-store';
import { loadSmsReceiveEnabled, loadSmsReceiveNumbers } from '@/utils/sms-receive-settings';

export type PendingSmsInboxNativeItem = {
  id?: string;
  body?: string;
  sender?: string;
  enqueuedAt?: string;
};

type WidgetDataSyncSmsInboxModule = {
  drainPendingSmsInbox: () => Promise<PendingSmsInboxNativeItem[]>;
  peekPendingSmsInbox: () => Promise<PendingSmsInboxNativeItem[]>;
};

const widgetDataSync = NativeModules.WidgetDataSync as WidgetDataSyncSmsInboxModule | undefined;

const LAST_FLUSH_KEY = '@awallet/smsInboxLastFlushReport';

let flushChain: Promise<void> = Promise.resolve();
let memoryLastFlush: SmsInboxFlushReport | null = null;

function isPendingItem(value: unknown): value is PendingSmsInboxNativeItem {
  if (value == null || typeof value !== 'object') return false;
  const body = (value as PendingSmsInboxNativeItem).body;
  return typeof body === 'string' && body.trim().length > 0;
}

function previewBody(body: string, max = 80): string {
  const oneLine = body.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max)}…`;
}

export type SmsInboxFlushReport = {
  nativeModule: boolean;
  drained: number;
  bodyPreviews: string[];
  results: Array<{ ok: boolean; reason?: string; action?: string }>;
  at: string;
};

export type SmsInboxDiagnoseReport = {
  platform: string;
  nativeModule: boolean;
  peekAvailable: boolean;
  pendingCount: number;
  pendingPreviews: string[];
  smsReceiveEnabled: boolean;
  allowlistCount: number;
  storeItemCount: number;
  widgetDataSyncKeys: string[];
  hasSaveMonthlyExpenseData: boolean;
  hasPeekPendingSmsInbox: boolean;
  hasDrainPendingSmsInbox: boolean;
  bridgeVersion: string;
  lastFlush: SmsInboxFlushReport | null;
  diagnosis: string;
};

function getWidgetDataSyncProbe(): {
  keys: string[];
  hasSave: boolean;
  hasPeek: boolean;
  hasDrain: boolean;
  hasBridgeVersion: boolean;
} {
  const mod = NativeModules.WidgetDataSync as Record<string, unknown> | undefined;
  if (mod == null) {
    return {
      keys: [],
      hasSave: false,
      hasPeek: false,
      hasDrain: false,
      hasBridgeVersion: false,
    };
  }
  const keys = Object.keys(mod).sort();
  return {
    keys,
    hasSave: typeof mod.saveMonthlyExpenseData === 'function',
    hasPeek: typeof mod.peekPendingSmsInbox === 'function',
    hasDrain: typeof mod.drainPendingSmsInbox === 'function',
    hasBridgeVersion: typeof mod.getSmsInboxBridgeVersion === 'function',
  };
}

async function callNativeList(
  method: 'peekPendingSmsInbox' | 'drainPendingSmsInbox',
): Promise<{ ok: true; items: PendingSmsInboxNativeItem[] } | { ok: false; reason: string }> {
  if (Platform.OS !== 'ios') {
    return { ok: false, reason: 'not-ios' };
  }
  const fn = widgetDataSync?.[method];
  if (typeof fn !== 'function') {
    return { ok: false, reason: 'native-method-missing' };
  }
  try {
    const raw = await fn.call(widgetDataSync);
    if (!Array.isArray(raw)) {
      return { ok: false, reason: 'invalid-native-payload' };
    }
    return { ok: true, items: raw.filter(isPendingItem) };
  } catch {
    return { ok: false, reason: 'native-call-failed' };
  }
}

async function loadLastFlush(): Promise<SmsInboxFlushReport | null> {
  if (memoryLastFlush) return memoryLastFlush;
  try {
    const raw = await AsyncStorage.getItem(LAST_FLUSH_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (parsed == null || typeof parsed !== 'object') return null;
    memoryLastFlush = parsed as SmsInboxFlushReport;
    return memoryLastFlush;
  } catch {
    return null;
  }
}

async function saveLastFlush(report: SmsInboxFlushReport): Promise<void> {
  memoryLastFlush = report;
  try {
    await AsyncStorage.setItem(LAST_FLUSH_KEY, JSON.stringify(report));
  } catch {
    // ignore
  }
}

/** 큐를 비우지 않고 Intent→App Group 전달 여부를 확인한다. */
export async function diagnoseSmsInboxNativeQueue(): Promise<SmsInboxDiagnoseReport> {
  const [enabled, allowlist, storeItems, lastFlush] = await Promise.all([
    loadSmsReceiveEnabled(),
    loadSmsReceiveNumbers(),
    loadSmsInboxItems(),
    loadLastFlush(),
  ]);

  const probe = getWidgetDataSyncProbe();
  let bridgeVersion = 'missing';
  if (probe.hasBridgeVersion) {
    try {
      const mod = NativeModules.WidgetDataSync as {
        getSmsInboxBridgeVersion?: () => Promise<string>;
      };
      bridgeVersion = String(await mod.getSmsInboxBridgeVersion?.());
    } catch {
      bridgeVersion = 'call-failed';
    }
  }

  const peek = await callNativeList('peekPendingSmsInbox');
  const pending = peek.ok ? peek.items : [];
  const pendingPreviews = pending.map((item) => previewBody(item.body ?? ''));

  let diagnosis: string;
  if (Platform.OS !== 'ios') {
    diagnosis = 'iOS에서만 App Group 큐를 사용합니다.';
  } else if (probe.keys.length === 0) {
    diagnosis = 'NativeModules.WidgetDataSync 자체가 없음 → 네이티브 모듈 미링크/다른 바이너리.';
  } else if (!probe.hasPeek || !probe.hasDrain || bridgeVersion !== 'sms-inbox-1') {
    diagnosis = `구 바이너리(또는 Clean 미적용). bridgeVersion=${bridgeVersion}, keys=[${probe.keys.join(', ')}] → 앱 삭제 후 Clean Build로 awallet-stage 재설치.`;
  } else if (peek.reason === 'native-call-failed') {
    diagnosis = 'peek 메서드는 있으나 호출 실패.';
  } else if (pending.length === 0 && lastFlush && lastFlush.drained > 0) {
    diagnosis = `대기 큐는 비어 있지만, 최근 flush가 ${lastFlush.drained}건을 이미 가져감(앱 기동 시 auto-flush). lastFlush 결과 확인.`;
  } else if (pending.length === 0) {
    diagnosis =
      '대기 큐 비어 있음 + 최근 flush 기록 없음 → Intent가 본문을 App Group에 안 넣음(단축어「입력 내용」←단축어 입력 미연결, 또는 빈 본문, 또는 프로덕션 Intent/스테이지 앱 불일치).';
  } else if (!enabled) {
    diagnosis = `대기 ${pending.length}건 있음. 문자 수신 OFF라 flush 시 ingest가 거절됩니다.`;
  } else if (allowlist.length === 0) {
    diagnosis = `대기 ${pending.length}건 있음. 수신 번호가 없어 flush 시 ingest가 거절됩니다.`;
  } else {
    diagnosis = `대기 ${pending.length}건 있음. 본문이 App Group까지 도달함 → flush/ingest·파싱을 확인하세요.`;
  }

  const report: SmsInboxDiagnoseReport = {
    platform: Platform.OS,
    nativeModule: probe.hasPeek && probe.hasDrain && bridgeVersion === 'sms-inbox-1',
    peekAvailable: peek.ok,
    pendingCount: pending.length,
    pendingPreviews,
    smsReceiveEnabled: enabled,
    allowlistCount: allowlist.length,
    storeItemCount: storeItems.length,
    widgetDataSyncKeys: probe.keys,
    hasSaveMonthlyExpenseData: probe.hasSave,
    hasPeekPendingSmsInbox: probe.hasPeek,
    hasDrainPendingSmsInbox: probe.hasDrain,
    bridgeVersion,
    lastFlush,
    diagnosis,
  };
  console.warn('[SmsInbox] diagnose', JSON.stringify(report));
  return report;
}

export function formatSmsInboxDiagnoseMessage(report: SmsInboxDiagnoseReport): string {
  const lines = [
    report.diagnosis,
    '',
    `bridgeVersion: ${report.bridgeVersion}`,
    `pending: ${report.pendingCount}`,
    `수신 ON: ${report.smsReceiveEnabled ? 'Y' : 'N'}`,
    `수신번호: ${report.allowlistCount}`,
    `스토어 가기록: ${report.storeItemCount}`,
  ];
  if (report.pendingPreviews.length > 0) {
    lines.push('', '[대기 본문 미리보기]');
    report.pendingPreviews.slice(0, 5).forEach((preview, index) => {
      lines.push(`${index + 1}. ${preview}`);
    });
  }
  if (report.lastFlush) {
    lines.push('', '[최근 flush]');
    lines.push(`at: ${report.lastFlush.at}`);
    lines.push(formatSmsInboxFlushMessage(report.lastFlush));
  } else {
    lines.push('', '[최근 flush] 없음');
  }
  return lines.join('\n');
}

/**
 * App Group 대기 큐를 비우고 기존 ingest 파이프라인으로 적재한다.
 */
export function flushPendingSmsInboxFromNative(): Promise<SmsInboxFlushReport> {
  const report: SmsInboxFlushReport = {
    nativeModule: false,
    drained: 0,
    bodyPreviews: [],
    results: [],
    at: new Date().toISOString(),
  };

  flushChain = flushChain.then(async () => {
    if (Platform.OS !== 'ios') return;
    const drain = await callNativeList('drainPendingSmsInbox');
    if (drain.ok === false && drain.reason === 'native-method-missing') {
      console.warn('[SmsInbox] WidgetDataSync.drainPendingSmsInbox 없음 — 네이티브 재빌드 필요');
      await saveLastFlush(report);
      return;
    }
    report.nativeModule = drain.ok || drain.reason !== 'native-method-missing';
    if (!drain.ok) {
      console.warn('[SmsInbox] drain 실패', drain.reason);
      await saveLastFlush(report);
      return;
    }

    report.drained = drain.items.length;
    report.bodyPreviews = drain.items.map((item) => previewBody(item.body ?? ''));

    for (const entry of drain.items) {
      try {
        const result = await ingestSmsInboxMessage({
          body: normalizeSmsOriginalBody(entry.body ?? ''),
          sender: (entry.sender ?? '').trim(),
        });
        if (result.ok) {
          report.results.push({ ok: true, action: result.action });
        } else {
          report.results.push({ ok: false, reason: result.reason });
        }
      } catch (error) {
        report.results.push({ ok: false, reason: 'ingest-throw' });
        console.warn('[SmsInbox] ingest throw', error);
      }
    }
    await saveLastFlush(report);
    console.warn('[SmsInbox] flush report', JSON.stringify(report));
  });

  return flushChain.then(() => report);
}

export function formatSmsInboxFlushMessage(report: SmsInboxFlushReport): string {
  if (!report.nativeModule) {
    return '네이티브 drain 없음 — 재빌드 필요';
  }
  if (report.drained === 0) {
    return 'drain 0건 (대기 큐 비어 있음)';
  }
  const lines = [`drain ${report.drained}건`, ''];
  report.results.forEach((result, index) => {
    const preview = report.bodyPreviews[index] ?? '';
    if (result.ok) {
      lines.push(`${index + 1}. OK action=${result.action ?? '?'} | ${preview}`);
    } else {
      lines.push(`${index + 1}. FAIL reason=${result.reason ?? '?'} | ${preview}`);
    }
  });
  return lines.join('\n');
}
