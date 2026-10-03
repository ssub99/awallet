/**
 * 기록 수신함 persist 큐.
 * 승인 append / 취소 매칭 제거 / UI 구독.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { buildConfirmCardFromRecordInboxFields } from '@/utils/record-inbox-card';
import {
  formatSmsSenderDisplay,
  parseRecordInboxBody,
  parsedFieldsToIso,
  type RecordInboxParsedFields,
} from '@/utils/record-inbox-parse';
import {
  markRecordInboxPushConverted,
  markRecordInboxPushInvalidated,
  recordRecordInboxPushReceived,
} from '@/utils/record-inbox-push-ledger';
import type { RecordInboxItem } from '@/utils/record-inbox-types';
import { setupDailyReminder } from '@/utils/notification-scheduler';

export const RECORD_INBOX_ITEMS_KEY = '@awallet/smsInboxItems';

type RecordInboxListener = (items: RecordInboxItem[]) => void;
const listeners = new Set<RecordInboxListener>();

let memoryCache: RecordInboxItem[] | null = null;
let writeChain: Promise<void> = Promise.resolve();

function notify(items: RecordInboxItem[]): void {
  listeners.forEach((listener) => {
    listener(items);
  });
}

export function subscribeRecordInboxItems(listener: RecordInboxListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function isRecordInboxItem(value: unknown): value is RecordInboxItem {
  if (value == null || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    typeof item.originalBody === 'string' &&
    typeof item.sender === 'string' &&
    typeof item.amount === 'number' &&
    item.card != null &&
    typeof item.card === 'object'
  );
}

async function readItems(): Promise<RecordInboxItem[]> {
  if (memoryCache) {
    return memoryCache;
  }
  const raw = await AsyncStorage.getItem(RECORD_INBOX_ITEMS_KEY);
  if (!raw) {
    memoryCache = [];
    return memoryCache;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      memoryCache = [];
      return memoryCache;
    }
    memoryCache = parsed.filter(isRecordInboxItem).map((item) => ({
      ...item,
      originalBody: normalizeRecordInboxOriginalBody(item.originalBody),
      rawBody: normalizeRecordInboxOriginalBody(item.rawBody ?? item.originalBody),
    }));
    return memoryCache;
  } catch {
    memoryCache = [];
    return memoryCache;
  }
}

async function writeItems(items: RecordInboxItem[]): Promise<void> {
  memoryCache = items;
  writeChain = writeChain.then(async () => {
    await AsyncStorage.setItem(RECORD_INBOX_ITEMS_KEY, JSON.stringify(items));
  });
  await writeChain;
  notify(items);
}

export async function loadRecordInboxItems(): Promise<RecordInboxItem[]> {
  return readItems();
}

export async function clearRecordInboxItems(): Promise<void> {
  await writeItems([]);
}

function formatSenderLabel(sender: string): string {
  return formatSmsSenderDisplay(sender);
}

function createId(): string {
  return `sms-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 원문 줄바꿈 유지. 끝·맨앞 빈 줄만 제거하고 본문 중간의 \\n 은 그대로 둔다. */
export function normalizeRecordInboxOriginalBody(body: string): string {
  return body
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u2028|\u2029/g, '\n')
    .replace(/[^\S\n]+$/gm, '')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '');
}

function buildItemFromApproval(
  sender: string,
  body: string,
  fields: RecordInboxParsedFields,
): RecordInboxItem {
  const approvedAt = parsedFieldsToIso(fields);
  const createdAt = new Date().toISOString();
  const normalizedBody = normalizeRecordInboxOriginalBody(body);
  return {
    id: createId(),
    sender,
    senderLabels: [formatSenderLabel(sender)],
    originalBody: normalizedBody,
    rawBody: normalizedBody,
    status: 'approved',
    amount: fields.amount,
    approvedAt,
    merchant: fields.merchant,
    cardHint: fields.cardHint,
    createdAt,
    card: buildConfirmCardFromRecordInboxFields({
      amount: fields.amount,
      year: fields.year,
      month: fields.month,
      day: fields.day,
    }),
  };
}

/** 취소 → 미처리 승인 중 최적 건 (금액 필수, 가맹점/카드힌트 가산) */
export function findCancelMatch(
  items: RecordInboxItem[],
  fields: RecordInboxParsedFields,
): RecordInboxItem | null {
  const sameAmount = items.filter((item) => item.amount === fields.amount);
  if (sameAmount.length === 0) return null;

  const scored = sameAmount.map((item) => {
    let score = 0;
    if (fields.merchant && item.merchant && fields.merchant === item.merchant) {
      score += 2;
    }
    if (fields.cardHint && item.cardHint && fields.cardHint === item.cardHint) {
      score += 2;
    }
    return { item, score };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.item.createdAt.localeCompare(a.item.createdAt);
  });

  return scored[0]?.item ?? null;
}

