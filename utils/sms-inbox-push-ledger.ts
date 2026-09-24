/**
 * 문자 가기록 푸시 판정용 원장.
 * 수신함에서 삭제된 뒤에도 “구간 내 수신/전환”을 남긴다.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export const SMS_INBOX_PUSH_LEDGER_KEY = '@awallet/smsInboxPushLedger';

export type SmsInboxPushLedgerEntry = {
  id: string;
  receivedAtMs: number;
  convertedAtMs?: number;
  /** 카드사 취소 매칭 등으로 무효 */
  invalidatedAtMs?: number;
};

type LedgerFile = {
  entries: SmsInboxPushLedgerEntry[];
};

const RETENTION_MS = 1000 * 60 * 60 * 48; // 48h

let writeChain: Promise<void> = Promise.resolve();

function isEntry(value: unknown): value is SmsInboxPushLedgerEntry {
  if (value == null || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string' && typeof row.receivedAtMs === 'number';
}

async function readFile(): Promise<LedgerFile> {
  const raw = await AsyncStorage.getItem(SMS_INBOX_PUSH_LEDGER_KEY);
  if (!raw) {
    return { entries: [] };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed == null || typeof parsed !== 'object') {
      return { entries: [] };
    }
    const entriesUnknown = (parsed as { entries?: unknown }).entries;
    if (!Array.isArray(entriesUnknown)) {
      return { entries: [] };
    }
    return { entries: entriesUnknown.filter(isEntry) };
  } catch {
    return { entries: [] };
  }
}

async function writeFile(file: LedgerFile): Promise<void> {
  writeChain = writeChain.then(async () => {
    await AsyncStorage.setItem(SMS_INBOX_PUSH_LEDGER_KEY, JSON.stringify(file));
  });
  await writeChain;
}

function prune(entries: SmsInboxPushLedgerEntry[], nowMs: number): SmsInboxPushLedgerEntry[] {
  const cutoff = nowMs - RETENTION_MS;
  return entries.filter((entry) => entry.receivedAtMs >= cutoff);
}

export async function recordSmsInboxPushReceived(
  id: string,
  receivedAtMs: number = Date.now(),
): Promise<void> {
  const file = await readFile();
  if (file.entries.some((entry) => entry.id === id)) {
    return;
  }
  const next = [...file.entries, { id, receivedAtMs }];
  await writeFile({ entries: prune(next, receivedAtMs) });
}

export async function markSmsInboxPushConverted(
  id: string,
  convertedAtMs: number = Date.now(),
): Promise<void> {
  const file = await readFile();
  let found = false;
  const next = file.entries.map((entry) => {
    if (entry.id !== id) return entry;
    found = true;
    return { ...entry, convertedAtMs, invalidatedAtMs: undefined };
  });
  if (!found) {
    next.push({ id, receivedAtMs: convertedAtMs, convertedAtMs });
  }
  await writeFile({ entries: prune(next, convertedAtMs) });
}

export async function markSmsInboxPushInvalidated(
  id: string,
  invalidatedAtMs: number = Date.now(),
): Promise<void> {
  const file = await readFile();
  let found = false;
  const next = file.entries.map((entry) => {
    if (entry.id !== id) return entry;
    found = true;
    return { ...entry, invalidatedAtMs, convertedAtMs: undefined };
  });
  if (!found) {
    next.push({ id, receivedAtMs: invalidatedAtMs, invalidatedAtMs });
  }
  await writeFile({ entries: prune(next, invalidatedAtMs) });
}

export type SmsInboxPushWindowStats = {
  receivedCount: number;
  unconvertedCount: number;
  convertedCount: number;
};

export async function getSmsInboxPushWindowStats(
  startMs: number,
  endMs: number,
): Promise<SmsInboxPushWindowStats> {
  const file = await readFile();
  let receivedCount = 0;
  let unconvertedCount = 0;
  let convertedCount = 0;

  for (const entry of file.entries) {
    if (entry.receivedAtMs < startMs || entry.receivedAtMs >= endMs) {
      continue;
    }
    if (entry.invalidatedAtMs != null) {
      continue;
    }
    receivedCount += 1;
    if (entry.convertedAtMs != null) {
      convertedCount += 1;
    } else {
      unconvertedCount += 1;
    }
  }

  return { receivedCount, unconvertedCount, convertedCount };
}

export async function clearSmsInboxPushLedger(): Promise<void> {
  await AsyncStorage.removeItem(SMS_INBOX_PUSH_LEDGER_KEY);
}
