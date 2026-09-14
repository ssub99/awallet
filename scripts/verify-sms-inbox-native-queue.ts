/**
 * App Group 대기 큐 → ingest 직렬화 가드 (로직 스모크).
 * 실제 NativeModules는 런타임 iOS에서만 존재.
 */
import assert from 'node:assert/strict';

function isPendingItem(value: unknown): value is { body: string } {
  if (value == null || typeof value !== 'object') return false;
  const body = (value as { body?: unknown }).body;
  return typeof body === 'string' && body.trim().length > 0;
}

function filterPending(raw: unknown[]): { body: string }[] {
  return raw.filter(isPendingItem).map((item) => ({ body: item.body.trim() }));
}

const filtered = filterPending([
  { body: '승인 1,000원' },
  { body: '   ' },
  { id: 'x' },
  null,
  { body: '취소 500원' },
]);

assert.equal(filtered.length, 2);
assert.equal(filtered[0]?.body, '승인 1,000원');
assert.equal(filtered[1]?.body, '취소 500원');
console.log('sms-inbox-native-queue pending filter OK');