export type RecordInboxIngestResult =
  | { ok: true; action: 'appended'; item: RecordInboxItem }
  | { ok: true; action: 'removed'; item: RecordInboxItem }
  | { ok: false; reason: string };

/** 파싱된 승인/취소만 처리. allowlist는 호출 전. */
export async function ingestParsedRecordInbox(input: {
  sender: string;
  body: string;
  parsed: Exclude<ReturnType<typeof parseRecordInboxBody>, { kind: 'ignore' }>;
}): Promise<RecordInboxIngestResult> {
  const { sender, body, parsed } = input;
  const items = await readItems();

  if (parsed.kind === 'approval') {
    const item = buildItemFromApproval(sender, body, parsed);
    const next = [item, ...items];
    await writeItems(next);
    await recordRecordInboxPushReceived(item.id, Date.parse(item.createdAt) || Date.now());
    setupDailyReminder().catch(() => {});
    return { ok: true, action: 'appended', item };
  }

  const match = findCancelMatch(items, parsed);
  if (!match) {
    return { ok: false, reason: 'cancel-no-match' };
  }
  const next = items.filter((item) => item.id !== match.id);
  await writeItems(next);
  await markRecordInboxPushInvalidated(match.id);
  setupDailyReminder().catch(() => {});
  return { ok: true, action: 'removed', item: match };
}

export type RecordInboxRemoveOutcome = 'converted' | 'dismissed';

export async function removeRecordInboxItemById(
  id: string,
  options?: { outcome?: RecordInboxRemoveOutcome },
): Promise<boolean> {
  const items = await readItems();
  const next = items.filter((item) => item.id !== id);
  if (next.length === items.length) return false;
  await writeItems(next);
  if (options?.outcome === 'converted') {
    await markRecordInboxPushConverted(id);
  }
  // dismissed: 큐에서 제거되면 가기록 푸시 건수(큐 잔여)에서도 제외됨
  setupDailyReminder().catch(() => {});
  return true;
}

export async function updateRecordInboxItem(
  id: string,
  updater: (item: RecordInboxItem) => RecordInboxItem,
): Promise<RecordInboxItem | null> {
  const items = await readItems();
  let updated: RecordInboxItem | null = null;
  const next = items.map((item) => {
    if (item.id !== id) return item;
    updated = updater(item);
    return updated;
  });
  if (!updated) return null;
  await writeItems(next);
  return updated;
}

export async function replaceRecordInboxItems(items: RecordInboxItem[]): Promise<void> {
  await writeItems(items);
}

/**
 * __DEV__ 전용: 오늘(판정 구간 안) 미전환 가기록 N건만 적재한다. (스케줄은 호출하지 않음)
 */
export async function seedDevRecordInboxItemsForPushTest(count: number = 10): Promise<{
  seeded: number;
  total: number;
  ids: string[];
}> {
  if (!__DEV__) {
    const items = await readItems();
    return { seeded: 0, total: items.length, ids: [] };
  }

  const safeCount = Math.max(0, Math.floor(count));
  if (safeCount === 0) {
    const items = await readItems();
    return { seeded: 0, total: items.length, ids: [] };
  }

  const now = Date.now();
  const today = new Date(now);
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const day = today.getDate();
  const existing = await readItems();
  const seeded: RecordInboxItem[] = [];

  for (let i = 0; i < safeCount; i++) {
    const receivedAtMs = now - i * 60_000;
    const createdAt = new Date(receivedAtMs).toISOString();
    const amount = 1_000 * (i + 1);
    const body = [
      '[테스트카드]',
      `${month}/${day} 승인`,
      `${amount.toLocaleString('ko-KR')}원`,
      `테스트가맹점${i + 1}`,
    ].join('\n');
    const item: RecordInboxItem = {
      id: `sms-dev-${receivedAtMs}-${i}`,
      sender: '15447200',
      senderLabels: [formatSenderLabel('15447200')],
      originalBody: normalizeRecordInboxOriginalBody(body),
      rawBody: normalizeRecordInboxOriginalBody(body),
      status: 'approved',
      amount,
      approvedAt: createdAt,
      merchant: `테스트가맹점${i + 1}`,
      createdAt,
      card: buildConfirmCardFromRecordInboxFields({
        amount,
        year,
        month,
        day,
      }),
    };
    seeded.push(item);
    await recordRecordInboxPushReceived(item.id, receivedAtMs);
  }

  await writeItems([...seeded, ...existing]);
  console.log('[record-inbox-push] seedDevRecordInboxItemsForPushTest', {
    seeded: safeCount,
    total: seeded.length + existing.length,
    ids: seeded.map((item) => item.id),
    firstCreatedAt: seeded[0]?.createdAt,
    lastCreatedAt: seeded[seeded.length - 1]?.createdAt,
  });
  return {
    seeded: safeCount,
    total: seeded.length + existing.length,
    ids: seeded.map((item) => item.id),
  };
}
