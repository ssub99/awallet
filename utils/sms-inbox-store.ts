/**
 * 문자 수신함 persist 큐.
 * 승인 append / 취소 매칭 제거 / UI 구독.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { buildConfirmCardFromSmsFields } from '@/utils/sms-inbox-card';
import {
  parseSmsInboxBody,
  parsedFieldsToIso,
  type SmsInboxParsedFields,
} from '@/utils/sms-inbox-parse';
import type { SmsInboxItem } from '@/utils/sms-inbox-types';

export const SMS_INBOX_ITEMS_KEY = '@awallet/smsInboxItems';

type SmsInboxListener = (items: SmsInboxItem[]) => void;
const listeners = new Set<SmsInboxListener>();

let memoryCache: SmsInboxItem[] | null = null;
let writeChain: Promise<void> = Promise.resolve();

function notify(items: SmsInboxItem[]): void {
  listeners.forEach((listener) => {
    listener(items);
  });
}

export function subscribeSmsInboxItems(listener: SmsInboxListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function isSmsInboxItem(value: unknown): value is SmsInboxItem {
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

async function readItems(): Promise<SmsInboxItem[]> {
  if (memoryCache) {
    return memoryCache;
  }
  const raw = await AsyncStorage.getItem(SMS_INBOX_ITEMS_KEY);
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
    memoryCache = parsed.filter(isSmsInboxItem).map((item) => ({
      ...item,
      originalBody: normalizeSmsOriginalBody(item.originalBody),
      rawBody: normalizeSmsOriginalBody(item.rawBody ?? item.originalBody),
    }));
    return memoryCache;
  } catch {
    memoryCache = [];
    return memoryCache;
  }
}

async function writeItems(items: SmsInboxItem[]): Promise<void> {
  memoryCache = items;
  writeChain = writeChain.then(async () => {
    await AsyncStorage.setItem(SMS_INBOX_ITEMS_KEY, JSON.stringify(items));
  });
  await writeChain;
  notify(items);
}

export async function loadSmsInboxItems(): Promise<SmsInboxItem[]> {
  return readItems();
}

export async function clearSmsInboxItems(): Promise<void> {
  await writeItems([]);
}

function formatSenderLabel(sender: string): string {
  const trimmed = sender.trim();
  return trimmed.length > 0 ? trimmed : '발신번호 없음';
}

function createId(): string {
  return `sms-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 원문 줄바꿈 유지. 끝·맨앞 빈 줄만 제거하고 본문 중간의 \\n 은 그대로 둔다. */
export function normalizeSmsOriginalBody(body: string): string {
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
  fields: SmsInboxParsedFields,
): SmsInboxItem {
  const approvedAt = parsedFieldsToIso(fields);
  const createdAt = new Date().toISOString();
  const normalizedBody = normalizeSmsOriginalBody(body);
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
    card: buildConfirmCardFromSmsFields({
      amount: fields.amount,
      year: fields.year,
      month: fields.month,
      day: fields.day,
    }),
  };
}

/** 취소 → 미처리 승인 중 최적 건 (금액 필수, 가맹점/카드힌트 가산) */
export function findCancelMatch(
  items: SmsInboxItem[],
  fields: SmsInboxParsedFields,
): SmsInboxItem | null {
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

export type SmsInboxIngestResult =
  | { ok: true; action: 'appended'; item: SmsInboxItem }
  | { ok: true; action: 'removed'; item: SmsInboxItem }
  | { ok: false; reason: string };

/** 파싱된 승인/취소만 처리. allowlist는 호출 전. */
export async function ingestParsedSms(input: {
  sender: string;
  body: string;
  parsed: Exclude<ReturnType<typeof parseSmsInboxBody>, { kind: 'ignore' }>;
}): Promise<SmsInboxIngestResult> {
  const { sender, body, parsed } = input;
  const items = await readItems();

  if (parsed.kind === 'approval') {
    const item = buildItemFromApproval(sender, body, parsed);
    const next = [item, ...items];
    await writeItems(next);
    return { ok: true, action: 'appended', item };
  }

  const match = findCancelMatch(items, parsed);
  if (!match) {
    return { ok: false, reason: 'cancel-no-match' };
  }
  const next = items.filter((item) => item.id !== match.id);
  await writeItems(next);
  return { ok: true, action: 'removed', item: match };
}

export async function removeSmsInboxItemById(id: string): Promise<boolean> {
  const items = await readItems();
  const next = items.filter((item) => item.id !== id);
  if (next.length === items.length) return false;
  await writeItems(next);
  return true;
}

export async function updateSmsInboxItem(
  id: string,
  updater: (item: SmsInboxItem) => SmsInboxItem,
): Promise<SmsInboxItem | null> {
  const items = await readItems();
  let updated: SmsInboxItem | null = null;
  const next = items.map((item) => {
    if (item.id !== id) return item;
    updated = updater(item);
    return updated;
  });
  if (!updated) return null;
  await writeItems(next);
  return updated;
}

export async function replaceSmsInboxItems(items: SmsInboxItem[]): Promise<void> {
  await writeItems(items);
}
