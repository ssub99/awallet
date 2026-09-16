/**
 * App Group 대기 큐 → ingest 직렬화 가드 (로직 스모크).
 * 실제 NativeModules는 런타임 iOS에서만 존재.
 */
import assert from 'node:assert/strict';

function isPendingItem(value: unknown): value is { body: string; id?: string } {
  if (value == null || typeof value !== 'object') return false;
  const body = (value as { body?: unknown }).body;
  return typeof body === 'string' && body.trim().length > 0;
}

function filterPending(raw: unknown[]): { body: string; id?: string }[] {
  return raw.filter(isPendingItem).map((item) => ({
    body: item.body.trim(),
    id: typeof item.id === 'string' ? item.id : undefined,
  }));
}

/** 성공·영구실패만 ack. throw성 실패는 큐 유지. */
function shouldAckAfterIngest(result: { ok: true } | { ok: false; reason: string }): boolean {
  if (result.ok) return true;
  return (
    result.reason === 'disabled' ||
    result.reason === 'empty-allowlist' ||
    result.reason === 'sender-not-allowed' ||
    result.reason === 'no-keyword' ||
    result.reason === 'no-amount' ||
    result.reason === 'empty-body' ||
    result.reason === 'empty' ||
    result.reason === 'cancel-no-match'
  );
}

const filtered = filterPending([
  { body: '승인 1,000원', id: 'a' },
  { body: '   ' },
  { id: 'x' },
  null,
  { body: '취소 500원', id: 'b' },
]);

assert.equal(filtered.length, 2);
assert.equal(filtered[0]?.body, '승인 1,000원');
assert.equal(filtered[1]?.body, '취소 500원');

assert.equal(shouldAckAfterIngest({ ok: true }), true);
assert.equal(shouldAckAfterIngest({ ok: false, reason: 'sender-not-allowed' }), true);
assert.equal(shouldAckAfterIngest({ ok: false, reason: 'ingest-throw' }), false);

console.log('sms-inbox-native-queue pending filter + ack policy OK');
